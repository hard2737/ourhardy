// Service worker — caches app shell for offline support.
// Audio files are cached directly by AuxPlayer.tsx via the Cache API.

const SHELL_CACHE = "aux-shell-v1"
const SHELL_ASSETS = ["/aux", "/aux/"]

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  // Purge old shell caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("aux-shell-") && k !== SHELL_CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)
  // Only handle same-origin navigation requests
  if (e.request.mode !== "navigate" || url.origin !== self.location.origin) return

  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match("/aux").then(r => r ?? Response.error())
    )
  )
})
