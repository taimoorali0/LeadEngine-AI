#!/bin/sh
# ROLE=api runs migrations and seeds an empty database; other roles wait for that.
set -e
cd /var/www/html

# Generate APP_KEY once and keep it in the storage volume.
if [ -z "$APP_KEY" ]; then
  if [ ! -f storage/app_key ]; then
    php -r 'echo "base64:".base64_encode(random_bytes(32));' > storage/app_key
  fi
  export APP_KEY="$(cat storage/app_key)"
fi

until pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USERNAME" >/dev/null 2>&1; do
  echo "waiting for database…"; sleep 2
done

if [ "$ROLE" = "api" ]; then
  rm -f storage/.migrated   # workers wait while new migrations run
  php artisan migrate --force
  if [ "$(php artisan tinker --execute='echo \App\Models\Organization::count();' 2>/dev/null | tail -1)" = "0" ]; then
    php artisan db:seed --force
    echo "Seeded demo data: owner@leadengine.test / password"
  fi
  touch storage/.migrated
else
  until [ -f storage/.migrated ]; do echo "waiting for migrations…"; sleep 3; done
fi

php artisan config:cache >/dev/null
php artisan route:cache >/dev/null
chown -R www-data:www-data storage bootstrap/cache
exec "$@"
