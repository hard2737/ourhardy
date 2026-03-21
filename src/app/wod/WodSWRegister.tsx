"use client"

import { useEffect } from "react"

export default function WodSWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/wod-sw.js").catch(() => {})

      // Replay queued submissions when coming back online
      const onOnline = () => {
        navigator.serviceWorker.ready.then((reg) => {
          if ("sync" in reg) {
            (reg as unknown as { sync: { register: (t: string) => Promise<void> } }).sync.register("wod-outbox")
          } else {
            navigator.serviceWorker.controller?.postMessage("REPLAY_QUEUE")
          }
        })
      }

      window.addEventListener("online", onOnline)
      return () => window.removeEventListener("online", onOnline)
    }
  }, [])

  return null
}
