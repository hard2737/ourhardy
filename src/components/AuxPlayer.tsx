"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type { Track } from "@/lib/trackCache"
import styles from "./AuxPlayer.module.css"

const CACHE_NAME = "aux-audio-v1"
const PLAY_COUNTS_KEY = "aux:playcounts"

type View = "all" | "offline"

function getPlayCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PLAY_COUNTS_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function incrementPlayCount(key: string) {
  const counts = getPlayCounts()
  counts[key] = (counts[key] ?? 0) + 1
  localStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(counts))
  return counts[key]
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AuxPlayer({ tracks }: { tracks: Track[] }) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("all")
  const [current, setCurrent] = useState<Track | null>(null)
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set())
  const [cacheSize, setCacheSize] = useState<number>(0)
  const [isOnline, setIsOnline] = useState(true)
  const [cachingKey, setCachingKey] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Register service worker for offline app shell
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down) }
  }, [])

  // Build cached key set and estimate size
  const refreshCacheList = useCallback(async () => {
    if (!("caches" in window)) return
    const cache = await caches.open(CACHE_NAME)
    const requests = await cache.keys()
    const keys = new Set(requests.map(r => {
      const url = new URL(r.url)
      // convert CDN URL back to key: strip leading "/"
      return url.pathname.slice(1)
    }))
    setCachedKeys(keys)

    // Estimate total size
    let total = 0
    for (const req of requests) {
      const res = await cache.match(req)
      if (res) {
        const buf = await res.clone().arrayBuffer()
        total += buf.byteLength
      }
    }
    setCacheSize(total)
  }, [])

  useEffect(() => { refreshCacheList() }, [refreshCacheList])

  async function cacheTrackInBackground(track: Track) {
    if (!("caches" in window)) return
    if (cachedKeys.has(track.key)) return
    try {
      setCachingKey(track.key)
      const cache = await caches.open(CACHE_NAME)
      const res = await fetch(track.url, { mode: "cors" })
      await cache.put(track.url, res)
      await refreshCacheList()
    } catch {
      // Non-fatal: cache miss just means online-only playback
    } finally {
      setCachingKey(null)
    }
  }

  async function removeCached(track: Track) {
    if (!("caches" in window)) return
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(track.url)
    await refreshCacheList()
  }

  async function playTrack(track: Track) {
    const el = audioRef.current
    if (!el) return

    incrementPlayCount(track.key)
    setCurrent(track)

    // Serve from cache if available, otherwise stream and cache in background
    if (cachedKeys.has(track.key) && "caches" in window) {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(track.url)
      if (cached) {
        const blob = await cached.blob()
        const blobUrl = URL.createObjectURL(blob)
        el.src = blobUrl
        el.play()
        return
      }
    }

    el.src = track.url
    el.play()
    cacheTrackInBackground(track)
  }

  const filtered = query.length < 2
    ? (view === "offline" ? [] : tracks.slice(0, 50))
    : tracks.filter(t =>
        `${t.artist} ${t.album} ${t.title}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 200)

  const displayTracks = view === "offline"
    ? tracks.filter(t => cachedKeys.has(t.key))
    : filtered

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>aux</span>
        {!isOnline && <span className={styles.offline}>offline</span>}
        <nav className={styles.tabs}>
          <button
            className={view === "all" ? styles.activeTab : styles.tab}
            onClick={() => setView("all")}
          >all</button>
          <button
            className={view === "offline" ? styles.activeTab : styles.tab}
            onClick={() => setView("offline")}
          >
            cached {cachedKeys.size > 0 && <span className={styles.count}>{cachedKeys.size}</span>}
          </button>
        </nav>
      </header>

      {view === "all" && (
        <input
          className={styles.search}
          autoFocus
          placeholder="artist, album, or track..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}

      {view === "offline" && (
        <div className={styles.cacheInfo}>
          {cachedKeys.size} tracks · {fmtBytes(cacheSize)}
        </div>
      )}

      <ul className={styles.list}>
        {displayTracks.map(track => (
          <li
            key={track.key}
            className={[
              styles.track,
              current?.key === track.key ? styles.playing : "",
              cachedKeys.has(track.key) ? styles.cached : "",
            ].join(" ")}
            onClick={() => playTrack(track)}
          >
            <div className={styles.meta}>
              <span className={styles.title}>{track.title}</span>
              <span className={styles.sub}>{track.artist}{track.album ? ` · ${track.album}` : ""}</span>
            </div>
            <div className={styles.actions}>
              {cachingKey === track.key && <span className={styles.spinner}>⋯</span>}
              {cachedKeys.has(track.key) && cachingKey !== track.key && (
                <button
                  className={styles.removeBtn}
                  title="Remove from cache"
                  onClick={e => { e.stopPropagation(); removeCached(track) }}
                >✕</button>
              )}
            </div>
          </li>
        ))}
        {displayTracks.length === 0 && (
          <li className={styles.empty}>
            {view === "offline" ? "No cached tracks." : query.length < 2 ? "Type to search." : "No results."}
          </li>
        )}
      </ul>

      <div className={styles.player}>
        {current && (
          <div className={styles.nowPlaying}>
            <span className={styles.np}>{current.title}</span>
            <span className={styles.npSub}>{current.artist}</span>
          </div>
        )}
        <audio ref={audioRef} controls className={styles.audio} crossOrigin="anonymous" />
      </div>
    </div>
  )
}
