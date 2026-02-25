# Genesis Ortho CRM — Referral Tracker

A multi-user CRM for tracking inbound patient referrals at Genesis Orthopedics.

## Features

- **Dashboard** — Pipeline overview, stats by status, recent referrals
- **Referral management** — Create, edit, update status, delete referrals
- **Document uploads** — Attach PDFs and images to each referral (Vercel Blob)
- **Referring doctors** — Manage referring practices with contact info
- **Filters & search** — Filter by status, date range, practice; search by name
- **CSV export** — Download filtered referral data
- **User management** — Admin can add staff, change roles, reset passwords
- **Authentication** — Email + password login (NextAuth v5)

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **PostgreSQL** on [Neon](https://neon.tech)
- **Prisma** ORM
- **NextAuth v5** for authentication
- **Tailwind CSS + shadcn/ui** for UI
- **Vercel Blob** for document storage
- **Vercel** for deployment

---

## Setup Instructions

### 1. Install Node.js
Download LTS from [nodejs.org](https://nodejs.org). Verify:
```bash
node --version   # should be 18+
npm --version
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Neon database
1. Go to [console.neon.tech](https://console.neon.tech) and create a free project
2. Copy the connection string
3. Update `.env.local`:
```
DATABASE_URL="postgresql://your-connection-string"
```

### 4. Set up Vercel Blob (for document uploads)
1. Deploy to Vercel first (or create a project there)
2. In the Vercel dashboard → Storage → Create Blob Store → Connect to Project
3. Copy `BLOB_READ_WRITE_TOKEN` to `.env.local`

### 5. Generate AUTH_SECRET
```bash
# On Mac/Linux:
openssl rand -base64 32

# On Windows PowerShell:
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```
Update `.env.local` with the result.

### 6. Run database migrations
```bash
npm run db:migrate
```

### 7. Seed initial admin user
```bash
npm run db:seed
```
This creates: **admin@genesisortho.com** / **admin123**

> **Change this password immediately** after first login via User Management.

### 8. Start the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Referral Statuses

| Status | Meaning |
|--------|---------|
| **New** | Referral received, not yet contacted |
| **Contacted** | Patient has been reached out to |
| **Scheduled** | Appointment scheduled |
| **Completed** | Patient was seen |
| **No Show** | Patient did not show up |

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# DATABASE_URL, AUTH_SECRET, BLOB_READ_WRITE_TOKEN, AUTH_TRUST_HOST=true
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed admin user |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate Prisma client |
