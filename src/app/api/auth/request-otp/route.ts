import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { sendOtp } from "@/lib/email"

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  }

  // Gate: only existing users or admin can request an OTP
  if (email !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    const [user] = await sql`SELECT id FROM users WHERE email = ${email}`
    if (!user) {
      return NextResponse.json({ error: "No account found for this email.", code: "NOT_REGISTERED" }, { status: 403 })
    }
  }

  // Rate limit: max 3 pending OTPs per email per 10 minutes
  const [{ count }] = await sql<[{ count: string }]>`
    SELECT COUNT(*)::text AS count FROM otps
    WHERE email = ${email}
    AND created_at > NOW() - INTERVAL '10 minutes'
    AND used = FALSE
  `
  if (Number(count) >= 3) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await sql`
    INSERT INTO otps (email, code, expires_at)
    VALUES (${email}, ${code}, ${expiresAt})
  `

  try {
    await sendOtp(email, code)
  } catch (err) {
    console.error("Failed to send OTP email:", err)
    return NextResponse.json({ error: "Failed to send code. Check SMTP configuration." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
