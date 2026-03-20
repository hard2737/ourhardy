import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"
import { validateRegistrationEmail } from "@/lib/emailValidation"
import { sendRegistrationNotification } from "@/lib/email"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = body?.email?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 })
  }

  // Admin email cannot go through registration
  if (email === process.env.ADMIN_EMAIL?.toLowerCase()) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 })
  }

  // Bot / disposable email detection
  const validation = await validateRegistrationEmail(email)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 })
  }

  // Already an approved user
  const [existingUser] = await sql`SELECT id FROM users WHERE email = ${email}`
  if (existingUser) {
    return NextResponse.json({ error: "An account already exists for this email. Try signing in." }, { status: 409 })
  }

  // Check existing registration
  const [existingReg] = await sql<{ status: string }[]>`
    SELECT status FROM registrations WHERE email = ${email}
  `
  if (existingReg) {
    if (existingReg.status === "pending") {
      return NextResponse.json({ error: "A request for this email is already pending." }, { status: 409 })
    }
    if (existingReg.status === "approved") {
      return NextResponse.json({ error: "This email is already approved. Try signing in." }, { status: 409 })
    }
    if (existingReg.status === "denied") {
      return NextResponse.json({ error: "This request was previously denied." }, { status: 403 })
    }
  }

  await sql`INSERT INTO registrations (email) VALUES (${email})`

  try {
    await sendRegistrationNotification(email)
  } catch (err) {
    console.error("Failed to send registration notification:", err)
  }

  return NextResponse.json({ ok: true })
}
