# HackHub – Ultimate Hackathon Collaboration Platform

HackHub is a premium, all-in-one full-stack collaborative workspace application designed specifically for hackathons. It integrates real-time team chat, shared Monaco code editors with live linting, vector whiteboard drawing canvases, Notion-like collaborative markdown scratchpads, sprint Kanban boards, and a powerful **AI Hackathon Copilot** powered by Hugging Face's `Qwen/Qwen2.5-Coder-32B-Instruct` model.

---

## Key Features & Roadmap Batches

### 1. Collaborative Whiteboard & Notes (Batch 1)
- **Infinite Canvas Pan & Zoom**: Seamless navigation with zoom in/out/reset buttons or mouse-wheel controls, keeping sticky notes and drawings scaled in unison.
- **Snapping Guideline Grid**: Snaps all shape vectors automatically to 25px grid increments for pixel-perfect user interface drafting.
- **Offscreen PNG Exporter**: Renders the complete vector drawing layer, sticky notes, and snapping grid lines against a dark background, exporting as a high-resolution PNG image.
- **Glowing Laser Pointer**: Streams transient cursor paths to other team members via Socket.IO, leaving a glowing neon trail that fades out automatically after 1.5 seconds.
- **Notion-Like Collaborative Scratchpad**: Split-screen Markdown editor with real-time text syncing, live HTML rendering, and character/word counters.

### 2. AI Playground Hub (Batch 2)
- **Database ERD Schema Visualizer**: Generates raw XML/SVG entity relationship layouts from Prisma/SQL schema descriptions and renders them visually inline inside the Copilot panel.
- **API Mock Data Generator**: Generates realistic dummy JSON payloads matching endpoint schemas.
- **Jest Unit Test Writer**: Automates mocking and test assertion generation.
- **Interactive AI Helpers**: Includes code explainers, conventional commit message generators, presentation outlines, SaaS tagline hooks, and technical judge critics.

### 3. Sprints & Project Management (Batch 3)
- **Sprint Burndown Velocity Chart**: Displays a custom glowing SVG line chart plotting ideal sprint burn rates versus actual remaining tasks in real-time.
- **Interactive Milestone Timeline**: Displays clickable timeline milestones (e.g. database setup, routing endpoints, presentation deck) synced to the database.
- **XP Rewards Avatar Shop**: An interactive shop modal allowing users to spend earned experience points (XP) to unlock premium avatar glows, cyberpunk borders, and champion rings that render on the team leaderboard.
- **Workload Balancer Alerts**: Automatically displays warnings if any teammate is assigned to $\ge 70\%$ of active, open tasks.
- **Kanban Card Stopwatches**: Play/Pause stopwatch buttons on Kanban cards tick in real-time and save accumulated developer hours directly to the database.
- **Collapsible Checklist Sub-Tasks**: Cards contain collapsible checklist items with progress bars and quick-add forms to manage micro-sprints.

### 4. Security & Quality Audits (Batch 4)
- **Vulnerability Checks**: Rules-based scanning of code snippets for exposed secrets (API keys/passwords), wildcard CORS policies (`*`), non-expiring JWT signatures, missing Prisma cascade delete configs, and unprotected routes.
- **Complexity Ratings**: Computes branch conditions inside javascript/typescript files to rate file complexity (Low, Medium, High).
- **Lighthouse Simulator**: Displays Google Lighthouse-like progress metrics (Performance, Accessibility, Best Practices, SEO) in neon progress dials.

---

## Technical Stack & Architecture

### Backend:
- **Runtime**: Node.js & TypeScript
- **Web Server**: Express.js
- **Real-Time WebSockets**: Socket.IO
- **ORM & Database**: Prisma ORM with SQLite database engine (`prisma/schema.prisma`)
- **AI Core**: Hugging Face Serverless Inference API running `Qwen/Qwen2.5-Coder-32B-Instruct`
- **Authentication**: JWT Authorization & Google OAuth 2.0 (`passport`)

### Frontend:
- **Framework**: Next.js (App Router, Tailwind CSS, TypeScript)
- **Collaborative Editor**: `@monaco-editor/react`
- **Icon Assets**: Lucide React

---

## Step-by-Step Setup Instructions

### 1. Environment Configurations
Rename `backend/.env.example` to `backend/.env` (or create a new `.env` file) and define:
```env
PORT=8888
JWT_SECRET=your_jwt_signature_secret
SESSION_SECRET=your_session_secret_key
DATABASE_URL="file:./dev.db"
FRONTEND_URL="http://localhost:3000"
HUGGINGFACE_API_KEY=your_hf_inference_token
```

### 2. Backend Server Launch
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run database migrations to initialize tables and generate the Prisma Client:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
The backend server will launch at `http://localhost:8888`.

### 3. Frontend Next.js Launch
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js local development server:
   ```bash
   npm run dev
   ```
The client application will launch at `http://localhost:3000`.

---

## Deployment
For instructions on deploying the frontend and backend servers to production hosting platforms (such as Render, Railway, Fly.io, or Vercel).
