"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LayoutProvider } from "@/lib/layoutProvider"
import styles from "./login.module.css"

type Step = "email" | "code" | "register" | "pending"

export default function LoginForm({ redirectTo }: { redirectTo: string }) {
  const layout = LayoutProvider.fromPath(redirectTo)
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<Step>("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === "NOT_REGISTERED") {
          setStep("register")
          return
        }
        throw new Error(data.error ?? "Failed to send code")
      }
      setStep("code")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Invalid code")
      router.push(redirectTo)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Request failed")
      setStep("pending")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep("email")
    setError("")
    setCode("")
  }

  return (
    <div className={styles[layout.root]}>
      <div className={styles[layout.box]}>
        <div className={styles[layout.logo]}>{layout.title}</div>

        {step === "email" && (
          <form onSubmit={requestOtp} className={styles.form}>
            <input
              className={styles.input}
              type="email"
              placeholder="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "..." : "send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyOtp} className={styles.form}>
            <p className={styles.hint}>code sent to {email}</p>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "..." : "sign in"}
            </button>
            <button type="button" className={styles.back} onClick={reset}>← back</button>
          </form>
        )}

        {step === "register" && (
          <form onSubmit={requestAccess} className={styles.form}>
            <p className={styles.hint}>no account found for {email}</p>
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "..." : "request access"}
            </button>
            <button type="button" className={styles.back} onClick={reset}>← back</button>
          </form>
        )}

        {step === "pending" && (
          <div className={styles.form}>
            <p className={styles.hint}>request sent for {email}</p>
            <p className={styles.hint}>you&apos;ll receive an email when it&apos;s approved.</p>
            <button type="button" className={styles.back} onClick={reset}>← back</button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
