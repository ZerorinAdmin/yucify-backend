# Repto — Meta Ads Reporting & Spy Tool

SaaS app for ad monitoring and creative inspiration. See `.cursor/rules/requirements.mdc` for full specs.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Run the migration:

```bash
npx supabase db push
```

Or run the SQL in `supabase/migrations/` manually in the Supabase SQL Editor (001, 002, 003, 004). **Important:** Migration 004 adds the missing UPDATE policy for `meta_connect_flow` — without it, the Meta callback cannot save the token.

3. Enable **Google** and **Facebook** providers in Authentication → Providers
4. Add redirect URL: `http://localhost:3000/auth/callback` (and your production URL)

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase Project Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Project Settings → API
- `META_APP_ID` / `META_APP_SECRET` — from [Meta for Developers](https://developers.facebook.com) (create an app, add Facebook Login; add redirect URI `http://localhost:3000/api/meta/callback`)
- `ENCRYPTION_KEY` — a random string ≥32 characters (for encrypting stored tokens)
- `SUPABASE_SERVICE_ROLE_KEY` — for admin API and creating user_usage_limits on signup; from Supabase Project Settings → API
- `ADMIN_SECRET` — (optional) for admin limits API; set `x-admin-secret` header when calling `/api/admin/limits`

### 4. Run the app

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

**If you see Turbopack errors** (e.g. `Cannot find module '.next/transform.js'` or `app-build-manifest.json`): the default `npm run dev` uses the stable webpack dev server. Use `npm run dev:turbo` only if you want to try Turbopack; if it panics, run `rm -rf .next` and use `npm run dev` again.

## Development order (per requirements)

1. ✅ Auth (Google + Facebook OAuth, profiles table)
2. ✅ Meta connection (Connect with Facebook → select ad account → store encrypted token)
3. ✅ Metrics pull + storage (daily ad-level: spend, impressions, clicks, CTR, CPC, frequency, ROAS)
4. Health engine
5. Dashboard UI
6. Email alerts
7. Weekly AI summary
8. Ad library search
9. Inspiration board
10. AI creative tagging
