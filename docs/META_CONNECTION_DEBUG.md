# Meta Connection Debugging Guide

## ✅ Scope verification

**We ARE including the correct scopes.** In `/api/meta/connect`:

```
scope=ads_read,business_management
```

The OAuth URL is built as:
```
https://www.facebook.com/v21.0/dialog/oauth?client_id=...&redirect_uri=...&state=...&scope=ads_read%2Cbusiness_management
```

So the token request includes `ads_read` and `business_management`. If you still get no ad accounts, the app may need App Review for these permissions, or the Facebook account may need Business Manager access.

---

## Possible causes (NULL token + empty ad_accounts)

| # | Cause | Symptom | How to verify |
|---|-------|---------|---------------|
| 1 | **Redirect URI mismatch** | Token exchange fails; Meta returns error | Check server logs for `[meta/callback] Token exchange failed` with Meta response. Connect and callback must use identical `redirect_uri`. |
| 2 | **Callback never hit** | User lands on connect-meta with state but row never updated | Check if you see any `[meta/callback]` logs when completing Facebook flow. If none, redirect from Facebook may be wrong or blocked. |
| 3 | **Missing code/state in callback** | Facebook redirects without code (e.g. user denied, or error) | Check logs for `[meta/callback] Missing code or state`. Inspect the full URL Facebook redirects to. |
| 4 | **NEXT_PUBLIC_SITE_URL mismatch** | Connect uses `request.origin` (localhost), callback uses env (e.g. 127.0.0.1) | Connect and callback build `redirect_uri` differently. Connect: `request.nextUrl.origin`. Callback: `NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin`. If env is set to different host, token exchange fails. |
| 5 | **ENCRYPTION_KEY missing/invalid** | `encrypt()` throws before DB update | Check logs for `[meta/callback] Encrypt or DB update failed`. Ensure `ENCRYPTION_KEY` is set and ≥32 chars. |
| 6 | **Supabase RLS blocks update** | Update to `meta_connect_flow` fails — **no UPDATE policy existed** | **FIX:** Run migration `20250301000004_meta_connect_flow_update_policy.sql` to add the missing UPDATE policy. Without it, the callback cannot update the row and token stays NULL. |
| 7 | **Facebook app not in correct mode** | Development mode limits who can auth | Only app roles (admins, devs, testers) can complete login. Add your Facebook account as Tester. |
| 8 | **ads_read / business_management not approved** | Token has no ad permissions; `/me/adaccounts` returns empty or error | In Development mode these may work for test users. Check `[meta/callback] Ad accounts API error` or `No ad accounts returned` in logs. |
| 9 | **Facebook redirects to wrong URL** | Valid OAuth Redirect URIs in app don’t include our callback | Even if Facebook adds defaults, ensure `http://localhost:3000/api/meta/callback` is in the list. Must match exactly (no trailing slash, correct scheme/host). |

---

## Structured debugging steps

### Step 1: Confirm callback is reached

1. Run `npm run dev`.
2. Click "Connect with Facebook" and complete the Facebook flow.
3. Watch the terminal for `[meta/callback]` logs.

- **No logs at all** → Callback never hit. Go to Step 2.
- **`Missing code or state`** → Facebook didn’t send code. Go to Step 3.
- **`Token exchange failed`** → Token exchange failed. Go to Step 4.
- **`Encrypt or DB update failed`** → Encryption or DB issue. Go to Step 5.
- **Redirect to connect-meta** → Callback completed. If ad_accounts still empty, go to Step 6.

### Step 2: Callback not hit

- Check Facebook app **Valid OAuth Redirect URIs**: include `http://localhost:3000/api/meta/callback`.
- Ensure you’re using `http://localhost:3000` (not `https` or `127.0.0.1`) unless you explicitly use that.
- After Facebook auth, note the URL you’re redirected to. It should be `http://localhost:3000/api/meta/callback?code=...&state=...`.

### Step 3: Missing code or state

- Logs will show `URL searchParams: {...}`. Check for `code`, `state`, or `error`.
- If `error` is present, Facebook rejected the request (e.g. user denied, invalid redirect_uri).
- If URL has no query params, redirect_uri may be wrong.

### Step 4: Token exchange failed

- Logs show `redirect_uri used:` and `Meta response:`.
- If Meta returns `redirect_uri_mismatch`, connect and callback use different URIs.
- **Fix:** Unset `NEXT_PUBLIC_SITE_URL` for local dev, or set it to `http://localhost:3000` to match the browser.

### Step 5: Encrypt or DB update failed

- Ensure `ENCRYPTION_KEY` is set in `.env.local` and is at least 32 characters.
- Check Supabase for failed requests or RLS denials on `meta_connect_flow`.

### Step 6: Callback succeeds but no ad accounts

- Token is stored; `encrypted_access_token` should be non-NULL.
- If `ad_accounts` is still `[]`, the `/me/adaccounts` call returned empty.
- Possible reasons:
  - App in Development mode and `ads_read` not approved for your use case.
  - Facebook account has no ad accounts, or they’re only in Business Manager and the token doesn’t have access.
  - Add your account as Tester and ensure the ad account is assigned to your user in Business Manager.

---

## Redirect URI consistency

| Step | Where | How redirect_uri is built |
|------|-------|---------------------------|
| Connect | `/api/meta/connect` | `request.nextUrl.origin` + `/api/meta/callback` |
| Callback (token exchange) | `/api/meta/callback` | `NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin` + `/api/meta/callback` |

For local dev, leave `NEXT_PUBLIC_SITE_URL` unset so both use `request.nextUrl.origin` (e.g. `http://localhost:3000`).

---

## Facebook app checklist

- [ ] Facebook Login product added
- [ ] Valid OAuth Redirect URIs includes `http://localhost:3000/api/meta/callback`
- [ ] App in Development mode: your Facebook account added as Admin/Developer/Tester
- [ ] `ads_read` and `business_management` requested in App Review (or available for test users)
- [ ] App ID and App Secret in `.env.local` as `META_APP_ID` and `META_APP_SECRET`
