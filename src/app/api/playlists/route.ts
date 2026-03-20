import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await sql`
    SELECT
      p.id, p.name, p.is_global, p.user_id,
      COALESCE(
        json_agg(pt.track_key ORDER BY pt.added_at ASC)
        FILTER (WHERE pt.track_key IS NOT NULL),
        '[]'
      ) AS track_keys
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    WHERE p.user_id = ${session.userId} OR p.is_global = TRUE
    GROUP BY p.id
    ORDER BY p.is_global DESC, p.created_at ASC
  `

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 })

  const isAdmin = session.email === process.env.ADMIN_EMAIL
  const isGlobal = isAdmin && !!body?.isGlobal

  const [playlist] = await sql`
    INSERT INTO playlists (name, user_id, is_global)
    VALUES (${name}, ${session.userId}, ${isGlobal})
    RETURNING id, name, is_global, user_id
  `

  return NextResponse.json({ ...playlist, track_keys: [] })
}
