This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Vercel
[ourhardy server](https://ourhardy.vercel.app) from CNAME
### AWS
[ourhardy site](https://app.ourhardy.com)
### How to connect
https://medium.com/@andyasprou/how-to-use-vercel-and-route-53-for-your-root-domain-7ee25b4cf9fc
### AWS S3 / CloudFront
- Using CloudFront Distributions to handle s3://ourhardy.com to https://www.ourhardy.com

---

## /aux — Music Player

Lightweight SPA music player at `https://app.ourhardy.com/aux`. Streams from `s3://ourhardy.com/aux/x/` via CloudFront (`https://www.ourhardy.com/aux/x/`). Supports search, offline playback, and local audio caching via IndexedDB.

### Architecture

- **Track listing** — `src/lib/trackCache.ts` crawls S3 `aux/x/` on first request and caches the result for 30 days using Next.js `"use cache"` (Vercel Data Cache). No external store required.
- **Search** — client-side filter over the full track list embedded in the page on load.
- **Audio caching** — `src/lib/audioDb.ts` stores raw audio blobs in IndexedDB (`aux-audio-db`). Tracks are fetched with streaming progress and written to IDB on completion. Play counts tracked in `localStorage`.
- **Playback from cache** — cached tracks are served via `URL.createObjectURL(blob)`. The previous object URL is revoked each time a new one is created (and on unmount) to avoid memory leaks. Tracks not yet cached stream directly from CloudFront and are downloaded to IDB in the background.
- **Audio element CORS** — the `<audio>` element does **not** use `crossOrigin="anonymous"`. That attribute causes the browser to send an `Origin` header with every media request; CloudFront's CORS policy only allows `https://app.ourhardy.com`, so any other origin (including `localhost`) would receive a CORS rejection surfaced as `MEDIA_ERR_SRC_NOT_SUPPORTED`. Since WebAudio API canvas access is not required, omitting the attribute lets the browser make a plain (non-CORS) request that CloudFront serves without restriction.
- **Explicit offline download** — each track row shows a `↓` button (visible on hover) that downloads the track to IDB with a live `n%` progress indicator. No need to play a track first.
- **Persistent storage** — `navigator.storage.persist()` is requested on mount so the browser does not evict the IndexedDB store under storage pressure.
- **Offline view** — "cached" tab lists all locally stored tracks with total size and per-track removal.
- **Service worker** — `public/sw.js` caches the app shell (`/aux`) for offline access. Audio blobs are managed by `audioDb.ts`, not the service worker.
- **Registration & access control** — new users submit a request via the login page; `POST /api/auth/register` records them in the `registrations` table. `POST /api/auth/request-otp` gates on user existence and returns `403 { code: "NOT_REGISTERED" }` for unrecognised emails (bypassed for admin). The admin "access" tab in AuxPlayer lists pending requests with approve/deny buttons (`PATCH /api/registrations/[id]`); a badge on the tab shows the pending count. Approval emails are sent via `lib/email.ts` (`sendApprovalEmail`); new registration notifications go to `ADMIN_EMAIL` (`sendRegistrationNotification`). Email addresses are validated on submission using `src/lib/emailValidation.ts` (MX check, disposable domain blocklist, bot pattern detection).

### Why IndexedDB over Cache API

| | Cache API (old) | IndexedDB (current) |
|---|---|---|
| Eviction | Browser may evict silently | Persistent with `storage.persist()` |
| Download progress | Not possible | Streaming `ReadableStream` reader |
| Explicit pre-download | Not possible | ✓ |
| Storage control | Opaque HTTP responses | Raw blobs, queryable metadata |
| Playback | Direct URL or blob URL | `URL.createObjectURL(blob)` |

The one caveat with `URL.createObjectURL`: the object URL must be revoked when no longer needed or the backing memory is never freed. `AuxPlayer.tsx` tracks the active URL in a ref (`blobUrlRef`) and revokes it on every track switch and on component unmount.

- TODO
- [ ] get these back
01 Don't Know Why.mp3 
x/Norah Jones/Come Away With Me/
mp3
-
1.4 MB
The specified key does not exist.
01 Somebody Hates Me.mp3 
x/Reel Big Fish/Why Do They Rock So Hard/
mp3
-
1.6 MB
The specified key does not exist.
02 Gravity Rides Everything.mp3 
x/Modest Mouse/Moon and Antarctica/
mp3
-
5.0 MB
The specified key does not exist.
03 Dark Center of the Universe.mp3 
x/Modest Mouse/Moon and Antarctica/
mp3
-
5.8 MB
The specified key does not exist.
05 Don't Ever Fuckn' Question Tha.mp3 
x/Atmosphere/The Lucy Ford_ The Atmosphere EP's/
mp3
-
5.9 MB
The specified key does not exist.
07 Banditos.mp3 
x/Refreshments/Fizzy Fuzzy Big & Buzzy/
mp3
-
2.0 MB
The specified key does not exist.
07 Turn Me On.mp3 
x/Norah Jones/Come Away With Me [UK]/
mp3
-
1.2 MB
The specified key does not exist.
12 You Played Yourself.mp3 
x/Atmosphere/Strictly Leakage/
mp3
-
6.1 MB
The specified key does not exist.
14 Let's Groove.mp3 
x/Earth Wind & Fire/Unknown Album/
mp3
-
6.4 MB
The specified key does not exist.
Serpentine Fire.mp3 
x/Earth Wind & Fire/Unknown Album/
mp3
-
3.4 MB
The specified key does not exist.


### CLI Tools

| Tool | Install | Purpose |
|---|---|---|
| Vercel CLI | `npm i -g vercel` | Deploy, manage env vars, inspect project |
| Neon CLI | `npm i -g neonctl` | Manage Neon Postgres projects, branches, connection strings |

```bash
# Verify auth / current state
vercel whoami
vercel env ls
neonctl me
neonctl projects list --org-id org-green-pond-68012790
```

### Neon Database

**Project:** guinnessDB (`empty-star-16173401`) — `org-green-pond-68012790` (Vercel: David Hardy's projects)
**Region:** `aws-us-west-2` — matches Vercel deployment region
**Database:** `neondb` · **Branch:** `main` (`br-ancient-moon-afxuubgl`)

```bash
# Get connection strings
neonctl connection-string \
  --project-id empty-star-16173401 \
  --org-id org-green-pond-68012790           # direct (non-pooled)

neonctl connection-string \
  --project-id empty-star-16173401 \
  --org-id org-green-pond-68012790 \
  --pooled                                   # pooled — use this for POSTGRES_URL
```

Neon databases are plain Postgres instances. They are **not owned by or attached to a Vercel project** — multiple projects can share the same database. Linking is just adding the connection string as `POSTGRES_URL`.

```bash
# Test connection (confirm tables exist after migration)
node --input-type=module --env-file=.env.local <<'EOF'
import postgres from './node_modules/postgres/src/index.js'
const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1 })
const tables = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`
console.log('Tables:', tables.map(r => r.tablename).join(', '))
await sql.end()
EOF
# Expected output: Tables: otps, playlist_tracks, playlists, users
```

### Environment Variables

All vars confirmed set. `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are consumed directly by the AWS SDK — not referenced via `process.env` in code. `VERCEL_URL` is injected automatically by Vercel.

| Variable | Used in | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `sitemap.ts`, `robots.ts` | Falls back to `VERCEL_URL` then hardcoded URL |
| `AWS_REGION` | `lib/trackCache.ts` | |
| `AWS_PROFILE` | AWS SDK (local dev) | Named profile — alternative to static keys |
| `AWS_ACCESS_KEY_ID` | AWS SDK (production) | Set in Vercel Production only |
| `AWS_SECRET_ACCESS_KEY` | AWS SDK (production) | Set in Vercel Production only |
| `POSTGRES_URL` | `lib/db.ts`, `scripts/db-migrate.ts` | Pooled Neon connection string |
| `SMTP_HOST` | `lib/email.ts` | |
| `SMTP_PORT` | `lib/email.ts` | |
| `SMTP_USER` | `lib/email.ts` | |
| `SMTP_PASS` | `lib/email.ts` | Gmail App Password |
| `SMTP_FROM` | `lib/email.ts` | Address only — display name "Captain Shitbag" is hardcoded |
| `ADMIN_EMAIL` | `aux/page.tsx`, `api/playlists/*`, `api/cache/clear`, `api/registrations/*`, `api/auth/register` | Determines admin vs regular user; also receives registration notification emails |
| `SESSION_SECRET` | `lib/session.ts` | JWT signing key — `openssl rand -base64 32` |

**Vercel state** (`vercel env ls`):

| Variable | Production | Preview | Development |
|---|---|---|---|
| `POSTGRES_URL` | ✅ | ✅ | ✅ |
| `AWS_ACCESS_KEY_ID` | ✅ | — | — |
| `AWS_SECRET_ACCESS_KEY` | ✅ | — | — |
| `AWS_REGION` | ✅ | — | — |
| `SMTP_HOST` | ✅ | ✅ | ✅ |
| `SMTP_PORT` | ✅ | ✅ | ✅ |
| `SMTP_USER` | ✅ | ✅ | ✅ |
| `SMTP_PASS` | ✅ | ✅ | ✅ |
| `SMTP_FROM` | ✅ | ✅ | ✅ |
| `ADMIN_EMAIL` | ✅ | ✅ | ✅ |
| `SESSION_SECRET` | ✅ | ✅ | ✅ |

### Deployment Checklist

- [x] Set all four Vercel environment variables above — set via `vercel env add` for production. Secret stored in `.env.local` for local use.
- [x] Apply S3 CORS policy to allow `app.ourhardy.com` to fetch audio:
  ```bash
  aws s3api put-bucket-cors --profile ourhardy --bucket ourhardy.com --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://app.ourhardy.com"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["Range", "Origin"],
      "ExposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length"],
      "MaxAgeSeconds": 86400
    }]
  }'
  ```
- [x] Deploy `cloudfront-functions/add-cors-headers.js` to the `www.ourhardy.com` CloudFront distribution as a **viewer-response** function on the `/aux/*` behavior (same process as `block-probe-paths.js`)
	- [x] `aws cloudfront create-function --name add-cors-headers --function-config '{"Comment":"CORS for aux audio","Runtime":"cloudfront-js-2.0"}' --function-code fileb://cloudfront-functions/add-cors-headers.js --profile ourhardy`
	- [x] `aws cloudfront publish-function --name add-cors-headers --if-match $(aws cloudfront describe-function --name add-cors-headers --profile ourhardy --query 'ETag' --output text) --profile ourhardy`
	- [x] `aws cloudfront get-distribution-config --id E359Q5YGQ4LUI6 --profile ourhardy --output json > dist-config.json`
	- [x] Added `FunctionAssociations` to `DefaultCacheBehavior` via Python + `aws cloudfront update-distribution --id E359Q5YGQ4LUI6 --if-match E3JWKAKR8XB7XF` — deployed to Default (*) behavior (function guards internally on `/aux/`)
	- [x] test: `aws cloudfront get-distribution --id E359Q5YGQ4LUI6 --profile ourhardy --output json --query 'Distribution.Status' --output text`
- [x] Initial deploy via `vercel --prod` — failed with 500 due to `URIError: URI malformed` in `parseKey` (S3 keys are raw strings, not URL-encoded; `decodeURIComponent` blew up on filenames containing `%`). Fixed by removing `decodeURIComponent` calls in `src/lib/trackCache.ts`.
- [x] Redeployed via `vercel --prod` — live at https://app.ourhardy.com/aux

### How the track keys work

S3 returns object keys as raw strings (e.g. `aux/x/Björk/Debut/01 Human Behaviour.mp3`). `parseKey` in `src/lib/trackCache.ts` splits on `/`, strips the `aux/x/` prefix, and maps the remaining segments to `artist / album / title`. Do not use `decodeURIComponent` on these — the keys are not percent-encoded.

### Registration & Access

New users cannot request an OTP until they have been approved. The flow:

1. User visits `/aux` → redirected to `/login`.
2. They enter an email that isn't in the `users` table. The login page detects the `NOT_REGISTERED` response from `POST /api/auth/request-otp` and switches to a "request access" step.
3. User submits the form → `POST /api/auth/register` validates the address via `src/lib/emailValidation.ts` (MX lookup, disposable domain blocklist, bot pattern detection), writes a row to the `registrations` table, and emails `ADMIN_EMAIL` via `sendRegistrationNotification`.
4. The admin signs in and opens the "access" tab in AuxPlayer. A badge on the tab reflects the number of pending requests. Each row has Approve / Deny buttons that call `PATCH /api/registrations/[id]`.
5. On approval the user is inserted into the `users` table and `sendApprovalEmail` notifies them that they now have access.

### Clearing the Track Cache

The track listing is cached for 30 days. To force a refresh after adding or removing files in S3, use the `↺` button in the `/aux` header — visible only when signed in as the admin. It calls `POST /api/cache/clear` (admin session required), invalidates the `aux-tracks` Vercel Data Cache tag, and reloads the page.
