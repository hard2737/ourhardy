import { NextResponse } from "next/server"
import { getTracks } from "@/lib/trackCache"

export async function GET() {
  const tracks = await getTracks()
  return NextResponse.json(tracks)
}
