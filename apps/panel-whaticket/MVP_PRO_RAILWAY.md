# MVP Pro (WhatsApp-only) — Railway Deploy

This build runs **WhaTicket (frontend + backend)** with **Evolution API** as the WhatsApp provider.

## Services in Railway

1. **PostgreSQL** (Railway plugin)
2. **Evolution API** (your existing `wa-evolution-main` deployment is fine)
3. **panel-backend** (this repo: `apps/panel-whaticket/backend`)
4. **panel-frontend** (this repo: `apps/panel-whaticket/frontend`)

## panel-backend environment variables

Required:

```env
NODE_ENV=production
BACKEND_URL=https://<panel-backend>.up.railway.app
FRONTEND_URL=https://<panel-frontend>.up.railway.app
PROXY_PORT=443
PORT=8080

# Postgres (set from Railway plugin)
DB_DIALECT=postgres
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASS=

JWT_SECRET=<long-random>
JWT_REFRESH_SECRET=<long-random>

# Evolution provider
WHATSAPP_PROVIDER=EVOLUTION
EVOLUTION_API_URL=https://<evolution>.up.railway.app
EVOLUTION_API_KEY=<AUTHENTICATION_API_KEY>
EVOLUTION_WEBHOOK_SECRET=<long-random>
EVOLUTION_POLL_MS=3000
```

## panel-frontend environment variables

```env
VITE_BACKEND_URL=https://<panel-backend>.up.railway.app/
```

## Evolution API configuration

The backend will **auto-create** the instance on first connect and will register a webhook:

`<BACKEND_URL>/webhooks/evolution/<instanceName>?token=<EVOLUTION_WEBHOOK_SECRET>`

So you just need Evolution reachable + API key configured.

## First run (database)

After deploy, run migrations/seeds for the backend (Railway “Run Command”):

```bash
npx sequelize db:migrate
npx sequelize db:seed:all
```

## How to connect WhatsApp from the panel

1. Log in
2. Go to **Connections / WhatsApps**
3. Create a connection
   - **Name** = Evolution `instanceName` (example: `sector7`)
4. Click **QR Code** and scan

## Smoke test

- Send a message to that WhatsApp number → ticket appears in inbox
- Reply from inbox → message arrives in WhatsApp
