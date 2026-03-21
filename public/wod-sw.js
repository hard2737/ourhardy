// WOD service worker — offline caching + result submission queue.

const CACHE_NAME = "wod-v1"
const SHELL_URLS = ["/wod"]
const DB_NAME = "wod-outbox"
const STORE_NAME = "pending"

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function enqueue(request) {
  const db = await openDB()
  const body = await request.clone().text()
  const tx = db.transaction(STORE_NAME, "readwrite")
  tx.objectStore(STORE_NAME).add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  })
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

async function replayQueue() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const items = await new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      })
      if (res.ok) {
        const delTx = db.transaction(STORE_NAME, "readwrite")
        delTx.objectStore(STORE_NAME).delete(item.id)
      }
    } catch {
      // still offline — stop replaying
      break
    }
  }
}

// ── Install ────────────────────────────────────────────────────────────────

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

// ── Activate ───────────────────────────────────────────────────────────────

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("wod-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)

  // Only handle same-origin
  if (url.origin !== self.location.origin) return

  // ── Navigation (HTML pages) ──────────────────────────────────────────
  if (e.request.mode === "navigate" && url.pathname.startsWith("/wod")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/wod")))
    )
    return
  }

  // ── API GET requests (stale-while-revalidate) ────────────────────────
  if (url.pathname.startsWith("/api/wod/") && e.request.method === "GET") {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(e.request)
        const networkPromise = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        }).catch(() => null)

        // Return cached immediately, update in background
        if (cached) {
          networkPromise // fire-and-forget update
          return cached
        }
        // No cache — wait for network
        const networkRes = await networkPromise
        return networkRes || new Response('{"error":"offline"}', {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      })
    )
    return
  }

  // ── API POST/DELETE (result submission queue) ────────────────────────
  if (url.pathname.startsWith("/api/wod/") && (e.request.method === "POST" || e.request.method === "DELETE")) {
    e.respondWith(
      fetch(e.request.clone()).catch(async () => {
        // Queue for later sync
        await enqueue(e.request)
        // Notify clients
        const clients = await self.clients.matchAll()
        clients.forEach((c) => c.postMessage({ type: "WOD_QUEUED" }))
        return new Response(JSON.stringify({ ok: true, queued: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      })
    )
    return
  }

  // ── Static assets (/_next/static) — cache-first ─────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        const res = await fetch(e.request)
        if (res.ok) cache.put(e.request, res.clone())
        return res
      })
    )
    return
  }

  // Everything else — network only
})

// ── Background sync ────────────────────────────────────────────────────────

self.addEventListener("sync", (e) => {
  if (e.tag === "wod-outbox") {
    e.waitUntil(replayQueue())
  }
})

// Fallback: replay on message from client
self.addEventListener("message", (e) => {
  if (e.data === "REPLAY_QUEUE") {
    replayQueue()
  }
})
