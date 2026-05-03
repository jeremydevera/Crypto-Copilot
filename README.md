# Crypto Copilot

Monorepo for the Crypto Copilot web app, iOS app, backend signal engine, Supabase migrations, and shared docs/configs.

## Structure

```text
Crypto-Copilot/
  web/        React + Vite dashboard
  ios/        Swift iOS app
  backend/    Node/Express backend and market-data worker
  supabase/   Database migrations
  shared/     Shared docs and strategy configs
```

## Local Development

From the repo root:

```bash
npm run dev
```

This starts the backend on `http://localhost:3001` and the web app on `http://localhost:5173`.

You can also run them separately:

```bash
npm run dev:backend
npm run dev:web
```

## Environment Files

Copy the examples before running locally:

```bash
cp web/.env.example web/.env
cp backend/.env.example backend/.env
```

Then fill in your Supabase values.

## Production Hosting

- Backend: Render or Railway, because it needs long-running Node/WebSocket support.
- Web: Vercel, Netlify, or Render Static Site.
- Database/auth: Supabase.
