import postgres from "postgres"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

async function main() {
  const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" })
  const users = await sql`SELECT id, email FROM users ORDER BY id`
  console.log("USERS:", JSON.stringify(users))
  const profiles = await sql`SELECT * FROM wod_profiles ORDER BY id`
  console.log("PROFILES:", JSON.stringify(profiles))
  const workouts = await sql`SELECT id, name, score_type, format, time_cap FROM workouts ORDER BY id`
  console.log("WORKOUTS:", JSON.stringify(workouts))
  const results = await sql`SELECT COUNT(*) as c FROM workout_results`
  console.log("RESULTS:", JSON.stringify(results))
  const schedules = await sql`SELECT * FROM workout_schedules ORDER BY scheduled_date DESC LIMIT 5`
  console.log("SCHEDULES:", JSON.stringify(schedules))
  await sql.end()
}
main()
