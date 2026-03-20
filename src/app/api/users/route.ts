import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { sendInviteEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const email = body?.email?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 })
  }

  if (email === process.env.ADMIN_EMAIL?.toLowerCase()) {
    return NextResponse.json({ error: "Admin email does not need to be added." }, { status: 400 })
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`
  if (existing) {
    return NextResponse.json({ error: "User already exists." }, { status: 409 })
  }

  const [user] = await sql<{ id: number }[]>`
    INSERT INTO users (email) VALUES (${email}) RETURNING id
  `

  // If they had a pending/denied registration, mark it approved
  await sql`
    UPDATE registrations SET status = 'approved', reviewed_at = NOW()
    WHERE email = ${email} AND status IN ('pending', 'denied')
  `

  try {
    await sendInviteEmail(email)
  } catch (err) {
    console.error("Failed to send invite email:", err)
  }

  return NextResponse.json({ ok: true, id: user.id })
}
