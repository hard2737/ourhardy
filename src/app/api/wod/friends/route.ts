import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { BusinessRules } from "@/lib/businessRules"
import { createNotification } from "@/lib/notifications"

// GET /api/wod/friends — list accepted friends + pending requests
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const uid = session.userId

  const accepted = await sql`
    SELECT wp.user_id, wp.username, wp.first_name, wp.last_name
    FROM friendships f
    JOIN wod_profiles wp ON wp.user_id = CASE
      WHEN f.requester_id = ${uid} THEN f.addressee_id
      ELSE f.requester_id
    END
    WHERE (f.requester_id = ${uid} OR f.addressee_id = ${uid})
      AND f.status = 'accepted'
    ORDER BY wp.first_name
  `

  const incoming = await sql`
    SELECT f.id AS request_id, wp.user_id, wp.username, wp.first_name, wp.last_name, f.created_at
    FROM friendships f
    JOIN wod_profiles wp ON wp.user_id = f.requester_id
    WHERE f.addressee_id = ${uid} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `

  const outgoing = await sql`
    SELECT f.id AS request_id, wp.user_id, wp.username, wp.first_name, wp.last_name, f.created_at
    FROM friendships f
    JOIN wod_profiles wp ON wp.user_id = f.addressee_id
    WHERE f.requester_id = ${uid} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `

  // Attach scores to accepted friends
  const friendIds = accepted.map(f => f.user_id as number)
  const scores = await BusinessRules.getScores(friendIds)

  return NextResponse.json({
    accepted: accepted.map(f => ({ ...f, score: scores[f.user_id] ?? 0 })),
    incoming,
    outgoing,
  })
}

// POST /api/wod/friends — send friend request
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const targetUserId = parseInt(body?.userId, 10)
  if (!targetUserId || targetUserId === session.userId) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 })
  }

  // Check target exists
  const [target] = await sql`SELECT user_id, username FROM wod_profiles WHERE user_id = ${targetUserId}`
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Check existing friendship in either direction
  const [existing] = await sql`
    SELECT id, status FROM friendships
    WHERE (requester_id = ${session.userId} AND addressee_id = ${targetUserId})
       OR (requester_id = ${targetUserId} AND addressee_id = ${session.userId})
  `
  if (existing) {
    if (existing.status === "accepted") return NextResponse.json({ error: "Already friends" }, { status: 409 })
    if (existing.status === "pending") return NextResponse.json({ error: "Request already pending" }, { status: 409 })
    // If declined, allow re-request by updating
    await sql`
      UPDATE friendships SET requester_id = ${session.userId}, addressee_id = ${targetUserId},
        status = 'pending', updated_at = NOW() WHERE id = ${existing.id}
    `
  } else {
    await sql`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${session.userId}, ${targetUserId}, 'pending')
    `
  }

  // Notify target
  const [myProfile] = await sql`SELECT username FROM wod_profiles WHERE user_id = ${session.userId}`
  if (myProfile) {
    createNotification({
      userId: targetUserId,
      type: "friend_request",
      title: "Friend request",
      body: `@${myProfile.username} wants to be your friend`,
      metadata: { actorUserId: session.userId },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
