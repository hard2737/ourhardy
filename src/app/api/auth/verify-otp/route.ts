import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { createSessionToken, COOKIE, MAX_AGE } from "@/lib/session"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const code = body?.code?.trim()

  if (!email || !code) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const [otp] = await sql<{ id: number }[]>`
    SELECT id FROM otps
    WHERE email = ${email}
    AND code = ${code}
    AND expires_at > NOW()
    AND used = FALSE
    ORDER BY created_at DESC
    LIMIT 1
  `

  if (!otp) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 })
  }

  await sql`UPDATE otps SET used = TRUE WHERE id = ${otp.id}`

  const [user] = await sql<{ id: number; email: string }[]>`
    INSERT INTO users (email) VALUES (${email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
  `

  const token = await createSessionToken({ userId: user.id, email: user.email })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  })
  return res
}
