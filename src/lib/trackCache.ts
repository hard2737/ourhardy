import { cacheTag, cacheLife } from "next/cache"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"

const CDN = "https://www.ourhardy.com"

export interface Track {
  key: string        // e.g. "aux/Artist/Album/Track.mp3"
  artist: string
  album: string
  title: string
  url: string        // CDN URL for playback
}

export async function getTracks(): Promise<Track[]> {
  "use cache"
  cacheTag("aux-tracks")
  cacheLife({ expire: 60 * 60 * 24 * 30 }) // 30 days

  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-west-2" })
  const keys: string[] = []
  let token: string | undefined

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: "ourhardy.com",
      Prefix: "aux/x/",
      ContinuationToken: token,
    }))
    res.Contents?.forEach(o => {
      if (o.Key?.match(/\.(mp3|m4a|flac|ogg)$/i)) keys.push(o.Key)
    })
    token = res.NextContinuationToken
  } while (token)

  return keys.map(parseKey)
}

function parseKey(key: string): Track {
  const relative = key.replace(/^aux\/x\//, "")
  const parts = relative.split("/")
  const hasAlbum = parts.length >= 3
  return {
    key,
    artist: parts[0] ?? "Unknown",
    album: hasAlbum ? (parts[1] ?? "") : "",
    title: parts.slice(hasAlbum ? 2 : 1).join("/").replace(/\.[^.]+$/, ""),
    url: `${CDN}/${key}`,
  }
}
