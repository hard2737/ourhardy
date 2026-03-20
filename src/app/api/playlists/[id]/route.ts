import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { getSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const [playlist] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM playlists WHERE id = ${id}
  `
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = session.email === process.env.ADMIN_EMAIL
  if (playlist.user_id !== session.userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await sql`DELETE FROM playlists WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}

// Admin only: toggle is_global
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { isGlobal } = await req.json()

  const [playlist] = await sql`
    UPDATE playlists SET is_global = ${!!isGlobal}
    WHERE id = ${id}
    RETURNING id, name, is_global, user_id
  `
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(playlist)
}
