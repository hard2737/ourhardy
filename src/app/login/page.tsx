import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import LoginForm from "./LoginForm"

export const metadata = { title: "sign in · aux" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const dest = from ?? "/"

  const session = await getSession()
  if (session) redirect(dest)

  return <LoginForm redirectTo={dest} />
}
