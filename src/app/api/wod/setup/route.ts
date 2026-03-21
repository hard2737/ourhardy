import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const username = body?.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
  const firstName = body?.firstName?.trim()
  const lastName = body?.lastName?.trim()
  const bio = body?.bio?.trim() ?? ""
  const gender = ["male", "female", "other"].includes(body?.gender) ? body.gender : "other"

  if (!username || !firstName || !lastName) {
    return NextResponse.json({ error: "username, firstName, lastName are required" }, { status: 400 })
  }
  if (username.length < 2 || username.length > 30) {
    return NextResponse.json({ error: "Username must be 2–30 characters" }, { status: 400 })
  }

  // Check existing profile
  const [existing] = await sql`SELECT id FROM wod_profiles WHERE user_id = ${session.userId}`
  if (existing) {
    // Update existing profile
    await sql`
      UPDATE wod_profiles SET
        username = ${username}, first_name = ${firstName}, last_name = ${lastName},
        bio = ${bio}, gender = ${gender}
      WHERE user_id = ${session.userId}
    `
    return NextResponse.json({ ok: true })
  }

  // Check username taken
  const [taken] = await sql`SELECT id FROM wod_profiles WHERE username = ${username}`
  if (taken) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 })
  }

  await sql`
    INSERT INTO wod_profiles (user_id, username, first_name, last_name, bio, gender)
    VALUES (${session.userId}, ${username}, ${firstName}, ${lastName}, ${bio}, ${gender})
  `

  return NextResponse.json({ ok: true })
}
