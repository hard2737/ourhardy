import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

// POST /api/wod/notifications/read — mark notifications as read
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)

  if (body?.all) {
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${session.userId} AND is_read = FALSE`
  } else if (Array.isArray(body?.ids) && body.ids.length > 0) {
    const ids = body.ids.map((id: unknown) => parseInt(String(id), 10)).filter(Boolean)
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${session.userId} AND id = ANY(${ids})`
  } else {
    return NextResponse.json({ error: "Provide { all: true } or { ids: [...] }" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
