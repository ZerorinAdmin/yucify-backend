# Deployment: Vercel (Frontend) + Fly.io (Backend)

## Overview

- **Vercel**: Next.js frontend + API routes (auth, meta, boards, usage, etc.)
- **Fly.io**: AdSpy scraper backend (Playwright/Chromium)

## 1. Deploy Backend to Fly.io

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account (`fly auth login`)

### Deploy

From **repo root**:

```bash
# First time: create app (or skip if fly.toml already has app name)
fly launch --no-deploy   # creates app, use existing fly.toml

# Set required secret (generate with: openssl rand -hex 32)
fly secrets set BACKEND_SECRET=<your-secret>

# Create volume (first time only; use your primary region e.g. iad)
fly volumes create fb_profile --region iad -a yucify-backend --size 1

# Deploy
fly deploy
```

### One-time: Set up Facebook login (persistent session)

The scraper needs a logged-in Facebook session to fetch ads. A Fly volume persists the session across deploys.

**Step 1: Create the profile locally**

```bash
cd backend
ADSPY_FACEBOOK_PROFILE=./facebook-profile ADSPY_HEADLESS=false npm run dev
```

1. A browser window opens. Log in to Facebook manually.
2. Wait for the scraper to detect login (or close after logging in).
3. Stop the server (Ctrl+C). The session is saved in `facebook-profile/`.

**Step 2: Upload the profile to Fly**

```bash
# Ensure a machine is running (trigger a request to your app, or: fly scale count 1 -a yucify-backend)
fly ssh sftp shell -a yucify-backend

# In the sftp shell, from the backend/ directory:
put -r facebook-profile /data/
exit
```

This creates `/data/facebook-profile` (matches ADSPY_FACEBOOK_PROFILE in fly.toml).

**Step 3: Redeploy**

The app will use the persisted session. When the session expires (typically every few weeks), repeat Steps 1–2.

### After deploy

- Backend URL: `https://repto-backend.fly.dev` (or your app name)
- Health check: `curl https://repto-backend.fly.dev/health` (returns 401 without secret)
- Test with secret: `curl -H "X-Backend-Secret: YOUR_SECRET" https://repto-backend.fly.dev/health`

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
