"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import type { Track } from "@/lib/trackCache"
import styles from "./AuxPlayer.module.css"
import { getTrackBlob, getAllCacheEntries, deleteTrack, downloadTrack } from "@/lib/audioDb"

export interface Playlist {
  id: number
  name: string
  isGlobal: boolean
  ownerId: number
  trackKeys: string[]
}

export interface User {
  id: number
  email: string
  isAdmin: boolean
}

const PLAY_COUNTS_KEY = "aux:playcounts"

type View = "search" | "artists" | "playlists" | "cached" | "access"

interface Registration {
  id: number
  email: string
  status: "pending" | "approved" | "denied"
  created_at: string
}
type BrowseLevel =
  | { level: "artists" }
  | { level: "albums"; artist: string }
  | { level: "tracks"; artist: string; album: string }
type PlaylistBrowse = { level: "list" } | { level: "tracks"; playlistId: number }

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

export default function AuxPlayer({
  tracks: initialTracks,
  user,
  playlists: initialPlaylists,
}: {
  tracks: Track[]
  user: User
  playlists: Playlist[]
}) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("search")
  const [browse, setBrowse] = useState<BrowseLevel>({ level: "artists" })
  const [current, setCurrent] = useState<Track | null>(null)
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set())
  const [cacheSize, setCacheSize] = useState<number>(0)
  const [isOnline, setIsOnline] = useState(true)
  const [shuffle, setShuffle] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  // Playlists
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists)
  const [playlistBrowse, setPlaylistBrowse] = useState<PlaylistBrowse>({ level: "list" })
  const [playlistMenuFor, setPlaylistMenuFor] = useState<string | null>(null)
  const [showNewPlaylist, setShowNewPlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [newIsGlobal, setNewIsGlobal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false)
  const [refreshConfirmText, setRefreshConfirmText] = useState("")
  const [toast, setToast] = useState<string | null>(null)
  const [registrations, setRegistrations] = useState<Registration[] | null>(null)
  const [registrationsLoading, setRegistrationsLoading] = useState(false)
  const [addUserEmail, setAddUserEmail] = useState("")
  const [addUserLoading, setAddUserLoading] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const blobUrlRef = useRef<string | null>(null)
  const shuffleRef = useRef(false)
  const shuffleQueueRef = useRef<Track[]>([])
  const currentRef = useRef<Track | null>(null)
  const playlistRef = useRef<Track[]>([])
  const playTrackRef = useRef<(track: Track, playlist?: Track[]) => Promise<void>>(async () => {})

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
    } catch {}
  }, [])

  useEffect(() => { refreshCacheList() }, [refreshCacheList])

  // Close playlist add-menu on outside click
  useEffect(() => {
    if (!playlistMenuFor) return
    const t = setTimeout(() => {
      const close = () => setPlaylistMenuFor(null)
      document.addEventListener("click", close)
      return () => document.removeEventListener("click", close)
    }, 0)
    return () => clearTimeout(t)
  }, [playlistMenuFor])

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
  }, [tracks])

  function toggleShuffle() {
    const next = !shuffle
    setShuffle(next)
    shuffleRef.current = next
    if (next) shuffleQueueRef.current = buildShuffledQueue(tracks, current?.key)
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
      // Non-fatal
    } finally {
      setDownloadProgress(p => { const n = { ...p }; delete n[track.key]; return n })
    }
  }

  async function handleDownload(track: Track, e: React.MouseEvent) {
    e.stopPropagation()
    if (cachedKeys.has(track.key) || track.key in downloadProgress) return
    await fetchAndCache(track)
  }

  async function handleRemoveCache(track: Track, e: React.MouseEvent) {
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
    if (blob) { playBlobUrl(blob); return }

    const prev = blobUrlRef.current
    blobUrlRef.current = null
    el.src = track.url
    el.play()
    if (prev) URL.revokeObjectURL(prev)

    if (isOnline && !(track.key in downloadProgress)) fetchAndCache(track)
  }
  playTrackRef.current = playTrack

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  async function refreshTracks() {
    setRefreshing(true)
    setShowRefreshConfirm(false)
    setRefreshConfirmText("")
    await fetch("/api/cache/clear", { method: "POST" })
    const res = await fetch("/api/tracks")
    if (res.ok) {
      setTracks(await res.json())
      setToast("track listing refreshed")
      setTimeout(() => setToast(null), 2500)
    }
    setRefreshing(false)
  }

  async function loadRegistrations() {
    setRegistrationsLoading(true)
    const res = await fetch("/api/registrations")
    if (res.ok) setRegistrations(await res.json())
    setRegistrationsLoading(false)
  }

  async function reviewRegistration(id: number, action: "approve" | "deny") {
    const res = await fetch(`/api/registrations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      setRegistrations(rs => rs?.map(r => r.id === id ? { ...r, status: action === "approve" ? "approved" : "denied" } : r) ?? null)
      setToast(action === "approve" ? "approved — approval email sent" : "request denied")
      setTimeout(() => setToast(null), 2500)
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    const email = addUserEmail.trim().toLowerCase()
    if (!email) return
    setAddUserLoading(true)
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (res.ok) {
      setAddUserEmail("")
      // Update any matching registration row to approved
      setRegistrations(rs => rs?.map(r =>
        r.email === email ? { ...r, status: "approved" } : r
      ) ?? null)
      setToast(`${email} added — invite sent`)
      setTimeout(() => setToast(null), 2500)
    } else {
      setToast(data.error ?? "Failed to add user")
      setTimeout(() => setToast(null), 2500)
    }
    setAddUserLoading(false)
  }

  // Playlist mutations
  async function createPlaylist() {
    const name = newPlaylistName.trim()
    if (!name) return
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isGlobal: newIsGlobal }),
    })
    if (res.ok) {
      const p = await res.json()
      setPlaylists(ps => [...ps, {
        id: p.id, name: p.name, isGlobal: p.is_global,
        ownerId: p.user_id, trackKeys: [],
      }])
    }
    setNewPlaylistName("")
    setNewIsGlobal(false)
    setShowNewPlaylist(false)
  }

  async function deletePlaylist(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" })
    if (res.ok) {
      setPlaylists(ps => ps.filter(p => p.id !== id))
      if (playlistBrowse.level === "tracks" && playlistBrowse.playlistId === id) {
        setPlaylistBrowse({ level: "list" })
      }
    }
  }

  async function toggleGlobal(id: number, isGlobal: boolean, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await fetch(`/api/playlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isGlobal }),
    })
    if (res.ok) {
      setPlaylists(ps => ps.map(p => p.id === id ? { ...p, isGlobal } : p))
    }
  }

  async function addToPlaylist(trackKey: string, playlistId: number) {
    const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackKey }),
    })
    if (res.ok) {
      setPlaylists(ps => ps.map(p =>
        p.id === playlistId && !p.trackKeys.includes(trackKey)
          ? { ...p, trackKeys: [...p.trackKeys, trackKey] }
          : p
      ))
    }
    setPlaylistMenuFor(null)
  }

  async function removeFromPlaylist(trackKey: string, playlistId: number, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackKey }),
    })
    if (res.ok) {
      setPlaylists(ps => ps.map(p =>
        p.id === playlistId
          ? { ...p, trackKeys: p.trackKeys.filter(k => k !== trackKey) }
          : p
      ))
    }
  }

  // Track row renderer — playlistContext set when inside a playlist (shows remove-from-playlist instead)
  function trackRow(track: Track, playlist: Track[], showSub = true, playlistContext?: number) {
    const isCached = cachedKeys.has(track.key)
    const progress = downloadProgress[track.key]
    const isDownloading = progress !== undefined
    const menuOpen = playlistMenuFor === track.key

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
          {playlistContext != null ? (
            <button
              className={styles.removeBtn}
              title="Remove from playlist"
              onClick={e => removeFromPlaylist(track.key, playlistContext, e)}
            >✕</button>
          ) : (
            <>
              <button
                className={[styles.addBtn, menuOpen ? styles.addBtnActive : ""].join(" ")}
                title="Add to playlist"
                onClick={e => { e.stopPropagation(); setPlaylistMenuFor(menuOpen ? null : track.key) }}
              >+</button>
              {!isCached && !isDownloading && (
                <button className={styles.downloadBtn} title="Download for offline"
                  onClick={e => handleDownload(track, e)}>↓</button>
              )}
              {isCached && !isDownloading && (
                <button className={styles.removeBtn} title="Remove from cache"
                  onClick={e => handleRemoveCache(track, e)}>✕</button>
              )}
            </>
          )}
        </div>
        {menuOpen && (
          <div className={styles.playlistMenu} onClick={e => e.stopPropagation()}>
            {playlists.length === 0 ? (
              <span className={styles.playlistMenuEmpty}>no playlists yet</span>
            ) : (
              playlists.map(p => (
                <button
                  key={p.id}
                  className={styles.playlistMenuItem}
                  onClick={() => addToPlaylist(track.key, p.id)}
                >
                  {p.name}
                  {p.trackKeys.includes(track.key) ? " ✓" : ""}
                </button>
              ))
            )}
          </div>
        )}
      </li>
    )
  }

  // Search results
  const searchResults = query.length < 2
    ? tracks.slice(0, 50)
    : tracks
        .filter(t => `${t.artist} ${t.album} ${t.title}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 200)

  const cachedTracks = tracks.filter(t => cachedKeys.has(t.key))

  // Artist browse
  function renderArtistBrowse() {
    if (browse.level === "artists") {
      return artistList.map(artist => {
        const albumMap = byArtist.get(artist)!
        const total = [...albumMap.values()].reduce((n, ts) => n + ts.length, 0)
        return (
          <li key={artist} className={styles.browseItem}
            onClick={() => setBrowse({ level: "albums", artist })}>
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
            <li key={album} className={styles.browseItem}
              onClick={() => setBrowse({ level: "tracks", artist: browse.artist, album })}>
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

  // Playlist browse
  function renderPlaylists() {
    if (playlistBrowse.level === "list") {
      return (
        <>
          {showNewPlaylist ? (
            <li className={styles.newPlaylistRow}>
              <input
                className={styles.newPlaylistInput}
                placeholder="playlist name..."
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createPlaylist()}
                autoFocus
              />
              {user.isAdmin && (
                <label className={styles.globalToggle}>
                  <input
                    type="checkbox"
                    checked={newIsGlobal}
                    onChange={e => setNewIsGlobal(e.target.checked)}
                  />
                  global
                </label>
              )}
              <button className={styles.newPlaylistSave} onClick={createPlaylist}
                disabled={!newPlaylistName.trim()}>+</button>
              <button className={styles.newPlaylistCancel}
                onClick={() => { setShowNewPlaylist(false); setNewPlaylistName("") }}>✕</button>
            </li>
          ) : (
            <li className={styles.newPlaylistTrigger} onClick={() => setShowNewPlaylist(true)}>
              + new playlist
            </li>
          )}
          {playlists.map(p => (
            <li key={p.id} className={styles.browseItem}
              onClick={() => setPlaylistBrowse({ level: "tracks", playlistId: p.id })}>
              <span className={styles.browseLabel}>
                {p.isGlobal && <span className={styles.globalBadge}>global</span>}
                {p.name}
              </span>
              <div className={styles.playlistMeta}>
                <span className={styles.browseCount}>{p.trackKeys.length}</span>
                {user.isAdmin && (
                  <button
                    className={styles.globalToggleBtn}
                    title={p.isGlobal ? "make private" : "make global"}
                    onClick={e => toggleGlobal(p.id, !p.isGlobal, e)}
                  >{p.isGlobal ? "↓" : "↑"}</button>
                )}
                {(p.ownerId === user.id || user.isAdmin) && (
                  <button className={styles.removeBtn}
                    onClick={e => deletePlaylist(p.id, e)}>✕</button>
                )}
              </div>
            </li>
          ))}
          {playlists.length === 0 && !showNewPlaylist && (
            <li className={styles.empty}>No playlists yet.</li>
          )}
        </>
      )
    }

    if (playlistBrowse.level === "tracks") {
      const playlist = playlists.find(p => p.id === playlistBrowse.playlistId)
      if (!playlist) return null
      const byKey = new Map(tracks.map(t => [t.key, t]))
      const playlistTracks = playlist.trackKeys
        .map(k => byKey.get(k))
        .filter((t): t is Track => !!t)
      if (playlistTracks.length === 0) {
        return <li className={styles.empty}>No tracks yet. Use + on any track to add.</li>
      }
      return playlistTracks.map(t => trackRow(t, playlistTracks, true, playlist.id))
    }

    return null
  }

  function renderBreadcrumb() {
    if (view === "artists") {
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
    if (view === "playlists" && playlistBrowse.level === "tracks") {
      return (
        <button className={styles.breadcrumb} onClick={() => setPlaylistBrowse({ level: "list" })}>
          ← playlists
        </button>
      )
    }
    return null
  }

  return (
    <div className={styles.root}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <header className={styles.header}>
        <span className={styles.logo}>aux</span>
        {!isOnline && <span className={styles.offline}>offline</span>}
        <nav className={styles.tabs}>
          <button className={view === "search" ? styles.activeTab : styles.tab}
            onClick={() => setView("search")}>search</button>
          <button className={view === "artists" ? styles.activeTab : styles.tab}
            onClick={() => setView("artists")}>artists</button>
          <button className={view === "playlists" ? styles.activeTab : styles.tab}
            onClick={() => setView("playlists")}>
            playlists {playlists.length > 0 && <span className={styles.count}>{playlists.length}</span>}
          </button>
          <button className={view === "cached" ? styles.activeTab : styles.tab}
            onClick={() => setView("cached")}>
            cached {cachedKeys.size > 0 && <span className={styles.count}>{cachedKeys.size}</span>}
          </button>
          {user.isAdmin && (
            <button className={view === "access" ? styles.activeTab : styles.tab}
              onClick={() => { setView("access"); if (!registrations) loadRegistrations() }}>
              access
              {registrations && registrations.filter(r => r.status === "pending").length > 0 && (
                <span className={styles.count}>{registrations.filter(r => r.status === "pending").length}</span>
              )}
            </button>
          )}
          {user.isAdmin && !showRefreshConfirm && (
            <button className={styles.refreshBtn} title="Refresh track listing from S3"
              onClick={() => setShowRefreshConfirm(true)} disabled={refreshing}>↺</button>
          )}
          {user.isAdmin && showRefreshConfirm && (
            <span className={styles.refreshConfirm}>
              <input
                className={styles.refreshConfirmInput}
                placeholder='type "refresh"'
                value={refreshConfirmText}
                onChange={e => setRefreshConfirmText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && refreshConfirmText === "refresh") refreshTracks()
                  if (e.key === "Escape") { setShowRefreshConfirm(false); setRefreshConfirmText("") }
                }}
                autoFocus
              />
              <button className={styles.refreshConfirmOk}
                disabled={refreshConfirmText !== "refresh"}
                onClick={refreshTracks}>↺</button>
              <button className={styles.newPlaylistCancel}
                onClick={() => { setShowRefreshConfirm(false); setRefreshConfirmText("") }}>✕</button>
            </span>
          )}
          <button className={styles.signOutBtn} onClick={signOut}>sign out</button>
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

      {(view === "artists" || view === "playlists") && renderBreadcrumb()}

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
        {view === "artists" && renderArtistBrowse()}
        {view === "playlists" && renderPlaylists()}
        {view === "cached" && (
          <>
            {cachedTracks.map(t => trackRow(t, cachedTracks))}
            {cachedTracks.length === 0 && (
              <li className={styles.empty}>No cached tracks.</li>
            )}
          </>
        )}
        {view === "access" && user.isAdmin && (
          <>
            <li className={styles.addUserRow}>
              <form className={styles.addUserForm} onSubmit={addUser}>
                <input
                  className={styles.addUserInput}
                  type="email"
                  placeholder="add user by email..."
                  value={addUserEmail}
                  onChange={e => setAddUserEmail(e.target.value)}
                />
                <button className={styles.addUserBtn} type="submit"
                  disabled={addUserLoading || !addUserEmail.trim()}>
                  {addUserLoading ? "..." : "add"}
                </button>
              </form>
            </li>
            {registrationsLoading && <li className={styles.empty}>loading...</li>}
            {!registrationsLoading && registrations?.length === 0 && (
              <li className={styles.empty}>No access requests.</li>
            )}
            {registrations?.map(r => (
              <li key={r.id} className={styles.regRow}>
                <span className={styles.regEmail}>{r.email}</span>
                <span className={[styles.regStatus, styles[`reg_${r.status}`]].join(" ")}>{r.status}</span>
                {r.status === "pending" && (
                  <div className={styles.regActions}>
                    <button className={styles.regApprove} onClick={() => reviewRegistration(r.id, "approve")}>✓</button>
                    <button className={styles.regDeny} onClick={() => reviewRegistration(r.id, "deny")}>✕</button>
                  </div>
                )}
              </li>
            ))}
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
