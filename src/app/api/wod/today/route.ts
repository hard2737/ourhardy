import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD

  const [schedule] = await sql`
    SELECT
      ws.id AS schedule_id,
      ws.notes AS schedule_notes,
      w.id, w.name, w.description, w.type, w.format, w.score_type, w.time_cap, w.is_benchmark
    FROM workout_schedules ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.scheduled_date = ${today}
  `

  if (!schedule) {
    return NextResponse.json({ workout: null, userResult: null, previousResults: [] })
  }

  const workout = {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description,
    type: schedule.type,
    format: schedule.format,
    scoreType: schedule.score_type,
    timeCap: schedule.time_cap,
    isBenchmark: schedule.is_benchmark,
    scheduleNotes: schedule.schedule_notes,
  }

  // User's result for today
  const [userResult] = await sql`
    SELECT id, result, score, is_rx, scaling_notes, notes, is_pr, result_date
    FROM workout_results
    WHERE user_id = ${session.userId} AND workout_id = ${workout.id}
    AND result_date = ${today}
    ORDER BY created_at DESC
    LIMIT 1
  `

  // User's previous results for this workout (not today)
  const previousResults = await sql`
    SELECT id, result, score, is_rx, is_pr, result_date
    FROM workout_results
    WHERE user_id = ${session.userId} AND workout_id = ${workout.id}
    AND result_date < ${today}
    ORDER BY result_date DESC
    LIMIT 5
  `

  return NextResponse.json({
    workout,
    userResult: userResult ?? null,
    previousResults,
  })
}
