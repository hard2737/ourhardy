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

  console.log("Migration complete.")
  await sql.end()
}

migrate().catch(err => { console.error(err); process.exit(1) })
