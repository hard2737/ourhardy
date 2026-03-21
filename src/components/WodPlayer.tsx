"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import styles from "./WodPlayer.module.css"

// ── BeforeInstallPromptEvent (not in TS built-ins) ────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// ── types ──────────────────────────────────────────────────────────────────

interface User {
  id: number
  email: string
  isAdmin: boolean
}

interface WodProfile {
  username: string
  firstName: string
  lastName: string
  bio: string | null
  gender: string
}

interface Workout {
  id: number
  name: string
  description: string | null
  type: string
  format: string
  scoreType: string
  timeCap: number | null
  isBenchmark: boolean
  scheduleNotes?: string | null
}

interface WorkoutResult {
  id: number
  result: string
  score: number | null
  is_rx: boolean
  scaling_notes: string | null
  notes: string | null
  is_pr: boolean
  result_date: string
}

interface FeedResult {
  id: number
  result: string
  score: number | null
  is_rx: boolean
  is_pr: boolean
  result_date: string
  created_at: string
  user_id: number
  workout_id: number
  username: string
  first_name: string
  last_name: string
  workout_name: string
  score_type: string
  fist_bump_count: number
  comment_count: number
  i_bumped: boolean
}

interface Comment {
  id: number
  comment: string
  created_at: string
  user_id: number
  username: string
  first_name: string
  last_name: string
}

interface LeaderboardEntry {
  id: number
  user_id: number
  result: string
  score: number | null
  is_rx: boolean
  is_pr: boolean
  username: string
  first_name: string
  last_name: string
  gender: string
  fist_bump_count: number
}

interface ScheduleItem {
  id: number
  scheduled_date: string
  notes: string | null
  workout_id: number
  name: string
  format: string
  score_type: string
}

interface Notification {
  id: number
  type: string
  title: string
  body: string
  metadata: Record<string, unknown>
  is_read: boolean
  created_at: string
}

interface NotifPrefs {
  fist_bump: boolean
  comment: boolean
  workout_completion: boolean
  weekly_summary: boolean
  monthly_summary: boolean
}

interface Friend {
  user_id: number
  username: string
  first_name: string
  last_name: string
  score: number
}

interface PendingFriend {
  request_id: number
  user_id: number
  username: string
  first_name: string
  last_name: string
  created_at: string
}

interface SearchResult {
  user_id: number
  username: string
  first_name: string
  last_name: string
}

interface UnreadCounts {
  count: number
  fistBumpCount: number
  commentCount: number
  mentionCount: number
  friendRequestCount: number
}

type View = "today" | "feed" | "board" | "prs" | "profile" | "admin" | "notifications"

// ── helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  const iso = d.includes("T") ? d : d + "T00:00:00"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtTimeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return fmtDateTime(d)
}

function notifIcon(type: string) {
  switch (type) {
    case "fist_bump": return "👊"
    case "comment": return "💬"
    case "mention": return "@"
    case "workout_completion": return "🏋️"
    case "weekly_summary": return "📊"
    case "monthly_summary": return "📅"
    case "friend_request": return "🤝"
    case "friend_accepted": return "🎉"
    default: return "🔔"
  }
}

const NOTIF_FILTER_TYPES = [
  { key: "fist_bump", label: "👊 Bumps" },
  { key: "comment", label: "💬 Comments" },
  { key: "mention", label: "@ Mentions" },
  { key: "workout_completion", label: "🏋️ Buddies" },
  { key: "friend_request", label: "🤝 Friends" },
  { key: "weekly_summary", label: "📊 Weekly" },
  { key: "monthly_summary", label: "📅 Monthly" },
]

const PREF_LABELS: { key: keyof NotifPrefs; label: string }[] = [
  { key: "fist_bump", label: "Fist bumps" },
  { key: "comment", label: "Comments" },
  { key: "workout_completion", label: "Gym buddy completions" },
  { key: "weekly_summary", label: "Weekly recap" },
  { key: "monthly_summary", label: "Monthly recap" },
]

// ── sub-components ─────────────────────────────────────────────────────────

function RxBadge({ isRx }: { isRx: boolean }) {
  return isRx
    ? <span className={styles.rxBadge}>RX</span>
    : <span className={styles.scaledBadge}>SCALED</span>
}

function PrBadge() {
  return <span className={styles.prBadge}>PR</span>
}

// ── main component ─────────────────────────────────────────────────────────

export default function WodPlayer({
  user,
  profile,
}: {
  user: User
  profile: WodProfile
}) {
  const router = useRouter()
  const [view, setView] = useState<View>("today")
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    requestAnimationFrame(() => {
      setToast(msg)
      toastTimer.current = setTimeout(() => setToast(null), 2600)
    })
  }

  // ── TODAY state ──────────────────────────────────────────────────────────

  const [todayLoading, setTodayLoading] = useState(false)
  const [todayWod, setTodayWod] = useState<Workout | null>(null)
  const [userResult, setUserResult] = useState<WorkoutResult | null>(null)
  const [previousResults, setPreviousResults] = useState<WorkoutResult[]>([])
  const [logResult, setLogResult] = useState("")
  const [logScore, setLogScore] = useState("")
  const [logIsRx, setLogIsRx] = useState(true)
  const [logNotes, setLogNotes] = useState("")
  const [logScaling, setLogScaling] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [prCelebration, setPrCelebration] = useState(false)

  const loadToday = useCallback(async () => {
    setTodayLoading(true)
    try {
      const res = await fetch("/api/wod/today")
      if (!res.ok) return
      const data = await res.json()
      setTodayWod(data.workout)
      setUserResult(data.userResult)
      setPreviousResults(data.previousResults ?? [])
    } finally {
      setTodayLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "today") loadToday()
  }, [view, loadToday])

  async function submitResult(e: React.FormEvent) {
    e.preventDefault()
    if (!logResult.trim() || !todayWod) return
    setSubmitting(true)
    try {
      const scoreNum = logScore.trim() ? parseFloat(logScore) : null
      const res = await fetch("/api/wod/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: todayWod.id,
          result: logResult.trim(),
          score: scoreNum,
          isRx: logIsRx,
          scalingNotes: logScaling.trim() || null,
          notes: logNotes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.isPr) {
        setPrCelebration(true)
        setTimeout(() => setPrCelebration(false), 4000)
      }
      showToast(data.isPr ? "new PR! result logged." : "result logged")
      setLogResult("")
      setLogScore("")
      setLogNotes("")
      setLogScaling("")
      loadToday()
    } catch (err) {
      showToast((err as Error).message || "error submitting")
    } finally {
      setSubmitting(false)
    }
  }

  // ── FEED state ───────────────────────────────────────────────────────────

  const [feedLoading, setFeedLoading] = useState(false)
  const [feed, setFeed] = useState<FeedResult[]>([])
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set())
  const [comments, setComments] = useState<Record<number, Comment[]>>({})
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({})
  const [commentLoading, setCommentLoading] = useState<Record<number, boolean>>({})

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const res = await fetch("/api/wod/results")
      if (!res.ok) return
      const data = await res.json()
      setFeed(data.results ?? [])
    } finally {
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "feed") loadFeed()
  }, [view, loadFeed])

  async function toggleBump(resultId: number) {
    const res = await fetch("/api/wod/fist-bumps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId }),
    })
    if (!res.ok) return
    const data = await res.json()
    setFeed(prev =>
      prev.map(r =>
        r.id === resultId
          ? { ...r, fist_bump_count: data.count, i_bumped: data.bumped }
          : r
      )
    )
  }

  async function toggleComments(resultId: number) {
    const isOpen = expandedComments.has(resultId)
    if (isOpen) {
      setExpandedComments(prev => { const s = new Set(prev); s.delete(resultId); return s })
      return
    }
    setExpandedComments(prev => new Set(prev).add(resultId))
    if (comments[resultId]) return // already loaded
    const res = await fetch(`/api/wod/comments?resultId=${resultId}`)
    if (!res.ok) return
    const data = await res.json()
    setComments(prev => ({ ...prev, [resultId]: data.comments ?? [] }))
  }

  async function postComment(resultId: number) {
    const text = commentInputs[resultId]?.trim()
    if (!text) return
    setCommentLoading(prev => ({ ...prev, [resultId]: true }))
    try {
      const res = await fetch("/api/wod/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, comment: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComments(prev => ({
        ...prev,
        [resultId]: [...(prev[resultId] ?? []), data.comment],
      }))
      setCommentInputs(prev => ({ ...prev, [resultId]: "" }))
      setFeed(prev =>
        prev.map(r => r.id === resultId ? { ...r, comment_count: r.comment_count + 1 } : r)
      )
    } finally {
      setCommentLoading(prev => ({ ...prev, [resultId]: false }))
    }
  }

  // ── LEADERBOARD state ────────────────────────────────────────────────────

  const [boardLoading, setBoardLoading] = useState(false)
  const [allWorkouts, setAllWorkouts] = useState<{ id: number; name: string; isBenchmark: boolean }[]>([])
  const [boardWorkoutId, setBoardWorkoutId] = useState<number | null>(null)
  const [boardSections, setBoardSections] = useState<{ label: string; entries: LeaderboardEntry[] }[]>([])
  const [boardWorkout, setBoardWorkout] = useState<{ name: string } | null>(null)

  const loadWorkouts = useCallback(async () => {
    const res = await fetch("/api/wod/workouts")
    if (!res.ok) return
    const data = await res.json()
    const wods = data.workouts ?? []
    setAllWorkouts(wods)
    if (!boardWorkoutId && wods.length > 0) setBoardWorkoutId(wods[0].id)
  }, [boardWorkoutId])

  const loadLeaderboard = useCallback(async (workoutId: number) => {
    setBoardLoading(true)
    try {
      const res = await fetch(`/api/wod/leaderboard?workoutId=${workoutId}`)
      if (!res.ok) return
      const data = await res.json()
      setBoardSections(data.sections ?? [])
      setBoardWorkout(data.workout ?? null)
    } finally {
      setBoardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "board") {
      loadWorkouts()
    }
  }, [view, loadWorkouts])

  useEffect(() => {
    if (view === "board" && boardWorkoutId) loadLeaderboard(boardWorkoutId)
  }, [view, boardWorkoutId, loadLeaderboard])

  // ── PRs state ────────────────────────────────────────────────────────────

  const [prsLoading, setPrsLoading] = useState(false)
  const [prs, setPrs] = useState<{ id: number; workout_name: string; result: string; is_rx: boolean; result_date: string; is_pr: boolean }[]>([])
  const [prStats, setPrStats] = useState<{ total_results: number; total_prs: number } | null>(null)

  const loadPrs = useCallback(async () => {
    setPrsLoading(true)
    try {
      const res = await fetch("/api/wod/profile")
      if (!res.ok) return
      const data = await res.json()
      setPrs(data.prs ?? [])
      setPrStats(data.stats ?? null)
    } finally {
      setPrsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "prs") loadPrs()
  }, [view, loadPrs])

  // ── PROFILE state ─────────────────────────────────────────────────────────

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileData, setProfileData] = useState<{
    stats: { total_results: number; total_prs: number }
    recent: { id: number; workout_name: string; result: string; is_rx: boolean; is_pr: boolean; result_date: string }[]
  } | null>(null)

  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const res = await fetch("/api/wod/profile")
      if (!res.ok) return
      const data = await res.json()
      setProfileData({ stats: data.stats, recent: data.recent ?? [] })
      if (data.score) setScoreBreakdown(data.score)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "profile") loadProfile()
  }, [view, loadProfile])

  // ── ADMIN state ──────────────────────────────────────────────────────────

  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [schedDate, setSchedDate] = useState("")
  const [schedWorkoutId, setSchedWorkoutId] = useState("")
  const [schedNotes, setSchedNotes] = useState("")
  const [schedSubmitting, setSchedSubmitting] = useState(false)
  const [newWodName, setNewWodName] = useState("")
  const [newWodDesc, setNewWodDesc] = useState("")
  const [newWodFormat, setNewWodFormat] = useState("amrap")
  const [newWodScoreType, setNewWodScoreType] = useState("reps")
  const [newWodTimeCap, setNewWodTimeCap] = useState("")
  const [newWodBenchmark, setNewWodBenchmark] = useState(false)
  const [newWodSubmitting, setNewWodSubmitting] = useState(false)

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true)
    try {
      const [schedRes, worRes] = await Promise.all([
        fetch("/api/wod/schedule"),
        fetch("/api/wod/workouts"),
      ])
      if (schedRes.ok) {
        const d = await schedRes.json()
        setSchedule(d.schedule ?? [])
      }
      if (worRes.ok) {
        const d = await worRes.json()
        setAllWorkouts(d.workouts ?? [])
      }
    } finally {
      setScheduleLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "admin" && user.isAdmin) loadSchedule()
  }, [view, user.isAdmin, loadSchedule])

  async function scheduleWorkout(e: React.FormEvent) {
    e.preventDefault()
    if (!schedDate || !schedWorkoutId) return
    setSchedSubmitting(true)
    try {
      const res = await fetch("/api/wod/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: parseInt(schedWorkoutId, 10),
          date: schedDate,
          notes: schedNotes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast("workout scheduled")
      setSchedDate("")
      setSchedNotes("")
      loadSchedule()
    } catch (err) {
      showToast((err as Error).message || "error scheduling")
    } finally {
      setSchedSubmitting(false)
    }
  }

  async function deleteSchedule(date: string) {
    const res = await fetch(`/api/wod/schedule?date=${date}`, { method: "DELETE" })
    if (res.ok) {
      setSchedule(prev => prev.filter(s => s.scheduled_date !== date))
      showToast("removed")
    }
  }

  async function createWorkout(e: React.FormEvent) {
    e.preventDefault()
    if (!newWodName.trim()) return
    setNewWodSubmitting(true)
    try {
      const res = await fetch("/api/wod/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWodName.trim(),
          description: newWodDesc.trim() || null,
          format: newWodFormat,
          scoreType: newWodScoreType,
          timeCap: newWodTimeCap ? parseInt(newWodTimeCap, 10) : null,
          isBenchmark: newWodBenchmark,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast("workout created")
      setNewWodName("")
      setNewWodDesc("")
      setNewWodTimeCap("")
      setNewWodBenchmark(false)
      loadSchedule()
    } catch (err) {
      showToast((err as Error).message || "error creating")
    } finally {
      setNewWodSubmitting(false)
    }
  }

  // ── NOTIFICATIONS state ─────────────────────────────────────────────────

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({ count: 0, fistBumpCount: 0, commentCount: 0, mentionCount: 0, friendRequestCount: 0 })
  const [showNotifPrefs, setShowNotifPrefs] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    fist_bump: true, comment: true, workout_completion: true,
    weekly_summary: true, monthly_summary: true,
  })
  const [notifTypeFilter, setNotifTypeFilter] = useState<Set<string>>(new Set())

  // Poll unread count every 60s
  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/wod/notifications/unread-count")
        if (res.ok) {
          const data = await res.json()
          setUnreadCounts(data)
        }
      } catch { /* offline */ }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await fetch("/api/wod/notifications")
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCounts(prev => ({ ...prev, count: data.unreadCount ?? 0 }))
    } finally {
      setNotifLoading(false)
    }
  }, [])

  const loadNotifPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/wod/notifications/preferences")
      if (!res.ok) return
      const data = await res.json()
      setNotifPrefs(data.preferences)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (view === "notifications") {
      loadNotifications()
      loadNotifPrefs()
    }
  }, [view, loadNotifications, loadNotifPrefs])

  async function markAllRead() {
    await fetch("/api/wod/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCounts({ count: 0, fistBumpCount: 0, commentCount: 0, mentionCount: 0, friendRequestCount: 0 })
  }

  async function markRead(ids: number[]) {
    await fetch("/api/wod/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n))
    setUnreadCounts(prev => ({ ...prev, count: Math.max(0, prev.count - ids.length) }))
  }

  function handleNotifClick(n: Notification) {
    if (!n.is_read) markRead([n.id])
    if (n.type === "fist_bump" || n.type === "comment" || n.type === "workout_completion") {
      setView("feed")
    }
  }

  async function togglePref(key: keyof NotifPrefs) {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(updated)
    await fetch("/api/wod/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    })
  }

  // ── FRIENDS state ──────────────────────────────────────────────────────

  const [friends, setFriends] = useState<{ accepted: Friend[]; incoming: PendingFriend[]; outgoing: PendingFriend[] }>({ accepted: [], incoming: [], outgoing: [] })
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [showFriendSearch, setShowFriendSearch] = useState(false)
  const [friendSearchQuery, setFriendSearchQuery] = useState("")
  const [friendSearchResults, setFriendSearchResults] = useState<SearchResult[]>([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [scoreBreakdown, setScoreBreakdown] = useState<{ totalBumps: number; totalPrs: number; score: number } | null>(null)

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true)
    try {
      const res = await fetch("/api/wod/friends")
      if (!res.ok) return
      const data = await res.json()
      setFriends({ accepted: data.accepted ?? [], incoming: data.incoming ?? [], outgoing: data.outgoing ?? [] })
    } finally {
      setFriendsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === "profile") loadFriends()
  }, [view, loadFriends])

  // Debounced friend search
  useEffect(() => {
    if (!friendSearchQuery.trim()) { setFriendSearchResults([]); return }
    setFriendSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wod/friends/search?q=${encodeURIComponent(friendSearchQuery)}`)
        if (res.ok) { const d = await res.json(); setFriendSearchResults(d.results ?? []) }
      } finally { setFriendSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [friendSearchQuery])

  async function sendFriendRequest(userId: number) {
    const res = await fetch("/api/wod/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error ?? "Failed"); return }
    showToast("Friend request sent")
    setShowFriendSearch(false)
    setFriendSearchQuery("")
    loadFriends()
  }

  async function respondFriendRequest(requestId: number, action: "accept" | "decline") {
    const res = await fetch("/api/wod/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    })
    if (res.ok) {
      showToast(action === "accept" ? "Friend added!" : "Request declined")
      loadFriends()
    }
  }

  // ── MENTION autocomplete state ─────────────────────────────────────────

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionResults, setMentionResults] = useState<SearchResult[]>([])
  const [mentionResultId, setMentionResultId] = useState<number | null>(null)

  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 1) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wod/friends/search?q=${encodeURIComponent(mentionQuery)}`)
        if (res.ok) { const d = await res.json(); setMentionResults(d.results ?? []) }
      } catch { /* ignore */ }
    }, 250)
    return () => clearTimeout(t)
  }, [mentionQuery])

  function handleCommentInputChange(resultId: number, value: string) {
    setCommentInputs(prev => ({ ...prev, [resultId]: value }))
    // Detect @mention
    const match = value.match(/@([a-z0-9_]*)$/)
    if (match && match[1].length >= 1) {
      setMentionQuery(match[1])
      setMentionResultId(resultId)
    } else {
      setMentionQuery(null)
      setMentionResults([])
      setMentionResultId(null)
    }
  }

  function selectMention(resultId: number, username: string) {
    const current = commentInputs[resultId] ?? ""
    const replaced = current.replace(/@([a-z0-9_]*)$/, `@${username} `)
    setCommentInputs(prev => ({ ...prev, [resultId]: replaced }))
    setMentionQuery(null)
    setMentionResults([])
    setMentionResultId(null)
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  // ── online/offline ──────────────────────────────────────────────────────

  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])

  // ── SW queued submission listener ──────────────────────────────────────

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "WOD_QUEUED") showToast("saved offline — will sync when back online")
    }
    navigator.serviceWorker.addEventListener("message", handler)
    return () => navigator.serviceWorker.removeEventListener("message", handler)
  })

  // ── PWA install prompt ───────────────────────────────────────────────

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  useEffect(() => {
    // Don't show if already in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      // Show banner if user hasn't dismissed it this session
      if (!sessionStorage.getItem("swod-install-dismissed")) {
        setShowInstallBanner(true)
      }
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "accepted") {
      setShowInstallBanner(false)
      setInstallPrompt(null)
    }
  }

  function dismissInstallBanner() {
    setShowInstallBanner(false)
    sessionStorage.setItem("swod-install-dismissed", "1")
  }

  // ── nav items ─────────────────────────────────────────────────────────

  const navItems: { key: View; icon: string; label: string }[] = [
    { key: "today", icon: "🏋️", label: "WOD" },
    { key: "feed", icon: "📢", label: "Feed" },
    { key: "board", icon: "🏆", label: "Board" },
    { key: "prs", icon: "📈", label: "PRs" },
    { key: "profile", icon: "👤", label: "Profile" },
    ...(user.isAdmin ? [{ key: "admin" as View, icon: "⚙️", label: "Admin" }] : []),
  ]

  // ── skeleton loaders ──────────────────────────────────────────────────

  function Skeleton({ type }: { type: "card" | "row" }) {
    return <div className={type === "card" ? styles.skeletonCard : styles.skeletonRow} />
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* header */}
      <div className={styles.header}>
        <span className={styles.logo}>SmartWOD</span>
        <div className={styles.headerRight}>
          <button className={styles.bellBtn} onClick={() => setView("notifications")} title="notifications">
            🔔
            {unreadCounts.count > 0 && <span className={styles.bellBadge}>{unreadCounts.count > 99 ? "99+" : unreadCounts.count}</span>}
          </button>
          <div className={styles.avatar}>{profile.firstName[0]}</div>
          <button className={styles.signOutBtn} onClick={signOut} title="sign out">×</button>
        </div>
      </div>

      {!isOnline && <div className={styles.offlineBanner}>offline mode</div>}

      {showInstallBanner && (
        <div className={styles.installBanner}>
          <div className={styles.installText}>
            <strong>Install SmartWOD</strong>
            <span>Add to home screen for the full app experience</span>
          </div>
          <button className={styles.installBtn} onClick={handleInstall}>Install</button>
          <button className={styles.installDismiss} onClick={dismissInstallBanner}>✕</button>
        </div>
      )}

      {/* body */}
      <div className={styles.body}>

        {/* ── TODAY ── */}
        {view === "today" && (
          <>
            {todayLoading ? (
              <><Skeleton type="card" /><Skeleton type="row" /><Skeleton type="row" /></>
            ) : !todayWod ? (
              <div className={styles.noWod}>
                No workout scheduled today
                <div className={styles.noWodSub}>Check back later or ask an admin to schedule one</div>
              </div>
            ) : (
              <>
                <div className={styles.wodCard}>
                  <div className={styles.wodName}>{todayWod.name}</div>
                  <div className={styles.wodMeta}>
                    <span className={styles.accentTag}>{todayWod.format.toUpperCase()}</span>
                    {todayWod.timeCap && <span className={styles.metaTag}>{todayWod.timeCap} min cap</span>}
                    {todayWod.isBenchmark && <span className={styles.metaTag}>benchmark</span>}
                    <span className={styles.metaTag}>{todayWod.scoreType}</span>
                  </div>
                  {todayWod.description && <div className={styles.wodDescription}>{todayWod.description}</div>}
                  {todayWod.scheduleNotes && <div className={styles.scheduleNotes}>{todayWod.scheduleNotes}</div>}

                  {previousResults.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div className={styles.sectionLabel}>Your History</div>
                      {previousResults.map(r => (
                        <div key={r.id} className={styles.prevRow}>
                          <span className={styles.prevDate}>{fmtDate(r.result_date)}</span>
                          <span className={styles.prevResult}>{r.result}</span>
                          <RxBadge isRx={r.is_rx} />
                          {r.is_pr && <PrBadge />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!userResult ? (
                  <form className={styles.logForm} onSubmit={submitResult}>
                    <div className={styles.logFormLabel}>Log Today&apos;s Result</div>
                    <input
                      className={styles.resultInput}
                      type="text"
                      placeholder={
                        todayWod.scoreType === "time" ? "e.g. 21:43"
                        : todayWod.scoreType === "weight" ? "e.g. 185 LBS"
                        : "e.g. 245 reps"
                      }
                      value={logResult}
                      onChange={e => setLogResult(e.target.value)}
                      required
                    />
                    <input
                      className={styles.resultInput}
                      type="number"
                      placeholder={todayWod.scoreType === "time" ? "Score in seconds (optional)" : "Numeric score (for leaderboard)"}
                      value={logScore}
                      onChange={e => setLogScore(e.target.value)}
                    />
                    <div className={styles.rxToggle}>
                      <button type="button" className={logIsRx ? styles.rxBtnActive : styles.rxBtn} onClick={() => setLogIsRx(true)}>RX</button>
                      <button type="button" className={!logIsRx ? styles.rxBtnActive : styles.rxBtn} onClick={() => setLogIsRx(false)}>SCALED</button>
                    </div>
                    {!logIsRx && (
                      <input className={styles.resultInput} type="text" placeholder="Scaling notes (e.g. band-assisted pull-ups)" value={logScaling} onChange={e => setLogScaling(e.target.value)} />
                    )}
                    <textarea className={styles.notesInput} placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} rows={2} />
                    {prCelebration && <div className={styles.prCelebration}>New PR! Keep crushing it.</div>}
                    <button className={styles.submitBtn} type="submit" disabled={submitting || !logResult.trim()}>
                      {submitting ? "Saving..." : "Save Result"}
                    </button>
                  </form>
                ) : (
                  <div className={styles.todayResult}>
                    <div className={styles.sectionLabel}>Today&apos;s Result</div>
                    <div className={styles.todayResultScore}>{userResult.result}</div>
                    <div className={styles.todayResultMeta}>
                      <RxBadge isRx={userResult.is_rx} />
                      {userResult.is_pr && <PrBadge />}
                    </div>
                    {userResult.notes && <div style={{ color: "#666", fontSize: "13px", marginTop: "8px" }}>{userResult.notes}</div>}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── FEED ── */}
        {view === "feed" && (
          <>
            {feedLoading ? (
              <><Skeleton type="card" /><Skeleton type="card" /><Skeleton type="card" /></>
            ) : feed.length === 0 ? (
              <p className={styles.empty}>No results yet — be the first to log one.</p>
            ) : (
              feed.map(r => (
                <div key={r.id} className={styles.feedCard}>
                  <div className={styles.feedHeader}>
                    <span className={styles.feedUser}>{r.username}</span>
                    <span className={styles.feedDate}>{fmtDateTime(r.created_at)}</span>
                  </div>
                  <div className={styles.feedWorkout}>{r.workout_name}</div>
                  <div className={styles.feedResult}>{r.result}</div>
                  <div className={styles.feedMeta}>
                    <RxBadge isRx={r.is_rx} />
                    {r.is_pr && <PrBadge />}
                  </div>
                  <div className={styles.feedActions}>
                    <button className={r.i_bumped ? styles.bumpBtnActive : styles.bumpBtn} onClick={() => toggleBump(r.id)}>
                      👊 {r.fist_bump_count > 0 ? r.fist_bump_count : ""}
                    </button>
                    <button className={styles.commentToggle} onClick={() => toggleComments(r.id)}>
                      💬 {r.comment_count > 0 ? r.comment_count : ""}
                    </button>
                  </div>

                  {expandedComments.has(r.id) && (
                    <div className={styles.comments}>
                      {(comments[r.id] ?? []).map(c => (
                        <div key={c.id} className={styles.commentRow}>
                          <span className={styles.commentUser}>{c.username}</span>
                          <span className={styles.commentText}>{c.comment}</span>
                        </div>
                      ))}
                      <div className={styles.commentForm}>
                        {mentionResultId === r.id && mentionResults.length > 0 && (
                          <div className={styles.mentionDropdown}>
                            {mentionResults.map(m => (
                              <button key={m.user_id} className={styles.mentionItem} onClick={() => selectMention(r.id, m.username)}>
                                @{m.username} <span className={styles.mentionName}>{m.first_name} {m.last_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <input
                          className={styles.commentInput}
                          placeholder="Add a comment... use @ to mention"
                          value={commentInputs[r.id] ?? ""}
                          onChange={e => handleCommentInputChange(r.id, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); postComment(r.id) } }}
                          maxLength={500}
                        />
                        <button className={styles.commentSend} onClick={() => postComment(r.id)} disabled={commentLoading[r.id] || !commentInputs[r.id]?.trim()}>
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {view === "board" && (
          <>
            <div className={styles.workoutSelector}>
              <select className={styles.workoutSelect} value={boardWorkoutId ?? ""} onChange={e => setBoardWorkoutId(parseInt(e.target.value, 10))}>
                {allWorkouts.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {boardLoading ? (
              <><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></>
            ) : (
              boardSections.map(section => (
                <div key={section.label} className={styles.boardSection}>
                  <div className={styles.boardSectionLabel}>{section.label}</div>
                  {section.entries.length === 0 ? (
                    <div className={styles.boardEmpty}>No results</div>
                  ) : (
                    section.entries.map((entry, i) => (
                      <div key={entry.id} className={styles.boardRow}>
                        <span className={styles.boardRank}>{i + 1}</span>
                        <span className={styles.boardName}>
                          {entry.first_name} {entry.last_name}
                          {" "}<span className={styles.boardUsername}>@{entry.username}</span>
                        </span>
                        <span className={styles.boardResult}>{entry.result}</span>
                        {entry.fist_bump_count > 0 && <span className={styles.boardBumps}>👊 {entry.fist_bump_count}</span>}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* ── PRs ── */}
        {view === "prs" && (
          <>
            {prsLoading ? (
              <><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></>
            ) : prs.length === 0 ? (
              <p className={styles.prEmpty}>No benchmark results yet — log some to track your PRs.</p>
            ) : (
              <>
                {prStats && <div className={styles.prStats}>{prStats.total_results} results · {prStats.total_prs} PRs</div>}
                {prs.map(pr => (
                  <div key={pr.id} className={styles.prRow}>
                    <span className={styles.prWorkout}>{pr.workout_name}</span>
                    <span className={styles.prResult}>{pr.result}</span>
                    <RxBadge isRx={pr.is_rx} />
                    <span className={styles.prDate}>{fmtDate(pr.result_date)}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── PROFILE ── */}
        {view === "profile" && (
          <>
            <div className={styles.profileHeader}>
              <div className={styles.profileName}>
                {profile.firstName} {profile.lastName}
                {(unreadCounts.fistBumpCount > 0 || unreadCounts.commentCount > 0) && (
                  <span className={styles.profileBadges}>
                    {unreadCounts.fistBumpCount > 0 && <span className={styles.profileBadge}>👊 {unreadCounts.fistBumpCount}</span>}
                    {unreadCounts.commentCount > 0 && <span className={styles.profileBadge}>💬 {unreadCounts.commentCount}</span>}
                  </span>
                )}
              </div>
              <div className={styles.profileUsername}>@{profile.username} · {profile.gender}</div>
              {profile.bio && <div className={styles.profileBio}>{profile.bio}</div>}
              {profileData && (
                <div className={styles.profileStats}>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum}>{scoreBreakdown?.score ?? 0}</span>
                    <span className={styles.profileStatLabel}>Score</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum}>{profileData.stats.total_results}</span>
                    <span className={styles.profileStatLabel}>Results</span>
                  </div>
                  <div className={styles.profileStat}>
                    <span className={styles.profileStatNum}>{profileData.stats.total_prs}</span>
                    <span className={styles.profileStatLabel}>PRs</span>
                  </div>
                </div>
              )}
              {scoreBreakdown && (
                <div className={styles.scoreDetail}>
                  {scoreBreakdown.totalBumps} fist bumps + {scoreBreakdown.totalPrs} PRs × 50 pts
                </div>
              )}
            </div>

            {/* Friends section */}
            <div className={styles.profileSection}>
              <div className={styles.profileSectionLabel}>
                Friends ({friends.accepted.length})
                <button className={styles.addFriendBtn} onClick={() => setShowFriendSearch(true)}>+ Add</button>
              </div>

              {friends.incoming.length > 0 && (
                <div className={styles.friendRequests}>
                  <div className={styles.friendRequestLabel}>Pending Requests</div>
                  {friends.incoming.map(f => (
                    <div key={f.request_id} className={styles.friendRow}>
                      <div className={styles.friendAvatar}>{f.first_name[0]}</div>
                      <div className={styles.friendInfo}>
                        <span className={styles.friendName}>{f.first_name} {f.last_name}</span>
                        <span className={styles.friendUsername}>@{f.username}</span>
                      </div>
                      <div className={styles.friendActions}>
                        <button className={styles.acceptBtn} onClick={() => respondFriendRequest(f.request_id, "accept")}>Accept</button>
                        <button className={styles.declineBtn} onClick={() => respondFriendRequest(f.request_id, "decline")}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {friendsLoading ? <Skeleton type="row" /> : friends.accepted.length === 0 ? (
                <p className={styles.empty} style={{ padding: "16px 0" }}>No friends yet</p>
              ) : (
                friends.accepted.map(f => (
                  <div key={f.user_id} className={styles.friendRow}>
                    <div className={styles.friendAvatar}>{f.first_name[0]}</div>
                    <div className={styles.friendInfo}>
                      <span className={styles.friendName}>{f.first_name} {f.last_name}</span>
                      <span className={styles.friendUsername}>@{f.username}</span>
                    </div>
                    <span className={styles.friendScore}>{f.score}</span>
                  </div>
                ))
              )}

              {friends.outgoing.length > 0 && (
                <div className={styles.friendRequests}>
                  <div className={styles.friendRequestLabel}>Sent</div>
                  {friends.outgoing.map(f => (
                    <div key={f.request_id} className={styles.friendRow}>
                      <div className={styles.friendAvatar}>{f.first_name[0]}</div>
                      <div className={styles.friendInfo}>
                        <span className={styles.friendName}>{f.first_name} {f.last_name}</span>
                        <span className={styles.friendUsername}>@{f.username}</span>
                      </div>
                      <span className={styles.pendingLabel}>Pending</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Friend search overlay */}
            {showFriendSearch && (
              <div className={styles.friendSearchOverlay} onClick={() => { setShowFriendSearch(false); setFriendSearchQuery("") }}>
                <div className={styles.friendSearchPanel} onClick={e => e.stopPropagation()}>
                  <div className={styles.friendSearchTitle}>Add Friend</div>
                  <input
                    className={styles.friendSearchInput}
                    type="text"
                    placeholder="Search by name or username..."
                    value={friendSearchQuery}
                    onChange={e => setFriendSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {friendSearching && <div className={styles.friendSearchHint}>Searching...</div>}
                  {friendSearchResults.map(r => {
                    const alreadyFriend = friends.accepted.some(f => f.user_id === r.user_id)
                    const alreadyPending = friends.outgoing.some(f => f.user_id === r.user_id) || friends.incoming.some(f => f.user_id === r.user_id)
                    return (
                      <div key={r.user_id} className={styles.friendSearchRow}>
                        <div className={styles.friendAvatar}>{r.first_name[0]}</div>
                        <div className={styles.friendInfo}>
                          <span className={styles.friendName}>{r.first_name} {r.last_name}</span>
                          <span className={styles.friendUsername}>@{r.username}</span>
                        </div>
                        {alreadyFriend ? (
                          <span className={styles.pendingLabel}>Friends</span>
                        ) : alreadyPending ? (
                          <span className={styles.pendingLabel}>Pending</span>
                        ) : (
                          <button className={styles.acceptBtn} onClick={() => sendFriendRequest(r.user_id)}>Add</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {profileLoading ? (
              <><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></>
            ) : profileData ? (
              <div className={styles.profileSection}>
                <div className={styles.profileSectionLabel}>Recent Results</div>
                {profileData.recent.length === 0 ? (
                  <p className={styles.empty}>No results yet</p>
                ) : (
                  profileData.recent.map(r => (
                    <div key={r.id} className={styles.prevRow}>
                      <span className={styles.prevDate}>{fmtDate(r.result_date)}</span>
                      <span style={{ color: "#666", fontSize: "12px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.workout_name}</span>
                      <span className={styles.prevResult}>{r.result}</span>
                      <RxBadge isRx={r.is_rx} />
                      {r.is_pr && <PrBadge />}
                    </div>
                  ))
                )}
              </div>
            ) : null}

            <button className={styles.editProfileBtn} onClick={() => router.push("/wod/setup")}>Edit Profile</button>
          </>
        )}

        {/* ── NOTIFICATIONS ── */}
        {view === "notifications" && (
          <>
            <div className={styles.notifHeader}>
              <span className={styles.notifTitle}>Notifications</span>
              <div className={styles.notifActions}>
                {unreadCounts.count > 0 && (
                  <button className={styles.notifMarkAll} onClick={markAllRead}>Mark all read</button>
                )}
                <button className={styles.notifSettingsBtn} onClick={() => setShowNotifPrefs(p => !p)}>⚙️</button>
              </div>
            </div>

            <div className={styles.notifFilterBar}>
              {NOTIF_FILTER_TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  className={notifTypeFilter.has(key) ? styles.notifFilterChipActive : styles.notifFilterChip}
                  onClick={() => setNotifTypeFilter(prev => {
                    const s = new Set(prev)
                    if (s.has(key)) s.delete(key); else s.add(key)
                    return s
                  })}
                >
                  {label}
                </button>
              ))}
            </div>

            {showNotifPrefs && (
              <div className={styles.notifPrefsPanel}>
                <div className={styles.notifPrefsTitle}>Notification Settings</div>
                {PREF_LABELS.map(({ key, label }) => (
                  <label key={key} className={styles.notifPrefRow}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={notifPrefs[key]}
                      onChange={() => togglePref(key)}
                      className={styles.notifToggle}
                    />
                  </label>
                ))}
              </div>
            )}

            {notifLoading ? (
              <><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></>
            ) : (() => {
              const filtered = notifTypeFilter.size === 0
                ? notifications
                : notifications.filter(n => notifTypeFilter.has(n.type))
              return filtered.length === 0 ? (
                <p className={styles.empty}>{notifications.length === 0 ? "No notifications yet" : "No matching notifications"}</p>
              ) : (
              filtered.map(n => (
                <button
                  key={n.id}
                  className={n.is_read ? styles.notifRow : styles.notifRowUnread}
                  onClick={() => handleNotifClick(n)}
                >
                  <span className={styles.notifIcon}>{notifIcon(n.type)}</span>
                  <div className={styles.notifContent}>
                    <div className={styles.notifBody}>{n.body}</div>
                    <div className={styles.notifTime}>{fmtTimeAgo(n.created_at)}</div>
                  </div>
                  {!n.is_read && <span className={styles.notifDot} />}
                </button>
              )))
            })()}
          </>
        )}

        {/* ── ADMIN ── */}
        {view === "admin" && user.isAdmin && (
          <>
            <div className={styles.adminSection}>
              <div className={styles.adminSectionLabel}>Schedule Workout</div>
              <form onSubmit={scheduleWorkout}>
                <div className={styles.adminRow}>
                  <input className={styles.adminInput} type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} required />
                  <select className={styles.adminSelect} value={schedWorkoutId} onChange={e => setSchedWorkoutId(e.target.value)} required>
                    <option value="">Select workout</option>
                    {allWorkouts.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className={styles.adminRow}>
                  <input className={styles.adminInput} type="text" placeholder="Notes (optional)" value={schedNotes} onChange={e => setSchedNotes(e.target.value)} />
                  <button className={styles.adminBtn} type="submit" disabled={schedSubmitting || !schedDate || !schedWorkoutId}>
                    {schedSubmitting ? "..." : "Schedule"}
                  </button>
                </div>
              </form>
            </div>

            <div className={styles.adminSection}>
              <div className={styles.adminSectionLabel}>Upcoming</div>
              {scheduleLoading ? (
                <><Skeleton type="row" /><Skeleton type="row" /></>
              ) : schedule.length === 0 ? (
                <p className={styles.empty}>Nothing scheduled</p>
              ) : (
                schedule.map(s => (
                  <div key={s.id} className={styles.scheduleRow}>
                    <span className={styles.scheduleDate}>{fmtDate(s.scheduled_date)}</span>
                    <span className={styles.scheduleName}>{s.name}</span>
                    <span style={{ color: "#555", fontSize: "12px" }}>{s.format}</span>
                    <button className={styles.scheduleDelete} onClick={() => deleteSchedule(s.scheduled_date)}>✕</button>
                  </div>
                ))
              )}
            </div>

            <div className={styles.adminSection}>
              <div className={styles.adminSectionLabel}>Create Workout</div>
              <form onSubmit={createWorkout}>
                <div className={styles.adminRow}>
                  <input className={styles.adminInput} type="text" placeholder="Workout name" value={newWodName} onChange={e => setNewWodName(e.target.value)} required />
                </div>
                <div className={styles.adminRow}>
                  <textarea className={styles.adminInput} placeholder="Description" value={newWodDesc} onChange={e => setNewWodDesc(e.target.value)} rows={2} style={{ resize: "none" }} />
                </div>
                <div className={styles.adminRow}>
                  <select className={styles.adminSelect} value={newWodFormat} onChange={e => setNewWodFormat(e.target.value)}>
                    <option value="amrap">AMRAP</option>
                    <option value="for-time">For Time</option>
                    <option value="emom">EMOM</option>
                    <option value="strength">Strength</option>
                    <option value="chipper">Chipper</option>
                  </select>
                  <select className={styles.adminSelect} value={newWodScoreType} onChange={e => setNewWodScoreType(e.target.value)}>
                    <option value="reps">Reps</option>
                    <option value="time">Time</option>
                    <option value="weight">Weight</option>
                    <option value="rounds">Rounds</option>
                  </select>
                </div>
                <div className={styles.adminRow}>
                  <input className={styles.adminInput} type="number" placeholder="Time cap (min)" value={newWodTimeCap} onChange={e => setNewWodTimeCap(e.target.value)} />
                  <label style={{ color: "#666", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
                    <input type="checkbox" checked={newWodBenchmark} onChange={e => setNewWodBenchmark(e.target.checked)} />
                    Benchmark
                  </label>
                  <button className={styles.adminBtn} type="submit" disabled={newWodSubmitting || !newWodName.trim()}>
                    {newWodSubmitting ? "..." : "Create"}
                  </button>
                </div>
              </form>
            </div>

            <div className={styles.adminSection}>
              <div className={styles.adminSectionLabel}>Workouts ({allWorkouts.length})</div>
              {allWorkouts.map(w => (
                <div key={w.id} className={styles.workoutListRow}>
                  {w.isBenchmark && <span className={styles.benchmarkDot}>★</span>}
                  <span className={styles.workoutListName}>{w.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* bottom nav */}
      <nav className={styles.bottomNav}>
        {navItems.map(n => {
          const profileBadge = n.key === "profile" ? unreadCounts.fistBumpCount + unreadCounts.commentCount : 0
          return (
            <button
              key={n.key}
              className={view === n.key ? styles.navItemActive : styles.navItem}
              onClick={() => setView(n.key)}
            >
              <span className={styles.navIcon}>{n.icon}</span>
              {profileBadge > 0 && <span className={styles.navBadge}>{profileBadge > 99 ? "99+" : profileBadge}</span>}
              <span className={styles.navLabel}>{n.label}</span>
            </button>
          )
        })}
      </nav>

      {toast && <div key={toast + Date.now()} className={styles.toast}>{toast}</div>}
    </div>
  )
}
