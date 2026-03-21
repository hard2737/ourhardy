import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { ensureSummaries } from "@/lib/notifications"

// GET /api/wod/notifications — list notifications for current user
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Lazy-generate summaries
  await ensureSummaries(session.userId).catch(() => {})

  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "1"
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10) || 30, 100)
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0

  const notifications = await sql`
    SELECT id, type, title, body, metadata, is_read, created_at
    FROM notifications
    WHERE user_id = ${session.userId}
      ${unreadOnly ? sql`AND is_read = FALSE` : sql``}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE user_id = ${session.userId} AND is_read = FALSE
  `

  // Prune old notifications (> 90 days) occasionally
  if (Math.random() < 0.05) {
    sql`DELETE FROM notifications WHERE user_id = ${session.userId} AND created_at < NOW() - INTERVAL '90 days'`.catch(() => {})
  }

  return NextResponse.json({ notifications, unreadCount: count })
}
