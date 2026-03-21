import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

const DEFAULTS = {
  fist_bump: true,
  comment: true,
  workout_completion: true,
  weekly_summary: true,
  monthly_summary: true,
}

// GET /api/wod/notifications/preferences
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [row] = await sql`
    SELECT fist_bump, comment, workout_completion, weekly_summary, monthly_summary
    FROM notification_preferences
    WHERE user_id = ${session.userId}
  `

  return NextResponse.json({ preferences: row ?? DEFAULTS })
}

// PUT /api/wod/notifications/preferences
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const fistBump = body.fist_bump ?? true
  const comment = body.comment ?? true
  const workoutCompletion = body.workout_completion ?? true
  const weeklySummary = body.weekly_summary ?? true
  const monthlySummary = body.monthly_summary ?? true

  await sql`
    INSERT INTO notification_preferences (user_id, fist_bump, comment, workout_completion, weekly_summary, monthly_summary, updated_at)
    VALUES (${session.userId}, ${fistBump}, ${comment}, ${workoutCompletion}, ${weeklySummary}, ${monthlySummary}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      fist_bump = ${fistBump},
      comment = ${comment},
      workout_completion = ${workoutCompletion},
      weekly_summary = ${weeklySummary},
      monthly_summary = ${monthlySummary},
      updated_at = NOW()
  `

  return NextResponse.json({ ok: true })
}
