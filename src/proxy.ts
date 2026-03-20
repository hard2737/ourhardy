import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"

export async function proxy(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("from", req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/aux/:path*"],
}
