import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { createNotification } from "@/lib/notifications"

// GET /api/wod/results — community feed or personal results
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workoutId = req.nextUrl.searchParams.get("workoutId")
  const mine = req.nextUrl.searchParams.get("mine") === "1"
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0

  const rows = await sql`
    SELECT
      wr.id, wr.result, wr.score, wr.is_rx, wr.scaling_notes, wr.notes, wr.is_pr,
      wr.result_date, wr.created_at,
      wr.user_id, wr.workout_id,
      wp.username, wp.first_name, wp.last_name,
      w.name AS workout_name, w.score_type,
      (SELECT COUNT(*)::int FROM fist_bumps fb WHERE fb.result_id = wr.id) AS fist_bump_count,
      (SELECT COUNT(*)::int FROM result_comments rc WHERE rc.result_id = wr.id) AS comment_count,
      EXISTS(SELECT 1 FROM fist_bumps fb WHERE fb.result_id = wr.id AND fb.user_id = ${session.userId}) AS i_bumped
    FROM workout_results wr
    JOIN wod_profiles wp ON wp.user_id = wr.user_id
    JOIN workouts w ON w.id = wr.workout_id
    ${mine ? sql`WHERE wr.user_id = ${session.userId}` : workoutId ? sql`WHERE wr.workout_id = ${parseInt(workoutId, 10)}` : sql``}
    ORDER BY wr.created_at DESC
    LIMIT 30 OFFSET ${offset}
  `

  return NextResponse.json({ results: rows })
}

// POST /api/wod/results — submit a result
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Ensure wod_profile exists
  const [profile] = await sql`SELECT id FROM wod_profiles WHERE user_id = ${session.userId}`
  if (!profile) return NextResponse.json({ error: "Profile not set up" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const workoutId = parseInt(body?.workoutId, 10)
  const result = body?.result?.trim()
  const score = body?.score != null ? parseFloat(body.score) : null
  const isRx = body?.isRx !== false
  const scalingNotes = body?.scalingNotes?.trim() ?? null
  const notes = body?.notes?.trim() ?? null
  const resultDate = body?.resultDate ?? new Date().toISOString().split("T")[0]

  if (!workoutId || !result) {
    return NextResponse.json({ error: "workoutId and result are required" }, { status: 400 })
  }

  // Check if this is a PR (best score for this workout)
  const [workout] = await sql`SELECT score_type FROM workouts WHERE id = ${workoutId}`
  if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 })

  let isPr = false
  if (score != null) {
    const [best] = await sql`
      SELECT score FROM workout_results
      WHERE user_id = ${session.userId} AND workout_id = ${workoutId} AND score IS NOT NULL
      ORDER BY ${workout.score_type === "time" ? sql`score ASC` : sql`score DESC`}
      LIMIT 1
    `
    if (!best) {
      isPr = true
    } else {
      isPr = workout.score_type === "time"
        ? score < parseFloat(best.score)
        : score > parseFloat(best.score)
    }
  }

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO workout_results (user_id, workout_id, result, score, is_rx, scaling_notes, notes, is_pr, result_date)
    VALUES (${session.userId}, ${workoutId}, ${result}, ${score}, ${isRx}, ${scalingNotes}, ${notes}, ${isPr}, ${resultDate})
    RETURNING id
  `

  // Notify gym buddies (others who did the same WOD today)
  const [myProfile] = await sql`SELECT username FROM wod_profiles WHERE user_id = ${session.userId}`
  if (myProfile) {
    const [wo] = await sql`SELECT name FROM workouts WHERE id = ${workoutId}`
    const peers = await sql`
      SELECT DISTINCT user_id FROM workout_results
      WHERE workout_id = ${workoutId} AND result_date = ${resultDate} AND user_id != ${session.userId}
    `
    for (const peer of peers) {
      createNotification({
        userId: peer.user_id,
        type: "workout_completion",
        title: "Gym buddy finished!",
        body: `@${myProfile.username} completed ${wo?.name ?? "a workout"}`,
        metadata: { resultId: row.id, actorUserId: session.userId, workoutId },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, id: row.id, isPr })
}
