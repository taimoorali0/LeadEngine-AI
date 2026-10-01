# Laravel API (php-fpm), queue worker, scheduler and Reverb all run from this image.
# Ubuntu 24.04 + its PHP 8.3 packages, the same stack as deploy/ubuntu/install.sh.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      php8.3-fpm php8.3-cli php8.3-pgsql php8.3-redis php8.3-zip php8.3-bcmath php8.3-mbstring \
      php8.3-xml php8.3-curl php8.3-intl composer unzip git postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 # php-fpm: listen on the network for nginx and keep container env vars visible to Laravel.
 && sed -i 's|^listen = .*|listen = 9000|; s|^;clear_env = no|clear_env = no|' /etc/php/8.3/fpm/pool.d/www.conf

WORKDIR /var/www/html
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction --no-progress
COPY backend/ ./
# The migration loads ../database/schema.sql relative to the Laravel root.
COPY database/ /var/www/database/
RUN rm -f .env && composer dump-autoload --optimize --no-dev \
 && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
 && chown -R www-data:www-data storage bootstrap/cache

COPY deploy/docker/backend-entrypoint.sh /usr/local/bin/leadengine-entrypoint
RUN chmod +x /usr/local/bin/leadengine-entrypoint
ENTRYPOINT ["leadengine-entrypoint"]
CMD ["php-fpm8.3", "-F"]
