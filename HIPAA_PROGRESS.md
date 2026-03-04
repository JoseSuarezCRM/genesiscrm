# HIPAA Security Implementation — Progress Notes

Last updated: March 4, 2026
Repo: https://github.com/JoseSuarezCRM/genesiscrm

---

## What Was Done (Completed ✅)

All changes are committed and pushed to GitHub (commit: `9b1bb81`).
Vercel has auto-deployed the code.

### 1. Database Schema (`prisma/schema.prisma`)
Added to the `User` model:
- `failedLoginAttempts` — tracks bad login attempts
- `lockedUntil` — account lockout timestamp
- `lastLoginAt` — last successful login
- `isActive` — soft disable accounts without deleting them

Added new `AuditLog` model and `AuditAction` enum to track all PHI access.

**⚠️ THE MIGRATION HAS NOT BEEN RUN YET ON PRODUCTION.**
The new database tables/columns don't exist in the live database until you run the migration.

### 2. New Library Files
- `lib/audit.ts` — writes audit logs to the database
- `lib/password-policy.ts` — enforces 12-char passwords with complexity
- `lib/rate-limit.ts` — blocks brute force logins (5 attempts / 15 min per IP)

### 3. Authentication (`lib/auth.ts`, `auth.config.ts`)
- Account lockout after 5 failed login attempts (unlocks after 15 min)
- Session expires after 30 minutes of inactivity (HIPAA auto-logoff)
- All login events logged to AuditLog table

### 4. Authorization Fixes
- `app/actions/referrals.ts` — users can now only edit/delete their OWN referrals (admins can edit all)
- `app/api/documents/[id]/route.ts` — users can only delete their OWN documents
- `app/api/referrals/export/route.ts` — CSV export is now ADMIN-only
- `app/actions/users.ts` — passwords now require 12+ chars, uppercase, lowercase, number, special char

### 5. Security Headers (`next.config.mjs`)
Added: HSTS, X-Frame-Options, Content-Security-Policy, nosniff, Referrer-Policy

---

## What Still Needs To Be Done ❌

### CRITICAL — Run the database migration
The schema changes exist in code but the actual database tables haven't been updated.

**Steps:**
1. Get `DATABASE_URL` from Vercel dashboard → Project → Settings → Environment Variables
2. Create a file at `~/genesiscrm/.env` (this file is gitignored, never commit it):
   ```
   DATABASE_URL=postgresql://your_connection_string_here
   ```
3. Run in terminal:
   ```bash
   cd ~/genesiscrm
   npx prisma migrate deploy
   ```

### HIGH — File Storage (PHI Documents are publicly accessible)
Documents uploaded to the app are currently stored in `public/uploads/` which means
anyone with the URL can access them WITHOUT logging in. This is a HIPAA violation.

**Fix plan:** Migrate to Vercel Blob storage (package already installed: `@vercel/blob`)
1. Go to Vercel dashboard → Storage → Create Blob store
2. Copy the `BLOB_READ_WRITE_TOKEN`
3. Add it to Vercel environment variables
4. We need to update these files:
   - `app/api/documents/upload/route.ts` — use Vercel Blob instead of local filesystem
   - Create `app/api/documents/[id]/file/route.ts` — authenticated file serving endpoint
   - `components/document-list.tsx` — change file links to go through auth endpoint

### MEDIUM — Add production domain to next.config.mjs
Update `next.config.mjs` line 49 — replace the placeholder with the actual Vercel domain:
```js
allowedOrigins: [
  "localhost:3000",
  process.env.VERCEL_URL ?? "",
  "your-actual-domain.com",  // ← add this
],
```

### LOW — Update seed password
`prisma/seed.ts` likely has a hardcoded password like `admin123` that violates the new
12-character policy. Update it before running seeds in development.

---

## How to Sync This Laptop's Work to Your Desktop

When you get back to your desktop computer, run:
```bash
cd ~/path/to/genesiscrm
git pull
npm install
```

That will pull all the HIPAA changes and install dependencies.

---

## Environment Variables Needed

| Variable | Where to get it | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel → Settings → Env Vars | Database connection (for migration) |
| `AUTH_SECRET` | Vercel → Settings → Env Vars | NextAuth JWT signing |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob | File uploads (future task) |

Create a `.env` file in the project root with these values for local development.
This file is in `.gitignore` — never commit it.
