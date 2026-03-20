import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import { sendApprovalEmail } from "@/lib/email"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action // "approve" | "deny"

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  const [reg] = await sql<{ id: number; email: string; status: string }[]>`
    SELECT id, email, status FROM registrations WHERE id = ${id}
  `
  if (!reg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const newStatus = action === "approve" ? "approved" : "denied"

  await sql`
    UPDATE registrations SET status = ${newStatus}, reviewed_at = NOW()
    WHERE id = ${id}
  `

  if (action === "approve") {
    await sql`
      INSERT INTO users (email) VALUES (${reg.email})
      ON CONFLICT (email) DO NOTHING
    `
    try {
      await sendApprovalEmail(reg.email)
    } catch (err) {
      console.error("Failed to send approval email:", err)
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
