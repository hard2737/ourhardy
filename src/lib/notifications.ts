import sql from "@/lib/db"

type NotifType = "fist_bump" | "comment" | "workout_completion" | "weekly_summary" | "monthly_summary" | "mention" | "friend_request" | "friend_accepted"

interface CreateNotifOpts {
  userId: number
  type: NotifType
  title: string
  body: string
  metadata?: Record<string, unknown>
}

/** Insert a notification if the user's preferences allow it. */
export async function createNotification(opts: CreateNotifOpts) {
  // Map notification type to preference column (friend_accepted uses friend_request pref)
  const prefCol: Record<NotifType, string> = {
    fist_bump: "fist_bump", comment: "comment", workout_completion: "workout_completion",
    weekly_summary: "weekly_summary", monthly_summary: "monthly_summary",
    mention: "mention", friend_request: "friend_request", friend_accepted: "friend_request",
  }
  const col = prefCol[opts.type]

  const [pref] = await sql`
    SELECT fist_bump, comment, workout_completion, weekly_summary, monthly_summary, mention, friend_request
    FROM notification_preferences
    WHERE user_id = ${opts.userId}
  `
  if (pref && pref[col] === false) return null

  const [row] = await sql`
    INSERT INTO notifications (user_id, type, title, body, metadata)
    VALUES (${opts.userId}, ${opts.type}, ${opts.title}, ${opts.body}, ${JSON.stringify(opts.metadata ?? {})})
    RETURNING id
  `
  return row
}

/** Lazy-generate weekly and monthly summary if due. */
export async function ensureSummaries(userId: number) {
  const now = new Date()
  const today = now.toISOString().split("T")[0]

  // Weekly: generate on Monday or later in the week if not yet created
  const dayOfWeek = now.getDay() // 0=Sun
  if (dayOfWeek >= 1) {
    const monday = new Date(now)
    monday.setDate(monday.getDate() - (dayOfWeek - 1))
    monday.setHours(0, 0, 0, 0)
    const weekStart = monday.toISOString().split("T")[0]

    // Previous week range
    const prevMon = new Date(monday)
    prevMon.setDate(prevMon.getDate() - 7)
    const prevStart = prevMon.toISOString().split("T")[0]

    const [existing] = await sql`
      SELECT id FROM notifications
      WHERE user_id = ${userId} AND type = 'weekly_summary'
        AND created_at >= ${monday.toISOString()}
    `
    if (!existing) {
      const [stats] = await sql`
        SELECT
          COUNT(*)::int AS workouts,
          COUNT(*) FILTER (WHERE is_pr)::int AS prs,
          COUNT(DISTINCT workout_id)::int AS unique_workouts
        FROM workout_results
        WHERE user_id = ${userId}
          AND result_date >= ${prevStart}
          AND result_date < ${weekStart}
      `
      if (stats.workouts > 0) {
        const prText = stats.prs > 0 ? `, ${stats.prs} PR${stats.prs > 1 ? "s" : ""}!` : ""
        await createNotification({
          userId,
          type: "weekly_summary",
          title: "Weekly Recap",
          body: `Last week: ${stats.workouts} workout${stats.workouts > 1 ? "s" : ""} across ${stats.unique_workouts} WOD${stats.unique_workouts > 1 ? "s" : ""}${prText}`,
          metadata: { weekStart: prevStart, workouts: stats.workouts, prs: stats.prs },
        })
      }
    }
  }

  // Monthly: generate on first of month or later if not yet created
  if (now.getDate() >= 1) {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevEnd = firstOfMonth.toISOString().split("T")[0]
    const prevStart = prevFirst.toISOString().split("T")[0]
    const monthName = prevFirst.toLocaleDateString("en-US", { month: "long" })

    const [existing] = await sql`
      SELECT id FROM notifications
      WHERE user_id = ${userId} AND type = 'monthly_summary'
        AND created_at >= ${firstOfMonth.toISOString()}
    `
    if (!existing && today >= prevEnd) {
      const [stats] = await sql`
        SELECT
          COUNT(*)::int AS workouts,
          COUNT(*) FILTER (WHERE is_pr)::int AS prs
        FROM workout_results
        WHERE user_id = ${userId}
          AND result_date >= ${prevStart}
          AND result_date < ${prevEnd}
      `
      if (stats.workouts > 0) {
        const prText = stats.prs > 0 ? ` with ${stats.prs} PR${stats.prs > 1 ? "s" : ""}` : ""
        await createNotification({
          userId,
          type: "monthly_summary",
          title: `${monthName} Recap`,
          body: `${monthName}: ${stats.workouts} workout${stats.workouts > 1 ? "s" : ""}${prText}`,
          metadata: { month: prevStart, workouts: stats.workouts, prs: stats.prs },
        })
      }
    }
  }
}
