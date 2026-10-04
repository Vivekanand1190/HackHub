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
