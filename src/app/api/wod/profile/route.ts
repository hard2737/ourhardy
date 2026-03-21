import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { BusinessRules } from "@/lib/businessRules"

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const targetUserId = parseInt(req.nextUrl.searchParams.get("userId") ?? "", 10) || session.userId

  const [profile] = await sql`
    SELECT username, first_name, last_name, bio, gender, created_at
    FROM wod_profiles WHERE user_id = ${targetUserId}
  `
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  // Total results + PRs
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total_results,
      COUNT(*) FILTER (WHERE is_pr = TRUE)::int AS total_prs
    FROM workout_results WHERE user_id = ${targetUserId}
  `

  // Score from BusinessRules
  const score = await BusinessRules.getScoreBreakdown(targetUserId)

  // Benchmark PRs — best result per benchmark workout
  const prs = await sql`
    SELECT DISTINCT ON (wr.workout_id)
      wr.id, wr.workout_id, wr.result, wr.score, wr.is_rx, wr.result_date, wr.is_pr,
      w.name AS workout_name, w.score_type
    FROM workout_results wr
    JOIN workouts w ON w.id = wr.workout_id
    WHERE wr.user_id = ${targetUserId} AND w.is_benchmark = TRUE
    ORDER BY wr.workout_id,
      CASE WHEN w.score_type = 'time' THEN wr.score END ASC NULLS LAST,
      CASE WHEN w.score_type != 'time' THEN wr.score END DESC NULLS LAST
  `

  // Recent results (last 20)
  const recent = await sql`
    SELECT wr.id, wr.result, wr.score, wr.is_rx, wr.is_pr, wr.result_date,
      w.name AS workout_name
    FROM workout_results wr
    JOIN workouts w ON w.id = wr.workout_id
    WHERE wr.user_id = ${targetUserId}
    ORDER BY wr.result_date DESC, wr.created_at DESC
    LIMIT 20
  `

  // Friendship status if viewing another user
  let friendshipStatus: string | null = null
  if (targetUserId !== session.userId) {
    const [f] = await sql`
      SELECT status FROM friendships
      WHERE (requester_id = ${session.userId} AND addressee_id = ${targetUserId})
         OR (requester_id = ${targetUserId} AND addressee_id = ${session.userId})
      LIMIT 1
    `
    friendshipStatus = f?.status ?? null
  }

  // Friend count
  const [friendCount] = await sql`
    SELECT COUNT(*)::int AS count FROM friendships
    WHERE (requester_id = ${targetUserId} OR addressee_id = ${targetUserId})
      AND status = 'accepted'
  `

  return NextResponse.json({
    profile: { ...profile, userId: targetUserId },
    stats,
    score,
    prs,
    recent,
    friendshipStatus,
    friendCount: friendCount.count,
  })
}
