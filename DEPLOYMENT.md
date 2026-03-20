# Deployment Guide — ourhardy / aux

## Project state (2026-03-19)

| | |
|---|---|
| Vercel project | `david-hardys-projects-31d7e837/ourhardy` |
| Production URL | `https://app.ourhardy.com` |
| Neon project | `guinnessDB` · `empty-star-16173401` |
| Neon org | `org-green-pond-68012790` (Vercel: David Hardy's projects) |
| Neon region | `aws-us-west-2` |
| Neon database | `neondb` · branch `main` (`br-ancient-moon-afxuubgl`) |

---

## CLI tools

```bash
# Install (one-time)
npm install -g vercel      # Vercel CLI — deploy, env vars, project management
npm install -g neonctl     # Neon CLI — Postgres projects, branches, connection strings

# Verify auth
vercel whoami
neonctl me

# Inspect current state
vercel env ls
neonctl projects list --org-id org-green-pond-68012790
neonctl branches list --project-id empty-star-16173401 --org-id org-green-pond-68012790
neonctl databases list --project-id empty-star-16173401 --org-id org-green-pond-68012790
```

---

## Neon ↔ Vercel linking

Neon databases are plain Postgres instances — they are not "attached to" or "owned by" a
Vercel project. `guinnessDB` lives in `org-green-pond-68012790` which is the shared Vercel/Neon
org, but that does not prevent it being used by any project. Linking = setting `POSTGRES_URL`.

```bash
# Get the pooled connection string (required for serverless Vercel functions)
neonctl connection-string \
  --project-id empty-star-16173401 \
  --org-id org-green-pond-68012790 \
  --pooled
# → postgresql://neondb_owner:...@ep-spring-rain-afwlhf8p-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require
```

**How `POSTGRES_URL` was added to Vercel (all three environments):**

```bash
# Production
echo "<connection-string>" | vercel env add POSTGRES_URL production

# Preview (all branches — pass empty string as branch arg)
vercel env add POSTGRES_URL preview "" --value "<connection-string>" --yes

# Development
vercel env add POSTGRES_URL development --value "<connection-string>" --yes
```

**Verify:**
```bash
vercel env ls
# Should show POSTGRES_URL for Production, Preview, Development
```

---

## Database migration

Run once after `POSTGRES_URL` is set in `.env.local`:

```bash
npx tsx scripts/db-migrate.ts
# Output: Migration complete.
```

**Verify tables were created:**

```bash
node --input-type=module --env-file=.env.local <<'EOF'
import postgres from './node_modules/postgres/src/index.js'
const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1 })
const tables = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`
console.log('Tables:', tables.map(r => r.tablename).join(', '))
await sql.end()
EOF
# Expected: Tables: otps, playlist_tracks, playlists, registrations, users
```

---

## Environment variables

`AWS_PROFILE` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are consumed directly by the AWS SDK — not referenced via `process.env` in code. `VERCEL_URL` is injected automatically by Vercel.

### Variable reference

| Variable | Used in | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `sitemap.ts`, `robots.ts` | Falls back to `VERCEL_URL` then hardcoded URL |
| `AWS_REGION` | `lib/trackCache.ts` | |
| `AWS_PROFILE` | AWS SDK (local dev) | Named profile — alternative to static keys |
| `AWS_ACCESS_KEY_ID` | AWS SDK (production) | Set in Vercel Production only |
| `AWS_SECRET_ACCESS_KEY` | AWS SDK (production) | Set in Vercel Production only |
| `POSTGRES_URL` | `lib/db.ts`, `scripts/db-migrate.ts` | Pooled Neon connection string |
| `SMTP_HOST` | `lib/email.ts` | |
| `SMTP_PORT` | `lib/email.ts` | |
| `SMTP_USER` | `lib/email.ts` | |
| `SMTP_PASS` | `lib/email.ts` | Gmail App Password |
| `SMTP_FROM` | `lib/email.ts` | Address only — display name "Captain Shitbag" is hardcoded |
| `ADMIN_EMAIL` | `aux/page.tsx`, `api/playlists/*`, `api/cache/clear`, `api/registrations/*`, `api/auth/register` | Determines admin vs regular user; also receives registration notification emails |
| `SESSION_SECRET` | `lib/session.ts` | JWT signing key — `openssl rand -base64 32` |

### Vercel state

| Variable | Production | Preview | Development |
|---|---|---|---|
| `POSTGRES_URL` | ✅ | ✅ | ✅ |
| `AWS_ACCESS_KEY_ID` | ✅ | — | — |
| `AWS_SECRET_ACCESS_KEY` | ✅ | — | — |
| `AWS_REGION` | ✅ | — | — |
| `SMTP_HOST` | ✅ | ✅ | ✅ |
| `SMTP_PORT` | ✅ | ✅ | ✅ |
| `SMTP_USER` | ✅ | ✅ | ✅ |
| `SMTP_PASS` | ✅ | ✅ | ✅ |
| `SMTP_FROM` | ✅ | ✅ | ✅ |
| `ADMIN_EMAIL` | ✅ | ✅ | ✅ |
| `SESSION_SECRET` | ✅ | ✅ | ✅ |

### `.env.local` state

| Variable | Status |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ |
| `AWS_REGION` | ✅ |
| `AWS_PROFILE` | ✅ (`ourhardy`) |
| `POSTGRES_URL` | ✅ |
| `SMTP_*` | ✅ |
| `ADMIN_EMAIL` | ✅ |
| `SESSION_SECRET` | ✅ |

---

## Remaining setup checklist

### Google SMTP (OTP emails from "Captain Shitbag")

- [x] Enable **2-Step Verification** on the sender Gmail account:
  `Google Account → Security → 2-Step Verification`
- [x] Generate an **App Password**:
  `Google Account → Security → 2-Step Verification → App Passwords`
  Name it anything (e.g. "ourhardy aux") — copy the 16-character password
- [x] Add to `.env.local`:
  ```
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=you@gmail.com
  SMTP_PASS=xxxx-xxxx-xxxx-xxxx
  SMTP_FROM=you@gmail.com
  ```
- [x] Add to Vercel (all environments):
  ```bash
  for VAR in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
    vercel env add $VAR
  done
  ```

### Auth secrets

- [x] Generate a session secret:
  ```bash
  openssl rand -base64 32
  ```
- [x] Add to `.env.local`:
  ```
  ADMIN_EMAIL=hard2737@hotmail.com
  SESSION_SECRET=<generated above>
  ```
- [x] Add to Vercel:
  ```bash
  vercel env add ADMIN_EMAIL
  vercel env add SESSION_SECRET
  ```

### Deploy and smoke-test

- [x] Confirm env var table above is all ✅:
  ```bash
  vercel env ls
  ```
- [x] Deploy:
  ```bash
  vercel --prod
  ```
- [ ] Verify redirect: `https://app.ourhardy.com/aux` → `/login`
- [ ] Request OTP for `hard2737@hotmail.com` — email arrives from "Captain Shitbag"
- [ ] Sign in → land on `/aux` with playlists tab visible
- [ ] Verify admin: playlists tab shows "global" toggle (`↑`) on playlist rows

---

## Ongoing operations

### Registration approval

When a new user requests access, a notification email is sent to `ADMIN_EMAIL`. To review and act on pending requests:

1. Sign in to `/aux` as the admin.
2. Open the **access** tab in AuxPlayer. A badge on the tab shows the number of pending requests.
3. Use the **Approve** or **Deny** button on each row. Approval calls `PATCH /api/registrations/[id]`, inserts the user into the `users` table, and sends them an approval email. Denial updates the registration status without creating a user.

### Clear track listing cache

S3 track list is cached 30 days. After adding/removing files in `s3://ourhardy.com/aux/x/`, use the `↺` button in the `/aux` header (visible when signed in as admin). It calls `POST /api/cache/clear` (admin session auth), invalidates the `aux-tracks` Vercel Data Cache tag, and updates the track list in place.

### Inspect Neon database

```bash
# List tables
neonctl databases list --project-id empty-star-16173401 --org-id org-green-pond-68012790

# Connection string (pooled)
neonctl connection-string \
  --project-id empty-star-16173401 \
  --org-id org-green-pond-68012790 \
  --pooled
```

### Re-run migration (idempotent)

```bash
npx tsx scripts/db-migrate.ts
```

All `CREATE TABLE IF NOT EXISTS` — safe to re-run at any time.
