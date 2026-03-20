import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { getSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

async function authorize(session: { userId: number; email: string }, playlistId: string) {
  const [playlist] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM playlists WHERE id = ${playlistId}
  `
  if (!playlist) return { error: "Not found", status: 404 }
  const isAdmin = session.email === process.env.ADMIN_EMAIL
  if (playlist.user_id !== session.userId && !isAdmin) {
    return { error: "Forbidden", status: 403 }
  }
  return null
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { trackKey } = await req.json().catch(() => ({}))
  if (!trackKey) return NextResponse.json({ error: "trackKey required" }, { status: 400 })

  const denied = await authorize(session, id)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  await sql`
    INSERT INTO playlist_tracks (playlist_id, track_key)
    VALUES (${id}, ${trackKey})
    ON CONFLICT DO NOTHING
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { trackKey } = await req.json().catch(() => ({}))
  if (!trackKey) return NextResponse.json({ error: "trackKey required" }, { status: 400 })

  const denied = await authorize(session, id)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  await sql`
    DELETE FROM playlist_tracks
    WHERE playlist_id = ${id} AND track_key = ${trackKey}
  `
  return NextResponse.json({ ok: true })
}
