import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

// GET /api/wod/schedule — upcoming schedule (7 days)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const today = new Date().toISOString().split("T")[0]

  const schedule = await sql`
    SELECT
      ws.id, ws.scheduled_date, ws.notes,
      w.id AS workout_id, w.name, w.format, w.score_type
    FROM workout_schedules ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.scheduled_date >= ${today}
    ORDER BY ws.scheduled_date ASC
    LIMIT 14
  `

  return NextResponse.json({ schedule })
}

// POST /api/wod/schedule — schedule a workout for a date (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const workoutId = parseInt(body?.workoutId, 10)
  const date = body?.date?.trim() // YYYY-MM-DD
  const notes = body?.notes?.trim() ?? null

  if (!workoutId || !date) {
    return NextResponse.json({ error: "workoutId and date are required" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 })
  }

  const [workout] = await sql`SELECT id FROM workouts WHERE id = ${workoutId}`
  if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 })

  await sql`
    INSERT INTO workout_schedules (workout_id, scheduled_date, notes)
    VALUES (${workoutId}, ${date}, ${notes})
    ON CONFLICT (scheduled_date) DO UPDATE SET workout_id = EXCLUDED.workout_id, notes = EXCLUDED.notes
  `

  return NextResponse.json({ ok: true })
}

// DELETE /api/wod/schedule — remove a scheduled workout
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const date = req.nextUrl.searchParams.get("date")
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 })

  await sql`DELETE FROM workout_schedules WHERE scheduled_date = ${date}`
  return NextResponse.json({ ok: true })
}
