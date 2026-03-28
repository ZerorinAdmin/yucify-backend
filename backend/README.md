# Repto Backend (AdSpy Scraper)

Node.js + Express + Playwright service for Fly.io. Handles scrape, search-pages, and resolve-page.

## Deploy to Fly.io

From **repo root**:

```bash
fly secrets set BACKEND_SECRET=$(openssl rand -hex 32)
fly deploy
```

## Local dev

```bash
cd backend
npm install
BACKEND_SECRET=dev-secret npm run dev
```

## Env vars (Fly secrets)

| Secret | Required | Description |
|--------|----------|-------------|
| `BACKEND_SECRET` | Yes | Shared with Vercel; authenticates requests |
| `OPENAI_API_KEY` | Yes | Used for `/transcribe-0-5s` (audio → text) |
| `FFMPEG_PATH` | No | Absolute path to `ffmpeg` on macOS if `spawn ffmpeg` fails (ENOENT); otherwise `/opt/homebrew/bin/ffmpeg` and `/usr/local/bin/ffmpeg` are tried, then `PATH` |
| `ADSPY_FACEBOOK_PROFILE` | No | Path for persistent login (e.g. `/data/fb-profile`) |
| `ADSPY_HEADLESS` | No | `false` for visible browser (default: headless) |
