/**
 * Seed notifications for demo:
 *   npx tsx scripts/db-seed-notifications.ts
 */
import postgres from "postgres"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" })

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)] }
function hoursAgo(h: number) { return new Date(Date.now() - h * 3600_000).toISOString() }

async function seed() {
  console.log("🔔 Seeding notifications...")

  // Get user 1 (admin / david) and some actor profiles
  const profiles = await sql`SELECT user_id, username FROM wod_profiles ORDER BY id`
  const david = profiles.find(p => p.user_id === 1)
  if (!david) { console.log("No david profile found"); return }

  const others = profiles.filter(p => p.user_id !== 1)

  // Get some results owned by david
  const myResults = await sql`
    SELECT wr.id, w.name as workout_name FROM workout_results wr
    JOIN workouts w ON w.id = wr.workout_id
    WHERE wr.user_id = 1 ORDER BY wr.result_date DESC LIMIT 20
  `

  const notifs: { user_id: number; type: string; title: string; body: string; metadata: string; is_read: boolean; created_at: string }[] = []

  // Fist bump notifications
  for (let i = 0; i < 12; i++) {
    const actor = pick(others)
    const result = pick(myResults)
    notifs.push({
      user_id: 1,
      type: "fist_bump",
      title: "Fist bump!",
      body: `@${actor.username} fist-bumped your ${result.workout_name} result`,
      metadata: JSON.stringify({ resultId: result.id, actorUserId: actor.user_id }),
      is_read: i > 4, // first 5 unread
      created_at: hoursAgo(rand(1, 72)),
    })
  }

  // Comment notifications
  for (let i = 0; i < 8; i++) {
    const actor = pick(others)
    const result = pick(myResults)
    notifs.push({
      user_id: 1,
      type: "comment",
      title: "New comment",
      body: `@${actor.username} commented on your ${result.workout_name} result`,
      metadata: JSON.stringify({ resultId: result.id, actorUserId: actor.user_id }),
      is_read: i > 2,
      created_at: hoursAgo(rand(1, 96)),
    })
  }

  // Workout completion notifications
  const workoutNames = await sql`SELECT DISTINCT w.name FROM workout_results wr JOIN workouts w ON w.id = wr.workout_id WHERE wr.user_id = 1 LIMIT 10`
  for (let i = 0; i < 10; i++) {
    const actor = pick(others)
    const wn = pick(workoutNames)
    notifs.push({
      user_id: 1,
      type: "workout_completion",
      title: "Gym buddy finished!",
      body: `@${actor.username} completed ${wn.name}`,
      metadata: JSON.stringify({ actorUserId: actor.user_id }),
      is_read: i > 3,
      created_at: hoursAgo(rand(2, 120)),
    })
  }

  // Weekly summary
  notifs.push({
    user_id: 1,
    type: "weekly_summary",
    title: "Weekly Recap",
    body: "Last week: 4 workouts across 4 WODs, 2 PRs!",
    metadata: JSON.stringify({ weekStart: "2026-03-09", workouts: 4, prs: 2 }),
    is_read: true,
    created_at: hoursAgo(rand(48, 168)),
  })

  // Monthly summary
  notifs.push({
    user_id: 1,
    type: "monthly_summary",
    title: "February Recap",
    body: "February: 18 workouts with 5 PRs",
    metadata: JSON.stringify({ month: "2026-02-01", workouts: 18, prs: 5 }),
    is_read: true,
    created_at: hoursAgo(rand(200, 480)),
  })

  // Also seed some notifications for other users so the system looks alive
  for (const p of others.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      const actor = pick(others.filter(o => o.user_id !== p.user_id))
      notifs.push({
        user_id: p.user_id,
        type: pick(["fist_bump", "comment", "workout_completion"]),
        title: pick(["Fist bump!", "New comment", "Gym buddy finished!"]),
        body: `@${actor.username} interacted with your workout`,
        metadata: JSON.stringify({ actorUserId: actor.user_id }),
        is_read: Math.random() > 0.5,
        created_at: hoursAgo(rand(1, 168)),
      })
    }
  }

  // Bulk insert
  for (const n of notifs) {
    await sql`
      INSERT INTO notifications (user_id, type, title, body, metadata, is_read, created_at)
      VALUES (${n.user_id}, ${n.type}, ${n.title}, ${n.body}, ${n.metadata}, ${n.is_read}, ${n.created_at})
    `
  }

  const [count] = await sql`SELECT COUNT(*)::int as c FROM notifications`
  const [unread] = await sql`SELECT COUNT(*)::int as c FROM notifications WHERE user_id = 1 AND is_read = FALSE`
  console.log(`✅ Seeded ${count.c} notifications (${unread.c} unread for david)`)

  await sql.end()
}

seed().catch(err => { console.error(err); process.exit(1) })
