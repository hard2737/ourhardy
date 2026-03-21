import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workoutId = parseInt(req.nextUrl.searchParams.get("workoutId") ?? "", 10)
  if (!workoutId) return NextResponse.json({ error: "workoutId required" }, { status: 400 })

  const [workout] = await sql`SELECT id, name, score_type FROM workouts WHERE id = ${workoutId}`
  if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 })

  // Best result per user for this workout
  const rows = await sql`
    SELECT DISTINCT ON (wr.user_id, wr.is_rx, wp.gender)
      wr.id, wr.user_id, wr.result, wr.score, wr.is_rx, wr.is_pr,
      wp.username, wp.first_name, wp.last_name, wp.gender,
      (SELECT COUNT(*)::int FROM fist_bumps fb WHERE fb.result_id = wr.id) AS fist_bump_count
    FROM workout_results wr
    JOIN wod_profiles wp ON wp.user_id = wr.user_id
    WHERE wr.workout_id = ${workoutId} AND wr.score IS NOT NULL
    ORDER BY wr.user_id, wr.is_rx, wp.gender,
      ${workout.score_type === "time" ? sql`wr.score ASC` : sql`wr.score DESC`}
  `

  // Group into sections
  type Row = typeof rows[number]
  const groups: Record<string, Row[]> = {
    "RX · MEN": [],
    "SCALED · MEN": [],
    "RX · WOMEN": [],
    "SCALED · WOMEN": [],
    "RX · OTHER": [],
    "SCALED · OTHER": [],
  }

  for (const r of rows) {
    const g = r.gender === "male" ? "MEN" : r.gender === "female" ? "WOMEN" : "OTHER"
    const key = `${r.is_rx ? "RX" : "SCALED"} · ${g}`
    groups[key].push(r)
  }

  // Sort each group
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => {
      if (workout.score_type === "time") {
        return parseFloat(a.score) - parseFloat(b.score)
      }
      return parseFloat(b.score) - parseFloat(a.score)
    })
  }

  // Remove empty groups (except main 4)
  const sections = Object.entries(groups)
    .filter(([k, v]) => v.length > 0 || ["RX · MEN", "SCALED · MEN", "RX · WOMEN", "SCALED · WOMEN"].includes(k))
    .map(([label, entries]) => ({ label, entries }))

  return NextResponse.json({ workout, sections })
}
