import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cache-secret")
  if (!process.env.CACHE_CLEAR_SECRET || secret !== process.env.CACHE_CLEAR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  revalidateTag("aux-tracks", { expire: 60 * 60 * 24 * 30 })
  return NextResponse.json({ ok: true, message: "aux-tracks cache cleared" })
}
