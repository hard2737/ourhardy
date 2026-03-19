"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import type { Track } from "@/lib/trackCache"
import styles from "./AuxPlayer.module.css"
import { getTrackBlob, getAllCacheEntries, deleteTrack, downloadTrack } from "@/lib/audioDb"

const PLAY_COUNTS_KEY = "aux:playcounts"

type View = "search" | "artists" | "cached"
type BrowseLevel =
  | { level: "artists" }
  | { level: "albums"; artist: string }
  | { level: "tracks"; artist: string; album: string }

function buildShuffledQueue(tracks: Track[], excludeKey?: string): Track[] {
  const pool = excludeKey ? tracks.filter(t => t.key !== excludeKey) : [...tracks]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

function getPlayCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PLAY_COUNTS_KEY) ?? "{}") }
  catch { return {} }
}

function incrementPlayCount(key: string) {
  const counts = getPlayCounts()
  counts[key] = (counts[key] ?? 0) + 1
  localStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(counts))
}

function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AuxPlayer({ tracks }: { tracks: Track[] }) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("search")
  const [browse, setBrowse] = useState<BrowseLevel>({ level: "artists" })
  const [current, setCurrent] = useState<Track | null>(null)
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set())
  const [cacheSize, setCacheSize] = useState<number>(0)
  const [isOnline, setIsOnline] = useState(true)
  const [shuffle, setShuffle] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})

  const audioRef = useRef<HTMLAudioElement>(null)
  // Active blob URL — revoke previous before creating a new one to prevent leaks
  const blobUrlRef = useRef<string | null>(null)
  // Refs for stable onEnded handler
  const shuffleRef = useRef(false)
  const shuffleQueueRef = useRef<Track[]>([])
  const currentRef = useRef<Track | null>(null)
  // Sequential playlist (album or search results) for non-shuffle auto-advance
  const playlistRef = useRef<Track[]>([])
  // Updated each render so onEnded always calls the latest playTrack closure
  const playTrackRef = useRef<(track: Track, playlist?: Track[]) => Promise<void>>(async () => {})

  // artist → album → tracks (derived once from stable prop)
  const byArtist = useMemo(() => {
    const map = new Map<string, Map<string, Track[]>>()
    for (const t of tracks) {
      if (!map.has(t.artist)) map.set(t.artist, new Map())
      const albums = map.get(t.artist)!
      const albumKey = t.album || "—"
      if (!albums.has(albumKey)) albums.set(albumKey, [])
      albums.get(albumKey)!.push(t)
    }
    return map
  }, [tracks])

  const artistList = useMemo(() =>
    [...byArtist.keys()].sort((a, b) => a.localeCompare(b))
  , [byArtist])

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    navigator.storage?.persist?.().catch(() => {})
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const refreshCacheList = useCallback(async () => {
    try {
      const entries = await getAllCacheEntries()
      setCachedKeys(new Set(entries.map(e => e.key)))
      setCacheSize(entries.reduce((sum, e) => sum + e.size, 0))
    } catch {
      // IDB unavailable (e.g. Firefox private browsing)
    }
  }, [])

  useEffect(() => { refreshCacheList() }, [refreshCacheList])

  // Stable onEnded: advance shuffle queue or sequential playlist
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onEnded = () => {
      if (shuffleRef.current) {
        if (shuffleQueueRef.current.length === 0) {
          shuffleQueueRef.current = buildShuffledQueue(tracks, currentRef.current?.key)
        }
        const next = shuffleQueueRef.current.pop()
        if (next) playTrackRef.current(next)
      } else {
        const playlist = playlistRef.current
        const idx = playlist.findIndex(t => t.key === currentRef.current?.key)
        if (idx >= 0 && idx < playlist.length - 1) {
          playTrackRef.current(playlist[idx + 1])
        }
      }
    }
    el.addEventListener("ended", onEnded)
    return () => el.removeEventListener("ended", onEnded)
  }, [tracks]) // tracks is a stable server-rendered prop

  function toggleShuffle() {
    const next = !shuffle
    setShuffle(next)
    shuffleRef.current = next
    if (next) {
      shuffleQueueRef.current = buildShuffledQueue(tracks, current?.key)
    }
  }

  function playBlobUrl(blob: Blob) {
    const el = audioRef.current
    if (!el) return
    const prev = blobUrlRef.current
    const next = URL.createObjectURL(blob)
    blobUrlRef.current = next
    el.src = next
    el.play()
    if (prev) URL.revokeObjectURL(prev)
  }

  async function fetchAndCache(track: Track) {
    setDownloadProgress(p => ({ ...p, [track.key]: 0 }))
    try {
      await downloadTrack(track.url, track.key, pct => {
        setDownloadProgress(p => ({ ...p, [track.key]: pct }))
      })
      await refreshCacheList()
    } catch {
      // Non-fatal: online streaming still works
    } finally {
      setDownloadProgress(p => { const n = { ...p }; delete n[track.key]; return n })
    }
  }

  async function handleDownload(track: Track, e: React.MouseEvent) {
    e.stopPropagation()
    if (cachedKeys.has(track.key) || track.key in downloadProgress) return
    await fetchAndCache(track)
  }

  async function handleRemove(track: Track, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteTrack(track.key)
    await refreshCacheList()
  }

  async function playTrack(track: Track, playlist?: Track[]) {
    const el = audioRef.current
    if (!el) return
    incrementPlayCount(track.key)
    setCurrent(track)
    currentRef.current = track
    if (playlist) playlistRef.current = playlist

    const blob = await getTrackBlob(track.key).catch(() => null)
    if (blob) {
      playBlobUrl(blob)
      return
    }

    const prev = blobUrlRef.current
    blobUrlRef.current = null
    el.src = track.url
    el.play()
    if (prev) URL.revokeObjectURL(prev)

    if (isOnline && !(track.key in downloadProgress)) {
      fetchAndCache(track)
    }
  }
  // Keep ref current so the stable onEnded handler always calls this render's version
  playTrackRef.current = playTrack

  // Shared track row renderer (search results, album tracks, cached list)
  function trackRow(track: Track, playlist: Track[], showSub = true) {
    const isCached = cachedKeys.has(track.key)
    const progress = downloadProgress[track.key]
    const isDownloading = progress !== undefined
    return (
      <li
        key={track.key}
        className={[
          styles.track,
          current?.key === track.key ? styles.playing : "",
          isCached ? styles.cached : "",
        ].join(" ")}
        onClick={() => playTrack(track, playlist)}
      >
        <div className={styles.meta}>
          <span className={styles.title}>{track.title}</span>
          {showSub && (
            <span className={styles.sub}>
              {track.artist}{track.album ? ` · ${track.album}` : ""}
            </span>
          )}
        </div>
        <div className={styles.actions}>
          {isDownloading && (
            <span className={styles.progress}>
              {progress > 0 ? `${Math.round(progress * 100)}%` : "⋯"}
            </span>
          )}
          {!isCached && !isDownloading && (
            <button
              className={styles.downloadBtn}
              title="Download for offline"
              onClick={e => handleDownload(track, e)}
            >↓</button>
          )}
          {isCached && !isDownloading && (
            <button
              className={styles.removeBtn}
              title="Remove from cache"
              onClick={e => handleRemove(track, e)}
            >✕</button>
          )}
        </div>
      </li>
    )
  }

  // Search / default view
  const searchResults = query.length < 2
    ? tracks.slice(0, 50)
    : tracks
        .filter(t => `${t.artist} ${t.album} ${t.title}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 200)

  // Cached tracks list
  const cachedTracks = tracks.filter(t => cachedKeys.has(t.key))

  // Browse: artist → album → tracks drill-down
  function renderBrowse() {
    if (browse.level === "artists") {
      return artistList.map(artist => {
        const albumMap = byArtist.get(artist)!
        const total = [...albumMap.values()].reduce((n, ts) => n + ts.length, 0)
        return (
          <li
            key={artist}
            className={styles.browseItem}
            onClick={() => setBrowse({ level: "albums", artist })}
          >
            <span className={styles.browseLabel}>{artist}</span>
            <span className={styles.browseCount}>{total}</span>
          </li>
        )
      })
    }

    if (browse.level === "albums") {
      const albumMap = byArtist.get(browse.artist)
      if (!albumMap) return null
      return [...albumMap.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(album => {
          const albumTracks = albumMap.get(album)!
          return (
            <li
              key={album}
              className={styles.browseItem}
              onClick={() => setBrowse({ level: "tracks", artist: browse.artist, album })}
            >
              <span className={styles.browseLabel}>{album}</span>
              <span className={styles.browseCount}>{albumTracks.length}</span>
            </li>
          )
        })
    }

    if (browse.level === "tracks") {
      const albumTracks = byArtist.get(browse.artist)?.get(browse.album) ?? []
      return albumTracks.map(t => trackRow(t, albumTracks, false))
    }

    return null
  }

  function renderBreadcrumb() {
    if (browse.level === "artists") return null
    if (browse.level === "albums") {
      return (
        <button className={styles.breadcrumb} onClick={() => setBrowse({ level: "artists" })}>
          ← artists
        </button>
      )
    }
    const { artist } = browse
    return (
      <button className={styles.breadcrumb} onClick={() => setBrowse({ level: "albums", artist })}>
        ← {artist}
      </button>
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>aux</span>
        {!isOnline && <span className={styles.offline}>offline</span>}
        <nav className={styles.tabs}>
          <button
            className={view === "search" ? styles.activeTab : styles.tab}
            onClick={() => setView("search")}
          >search</button>
          <button
            className={view === "artists" ? styles.activeTab : styles.tab}
            onClick={() => setView("artists")}
          >artists</button>
          <button
            className={view === "cached" ? styles.activeTab : styles.tab}
            onClick={() => setView("cached")}
          >
            cached {cachedKeys.size > 0 && <span className={styles.count}>{cachedKeys.size}</span>}
          </button>
        </nav>
      </header>

      {view === "search" && (
        <input
          className={styles.search}
          autoFocus
          placeholder="artist, album, or track..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}

      {view === "artists" && renderBreadcrumb()}

      {view === "cached" && (
        <div className={styles.cacheInfo}>
          {cachedKeys.size} tracks · {fmtBytes(cacheSize)}
        </div>
      )}

      <ul className={styles.list}>
        {view === "search" && (
          <>
            {searchResults.map(t => trackRow(t, searchResults))}
            {searchResults.length === 0 && (
              <li className={styles.empty}>
                {query.length < 2 ? "Type to search." : "No results."}
              </li>
            )}
          </>
        )}

        {view === "artists" && renderBrowse()}

        {view === "cached" && (
          <>
            {cachedTracks.map(t => trackRow(t, cachedTracks))}
            {cachedTracks.length === 0 && (
              <li className={styles.empty}>No cached tracks.</li>
            )}
          </>
        )}
      </ul>

      <div className={styles.player}>
        {current && (
          <div className={styles.nowPlaying}>
            <span className={styles.np}>{current.title}</span>
            <span className={styles.npSub}>{current.artist}</span>
          </div>
        )}
        <audio ref={audioRef} controls className={styles.audio} />
        <button
          className={[styles.shuffleBtn, shuffle ? styles.shuffleActive : ""].join(" ")}
          title={shuffle ? "Shuffle on" : "Shuffle off"}
          onClick={toggleShuffle}
        >⇄</button>
      </div>
    </div>
  )
}
