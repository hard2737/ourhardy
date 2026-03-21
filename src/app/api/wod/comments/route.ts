import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { createNotification } from "@/lib/notifications"

// GET /api/wod/comments?resultId=X — fetch comments for a result
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const resultId = parseInt(req.nextUrl.searchParams.get("resultId") ?? "", 10)
  if (!resultId) return NextResponse.json({ error: "resultId required" }, { status: 400 })

  const comments = await sql`
    SELECT
      rc.id, rc.comment, rc.created_at,
      rc.user_id,
      wp.username, wp.first_name, wp.last_name
    FROM result_comments rc
    JOIN wod_profiles wp ON wp.user_id = rc.user_id
    WHERE rc.result_id = ${resultId}
    ORDER BY rc.created_at ASC
  `

  return NextResponse.json({ comments })
}

// POST /api/wod/comments — add a comment
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const resultId = parseInt(body?.resultId, 10)
  const comment = body?.comment?.trim()

  if (!resultId || !comment) {
    return NextResponse.json({ error: "resultId and comment required" }, { status: 400 })
  }
  if (comment.length > 500) {
    return NextResponse.json({ error: "Comment too long (max 500 chars)" }, { status: 400 })
  }

  const [result] = await sql`SELECT id, user_id FROM workout_results WHERE id = ${resultId}`
  if (!result) return NextResponse.json({ error: "Result not found" }, { status: 404 })

  const [profile] = await sql`SELECT username, first_name, last_name FROM wod_profiles WHERE user_id = ${session.userId}`
  if (!profile) return NextResponse.json({ error: "Profile not set up" }, { status: 403 })

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO result_comments (result_id, user_id, comment) VALUES (${resultId}, ${session.userId}, ${comment}) RETURNING id
  `

  // Notify result owner (don't notify yourself)
  if (result.user_id !== session.userId) {
    createNotification({
      userId: result.user_id,
      type: "comment",
      title: "New comment",
      body: `@${profile.username} commented on your result`,
      metadata: { resultId, commentId: row.id, actorUserId: session.userId },
    }).catch(() => {})
  }

  // Parse @mentions and notify
  const mentionPattern = /@([a-z0-9_]{2,30})/g
  const mentionedUsernames = [...new Set([...comment.matchAll(mentionPattern)].map((m: RegExpExecArray) => m[1]))]
  if (mentionedUsernames.length > 0) {
    const mentionedUsers = await sql`
      SELECT user_id, username FROM wod_profiles WHERE username = ANY(${mentionedUsernames})
    `
    for (const mu of mentionedUsers) {
      if (mu.user_id === session.userId) continue
      if (mu.user_id === result.user_id) continue // already notified above
      sql`INSERT INTO comment_mentions (comment_id, user_id) VALUES (${row.id}, ${mu.user_id}) ON CONFLICT DO NOTHING`.catch(() => {})
      createNotification({
        userId: mu.user_id,
        type: "mention",
        title: "You were mentioned",
        body: `@${profile.username} mentioned you in a comment`,
        metadata: { resultId, commentId: row.id, actorUserId: session.userId },
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    ok: true,
    comment: {
      id: row.id,
      comment,
      created_at: new Date().toISOString(),
      user_id: session.userId,
      username: profile.username,
      first_name: profile.first_name,
      last_name: profile.last_name,
    },
  })
}

// DELETE /api/wod/comments?id=X — delete own comment
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const commentId = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10)
  if (!commentId) return NextResponse.json({ error: "id required" }, { status: 400 })

  const isAdmin = session.email === process.env.ADMIN_EMAIL
  const [existing] = await sql`SELECT user_id, result_id FROM result_comments WHERE id = ${commentId}`
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (existing.user_id !== session.userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await sql`DELETE FROM result_comments WHERE id = ${commentId}`
  return NextResponse.json({ ok: true, resultId: existing.result_id })
}
