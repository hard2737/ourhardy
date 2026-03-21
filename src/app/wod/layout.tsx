import type { Metadata, Viewport } from "next"
import WodSWRegister from "./WodSWRegister"

export const metadata: Metadata = {
  title: "SmartWOD",
  description: "Track your workouts, log results, compete",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SmartWOD",
  },
}

export const viewport: Viewport = {
  themeColor: "#ff6b35",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function WodLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="apple-touch-icon" href="/apple-touch-icon-wod.png" />
      <WodSWRegister />
      {children}
    </>
  )
}
