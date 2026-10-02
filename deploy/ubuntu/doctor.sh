#!/usr/bin/env bash
# LeadEngine AI — health check and automatic repair.
#   sudo bash deploy/ubuntu/doctor.sh                 # check + repair
#   sudo bash deploy/ubuntu/doctor.sh you@mail.com    # also create/reset that Super Admin (asks for a password)
# Prints a short report; it never prints passwords or keys.
set -uo pipefail
APP=${APP_DIR:-/opt/leadengine}
B=$APP/backend
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; PROBLEMS=$((PROBLEMS+1)); }
info() { printf '\n\033[1m%s\033[0m\n' "$*"; }
PROBLEMS=0
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0"; exit 1; }
[ -f "$B/artisan" ] || { echo "LeadEngine is not installed in $APP. Run deploy/ubuntu/install.sh first."; exit 1; }
cd "$B"
art() { php artisan "$@" 2>&1; }

info "1. Internet and DNS"
if getent hosts github.com >/dev/null; then ok "DNS works"
else
  bad "DNS broken — fixing (Google + Cloudflare DNS)"
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNS=8.8.8.8 1.1.1.1\n' > /etc/systemd/resolved.conf.d/leadengine-dns.conf
  systemctl restart systemd-resolved 2>/dev/null; sleep 2
  getent hosts github.com >/dev/null && ok "DNS fixed" || bad "DNS still broken: check the server's internet connection"
fi

info "2. Services"
for s in nginx php8.3-fpm postgresql redis-server leadengine-engine leadengine-worker leadengine-reverb leadengine-scheduler; do
  if systemctl is-active --quiet "$s" 2>/dev/null; then ok "$s running"
  else systemctl restart "$s" 2>/dev/null; sleep 1
    systemctl is-active --quiet "$s" 2>/dev/null && ok "$s restarted" || bad "$s not running (see: journalctl -u $s -n 30)"
  fi
done

info "3. Application"
OUT=$(art migrate --force); echo "$OUT" | grep -q "FAIL\|Error\|ERROR" && bad "database update failed: $(echo "$OUT" | tail -2)" || ok "database up to date"
art optimize:clear >/dev/null; art config:cache >/dev/null && art route:cache >/dev/null && ok "caches rebuilt" || bad "cache rebuild failed"
chown -R www-data:www-data storage bootstrap/cache && ok "file permissions"
grep -q '^APP_KEY=base64' .env && ok "app key present" || { art key:generate --force >/dev/null; art config:cache >/dev/null; bad "app key was missing — generated (users must log in again)"; }
KEY=$(grep '^GOOGLE_PLACES_API_KEY=' .env | cut -d= -f2- | tr -d ' "\r')
[ -n "$KEY" ] && ok "Google Places key set (${#KEY} characters)" || bad "Google Places key missing in $B/.env (campaigns cannot search)"
ERR=$(grep -oE "production\.ERROR: [^{]{0,160}" storage/logs/laravel.log 2>/dev/null | tail -3)
[ -z "$ERR" ] && ok "no recent errors" || { echo "  recent errors:"; echo "$ERR" | sed 's/^/    /'; }

info "4. Accounts"
art tinker --execute='App\Models\User::with("role")->orderBy("id")->get()->each(fn($u)=>print("    #".$u->id." ".$u->email." (".($u->role?->name ?? "no role").($u->is_active ? "" : ", INACTIVE").($u->two_factor_confirmed_at ? ", 2FA on" : "").")".PHP_EOL));' | grep '#' || bad "could not list accounts"

if [ -n "${1:-}" ]; then
  info "5. Super Admin: $1"
  read -rsp "  New password (min. 10 characters): " PW; echo
  read -rsp "  Repeat password: " PW2; echo
  if [ "$PW" != "$PW2" ] || [ ${#PW} -lt 10 ]; then bad "passwords differ or are shorter than 10 characters"
  else
    EMAIL="$1" PW="$PW" php artisan tinker --execute='
      $r = App\Models\Role::where("key", "super_admin")->value("id");
      $u = App\Models\User::updateOrCreate(["email" => getenv("EMAIL")], ["name" => "Platform Admin", "role_id" => $r, "organization_id" => null, "password" => getenv("PW"), "is_active" => true]);
      $u->forceFill(["two_factor_secret" => null, "two_factor_confirmed_at" => null, "two_factor_recovery_codes" => null])->save();
      $u->tokens()->delete();
      echo "saved";' | grep -q saved && ok "Super Admin saved" || bad "could not save the Super Admin"
    redis-cli --scan --pattern '*login*' 2>/dev/null | xargs -r redis-cli del >/dev/null 2>&1   # clear login lockouts
    HOST=$(grep '^APP_URL=' .env | cut -d= -f2- | sed 's#https\?://##; s#/.*##')
    BODY=$(EMAIL="$1" PW="$PW" python3 -c 'import json,os;print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PW"]}))')
    RES=$(curl -sk -X POST "https://127.0.0.1/api/auth/login" -H "Host: $HOST" -H "Accept: application/json" -H "Content-Type: application/json" -d "$BODY" \
       || curl -s -X POST "http://127.0.0.1/api/auth/login" -H "Host: $HOST" -H "Accept: application/json" -H "Content-Type: application/json" -d "$BODY")
    echo "$RES" | grep -q '"token"' && ok "login works on the server" || bad "login test failed: $(echo "$RES" | head -c 200)"
  fi
fi

info "6. Website"
HOST=$(grep '^APP_URL=' .env | cut -d= -f2- | sed 's#https\?://##; s#/.*##')
CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "https://$HOST/login")
[ "$CODE" = 200 ] && ok "https://$HOST loads from the internet" || bad "https://$HOST returned '$CODE' from the internet (DNS/Cloudflare)"

echo
[ $PROBLEMS = 0 ] && printf '\033[32mAll good.\033[0m\n' || printf '\033[31m%s problem(s) found — send this report.\033[0m\n' "$PROBLEMS"
