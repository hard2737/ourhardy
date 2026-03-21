/**
 * Seed SmartWOD with demo data:
 *   npx tsx scripts/db-seed-wod.ts
 *
 * Creates fake users, profiles, custom WODs, 30 days of schedules,
 * hundreds of results with PRs, fist bumps, and comments.
 */
import postgres from "postgres"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" })

// ── Helpers ────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)]
}
function dateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

// ── Fake users to create ──────────────────────────────────────────────────

const fakeUsers = [
  { email: "mike.chen@example.com", username: "mikechen", first: "Mike", last: "Chen", gender: "male", bio: "Olympic lifting nerd. Snatch PR 225lb" },
  { email: "sarah.j@example.com", username: "sarahj", first: "Sarah", last: "Johnson", gender: "female", bio: "Former D1 athlete. Love metcons" },
  { email: "tony.r@example.com", username: "tony_rx", first: "Tony", last: "Rivera", gender: "male", bio: "5am crew forever" },
  { email: "alex.p@example.com", username: "alex_p", first: "Alex", last: "Park", gender: "other", bio: "Just here to have fun and get better" },
  { email: "emma.w@example.com", username: "emmawod", first: "Emma", last: "Williams", gender: "female", bio: "Competing in 2026 quarterfinals" },
  { email: "jake.m@example.com", username: "jakethesnake", first: "Jake", last: "Martinez", gender: "male", bio: "Muscle-ups are my love language" },
  { email: "lisa.t@example.com", username: "lisalifts", first: "Lisa", last: "Thompson", gender: "female", bio: null },
  { email: "chris.d@example.com", username: "chrisd", first: "Chris", last: "Davis", gender: "male", bio: "Started CrossFit 6 months ago" },
  { email: "nina.k@example.com", username: "nina_k", first: "Nina", last: "Kim", gender: "female", bio: "Coach at CF Downtown" },
  { email: "marcus.b@example.com", username: "marcus_b", first: "Marcus", last: "Brown", gender: "male", bio: "Former powerlifter making the switch" },
]

// ── Real user profiles to ensure exist ────────────────────────────────────

const realProfiles = [
  { userId: 2, email: "jessicahardy3@hotmail.com", username: "jessicahardy", first: "Jessica", last: "Hardy", gender: "female", bio: "Keeping up with the fam" },
  { userId: 4, email: "cordazerbroadus@msn.com", username: "cordazer", first: "Cordazer", last: "Broadus", gender: "male", bio: "Let's get it" },
]

// ── Custom daily WODs ─────────────────────────────────────────────────────

const customWods = [
  { name: "Death by Thrusters", description: "Min 1: 1 thruster, Min 2: 2 thrusters... continue until you can't complete the reps in the minute. (95/65 lb)", format: "emom", score_type: "rounds", time_cap: null },
  { name: "Filthy Fifty", description: "50 Box Jumps (24 in), 50 Jumping Pull-ups, 50 KB Swings (35 lb), 50 Walking Lunges, 50 K2E, 50 Push Press (45 lb), 50 Back Extensions, 50 Wall Balls (20 lb), 50 Burpees, 50 Double-Unders", format: "for-time", score_type: "time", time_cap: null },
  { name: "Fight Gone Bad", description: "3 rounds of: 1 min Wall Balls (20 lb), 1 min SDLHP (75 lb), 1 min Box Jumps (20 in), 1 min Push Press (75 lb), 1 min Row (calories). 1 min rest between rounds.", format: "amrap", score_type: "reps", time_cap: null },
  { name: "Tabata Something Else", description: "Tabata Pull-ups, Tabata Push-ups, Tabata Sit-ups, Tabata Squats. Score = total reps across all movements.", format: "amrap", score_type: "reps", time_cap: null },
  { name: "The Chief", description: "5 rounds of: AMRAP 3 min — 3 Power Cleans (135/95 lb), 6 Push-ups, 9 Squats. Rest 1 min between rounds.", format: "amrap", score_type: "rounds", time_cap: null },
  { name: "Nate", description: "AMRAP 20 min: 2 Muscle-ups, 4 HSPU, 8 KB Swings (70/53 lb)", format: "amrap", score_type: "rounds", time_cap: 20 },
  { name: "Open 24.1", description: "AMRAP 15 min: 15 Toes-to-Bar, 10 Shuttle Runs, 5 Cleans — escalating weight each round (135/155/185 M, 95/105/125 F)", format: "amrap", score_type: "reps", time_cap: 15 },
  { name: "Rowing Sprint", description: "500m Row for time", format: "for-time", score_type: "time", time_cap: null },
  { name: "Leg Blaster", description: "5 RFT: 20 Squats, 10 Lunges (each leg), 10 Jump Squats, 10 Jump Lunges", format: "for-time", score_type: "time", time_cap: null },
  { name: "Upper Body Pump", description: "AMRAP 12 min: 5 Strict Pull-ups, 10 Push-ups, 15 Ring Rows", format: "amrap", score_type: "rounds", time_cap: 12 },
  { name: "Chipper", description: "100 Double-Unders, 80 Air Squats, 60 Sit-ups, 40 Burpees, 20 Muscle-ups", format: "for-time", score_type: "time", time_cap: null },
  { name: "Sprint Day", description: "3 RFT: 200m Run, 10 Power Snatches (95/65 lb), 10 Box Jump Overs (24/20 in)", format: "for-time", score_type: "time", time_cap: null },
  { name: "Gymnastics EMOM", description: "EMOM 20: Odd — 8 T2B + 4 Bar Muscle-ups, Even — 40 sec Max Handstand Hold", format: "emom", score_type: "rounds", time_cap: 20 },
  { name: "Deadlift Ladder", description: "1-1-1-1-1 Deadlift. Build to a heavy single.", format: "for-time", score_type: "reps", time_cap: null },
  { name: "Partner Helen", description: "Split reps with a partner. 3 rounds each: 400m Run, 21 KB Swings (53/35 lb), 12 Pull-ups", format: "for-time", score_type: "time", time_cap: null },
]

// ── Score generators per score_type ───────────────────────────────────────

type ScoreGen = { result: string; score: number }

function genTimeScore(fast: number, slow: number): ScoreGen {
  const secs = rand(fast, slow)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return { result: `${m}:${s.toString().padStart(2, "0")}`, score: secs }
}

function genRepsScore(low: number, high: number): ScoreGen {
  const reps = rand(low, high)
  return { result: `${reps} reps`, score: reps }
}

function genRoundsScore(low: number, high: number): ScoreGen {
  const rounds = rand(low, high)
  const extra = rand(0, 12)
  return { result: extra > 0 ? `${rounds} + ${extra}` : `${rounds} rounds`, score: rounds + extra / 100 }
}

function genScore(scoreType: string, workoutName: string): ScoreGen {
  if (scoreType === "time") {
    // Different ranges per workout for realism
    const ranges: Record<string, [number, number]> = {
      "Fran": [120, 480],
      "Murph": [1800, 3600],
      "Grace": [90, 360],
      "Helen": [540, 900],
      "Annie": [300, 720],
      "Barbara": [1500, 2400],
      "Diane": [240, 720],
      "Elizabeth": [300, 600],
      "Kelly": [1200, 2400],
      "Chad": [2400, 4800],
      "DT": [420, 900],
      "Jackie": [420, 840],
      "Karen": [420, 900],
      "Filthy Fifty": [1200, 2400],
      "Rowing Sprint": [85, 140],
      "Leg Blaster": [600, 1200],
      "Chipper": [900, 1800],
      "Sprint Day": [360, 720],
      "Partner Helen": [480, 840],
    }
    const [fast, slow] = ranges[workoutName] ?? [300, 900]
    return genTimeScore(fast, slow)
  }
  if (scoreType === "rounds") {
    const ranges: Record<string, [number, number]> = {
      "Chelsea": [20, 30],
      "Cindy": [12, 25],
      "Death by Thrusters": [8, 16],
      "The Chief": [15, 28],
      "Nate": [6, 16],
      "Upper Body Pump": [8, 16],
      "Gymnastics EMOM": [16, 20],
    }
    const [lo, hi] = ranges[workoutName] ?? [8, 20]
    return genRoundsScore(lo, hi)
  }
  // reps
  const ranges: Record<string, [number, number]> = {
    "Fight Gone Bad": [200, 380],
    "Tabata Something Else": [180, 340],
    "Open 24.1": [100, 220],
    "Deadlift Ladder": [315, 545],
  }
  const [lo, hi] = ranges[workoutName] ?? [80, 250]
  return genRepsScore(lo, hi)
}

// ── Comments pool ─────────────────────────────────────────────────────────

const commentPool = [
  "Beast mode! 🔥", "That's a PR right?!", "Great work!", "Crushed it 💪",
  "You make it look easy", "Let's go!!", "Insane pace", "Way to push through",
  "That score is legit", "New PR incoming", "Goals 🎯", "Killed it today",
  "Strong finish!", "Respect 🫡", "Getting faster every week",
  "The 5am crew don't play", "Scaled and still killed it",
  "That Fran time though 😳", "Sub-3 Grace? Unreal", "Welcome to the pain cave",
  "Can't wait for tomorrow's WOD", "My legs are still shaking",
  "That was brutal but worth it", "See you tomorrow!", "Nice work team!",
]

// ── Main seed ─────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Starting SmartWOD seed...")

  // 1. Clean up duplicate workouts (keep ids 1-15)
  console.log("  Cleaning duplicate workouts...")
  await sql`DELETE FROM workouts WHERE id > 15`

  // 2. Create fake users + approve registrations
  console.log("  Creating fake users...")
  const allUserIds: number[] = [1, 2, 4] // existing real users

  for (const u of fakeUsers) {
    const [existing] = await sql`SELECT id FROM users WHERE email = ${u.email}`
    if (existing) {
      allUserIds.push(existing.id)
    } else {
      const [row] = await sql`INSERT INTO users (email) VALUES (${u.email}) RETURNING id`
      allUserIds.push(row.id)
      // Also create approved registration
      await sql`
        INSERT INTO registrations (email, status, reviewed_at)
        VALUES (${u.email}, 'approved', NOW())
        ON CONFLICT (email) DO NOTHING
      `
    }
  }

  // 3. Create WOD profiles for real users who don't have one
  console.log("  Creating WOD profiles...")
  for (const p of realProfiles) {
    await sql`
      INSERT INTO wod_profiles (user_id, username, first_name, last_name, bio, gender)
      VALUES (${p.userId}, ${p.username}, ${p.first}, ${p.last}, ${p.bio}, ${p.gender})
      ON CONFLICT (user_id) DO NOTHING
    `
  }

  // Create profiles for fake users
  for (let i = 0; i < fakeUsers.length; i++) {
    const u = fakeUsers[i]
    const uid = allUserIds[3 + i] // offset past real users
    await sql`
      INSERT INTO wod_profiles (user_id, username, first_name, last_name, bio, gender)
      VALUES (${uid}, ${u.username}, ${u.first}, ${u.last}, ${u.bio ?? null}, ${u.gender})
      ON CONFLICT (user_id) DO NOTHING
    `
  }

  // 4. Insert custom WODs
  console.log("  Creating custom WODs...")
  const customWorkoutIds: number[] = []
  for (const w of customWods) {
    const [row] = await sql`
      INSERT INTO workouts (name, description, type, format, score_type, time_cap, is_benchmark)
      VALUES (${w.name}, ${w.description}, 'wod', ${w.format}, ${w.score_type}, ${w.time_cap}, FALSE)
      RETURNING id
    `
    customWorkoutIds.push(row.id)
  }

  // All workout IDs: benchmarks 1-15 + custom ones
  const allWorkoutIds = [...Array.from({ length: 15 }, (_, i) => i + 1), ...customWorkoutIds]

  // 5. Get workout details for score generation
  const workoutMeta = await sql`SELECT id, name, score_type FROM workouts WHERE id = ANY(${allWorkoutIds})`
  const workoutMap = new Map(workoutMeta.map(w => [w.id, { name: w.name, scoreType: w.score_type }]))

  // 6. Schedule workouts for past 30 days + next 7 days
  console.log("  Scheduling workouts...")
  const scheduledWorkouts: { date: string; workoutId: number }[] = []

  for (let i = 30; i >= -7; i--) {
    const d = daysAgo(i)
    const day = d.getDay()
    if (day === 0) continue // skip Sundays (rest day)

    const ds = dateStr(d)
    const wid = allWorkoutIds[rand(0, allWorkoutIds.length - 1)]
    const notes = i <= 0 ? null : null // could add notes for future

    await sql`
      INSERT INTO workout_schedules (workout_id, scheduled_date, notes)
      VALUES (${wid}, ${ds}, ${notes})
      ON CONFLICT (scheduled_date) DO NOTHING
    `
    scheduledWorkouts.push({ date: ds, workoutId: wid })
  }

  // 7. Generate results
  console.log("  Generating results...")
  let totalResults = 0
  const resultIds: number[] = []

  // Track best scores per user per workout for PR calculation
  const bestScores = new Map<string, number>() // `userId-workoutId` -> best score

  for (const sched of scheduledWorkouts) {
    // Only generate results for past dates
    if (sched.date > dateStr(new Date())) continue

    const meta = workoutMap.get(sched.workoutId)
    if (!meta) continue

    // Random subset of users did each workout (60-90% participation)
    const participationRate = rand(60, 90) / 100
    const participants = allUserIds.filter(() => Math.random() < participationRate)

    for (const uid of participants) {
      const isRx = Math.random() > 0.25 // 75% RX
      const { result, score } = genScore(meta.scoreType, meta.name)

      // PR detection
      const key = `${uid}-${sched.workoutId}`
      const prevBest = bestScores.get(key)
      let isPr = false
      if (prevBest === undefined) {
        isPr = true // first attempt is always a PR
      } else if (meta.scoreType === "time") {
        isPr = score < prevBest
      } else {
        isPr = score > prevBest
      }

      if (isPr) {
        bestScores.set(key, score)
      }

      const scalingNotes = isRx ? null : pick([
        "65lb bar", "Banded pull-ups", "Box push-ups",
        "35lb KB", "Step-ups instead of box jumps",
        "Ring rows instead of pull-ups", "55lb thrusters",
      ])

      const notes = Math.random() > 0.7 ? pick([
        "Felt strong today", "Legs were toast", "New strategy worked",
        "Need to work on pacing", "Happy with this one",
        "Grip gave out at the end", "First time doing this one",
        "PR attempt — close but not quite", "Back from a week off",
        "Morning session hit different", "Went unbroken on the thrusters!",
        null,
      ]) : null

      const [row] = await sql`
        INSERT INTO workout_results (user_id, workout_id, result, score, is_rx, scaling_notes, notes, is_pr, result_date)
        VALUES (${uid}, ${sched.workoutId}, ${result}, ${score}, ${isRx}, ${scalingNotes}, ${notes}, ${isPr}, ${sched.date})
        RETURNING id
      `
      resultIds.push(row.id)
      totalResults++
    }
  }

  console.log(`  Created ${totalResults} results`)

  // 8. Generate fist bumps
  console.log("  Adding fist bumps...")
  let totalBumps = 0

  for (const rid of resultIds) {
    // Each result gets 0-6 fist bumps
    const numBumps = rand(0, 6)
    const bumpers = [...allUserIds].sort(() => Math.random() - 0.5).slice(0, numBumps)

    for (const uid of bumpers) {
      await sql`
        INSERT INTO fist_bumps (result_id, user_id)
        VALUES (${rid}, ${uid})
        ON CONFLICT (result_id, user_id) DO NOTHING
      `
      totalBumps++
    }
  }

  console.log(`  Created ${totalBumps} fist bumps`)

  // 9. Generate comments
  console.log("  Adding comments...")
  let totalComments = 0

  // ~20% of results get comments
  const commentedResults = resultIds.filter(() => Math.random() < 0.2)

  for (const rid of commentedResults) {
    const numComments = rand(1, 3)
    for (let c = 0; c < numComments; c++) {
      const uid = pick(allUserIds)
      const comment = pick(commentPool)
      // Spread comment timestamps across the day
      await sql`
        INSERT INTO result_comments (result_id, user_id, comment)
        VALUES (${rid}, ${uid}, ${comment})
      `
      totalComments++
    }
  }

  console.log(`  Created ${totalComments} comments`)

  // 10. Summary
  const [profileCount] = await sql`SELECT COUNT(*) as c FROM wod_profiles`
  const [workoutCount] = await sql`SELECT COUNT(*) as c FROM workouts`
  const [scheduleCount] = await sql`SELECT COUNT(*) as c FROM workout_schedules`
  const [resultCount] = await sql`SELECT COUNT(*) as c FROM workout_results`
  const [prCount] = await sql`SELECT COUNT(*) as c FROM workout_results WHERE is_pr = true`
  const [bumpCount] = await sql`SELECT COUNT(*) as c FROM fist_bumps`
  const [commentCount] = await sql`SELECT COUNT(*) as c FROM result_comments`

  console.log("\n✅ Seed complete!")
  console.log(`   Profiles:  ${profileCount.c}`)
  console.log(`   Workouts:  ${workoutCount.c}`)
  console.log(`   Scheduled: ${scheduleCount.c}`)
  console.log(`   Results:   ${resultCount.c}`)
  console.log(`   PRs:       ${prCount.c}`)
  console.log(`   Fist bumps:${bumpCount.c}`)
  console.log(`   Comments:  ${commentCount.c}`)

  await sql.end()
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
