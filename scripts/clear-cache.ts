#!/usr/bin/env npx tsx
/**
 * Clears the aux-tracks Vercel Data Cache.
 * The next request to /aux will re-crawl S3 and repopulate the cache.
 *
 * Usage:
 *   APP_URL=https://app.ourhardy.com CACHE_CLEAR_SECRET=your-secret npx tsx scripts/clear-cache.ts
 *
 * Or with a .env.local:
 *   npx tsx --env-file=.env.local scripts/clear-cache.ts
 */

export {}

const url = process.env.APP_URL
const secret = process.env.CACHE_CLEAR_SECRET

if (!url || !secret) {
  console.error("Missing APP_URL or CACHE_CLEAR_SECRET env vars")
  process.exit(1)
}

const res = await fetch(`${url}/api/cache/clear`, {
  method: "POST",
  headers: { "x-cache-secret": secret },
})

const body = await res.json()

if (!res.ok) {
  console.error(`Failed (${res.status}):`, body)
  process.exit(1)
}

console.log("Cache cleared:", body)
