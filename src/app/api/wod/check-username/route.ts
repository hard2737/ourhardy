import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/db"

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "") ?? ""
  if (!username || username.length < 2) {
    return NextResponse.json({ available: false })
  }
  const [row] = await sql`SELECT id FROM wod_profiles WHERE username = ${username}`
  return NextResponse.json({ available: !row })
}
