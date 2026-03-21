/**
 * Run once to create all tables:
 *   npx tsx scripts/db-migrate.ts
 */
import postgres from "postgres"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

async function migrate() {
  const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" })

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS otps (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      code       TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS playlists (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_global  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_key   TEXT NOT NULL,
      added_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (playlist_id, track_key)
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id
    ON playlist_tracks (playlist_id)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS registrations (
      id          SERIAL PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `

  // ── WOD tables ──────────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS wod_profiles (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      username    TEXT UNIQUE NOT NULL,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      bio         TEXT,
      gender      TEXT NOT NULL DEFAULT 'other',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS workouts (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      type         TEXT NOT NULL DEFAULT 'wod',
      format       TEXT NOT NULL DEFAULT 'amrap',
      score_type   TEXT NOT NULL DEFAULT 'reps',
      time_cap     INTEGER,
      is_benchmark BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS workout_schedules (
      id             SERIAL PRIMARY KEY,
      workout_id     INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      scheduled_date DATE NOT NULL UNIQUE,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS workout_results (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workout_id    INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      result        TEXT NOT NULL,
      score         NUMERIC,
      is_rx         BOOLEAN NOT NULL DEFAULT TRUE,
      scaling_notes TEXT,
      notes         TEXT,
      is_pr         BOOLEAN NOT NULL DEFAULT FALSE,
      result_date   DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fist_bumps (
      id          SERIAL PRIMARY KEY,
      result_id   INTEGER NOT NULL REFERENCES workout_results(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (result_id, user_id)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS result_comments (
      id          SERIAL PRIMARY KEY,
      result_id   INTEGER NOT NULL REFERENCES workout_results(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Notifications ─────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      metadata    JSONB NOT NULL DEFAULT '{}',
      is_read     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, is_read, created_at DESC)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id                    SERIAL PRIMARY KEY,
      user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      fist_bump             BOOLEAN NOT NULL DEFAULT TRUE,
      comment               BOOLEAN NOT NULL DEFAULT TRUE,
      workout_completion    BOOLEAN NOT NULL DEFAULT TRUE,
      weekly_summary        BOOLEAN NOT NULL DEFAULT TRUE,
      monthly_summary       BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Friendships ──────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS friendships (
      id           SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (requester_id, addressee_id),
      CHECK (requester_id != addressee_id)
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status)`

  // ── Comment mentions ───────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS comment_mentions (
      id          SERIAL PRIMARY KEY,
      comment_id  INTEGER NOT NULL REFERENCES result_comments(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (comment_id, user_id)
    )
  `

  // Add mention + friend_request columns to notification_preferences (safe if already exists)
  await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS mention BOOLEAN NOT NULL DEFAULT TRUE`
  await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS friend_request BOOLEAN NOT NULL DEFAULT TRUE`

  // Seed benchmark workouts (idempotent)
  await sql`
    INSERT INTO workouts (name, description, type, format, score_type, time_cap, is_benchmark)
    VALUES
      ('Fran',     '21-15-9: Thrusters (95/65 lb), Pull-ups',                              'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Murph',    '1 Mile Run, 100 Pull-ups, 200 Push-ups, 300 Squats, 1 Mile Run (20 lb vest optional)', 'benchmark', 'for-time', 'time', NULL, TRUE),
      ('Grace',    '30 Clean & Jerks (135/95 lb) for time',                                'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Helen',    '3 rounds: 400m Run, 21 KB Swings (53/35 lb), 12 Pull-ups',             'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Annie',    '50-40-30-20-10: Double-Unders, Sit-ups',                               'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Barbara',  '5 rounds: 20 Pull-ups, 30 Push-ups, 40 Sit-ups, 50 Squats (rest 3 min between rounds)', 'benchmark', 'for-time', 'time', NULL, TRUE),
      ('Chelsea',  'EMOM 30 min: 5 Pull-ups, 10 Push-ups, 15 Squats',                      'benchmark', 'emom',     'rounds', 30,   TRUE),
      ('Cindy',    'AMRAP 20 min: 5 Pull-ups, 10 Push-ups, 15 Squats',                     'benchmark', 'amrap',    'rounds', 20,   TRUE),
      ('Diane',    '21-15-9: Deadlifts (225/155 lb), Handstand Push-ups',                  'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Elizabeth','21-15-9: Cleans (135/95 lb), Ring Dips',                               'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Kelly',    '5 rounds: 400m Run, 30 Box Jumps (24/20 in), 30 Wall Balls (20/14 lb)','benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Chad',     '1000 Step-ups (20 in box, 45 lb vest)',                                 'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('DT',       '5 rounds: 12 Deadlifts, 9 Hang Power Cleans, 6 Push Jerks (155/105 lb)','benchmark','for-time', 'time',   NULL, TRUE),
      ('Jackie',   '1000m Row, 50 Thrusters (45 lb), 30 Pull-ups',                         'benchmark', 'for-time', 'time',   NULL, TRUE),
      ('Karen',    '150 Wall Balls (20/14 lb)',                                              'benchmark', 'for-time', 'time',   NULL, TRUE)
    ON CONFLICT DO NOTHING
  `

  console.log("Migration complete.")
  await sql.end()
}

migrate().catch(err => { console.error(err); process.exit(1) })
