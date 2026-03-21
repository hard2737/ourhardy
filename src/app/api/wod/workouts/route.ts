import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

// GET /api/wod/workouts — list all workouts (any authenticated user)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workouts = await sql`
    SELECT id, name, description, type, format, score_type, time_cap, is_benchmark, created_at
    FROM workouts
    ORDER BY is_benchmark DESC, name ASC
  `

  return NextResponse.json({ workouts })
}

// POST /api/wod/workouts — create a workout (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const name = body?.name?.trim()
  const description = body?.description?.trim() ?? null
  const type = body?.type ?? "wod"
  const format = body?.format ?? "amrap"
  const scoreType = body?.scoreType ?? "reps"
  const timeCap = body?.timeCap ? parseInt(body.timeCap, 10) : null
  const isBenchmark = body?.isBenchmark === true

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO workouts (name, description, type, format, score_type, time_cap, is_benchmark)
    VALUES (${name}, ${description}, ${type}, ${format}, ${scoreType}, ${timeCap}, ${isBenchmark})
    RETURNING id
  `

  return NextResponse.json({ ok: true, id: row.id })
}
