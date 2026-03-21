import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

// GET /api/wod/notifications/unread-count — per-type badge counts
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [row] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE is_read = FALSE)::int AS count,
      COUNT(*) FILTER (WHERE is_read = FALSE AND type = 'fist_bump')::int AS fist_bump_count,
      COUNT(*) FILTER (WHERE is_read = FALSE AND type = 'comment')::int AS comment_count,
      COUNT(*) FILTER (WHERE is_read = FALSE AND type = 'mention')::int AS mention_count,
      COUNT(*) FILTER (WHERE is_read = FALSE AND type = 'friend_request')::int AS friend_request_count
    FROM notifications
    WHERE user_id = ${session.userId}
  `

  return NextResponse.json({
    count: row.count,
    fistBumpCount: row.fist_bump_count,
    commentCount: row.comment_count,
    mentionCount: row.mention_count,
    friendRequestCount: row.friend_request_count,
  })
}
