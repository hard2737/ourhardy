import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import WodPlayer from "@/components/WodPlayer"

export const dynamic = "force-dynamic"
export const metadata = { title: "wod" }

export default async function WodPage() {
  const session = await getSession()
  if (!session) redirect("/login?from=/wod")

  const [profileRow] = await sql`
    SELECT username, first_name, last_name, bio, gender
    FROM wod_profiles WHERE user_id = ${session.userId}
  `

  if (!profileRow) redirect("/wod/setup")

  const user = {
    id: session.userId,
    email: session.email,
    isAdmin: session.email === process.env.ADMIN_EMAIL,
  }

  const profile = {
    username: profileRow.username as string,
    firstName: profileRow.first_name as string,
    lastName: profileRow.last_name as string,
    bio: profileRow.bio as string | null,
    gender: profileRow.gender as string,
  }

  return <WodPlayer user={user} profile={profile} />
}
