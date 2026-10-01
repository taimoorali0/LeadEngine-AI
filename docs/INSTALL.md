# Installing LeadEngine AI

Two ways to run it. Both were tested on a fresh machine.

| | Option A — Docker | Option B — Ubuntu server |
|---|---|---|
| Best for | Trying it on your own computer (Windows, Mac, Linux) | A real server people log into (VPS, cloud, office server) |
| You install | Docker Desktop | Nothing — the script installs everything |
| Command | `docker compose up -d --build` | `sudo bash deploy/ubuntu/install.sh` |
| Address | http://localhost:8080 | http://your-server-ip (or your domain, with HTTPS) |

After either option, sign in with **owner@leadengine.test / password** and change the password under **My Account**.

---

## Option A — Docker (any computer)

1. Install **Docker Desktop**: https://www.docker.com/products/docker-desktop (on Linux: Docker Engine + the compose plugin).
2. Download the code:
   ```bash
   git clone -b claude/sharp-knuth-zj8y8r https://github.com/taimoorali0/LeadEngine-AI.git
   cd LeadEngine-AI
   ```
3. (Optional) add your API keys: copy `.env.example` to `.env` and fill in `GOOGLE_PLACES_API_KEY` and `OPENAI_API_KEY`.
4. Start everything:
   ```bash
   docker compose up -d --build
   ```
   The first build takes 5–10 minutes. The database is created and demo data added automatically.
5. Open **http://localhost:8080**.

| To… | Run |
|---|---|
| See status | `docker compose ps` |
| See logs | `docker compose logs -f backend worker` |
| Stop | `docker compose down` (your data is kept) |
| Update after `git pull` | `docker compose up -d --build` |
| Use another port | set `PORT=9000` in `.env` |
| Delete everything, including data | `docker compose down -v` |

## Option B — Ubuntu server (24.04 recommended, 22.04 works)

You need a server with at least **2 GB RAM** and **sudo** access. If you want a domain name, point its DNS **A record** at the server first.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone -b claude/sharp-knuth-zj8y8r https://github.com/taimoorali0/LeadEngine-AI.git
cd LeadEngine-AI

# Plain IP address (http://server-ip):
sudo bash deploy/ubuntu/install.sh

# Or with your domain and a free HTTPS certificate:
sudo DOMAIN=leads.example.com SSL_EMAIL=you@example.com bash deploy/ubuntu/install.sh
```

You can also pass keys on the same line: `sudo GOOGLE_PLACES_API_KEY=... OPENAI_API_KEY=... bash deploy/ubuntu/install.sh`.

The script installs nginx, PostgreSQL, Redis, PHP 8.3, Python and Node.js, puts the app in `/opt/leadengine`,
builds it, and creates four services that start on boot:

| Service | What it does |
|---|---|
| `leadengine-engine` | Python data engine (enrichment, dedup, scoring, AI) |
| `leadengine-worker` | Runs campaigns and background jobs |
| `leadengine-reverb` | Live updates (WebSockets) |
| `leadengine-scheduler` | Follow-up reminders, campaign refresh, monthly credits |

| To… | Run |
|---|---|
| Check services | `systemctl status 'leadengine-*'` |
| See logs | `journalctl -u leadengine-worker -f` and `/opt/leadengine/backend/storage/logs/laravel.log` |
| Change settings / keys | edit `/opt/leadengine/backend/.env` (Google key) or `/etc/leadengine-engine.env` (OpenAI key), then `cd /opt/leadengine/backend && sudo php artisan config:cache && sudo systemctl restart 'leadengine-*'` |
| Update after `git pull` | run the install script again (keeps your data and secrets) |
| Back up the database | `sudo -u postgres pg_dump leadengine > leadengine-$(date +%F).sql` |

Firewall: allow ports **80** and **443** (`sudo ufw allow 'Nginx Full'`).

## API keys

| Key | Where to get it | What happens without it |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → enable **Places API (New)** → Credentials | Campaigns cannot find businesses; they end as *Failed* with that reason shown |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | AI summaries use a simpler built-in classifier |

## For developers (running from source)

See the README section *Running everything locally* (Laravel `php artisan serve`, `npm start`, `uvicorn`).
