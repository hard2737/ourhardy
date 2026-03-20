import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { getSession } from "@/lib/session"

export async function POST() {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  revalidateTag("aux-tracks", { expire: 60 * 60 * 24 * 30 })
  return NextResponse.json({ ok: true, message: "aux-tracks cache cleared" })
}
