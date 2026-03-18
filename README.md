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

Lightweight SPA music player at `https://app.ourhardy.com/aux`. Streams from `s3://ourhardy.com/aux/x/` via CloudFront (`https://www.ourhardy.com/aux/x/`). Supports search, offline playback, and local audio caching via the browser Cache API.

### Architecture

- **Track listing** — `src/lib/trackCache.ts` crawls S3 `aux/x/` on first request and caches the result for 30 days using Next.js `"use cache"` (Vercel Data Cache). No external store required.
- **Search** — client-side filter over the full track list embedded in the page on load.
- **Audio caching** — tracks are cached in the browser Cache API (`aux-audio-v1`) when played and served as blob URLs offline. Play counts tracked in `localStorage`.
- **Offline view** — "cached" tab in the player lists all locally cached tracks with cache size and per-track removal.
- **Service worker** — `public/sw.js` caches the app shell (`/aux`) for offline access.

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


### Vercel Environment Variables

Set these in the Vercel project dashboard (Settings → Environment Variables):

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2
CACHE_CLEAR_SECRET=<random secret for the clear-cache script>
```

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

### Clearing the Track Cache

The track listing is cached for 30 days. To force a refresh (e.g. after adding files to S3):

```bash
APP_URL=https://app.ourhardy.com CACHE_CLEAR_SECRET=<secret> npx tsx scripts/clear-cache.ts
```

Or directly via curl:

```bash
curl -X POST https://app.ourhardy.com/api/cache/clear \
  -H "x-cache-secret: <secret>"
```
