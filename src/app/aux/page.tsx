import { getTracks } from "@/lib/trackCache"
import AuxPlayer from "@/components/AuxPlayer"

export const dynamic = "force-dynamic"
export const metadata = { title: "aux" }

export default async function AuxPage() {
  const tracks = await getTracks()
  return <AuxPlayer tracks={tracks} />
}
