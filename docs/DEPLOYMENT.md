# Deployment: Vercel (Frontend) + Fly.io (Backend)

## Overview

- **Vercel**: Next.js frontend + API routes (auth, meta, boards, usage, etc.)
- **Fly.io**: AdSpy scraper backend (Playwright/Chromium)

## 1. Deploy Backend to Fly.io

From repo root:

```bash
# Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
fly launch   # or fly apps create repto-backend
fly deploy
```

Set secrets:

```bash
fly secrets set BACKEND_SECRET=<random-secret>
fly secrets set ADSPY_FACEBOOK_PROFILE=/data/fb-profile  # optional, for persistent login
```

Get your backend URL: `https://repto-backend.fly.dev`

## 2. Deploy Frontend to Vercel

```bash
vercel
```

Set environment variables in Vercel:

| Variable | Description |
|----------|-------------|
| `ADSPY_BACKEND_URL` | Backend URL, e.g. `https://repto-backend.fly.dev` |
| `ADSPY_BACKEND_SECRET` | Same value as `BACKEND_SECRET` on Fly.io |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | For auth callback, admin |
| ... | Other existing env vars (OpenAI, Resend, etc.) |

## 3. Local Development

Run both:

```bash
# Terminal 1: Backend (from repo root)
cd backend && npm install && npm run dev

# Terminal 2: Frontend
npm run dev
```

Create `.env.local`:

```
ADSPY_BACKEND_URL=http://localhost:8080
ADSPY_BACKEND_SECRET=dev-secret
```

And in `backend/`, create `.env`:

```
BACKEND_SECRET=dev-secret
ADSPY_FACEBOOK_PROFILE=./fb-profile  # optional
```

## 4. Notes

- **Backend excluded from Vercel**: The `backend/` folder is in `.vercelignore` and `tsconfig.json` exclude. It deploys only to Fly.io.
- **Playwright**: Not used on Vercel. The `/api/adspy/debug` route returns 503 when deployed; full diagnostics require running locally.
- **Resend**: `RESEND_API_KEY` is required only at runtime when sending alerts. Build succeeds without it.
- **Backend auth**: All backend requests must include `X-Backend-Secret` header. Only the Vercel API routes call the backend; never expose the secret to the client.
