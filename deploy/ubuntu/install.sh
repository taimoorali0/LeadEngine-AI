#!/usr/bin/env bash
# LeadEngine AI — native install for Ubuntu 24.04 (22.04 also works).
#
#   sudo bash deploy/ubuntu/install.sh                       # http://<server-ip>
#   sudo DOMAIN=leads.example.com bash deploy/ubuntu/install.sh
#   sudo DOMAIN=leads.example.com SSL_EMAIL=you@example.com bash deploy/ubuntu/install.sh   # + HTTPS
#
# Optional: GOOGLE_PLACES_API_KEY=... OPENAI_API_KEY=... on the same line.
# Safe to re-run: it updates code, dependencies and the build, and keeps data and secrets.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/leadengine}
DOMAIN=${DOMAIN:-_}
SRC_DIR=$(cd "$(dirname "$0")/../.." && pwd)
export DEBIAN_FRONTEND=noninteractive

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash $0"; exit 1; }
. /etc/os-release
[ "$ID" = ubuntu ] || echo "Warning: tested on Ubuntu; found $PRETTY_NAME"

# ---------------------------------------------------------------- packages
log "Installing system packages"
apt-get update -qq
apt-get install -y -qq software-properties-common curl ca-certificates rsync unzip git xz-utils >/dev/null
if ! apt-cache show php8.3-fpm >/dev/null 2>&1; then
  add-apt-repository -y ppa:ondrej/php >/dev/null && apt-get update -qq   # Ubuntu 22.04
fi
apt-get install -y -qq nginx postgresql redis-server python3-venv python3-pip composer \
  php8.3-fpm php8.3-cli php8.3-pgsql php8.3-redis php8.3-zip php8.3-bcmath php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-intl >/dev/null

# Angular 20 needs Node >= 20.19 or >= 22.12.
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>=24?0:1)'; }
if ! node_ok; then
  ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
  TARBALL=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[0-9.]*-linux-$ARCH.tar.xz" | head -1)
  log "Installing ${TARBALL%.tar.xz}"
  rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack   # avoid mixing npm versions on upgrade
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$TARBALL" | tar -xJ -C /usr/local --strip-components=1
  hash -r
fi

# ---------------------------------------------------------------- services we depend on
HAS_SYSTEMD=0; [ -d /run/systemd/system ] && HAS_SYSTEMD=1
start_base() {
  if [ $HAS_SYSTEMD = 1 ]; then systemctl enable --now postgresql redis-server php8.3-fpm nginx >/dev/null 2>&1
  else
    for s in postgresql redis-server php8.3-fpm nginx; do service "$s" status >/dev/null 2>&1 || service "$s" start >/dev/null 2>&1 || true; done
    # Some containers refuse the init script's ulimit call; start Redis directly instead.
    redis-cli ping >/dev/null 2>&1 || su -s /bin/sh redis -c "redis-server /etc/redis/redis.conf --daemonize yes --supervised no" >/dev/null 2>&1 || true
  fi
}
start_base

# ---------------------------------------------------------------- code
log "Copying code to $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude .git --exclude node_modules --exclude vendor --exclude .angular --exclude dist \
  --exclude '__pycache__' --exclude 'backend/.env' --exclude 'backend/storage' --exclude 'python-engine/.venv' \
  "$SRC_DIR"/ "$APP_DIR"/
mkdir -p "$APP_DIR"/backend/storage/{app,logs,framework/{cache,sessions,views}}
rsync -a --ignore-existing "$SRC_DIR"/backend/storage/app/ "$APP_DIR"/backend/storage/app/ 2>/dev/null || true

# ---------------------------------------------------------------- database
ENV_FILE=$APP_DIR/backend/.env
if [ -f "$ENV_FILE" ]; then
  DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
else
  DB_PASSWORD=$(openssl rand -hex 16)
fi
log "Preparing PostgreSQL"
until su postgres -c "pg_isready -q"; do sleep 1; done
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='leadengine'\"" | grep -q 1 \
  || su postgres -c "psql -qc \"CREATE ROLE leadengine LOGIN PASSWORD '$DB_PASSWORD'\""
su postgres -c "psql -qc \"ALTER ROLE leadengine PASSWORD '$DB_PASSWORD'\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='leadengine'\"" | grep -q 1 \
  || su postgres -c "createdb -O leadengine leadengine"
# The schema uses these extensions; creating them needs superuser rights.
su postgres -c "psql -q -d leadengine -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS citext;'"

# ---------------------------------------------------------------- backend
log "Configuring Laravel"
cd "$APP_DIR/backend"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  URL="http://$([ "$DOMAIN" = _ ] && hostname -I | awk '{print $1}' || echo "$DOMAIN")"
  set_env() { if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi; }
  set_env APP_ENV production; set_env APP_DEBUG false; set_env APP_URL "$URL"
  set_env DB_PASSWORD "$DB_PASSWORD"; set_env QUEUE_CONNECTION redis; set_env CACHE_STORE redis
  set_env SESSION_DRIVER redis; set_env BROADCAST_CONNECTION reverb; set_env LOG_LEVEL warning
  set_env REVERB_APP_SECRET "$(openssl rand -hex 24)"; set_env REVERB_HOST 127.0.0.1; set_env REVERB_PORT 8080
  set_env GOOGLE_PLACES_API_KEY "${GOOGLE_PLACES_API_KEY:-}"
fi
# Downloads only (never an interactive git/ssh fallback), with one retry for flaky networks.
export COMPOSER_ALLOW_SUPERUSER=1 GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10"
composer_install() { composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-progress -q; }
composer_install || { sleep 5; composer_install; }
grep -q '^APP_KEY=base64' "$ENV_FILE" || php artisan key:generate --force -q
php artisan migrate --force
if [ "$(php artisan tinker --execute='echo \App\Models\Organization::count();' | tail -1)" = "0" ]; then
  php artisan db:seed --force && SEEDED=1
fi
php artisan config:cache -q && php artisan route:cache -q
chown -R www-data:www-data storage bootstrap/cache
chmod 640 "$ENV_FILE" && chown root:www-data "$ENV_FILE"

# ---------------------------------------------------------------- python engine
log "Installing the Python engine"
cd "$APP_DIR/python-engine"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
ENGINE_ENV=/etc/leadengine-engine.env
[ -f $ENGINE_ENV ] || printf 'OPENAI_API_KEY=%s\nOPENAI_MODEL=gpt-4o-mini\n' "${OPENAI_API_KEY:-}" > $ENGINE_ENV
chmod 600 $ENGINE_ENV

# ---------------------------------------------------------------- frontend
log "Building the Angular app"
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund --loglevel=error
npx ng build --configuration production >/dev/null

# ---------------------------------------------------------------- nginx
log "Configuring nginx"
cat > /etc/nginx/sites-available/leadengine <<NGINX
map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
server {
    listen 80;
    server_name $DOMAIN;
    root $APP_DIR/frontend/dist/frontend/browser;
    client_max_body_size 20m;

    location /api/ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $APP_DIR/backend/public/index.php;
        fastcgi_param SCRIPT_NAME /index.php;
        fastcgi_read_timeout 120s;
    }
    location /app/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/leadengine /etc/nginx/sites-enabled/leadengine
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
if [ $HAS_SYSTEMD = 1 ]; then systemctl reload nginx; else start_base; service nginx reload >/dev/null; fi

# ---------------------------------------------------------------- app services
log "Starting LeadEngine services"
unit() {  # name, description, user, workdir, command, [envfile]
  cat > "/etc/systemd/system/leadengine-$1.service" <<UNIT
[Unit]
Description=LeadEngine AI $2
After=network.target postgresql.service redis-server.service

[Service]
User=$3
WorkingDirectory=$4
ExecStart=$5
${6:+EnvironmentFile=$6}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
}
PHP=/usr/bin/php
unit engine "Python data engine" www-data "$APP_DIR/python-engine" "$APP_DIR/python-engine/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2" $ENGINE_ENV
unit worker "queue worker" www-data "$APP_DIR/backend" "$PHP artisan queue:work --tries=3 --timeout=3600"
unit reverb "WebSockets (Reverb)" www-data "$APP_DIR/backend" "$PHP artisan reverb:start --host=127.0.0.1 --port=8080"
unit scheduler "scheduler" www-data "$APP_DIR/backend" "$PHP artisan schedule:work"

SERVICES="engine worker reverb scheduler"
if [ $HAS_SYSTEMD = 1 ]; then
  systemctl daemon-reload
  for s in $SERVICES; do systemctl enable -q "leadengine-$s"; systemctl restart "leadengine-$s"; done
else
  # Containers without systemd: run the same commands in the background.
  echo "systemd not found: starting services in the background (they will not survive a reboot)"
  start_base
  pkill -f "uvicorn app.main:app" || true; pkill -f "artisan (queue:work|reverb:start|schedule:work)" || true
  set -a; . $ENGINE_ENV; set +a
  (cd "$APP_DIR/python-engine" && nohup su -s /bin/sh www-data -c ".venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001" >/var/log/leadengine-engine.log 2>&1 &)
  for c in "queue:work --tries=3 --timeout=3600" "reverb:start --host=127.0.0.1 --port=8080" "schedule:work"; do
    (cd "$APP_DIR/backend" && nohup su -s /bin/sh www-data -c "$PHP artisan $c" >>/var/log/leadengine.log 2>&1 &)
  done
fi

# ---------------------------------------------------------------- HTTPS
if [ -n "${SSL_EMAIL:-}" ] && [ "$DOMAIN" != _ ]; then
  log "Requesting a Let's Encrypt certificate for $DOMAIN"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  certbot --nginx -d "$DOMAIN" -m "$SSL_EMAIL" --agree-tos --non-interactive --redirect
  sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" "$ENV_FILE"
  (cd "$APP_DIR/backend" && php artisan config:cache -q)
fi

URL=$(grep '^APP_URL=' "$ENV_FILE" | cut -d= -f2-)
log "Done"
echo "Open: $URL"
[ "${SEEDED:-0}" = 1 ] && echo "Sign in: owner@leadengine.test / password   (change it under My Account)"
echo "Add keys in $ENV_FILE (GOOGLE_PLACES_API_KEY) and $ENGINE_ENV (OPENAI_API_KEY), then:"
echo "  sudo bash $APP_DIR/deploy/ubuntu/install.sh   # or: cd $APP_DIR/backend && php artisan config:cache && systemctl restart 'leadengine-*'"
