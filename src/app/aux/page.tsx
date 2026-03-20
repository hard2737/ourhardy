import { redirect } from "next/navigation"
import { getTracks } from "@/lib/trackCache"
import { getSession } from "@/lib/session"
import sql from "@/lib/db"
import AuxPlayer from "@/components/AuxPlayer"
import type { Playlist } from "@/components/AuxPlayer"

export const dynamic = "force-dynamic"
export const metadata = { title: "aux" }

export default async function AuxPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const user = {
    id: session.userId,
    email: session.email,
    isAdmin: session.email === process.env.ADMIN_EMAIL,
  }

  const [tracks, rows] = await Promise.all([
    getTracks(),
    sql`
      SELECT
        p.id, p.name, p.is_global, p.user_id,
        COALESCE(
          json_agg(pt.track_key ORDER BY pt.added_at ASC)
          FILTER (WHERE pt.track_key IS NOT NULL),
          '[]'
        ) AS track_keys
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      WHERE p.user_id = ${session.userId} OR p.is_global = TRUE
      GROUP BY p.id
      ORDER BY p.is_global DESC, p.created_at ASC
    `,
  ])

  const playlists: Playlist[] = rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    isGlobal: r.is_global as boolean,
    ownerId: r.user_id as number,
    trackKeys: r.track_keys as string[],
  }))

  return <AuxPlayer tracks={tracks} user={user} playlists={playlists} />
}
