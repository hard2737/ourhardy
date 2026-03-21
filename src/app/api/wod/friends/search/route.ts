import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

// GET /api/wod/friends/search?q=... — search profiles by username/name
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 1) return NextResponse.json({ results: [] })

  const pattern = `%${q}%`
  const results = await sql`
    SELECT user_id, username, first_name, last_name
    FROM wod_profiles
    WHERE user_id != ${session.userId}
      AND (username ILIKE ${pattern} OR first_name ILIKE ${pattern} OR last_name ILIKE ${pattern})
    ORDER BY username
    LIMIT 20
  `

  return NextResponse.json({ results })
}
