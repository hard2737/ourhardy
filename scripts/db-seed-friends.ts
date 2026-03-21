/**
 * Seed friendships for demo:
 *   npx tsx scripts/db-seed-friends.ts
 */
import postgres from "postgres"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" })

async function seed() {
  console.log("🤝 Seeding friendships...")

  const profiles = await sql`SELECT user_id, username, first_name FROM wod_profiles ORDER BY id`
  const david = profiles.find(p => p.user_id === 1)!
  const others = profiles.filter(p => p.user_id !== 1)

  // David is friends with Jessica, Cordazer, and 4 fake users
  const friendUserIds = others.slice(0, 6)
  for (const f of friendUserIds) {
    await sql`
      INSERT INTO friendships (requester_id, addressee_id, status, updated_at)
      VALUES (${david.user_id}, ${f.user_id}, 'accepted', NOW())
      ON CONFLICT (requester_id, addressee_id) DO NOTHING
    `
  }

  // 2 pending incoming requests to David
  for (const f of others.slice(6, 8)) {
    await sql`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${f.user_id}, ${david.user_id}, 'pending')
      ON CONFLICT (requester_id, addressee_id) DO NOTHING
    `
    // Add friend_request notification
    const hoursAgo = new Date(Date.now() - Math.floor(Math.random() * 24) * 3600_000).toISOString()
    await sql`
      INSERT INTO notifications (user_id, type, title, body, metadata, is_read, created_at)
      VALUES (${david.user_id}, 'friend_request', 'Friend request', ${`@${f.username} wants to be your friend`},
        ${JSON.stringify({ actorUserId: f.user_id })}, FALSE, ${hoursAgo})
    `
  }

  // 1 pending outgoing request from David
  if (others.length > 8) {
    const target = others[8]
    await sql`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${david.user_id}, ${target.user_id}, 'pending')
      ON CONFLICT (requester_id, addressee_id) DO NOTHING
    `
  }

  // Some friendships between other users
  for (let i = 0; i < others.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 3, others.length); j++) {
      await sql`
        INSERT INTO friendships (requester_id, addressee_id, status, updated_at)
        VALUES (${others[i].user_id}, ${others[j].user_id}, 'accepted', NOW())
        ON CONFLICT (requester_id, addressee_id) DO NOTHING
      `
    }
  }

  const [count] = await sql`SELECT COUNT(*)::int as c FROM friendships`
  const [accepted] = await sql`SELECT COUNT(*)::int as c FROM friendships WHERE (requester_id = 1 OR addressee_id = 1) AND status = 'accepted'`
  const [pending] = await sql`SELECT COUNT(*)::int as c FROM friendships WHERE addressee_id = 1 AND status = 'pending'`

  console.log(`✅ Seeded ${count.c} friendships (David: ${accepted.c} friends, ${pending.c} pending incoming)`)

  await sql.end()
}

seed().catch(err => { console.error(err); process.exit(1) })
