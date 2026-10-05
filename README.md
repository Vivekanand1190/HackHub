# HackHub – Self-Hosted Real-Time Hackathon Workspace

HackHub is an all-in-one, **100% self-hosted local-only** collaborative workspace application designed specifically for hackathons. It requires **zero third-party SaaS or CDN dependencies**: everything runs locally on your own server.

It integrates real-time team chat, shared Monaco code editors with local sandboxed code execution (JS/TS), vector whiteboard drawing canvases, collaborative markdown scratchpads, sprint Kanban boards, persisted team polls, and a deterministic local **AI Hackathon Copilot**.

---

## Key Features & Capabilities

### 1. Collaborative Whiteboard & Notes
- **Infinite Canvas Pan & Zoom**: Seamless navigation with zoom controls.
- **Snapping Guideline Grid**: Snaps all shape vectors automatically to grid increments.
- **Offscreen PNG Exporter**: Renders the complete vector drawing layer and sticky notes.
- **Glowing Laser Pointer**: Streams transient cursor paths to team members via Socket.IO.
- **Collaborative Scratchpad**: Markdown editor with real-time text syncing and live HTML rendering.

### 2. Local AI Copilot & Code Security Analyzer
- **Deterministic Rule-Based Analyzer**: Scans workspace data (tasks, code snippets, documents, messages) to produce real, actionable findings.
- **Security & Vulnerability Audit**: Scans code snippets for exposed credentials, wildcard CORS policies, and code complexity ratings.
- **Local AI Sandbox Tools**: Generates ERD diagrams, API mocks, unit tests, and commit messages locally.

### 3. Sprints & Project Management
- **Persisted Team Polls**: Polls and votes persist in the local database and broadcast live over Socket.IO.
- **Sprint Burndown Velocity Chart**: Displays a custom SVG line chart plotting sprint burn rates.
- **Milestone Timeline**: Clickable timeline milestones synced to the database.
- **XP Rewards Avatar Shop**: Earn experience points (XP) to unlock custom avatar badges.
- **Kanban Card Stopwatches**: Stopwatch controls on Kanban cards save developer hours to the database.

### 4. Zero External Dependencies
- **Self-Hosted Fonts**: Local font loading with zero network requests at build time or runtime.
- **Bundled Monaco Editor**: Monaco editor and web workers are bundled locally without CDN dependencies.
- **Local Sandboxed Code Execution**: Executes JS/TS code in isolated child processes with a 3000ms timeout and memory limits.

---

## Technical Stack

### Backend:
- **Runtime**: Node.js & TypeScript
- **Web Server**: Express.js
- **Real-Time WebSockets**: Socket.IO
- **ORM & Database**: Prisma ORM with SQLite (`prisma/schema.prisma`)
- **Authentication**: JWT Authorization (Email / Password)

### Frontend:
- **Framework**: Next.js (App Router, Tailwind CSS, TypeScript)
- **Collaborative Editor**: `@monaco-editor/react` (bundled locally)
- **Icon Assets**: Lucide React

---

## Quick Start Setup

### 1. Environment Configuration
Copy `backend/.env.example` to `backend/.env`:
```env
NODE_ENV=development
PORT=8888
JWT_SECRET=your_jwt_signature_secret
DATABASE_URL="file:./dev.db"
FRONTEND_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000"
```

### 2. Launch Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy   # applies the migrations and creates every table
npm run dev
```
The backend server runs at `http://localhost:8888`.

### 3. Launch Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend application runs at `http://localhost:3000`.

### 4. Run Verification Suite
```bash
cd backend
npm test
```
Runs all unit & integration tests, including the local-only outbound network audit test.

---

## Troubleshooting

### "Token is invalid or expired"

Every backend that issues or verifies tokens must share the same `JWT_SECRET`.
This shows up most often when you run the app two different ways — for example
`docker compose up` for the backend but `npm run dev` for the frontend, or a
local backend alongside a deployed one — and the two processes ended up with
different secrets. A token minted by one is then rejected by the other.

To fix it, set one explicit `JWT_SECRET` in `backend/.env` (generate it with
`openssl rand -hex 32`) and use that same value everywhere the backend runs,
including your deployment environment. Then clear the stale token from the
browser (`localStorage.removeItem('hackhub_token')`) and sign in again. Changing
`JWT_SECRET` deliberately invalidates all existing sessions — that is expected.

In development you can also simply leave `JWT_SECRET` unset: the backend then
uses one stable built-in dev secret for every start path, which keeps tokens
valid across restarts.


### Database errors: `P3005` and `P3018`

Never run `npx prisma db push` against this project. `db push` syncs
`schema.prisma` straight into the database and writes nothing to
`_prisma_migrations`, so you end up with a database that contains the tables
while Prisma has no record of how they got there. The next
`prisma migrate deploy` then refuses to run:

```
Error: P3005
The database schema is not empty.
```

If you baseline your way past that, the run gets as far as the first migration
that tries to create something your database already has:

```
Error: P3018
A migration failed to apply.
Database error: table "Notification" already exists
```

Both mean the same thing — the database has drifted away from the migrations.
Prisma's migrations are deliberately not idempotent: they assume they are
applied in order, to a database in the state the previous migration left it in.
A database built by `db push` therefore cannot be brought back into line by
editing the migration files.

For a local development database the fix is to rebuild it from the migrations:

```bash
cd backend
npx prisma migrate reset
```

That drops `dev.db`, recreates `_prisma_migrations`, and replays every migration
in order. It is destructive, and there is no seed script, so you will come back
to an empty database and need to register again.

To keep the data instead, clear the failed marker and tell Prisma which
migrations your database already reflects:

```bash
npx prisma db pull --print   # keep --print: without it this overwrites schema.prisma
npx prisma migrate resolve --rolled-back <failed-migration>
npx prisma migrate resolve --applied <migration-already-in-place>
npx prisma migrate deploy
```

Only baseline migrations whose effects `db pull --print` actually shows, and
check each one individually  a migration that adds a column fails the same way
if the column is already present.

If the generated Prisma Client is stale, the symptom is type errors on models
or fields that clearly exist in `schema.prisma`, such as
`prisma.snippetRevision` or `message.pinned`. The client is generated into
`node_modules/.prisma/client`, so a schema change does nothing to the types
until you run:

```bash
cd backend
npm run prisma:generate
```

CI never hits this because it runs `npx prisma generate` immediately before
`npx tsc --noEmit`. Restart your editor's TypeScript server afterwards if the
squiggles linger.
