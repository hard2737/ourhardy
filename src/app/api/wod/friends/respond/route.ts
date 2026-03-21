import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { createNotification } from "@/lib/notifications"

// POST /api/wod/friends/respond — accept or decline a friend request
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const requestId = parseInt(body?.requestId, 10)
  const action = body?.action

  if (!requestId || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "requestId and action (accept|decline) required" }, { status: 400 })
  }

  const [request] = await sql`
    SELECT id, requester_id, addressee_id, status
    FROM friendships WHERE id = ${requestId}
  `
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (request.addressee_id !== session.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (request.status !== "pending") return NextResponse.json({ error: "Already responded" }, { status: 409 })

  const newStatus = action === "accept" ? "accepted" : "declined"
  await sql`UPDATE friendships SET status = ${newStatus}, updated_at = NOW() WHERE id = ${requestId}`

  if (action === "accept") {
    const [myProfile] = await sql`SELECT username FROM wod_profiles WHERE user_id = ${session.userId}`
    if (myProfile) {
      createNotification({
        userId: request.requester_id,
        type: "friend_accepted",
        title: "Friend request accepted!",
        body: `@${myProfile.username} accepted your friend request`,
        metadata: { actorUserId: session.userId },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
