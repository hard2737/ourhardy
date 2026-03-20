import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"

export const COOKIE = "aux-session"
export const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  userId: number
  email: string
}

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!)
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// For use in server components and API route handlers
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

// For use in middleware (Edge Runtime — no next/headers)
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}
