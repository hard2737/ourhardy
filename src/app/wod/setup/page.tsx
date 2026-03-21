"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import styles from "./setup.module.css"

export default function WodSetupPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [bio, setBio] = useState("")
  const [gender, setGender] = useState("other")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "available" | "taken">("idle")

  useEffect(() => {
    if (!username.trim()) { setUsernameState("idle"); return }
    setUsernameState("checking")
    const t = setTimeout(async () => {
      const res = await fetch(`/api/wod/check-username?username=${encodeURIComponent(username)}`)
      const d = await res.json()
      setUsernameState(d.available ? "available" : "taken")
    }, 400)
    return () => clearTimeout(t)
  }, [username])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (usernameState === "taken" || usernameState === "checking") return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/wod/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, firstName, lastName, bio, gender }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Setup failed")
      router.push("/wod")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || usernameState === "taken" || usernameState === "checking" || !username || !firstName || !lastName

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.brand}>SmartWOD</div>
        <p className={styles.subtitle}>Set up your profile to get started</p>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Username *</label>
            <input
              className={`${styles.input} ${usernameState === "available" ? styles.inputValid : usernameState === "taken" ? styles.inputInvalid : ""}`}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g. jsmith"
              required
              maxLength={30}
              autoFocus
            />
            {usernameState === "available" && (
              <span className={styles.hint} data-valid>available</span>
            )}
            {usernameState === "taken" && (
              <span className={styles.hint} data-invalid>already taken</span>
            )}
            {usernameState === "checking" && (
              <span className={styles.hint}>checking...</span>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>First name *</label>
              <input
                className={styles.input}
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First"
                required
                maxLength={50}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Last name *</label>
              <input
                className={styles.input}
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last"
                required
                maxLength={50}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Gender (for leaderboard)</label>
            <div className={styles.genderRow}>
              {(["male", "female", "other"] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`${styles.genderBtn} ${gender === g ? styles.genderActive : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Bio (optional)</label>
            <textarea
              className={styles.textarea}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="A bit about your training..."
              rows={2}
              maxLength={300}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={disabled} className={styles.submitBtn}>
            {loading ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  )
}
