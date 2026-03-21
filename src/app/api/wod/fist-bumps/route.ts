import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { createNotification } from "@/lib/notifications"

// POST /api/wod/fist-bumps — toggle fist bump on a result
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const resultId = parseInt(body?.resultId, 10)
  if (!resultId) return NextResponse.json({ error: "resultId required" }, { status: 400 })

  // Verify result exists
  const [result] = await sql`SELECT id, user_id FROM workout_results WHERE id = ${resultId}`
  if (!result) return NextResponse.json({ error: "Result not found" }, { status: 404 })

  const [existing] = await sql`
    SELECT id FROM fist_bumps WHERE result_id = ${resultId} AND user_id = ${session.userId}
  `

  if (existing) {
    await sql`DELETE FROM fist_bumps WHERE id = ${existing.id}`
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM fist_bumps WHERE result_id = ${resultId}`
    return NextResponse.json({ bumped: false, count })
  } else {
    await sql`INSERT INTO fist_bumps (result_id, user_id) VALUES (${resultId}, ${session.userId})`
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM fist_bumps WHERE result_id = ${resultId}`

    // Notify result owner (don't notify yourself)
    if (result.user_id !== session.userId) {
      const [p] = await sql`SELECT username FROM wod_profiles WHERE user_id = ${session.userId}`
      if (p) {
        createNotification({
          userId: result.user_id,
          type: "fist_bump",
          title: "Fist bump!",
          body: `@${p.username} fist-bumped your result`,
          metadata: { resultId, actorUserId: session.userId },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ bumped: true, count })
  }
}
