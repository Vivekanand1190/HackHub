import { Router, Response } from 'express';
import { execFile } from 'child_process';
import os from 'os';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma';
import { config } from '../config';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  requireTeamMember,
  requireTeamMemberFromBody,
  requireTaskTeamMember,
  requireDocumentTeamMember,
} from '../middleware/teamAccess';
import { CopilotService } from '../services/copilot.service';

const router = Router();

/** Safely parse a value that may be a JSON string, a plain string, or null. */
function parseMaybeJson(value: unknown): any {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** True if the user is the team's leader or one of its members. */
async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, OR: [{ leaderId: userId }, { members: { some: { id: userId } } }] },
    select: { id: true },
  });
  return !!team;
}

/** null = event not found; true = may manage; false = forbidden. */
async function canManageEvent(userId: string, role: string | undefined, eventId: string): Promise<boolean | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
  if (!event) return null;
  return event.organizerId === userId || role === 'Organizer' || role === 'Leader';
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multer Local File Upload Config
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

/* ==========================================================================
   AUTHENTICATION ENDPOINTS
   ========================================================================== */

// 1. User Registration
router.post('/auth/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role:
          typeof role === 'string' && role.trim() &&
          !['Leader', 'Organizer', 'Admin', 'Owner'].includes(role.trim())
            ? role.trim()
            : 'Developer',
        xp: 10, // Starting XP
        badges: JSON.stringify(['Novice Hacker'])
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        xp: user.xp,
        badges: parseMaybeJson(user.badges)
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. User Login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        xp: user.xp,
        badges: parseMaybeJson(user.badges)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// 3. Get Session
router.get('/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      xp: user.xp,
      avatar: user.avatar,
      badges: parseMaybeJson(user.badges)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching user session' });
  }
});


/* ==========================================================================
   TEAM WORKSPACE ENDPOINTS
   ========================================================================== */

// 0. Get User's Teams
router.get('/teams', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        teams: {
          select: {
            id: true,
            name: true,
            joinCode: true,
            createdAt: true
          }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user.teams);
  } catch (err) {
    console.error('Fetch user teams error:', err);
    res.status(500).json({ error: 'Server error fetching user teams' });
  }
});

// 1. Create a Team Workspace
router.post('/teams/create', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Team name is required' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Generate simple readable 6-character code
    const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const team = await prisma.team.create({
      data: {
        name,
        joinCode,
        leaderId: req.user.id,
        members: {
          connect: { id: req.user.id }
        }
      }
    });

    // Create an initial README doc
    await prisma.document.create({
      data: {
        title: 'Project README',
        content: `# Welcome to ${name} Hackathon Workspace!\n\nUse this collaborative markdown document to build your hackathon project details.`,
        teamId: team.id
      }
    });

    res.status(201).json(team);
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Server error creating team' });
  }
});

// 2. Join a Team Workspace
router.post('/teams/join', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { joinCode } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'Join code is required' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const team = await prisma.team.findUnique({
      where: { joinCode: joinCode.trim().toUpperCase() },
      include: { members: true }
    });

    if (!team) {
      return res.status(404).json({ error: 'Invalid join code. Team not found.' });
    }

    const isMember = team.members.some(m => m.id === req.user!.id);
    if (!isMember) {
      await prisma.team.update({
        where: { id: team.id },
        data: {
          members: {
            connect: { id: req.user.id }
          }
        }
      });
    }

    res.json({ success: true, teamId: team.id, teamName: team.name });
  } catch (err) {
    console.error('Join team error:', err);
    res.status(500).json({ error: 'Server error joining team' });
  }
});

// 3. Get Workspace State (Messages, Tasks, Snippets, Documents, Members)
router.get('/teams/:teamId/workspace', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        leader: { select: { id: true, name: true, role: true } },
        members: { select: { id: true, name: true, role: true, xp: true } },
        tasks: {
          include: { assignee: { select: { id: true, name: true } } }
        },
        messages: {
          take: 50,
          orderBy: { timestamp: 'desc' },
          include: { user: { select: { name: true, role: true } } }
        },
        snippets: {
          orderBy: { createdAt: 'desc' }
        },
        documents: {
          orderBy: { updatedAt: 'desc' }
        }
      }
    });

    if (!team) {
      return res.status(404).json({ error: 'Workspace team not found' });
    }

    // Return reversed messages for ascending chronological order
    const formattedMessages = team.messages.reverse().map(m => ({
      id: m.id,
      text: m.text,
      system: m.system,
      userId: m.userId,
      user: m.user ? { name: m.user.name, role: m.user.role } : null,
      attachment: parseMaybeJson(m.attachment),
      timestamp: m.timestamp.toISOString()
    }));

    res.json({
      id: team.id,
      name: team.name,
      joinCode: team.joinCode,
      leader: team.leader,
      members: team.members,
      tasks: team.tasks,
      messages: formattedMessages,
      snippets: team.snippets,
      documents: team.documents,
      whiteboardData: JSON.parse((team.whiteboardData as string) || '[]'),
      copilotState: typeof team.copilotState === 'string' ? JSON.parse(team.copilotState) : team.copilotState,
      githubRepo: team.githubRepo || '',
      milestones: typeof team.milestones === 'string' ? JSON.parse(team.milestones || '[]') : team.milestones,
      unlockedAvatars: typeof team.unlockedAvatars === 'string' ? JSON.parse(team.unlockedAvatars || '[]') : team.unlockedAvatars
    });
  } catch (err) {
    console.error('Fetch workspace error:', err);
    res.status(500).json({ error: 'Server error fetching workspace state' });
  }
});


/* ==========================================================================
   TASK KANBAN ENDPOINTS
   ========================================================================== */

// 1. Create a Task
router.post('/tasks', authMiddleware, requireTeamMemberFromBody('teamId'), async (req: AuthenticatedRequest, res) => {
  const { title, description, column, teamId, assigneeId, deadline } = req.body;
  if (!title || !teamId) return res.status(400).json({ error: 'Title and teamId are required' });

  try {
    const task = await prisma.task.create({
      data: {
        title,
        description: description || '',
        column: column || 'todo',
        teamId,
        assigneeId: assigneeId || null,
        deadline: deadline ? new Date(deadline) : null
      },
      include: { assignee: { select: { name: true } } }
    });

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error creating task' });
  }
});

// 2. Update a Task (Status column, details, assignee)
router.put('/tasks/:taskId', authMiddleware, requireTaskTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const { title, description, column, assigneeId, deadline, timeSpent, checklist } = req.body;

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        column,
        assigneeId: assigneeId || null,
        deadline: deadline ? new Date(deadline) : null,
        timeSpent: timeSpent !== undefined ? parseInt(timeSpent, 10) : undefined,
        checklist: checklist !== undefined ? (typeof checklist === 'string' ? checklist : JSON.stringify(checklist)) : undefined
      },
      include: { assignee: { select: { name: true } } }
    });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error updating task' });
  }
});

// 3. Delete a Task
router.delete('/tasks/:taskId', authMiddleware, requireTaskTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;

  try {
    await prisma.task.delete({ where: { id: taskId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting task' });
  }
});


/* ==========================================================================
   CODE SNIPPETS & WORKSPACE DOCUMENTS
   ========================================================================== */

// Create Snippet
router.post('/snippets', authMiddleware, requireTeamMemberFromBody('teamId'), async (req: AuthenticatedRequest, res) => {
  const { title, code, language, teamId } = req.body;
  if (!title || !code || !teamId || !req.user) {
    return res.status(400).json({ error: 'Missing title, code, or teamId' });
  }

  try {
    const snippet = await prisma.codeSnippet.create({
      data: {
        title,
        code,
        language: language || 'javascript',
        teamId,
        userId: req.user.id
      }
    });
    res.status(201).json(snippet);
  } catch (err) {
    res.status(500).json({ error: 'Server error creating snippet' });
  }
});

// Version History: Get revisions for a snippet
router.get('/snippets/:snippetId/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { snippetId } = req.params;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const snippet = await prisma.codeSnippet.findUnique({ where: { id: snippetId }, select: { teamId: true } });
  if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
  if (!(await isTeamMember(req.user.id, snippet.teamId))) {
    return res.status(403).json({ error: 'You are not a member of this team' });
  }

  const revisions = await prisma.snippetRevision.findMany({
    where: { snippetId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(revisions);
});

// Version History: Save a snapshot revision
router.post('/snippets/:snippetId/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { snippetId } = req.params;
  const { code, language, commitMessage } = req.body;

  if (!code) return res.status(400).json({ error: 'Code content is required' });

  const snippet = await prisma.codeSnippet.findUnique({ where: { id: snippetId }, select: { teamId: true } });
  if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
  if (!req.user || !(await isTeamMember(req.user.id, snippet.teamId))) {
    return res.status(403).json({ error: 'You are not a member of this team' });
  }

  try {
    const existingCount = await prisma.snippetRevision.count({ where: { snippetId } });

    const revision = await prisma.snippetRevision.create({
      data: {
        snippetId,
        code,
        language: language || 'javascript',
        commitMessage: commitMessage || `Snapshot revision ${existingCount + 1}`,
        author: req.user.name || 'Teammate'
      }
    });

    res.status(201).json(revision);
  } catch (err) {
    console.error('Failed to save snippet revision:', err);
    res.status(500).json({ error: 'Failed to save revision' });
  }
});

// Version History: Restore a past revision
router.post('/snippets/:snippetId/restore', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { snippetId } = req.params;
  const { revisionId } = req.body;

  const snippet = await prisma.codeSnippet.findUnique({ where: { id: snippetId }, select: { teamId: true } });
  if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
  if (!req.user || !(await isTeamMember(req.user.id, snippet.teamId))) {
    return res.status(403).json({ error: 'You are not a member of this team' });
  }

  const target = await prisma.snippetRevision.findFirst({
    where: { id: revisionId, snippetId }
  });

  if (!target) return res.status(404).json({ error: 'Revision not found' });

  try {
    const updatedSnippet = await prisma.codeSnippet.update({
      where: { id: snippetId },
      data: { code: target.code, language: target.language }
    });

    res.json({ success: true, snippet: updatedSnippet, restoredRevision: target });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore revision' });
  }
});

// Create/Update Document
router.post('/documents', authMiddleware, requireDocumentTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { id, title, content, teamId } = req.body;
  if (!title || !teamId) return res.status(400).json({ error: 'Title and teamId are required' });

  try {
    let doc;
    if (id) {
      doc = await prisma.document.update({
        where: { id },
        data: { title, content, updatedAt: new Date() }
      });
    } else {
      doc = await prisma.document.create({
        data: { title, content: content || '', teamId }
      });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Server error handling document' });
  }
});


/* ==========================================================================
   HACKATHON COPILOT (AI COACH)
   ========================================================================== */

// Trigger live AI review
router.post('/copilot/:teamId/scan', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const analysis = await CopilotService.analyzeTeam(teamId);
    
    // Reward XP to team members for running analyses and making progress
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true }
    });
    
    if (team) {
      for (const member of team.members) {
        await prisma.user.update({
          where: { id: member.id },
          data: { xp: { increment: 5 } } // Reward 5 XP for AI scanning
        });
      }
    }

    res.json(analysis);
  } catch (err: any) {
    console.error('Copilot scan error:', err);
    res.status(500).json({ error: err.message || 'Server error running AI scan' });
  }
});

/* ==========================================================================
   CODE EXECUTION SANDBOX
   ========================================================================== */

router.post('/sandbox/execute', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { code, language } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code string is required' });
  }

  const lang = (language || 'javascript').toLowerCase();
  if (lang !== 'javascript' && lang !== 'js' && lang !== 'typescript' && lang !== 'ts') {
    return res.status(400).json({
      error: `Execution is only supported for JavaScript and TypeScript in the local sandbox. ${language} is disabled.`,
      language: lang,
      durationMs: 0,
      success: false,
      logs: [`Execution disabled for ${language}. Only JS/TS supported.`]
    });
  }

  const startTime = Date.now();

  execFile(
    process.execPath,
    ['--max-old-space-size=64', '-e', code],
    {
      timeout: 3000,
      maxBuffer: 1024 * 512,
      cwd: os.tmpdir(),
      // Deliberately minimal: never inherit the backend's environment, or
      // submitted code could read JWT_SECRET / DATABASE_URL via process.env.
      env: { NODE_ENV: 'sandbox', TZ: 'UTC' }
    },
    (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const logs: string[] = [];

      if (stdout) {
        logs.push(...stdout.split('\n').filter(Boolean));
      }
      if (stderr) {
        logs.push(...stderr.split('\n').filter(Boolean).map(l => `[stderr] ${l}`));
      }

      if (error) {
        if (error.killed) {
          logs.push('❌ Error: Execution timed out (3000ms limit exceeded).');
        } else {
          logs.push(`❌ Runtime Error: ${error.message}`);
        }
        return res.json({
          success: false,
          language: lang,
          durationMs,
          error: logs.join('\n') || error.message,
          logs
        });
      }

      if (logs.length === 0) {
        logs.push('(Code executed successfully with no output logs)');
      }

      return res.json({
        success: true,
        language: lang,
        durationMs,
        logs
      });
    }
  );
});

/* ==========================================================================
   TEAM SPRINT POLLS (PERSISTED IN DATABASE)
   ========================================================================== */

router.get('/teams/:teamId/polls', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  try {
    const polls = await prisma.poll.findMany({
      where: { teamId },
      include: {
        creator: { select: { name: true } },
        votes: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = polls.map((p) => {
      const optionTexts: string[] = JSON.parse(p.options || '[]');
      const voteCounts = optionTexts.map((_, idx) =>
        p.votes.filter((v) => v.optionIdx === idx).length
      );
      const voters = p.votes.map((v) => v.userId);

      return {
        id: p.id,
        question: p.question,
        options: optionTexts.map((text, idx) => ({
          text,
          votes: voteCounts[idx]
        })),
        voters,
        author: p.creator?.name || 'Teammate',
        closed: p.closed,
        createdAt: p.createdAt.toISOString()
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
});

router.post('/teams/:teamId/polls', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  const { question, options } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Question and at least 2 options are required' });
  }

  try {
    const poll = await prisma.poll.create({
      data: {
        teamId,
        question,
        options: JSON.stringify(options),
        createdBy: req.user!.id
      },
      include: {
        creator: { select: { name: true } },
        votes: true
      }
    });

    res.status(201).json({
      id: poll.id,
      question: poll.question,
      options: options.map((text: string) => ({ text, votes: 0 })),
      voters: [],
      author: poll.creator?.name || 'Teammate',
      closed: false,
      createdAt: poll.createdAt.toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

router.post('/teams/:teamId/polls/:pollId/vote', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { pollId } = req.params;
  const { optionIndex } = req.body;
  const userId = req.user!.id;

  if (typeof optionIndex !== 'number' || optionIndex < 0) {
    return res.status(400).json({ error: 'Valid option index is required' });
  }

  try {
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.closed) return res.status(400).json({ error: 'Poll is closed' });

    const existing = await prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId, userId } }
    });

    if (existing) {
      await prisma.pollVote.update({
        where: { id: existing.id },
        data: { optionIdx: optionIndex }
      });
    } else {
      await prisma.pollVote.create({
        data: { pollId, userId, optionIdx: optionIndex }
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});


/* ==========================================================================
   FILE SHARING & UPLOADS
   ========================================================================== */

router.post('/uploads', authMiddleware, upload.single('file'), (req: AuthenticatedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileInfo = {
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
    url: `/uploads/${req.file.filename}`, // In production, Cloudinary/S3 URL goes here
    timestamp: new Date().toISOString()
  };

  res.json(fileInfo);
});


/* ==========================================================================
   ROADMAP BATCHES 2, 3, AND 4 API ENDPOINTS
   ========================================================================== */

// 1. Update Team details (Milestones, Github Repo)
router.put('/teams/:teamId', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  const { githubRepo, milestones, unlockedAvatars } = req.body;

  try {
    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        githubRepo: githubRepo !== undefined ? githubRepo : undefined,
        milestones: milestones !== undefined ? (typeof milestones === 'string' ? milestones : JSON.stringify(milestones)) : undefined,
        unlockedAvatars: unlockedAvatars !== undefined ? (typeof unlockedAvatars === 'string' ? unlockedAvatars : JSON.stringify(unlockedAvatars)) : undefined,
      }
    });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Server error updating team details' });
  }
});

// 1b. Fetch GitHub Repository Local Summary
router.get('/teams/:teamId/github/summary', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || !team.githubRepo) {
      return res.json({ connected: false });
    }

    // Clean up repo string e.g. "https://github.com/owner/repo" -> "owner/repo"
    const cleaned = team.githubRepo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
    const parts = cleaned.split('/');

    if (parts.length < 2) {
      return res.json({ connected: true, repoUrl: team.githubRepo, repoName: cleaned, valid: true, defaultBranch: 'main', stars: 0, forks: 0, openIssues: 0, recentCommits: [] });
    }

    const [owner, repo] = parts;

    return res.json({
      connected: true,
      valid: true,
      owner,
      repo,
      fullRepoName: `${owner}/${repo}`,
      repoUrl: team.githubRepo.startsWith('http') ? team.githubRepo : `https://github.com/${owner}/${repo}`,
      stars: 0,
      forks: 0,
      openIssues: 0,
      defaultBranch: 'main',
      updatedAt: new Date().toISOString(),
      recentCommits: []
    });
  } catch (err) {
    console.error('GitHub Summary endpoint error:', err);
    res.status(500).json({ error: 'Failed to fetch GitHub repository summary' });
  }
});



// 1e. Real-Time Workspace Activity Feed Endpoint
router.get('/teams/:teamId/activities', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        tasks: { include: { assignee: true }, take: 10, orderBy: { id: 'desc' } },
        snippets: { include: { user: true }, take: 10, orderBy: { createdAt: 'desc' } },
        messages: { include: { user: true }, take: 10, orderBy: { timestamp: 'desc' } },
        documents: { take: 5, orderBy: { updatedAt: 'desc' } }
      }
    });

    if (!team) return res.status(404).json({ error: 'Team not found' });

    const activities: any[] = [];

    // Map tasks
    (team.tasks || []).forEach(t => {
      activities.push({
        id: `act-task-${t.id}`,
        type: 'task',
        title: `Task "${t.title}" status: ${t.column.toUpperCase()}`,
        author: t.assignee?.name || 'Teammate',
        timestamp: t.deadline ? t.deadline.toISOString() : new Date().toISOString(),
        category: 'Kanban'
      });
    });

    // Map snippets
    (team.snippets || []).forEach(s => {
      activities.push({
        id: `act-snip-${s.id}`,
        type: 'code',
        title: `Code Snippet "${s.title}" updated (${s.language})`,
        author: s.user?.name || 'Developer',
        timestamp: s.createdAt.toISOString(),
        category: 'Code'
      });
    });

    // Map messages
    (team.messages || []).forEach(m => {
      if (!m.system && m.text) {
        activities.push({
          id: `act-msg-${m.id}`,
          type: 'chat',
          title: `Chat message: "${m.text.substring(0, 40)}${m.text.length > 40 ? '...' : ''}"`,
          author: m.user?.name || 'Teammate',
          timestamp: m.timestamp.toISOString(),
          category: 'Chat'
        });
      }
    });

    // Map documents
    (team.documents || []).forEach(d => {
      activities.push({
        id: `act-doc-${d.id}`,
        type: 'doc',
        title: `Workspace Document "${d.title}" revised`,
        author: 'Team',
        timestamp: d.updatedAt.toISOString(),
        category: 'Doc'
      });
    });

    res.json(activities.slice(0, 15));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// Full-Text Message Search Endpoint
router.get('/teams/:teamId/messages/search', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  const { q, channel, author } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Search query "q" is required' });
  }

  try {
    const whereClause: any = {
      teamId,
      text: { contains: q },
    };

    if (channel && typeof channel === 'string' && channel !== 'all') {
      whereClause.channel = channel;
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: { user: true },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const results = messages
      .filter((m) => !author || (m.user && m.user.name.toLowerCase().includes((author as string).toLowerCase())))
      .map((m) => ({
        id: m.id,
        text: m.text,
        channel: m.channel,
        parentId: m.parentId,
        userId: m.userId,
        author: m.user?.name || 'Teammate',
        role: m.user?.role || 'Developer',
        attachment: parseMaybeJson(m.attachment),
        reactions: m.reactions ? JSON.parse(m.reactions) : {},
        editedAt: m.editedAt?.toISOString(),
        timestamp: m.timestamp.toISOString(),
      }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to perform message search' });
  }
});

// Helper: Pure Node PKZip file builder
function createSimpleZipBuffer(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localHeaderBuffers: Buffer[] = [];
  const centralDirectoryBuffers: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < contentBuf.length; i++) {
      crc ^= contentBuf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
      }
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(contentBuf.length, 18);
    localHeader.writeUInt32LE(contentBuf.length, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localHeaderBuffers.push(localHeader, filenameBuf, contentBuf);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(0, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(contentBuf.length, 20);
    cdHeader.writeUInt32LE(contentBuf.length, 24);
    cdHeader.writeUInt16LE(filenameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(currentOffset, 42);

    centralDirectoryBuffers.push(cdHeader, filenameBuf);
    currentOffset += 30 + filenameBuf.length + contentBuf.length;
  }

  const cdStartOffset = currentOffset;
  let cdSize = 0;
  for (const b of centralDirectoryBuffers) cdSize += b.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStartOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaderBuffers, ...centralDirectoryBuffers, eocd]);
}

// 1f. Export Workspace ZIP Archive Endpoint
router.get('/teams/:teamId/export/zip', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        leader: true,
        members: true,
        snippets: true,
        tasks: true,
        documents: true
      }
    });

    if (!team) return res.status(404).json({ error: 'Team not found' });

    const filesToZip: Array<{ name: string; content: string }> = [];

    // 1. README.md
    const readmeContent = `# ${team.name} — HackHub Workspace Export

**Join Code:** \`${team.joinCode}\`
**Team Leader:** ${team.leader?.name || 'Leader'}
**Created At:** ${team.createdAt?.toISOString ? team.createdAt.toISOString() : team.createdAt || new Date().toISOString()}
**GitHub Repository:** ${team.githubRepo || 'Not linked'}

## Workspace Members
${(team.members || []).map(m => `- ${m.name} (${m.role}) — ${m.xp} XP`).join('\n')}

## Tasks Overview
${(team.tasks || []).map(t => `- [${t.column === 'done' ? 'x' : ' '}] ${t.title} (${t.column.toUpperCase()})`).join('\n')}

---
*Exported automatically from HackHub Platform.*
`;
    filesToZip.push({ name: 'README.md', content: readmeContent });

    // 2. Code Snippets
    (team.snippets || []).forEach((snip, index) => {
      const ext = snip.language === 'python' ? 'py' : snip.language === 'html' ? 'html' : snip.language === 'css' ? 'css' : 'js';
      const filename = `snippets/${snip.title ? snip.title.replace(/[^a-zA-Z0-9_-]/g, '_') : `snippet_${index + 1}`}.${ext}`;
      filesToZip.push({ name: filename, content: snip.code || '' });
    });

    // 3. Tasks & Documents
    filesToZip.push({ name: 'tasks.json', content: JSON.stringify(team.tasks || [], null, 2) });
    filesToZip.push({ name: 'whiteboard.json', content: team.whiteboardData || '[]' });
    filesToZip.push({ name: 'documents.json', content: JSON.stringify(team.documents || [], null, 2) });

    const zipBuffer = createSimpleZipBuffer(filesToZip);

    const safeName = team.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_export.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Zip export error:', err);
    res.status(500).json({ error: 'Failed to generate project zip export' });
  }
});



// 1h. Team Member Leaderboard Endpoint
router.get('/teams/:teamId/leaderboard', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
        tasks: { where: { column: 'done' } }
      }
    });

    if (!team) return res.status(404).json({ error: 'Team not found' });

    const memberStats = (team.members || []).map((m) => {
      const completedCount = (team.tasks || []).filter(t => t.assigneeId === m.id).length;
      const level = Math.floor((m.xp || 0) / 100) + 1;
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        xp: m.xp || 0,
        level,
        completedTasks: completedCount,
        roleBadge: m.roleBadge || m.role || 'Developer'
      };
    });

    // Sort by XP descending
    memberStats.sort((a, b) => b.xp - a.xp);

    const rankedMembers = memberStats.map((m, idx) => ({
      ...m,
      rank: idx + 1,
      badge: idx === 0 ? '🥇 1st Place Champion' : idx === 1 ? '🥈 2nd Place Silver' : idx === 2 ? '🥉 3rd Place Bronze' : `Rank #${idx + 1}`
    }));

    res.json({
      teamId,
      teamName: team.name,
      leaderboard: rankedMembers,
      totalTeamXp: rankedMembers.reduce((sum, m) => sum + m.xp, 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team leaderboard' });
  }
});



// 1j. Judge Evaluation Endpoints
router.get('/teams/:teamId/judge/score', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    let copilotObj: any = {};
    try { copilotObj = JSON.parse(team.copilotState || '{}'); } catch (e) {}

    const evaluations = copilotObj.judgeEvaluations || [];
    const avgScore = evaluations.length > 0 
      ? Math.round(evaluations.reduce((sum: number, ev: any) => sum + (ev.overallScore || 0), 0) / evaluations.length)
      : (copilotObj.readinessScore || 85);

    return res.json({
      teamId,
      evaluations,
      avgScore,
      totalEvaluations: evaluations.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error loading judge evaluations' });
  }
});

router.post('/teams/:teamId/judge/score', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  const { pitchScore, codeScore, innovationScore, designScore, comments } = req.body;

  try {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    let copilotObj: any = {};
    try { copilotObj = JSON.parse(team.copilotState || '{}'); } catch (e) {}

    const pScore = Number(pitchScore) || 80;
    const cScore = Number(codeScore) || 80;
    const iScore = Number(innovationScore) || 80;
    const dScore = Number(designScore) || 80;
    const overallScore = Math.round((pScore * 0.25) + (cScore * 0.35) + (iScore * 0.25) + (dScore * 0.15));

    const newEval = {
      id: `eval-${Date.now()}`,
      judgeName: req.user?.name || 'Hackathon Judge',
      pitchScore: pScore,
      codeScore: cScore,
      innovationScore: iScore,
      designScore: dScore,
      overallScore,
      comments: comments || 'Solid execution and submission.',
      timestamp: new Date().toISOString()
    };

    const updatedEvaluations = [newEval, ...(copilotObj.judgeEvaluations || [])];
    copilotObj.judgeEvaluations = updatedEvaluations;

    await prisma.team.update({
      where: { id: teamId },
      data: {
        copilotState: JSON.stringify(copilotObj)
      }
    });

    res.json({
      success: true,
      evaluation: newEval,
      evaluations: updatedEvaluations
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record judge evaluation' });
  }
});

// 2. Update User Profile Badge
router.put('/users/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { roleBadge } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        roleBadge: roleBadge || 'Contributor'
      }
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error updating user profile' });
  }
});

// 3. AI Copilot Playground Tools (DB schema, API mock, Test case generator)
router.post('/copilot/tools', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { toolName, inputData } = req.body;
  if (!toolName) return res.status(400).json({ error: 'Missing toolName' });

  let result = '';
  if (toolName === 'visualize-schema') {
    result = `<svg viewBox="0 0 400 180" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="150" height="150" rx="10" fill="#1e293b" stroke="#6366f1" stroke-width="2"/>
  <text x="25" y="35" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">User Table</text>
  <text x="25" y="60" font-family="sans-serif" font-size="11" fill="#94a3b8">id: String (PK)</text>
  <text x="25" y="80" font-family="sans-serif" font-size="11" fill="#94a3b8">email: String</text>
  <text x="25" y="100" font-family="sans-serif" font-size="11" fill="#94a3b8">xp: Int</text>
  
  <rect x="240" y="10" width="150" height="150" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
  <text x="255" y="35" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">Task Table</text>
  <text x="255" y="60" font-family="sans-serif" font-size="11" fill="#94a3b8">id: String (PK)</text>
  <text x="255" y="80" font-family="sans-serif" font-size="11" fill="#94a3b8">title: String</text>
  <text x="255" y="100" font-family="sans-serif" font-size="11" fill="#94a3b8">assigneeId: String</text>

  <path d="M 160 85 L 240 85" stroke="#a78bfa" stroke-width="2" stroke-dasharray="4"/>
  <polygon points="240,85 230,80 230,90" fill="#a78bfa"/>
</svg>`;
  } else if (toolName === 'generate-api') {
    result = JSON.stringify([
      { id: 1, name: "Alice", email: "alice@example.com", active: true },
      { id: 2, name: "Bob", email: "bob@example.com", active: false }
    ], null, 2);
  } else if (toolName === 'explain-code') {
    result = `- Iterates through the collection of data models.\n- Performs database operations asynchronously.\n- Returns processed output payload.`;
  } else if (toolName === 'generate-tests') {
    result = `describe('Helper Tests', () => {\n  it('should return correct results on normal bounds', () => {\n    expect(testFn(2, 3)).toBe(5);\n  });\n});`;
  } else if (toolName === 'commit-generator') {
    result = `feat: update database schema relationships and sprint tasks`;
  } else if (toolName === 'pitch-simulator') {
    result = `1. How does your realtime sync handle offline recovery when a member reconnects?\n2. What data models handle team workspace permissions?\n3. How are code snippets sandboxed during execution?`;
  } else if (toolName === 'slide-outline') {
    result = `Slide 1: Problem statement & Hackathon gaps\nSlide 2: Core Solution (Real-Time workspace)\nSlide 3: Whiteboard & Code Sandbox Demo\nSlide 4: Architecture & Security Scanners\nSlide 5: Business potential & Future roadmap`;
  } else if (toolName === 'tagline-improver') {
    result = `1. "Code, Collaborate, and Conquer the Sprint"\n2. "The All-in-One Workspace for Hackathon Sprints"\n3. "Eliminate Context Switching: Build Speed Demo Ready"`;
  } else {
    return res.status(400).json({ error: 'Invalid toolName' });
  }

  res.json({ result });
});

// 4. Code Quality & Security Auditing Scan
router.post('/copilot/audit/:teamId', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;

  try {
    const snippets = await prisma.codeSnippet.findMany({ where: { teamId } });
    const team = await prisma.team.findUnique({ where: { id: teamId } });

    const findings: any[] = [];
    const complexityAnalysis: any[] = [];
    let score = 100;

    const secretsRegex = /(password|passwd|aws_key|secret|api_key|token|jwt_secret|private_key)\s*[:=]\s*['"`][a-zA-Z0-9_\-\/+=]{10,}['"`]/gi;
    snippets.forEach(s => {
      let match;
      while ((match = secretsRegex.exec(s.code)) !== null) {
        score -= 15;
        findings.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Secret Exposure',
          severity: 'critical',
          title: `Hardcoded API Secret in ${s.title}`,
          description: `Detected a potential key or credentials signature assignment ("${match[1]}"). Shift secret credentials into configuration environment variables (.env).`,
          file: s.title,
          line: s.code.substring(0, match.index).split('\n').length
        });
      }
    });

    snippets.forEach(s => {
      if (s.code.includes('cors(') && (s.code.includes('*') || s.code.includes('origin: "*"'))) {
        score -= 10;
        findings.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'CORS Risk',
          severity: 'warning',
          title: `Permissive CORS Policy in ${s.title}`,
          description: `CORS is configured to accept all web origins ('*'). Restrict this to authorized development domains to prevent cross-site request forgery attacks.`,
          file: s.title,
          line: s.code.indexOf('cors') !== -1 ? s.code.substring(0, s.code.indexOf('cors')).split('\n').length : 1
        });
      }
    });

    snippets.forEach(s => {
      if (s.code.includes('jwt.sign') && !s.code.includes('expiresIn')) {
        score -= 10;
        findings.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'JWT Expiration',
          severity: 'warning',
          title: `Non-expiring Auth Tokens in ${s.title}`,
          description: `Auth tokens are generated without explicit expiration settings. Provide an expiresIn parameter (e.g. '24h') to limit token lifetimes.`,
          file: s.title,
          line: 1
        });
      }
    });

    if (team) {
      const isPrisma = snippets.some(s => s.code.includes('prisma') || s.language === 'prisma');
      const hasCascades = snippets.some(s => s.code.includes('onDelete: Cascade'));
      if (isPrisma && !hasCascades) {
        score -= 5;
        findings.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Data Integrity',
          severity: 'info',
          title: `Missing Cascading Deletes`,
          description: `Ensure database schemas utilize relation cascading keys (onDelete: Cascade) to prevent orphaned records.`,
          file: 'schema.prisma',
          line: 1
        });
      }
    }

    snippets.forEach(s => {
      if (s.code.includes('router.') && (s.code.includes('get(') || s.code.includes('post(')) && !s.code.includes('authMiddleware')) {
        score -= 5;
        findings.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'Route Security',
          severity: 'warning',
          title: `Orphaned Express route in ${s.title}`,
          description: `Route definitions found lacking authMiddleware security interceptors. Verify endpoints restrict visitor access.`,
          file: s.title,
          line: 1
        });
      }
    });

    snippets.forEach(s => {
      const conditionalMatches = s.code.match(/(if|for|while|case|&&|[|]{2})/g) || [];
      const compVal = 1 + conditionalMatches.length;
      complexityAnalysis.push({
        file: s.title,
        score: compVal,
        rating: compVal > 15 ? 'high' : compVal > 6 ? 'medium' : 'low'
      });
    });

    score = Math.max(10, score);

    res.json({
      securityScore: score,
      findings,
      complexityAnalysis,
      lighthouseScores: {
        performance: Math.round(75 + Math.random() * 20),
        accessibility: Math.round(80 + Math.random() * 18),
        seo: Math.round(85 + Math.random() * 14),
        bestPractices: Math.round(70 + Math.random() * 25)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Audit execution failure' });
  }
});

// 5. XP Level Rewards Avatar Store Purchases
router.post('/teams/:teamId/shop', authMiddleware, requireTeamMember(), async (req: AuthenticatedRequest, res) => {
  const { teamId } = req.params;
  const { itemName, cost } = req.body;
  // Always charge the authenticated user — never trust a client-supplied userId.
  const userId = req.user!.id;
  const price = Number(cost);
  if (!itemName || cost === undefined || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Missing or invalid purchase options' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.xp < price) {
      return res.status(400).json({ error: 'Insufficient XP points' });
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const unlocked = JSON.parse(team.unlockedAvatars || '[]');
    if (!unlocked.includes(itemName)) {
      unlocked.push(itemName);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { xp: { decrement: price } }
    });

    await prisma.team.update({
      where: { id: teamId },
      data: { unlockedAvatars: JSON.stringify(unlocked) }
    });

    res.json({
      success: true,
      newXp: updatedUser.xp,
      unlocked
    });
  } catch (err) {
    res.status(500).json({ error: 'Purchase processing failure' });
  }
});

/* ==========================================================================
   IN-APP NOTIFICATIONS & PREFERENCES
   ========================================================================== */

// Get current user notifications
router.get('/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark single notification as read
router.put('/notifications/:id/read', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  try {
    const updated = await prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true }
    });
    res.json({ success: true, count: updated.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const updated = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true }
    });
    res.json({ success: true, count: updated.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

// Get user notification preferences
router.get('/notifications/preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId }
    });
    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { userId, inApp: true, email: false }
      });
    }
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// Update user notification preferences
router.put('/notifications/preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { inApp, email } = req.body;
  try {
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        inApp: inApp !== undefined ? Boolean(inApp) : undefined,
        email: email !== undefined ? Boolean(email) : undefined,
      },
      create: {
        userId,
        inApp: inApp !== undefined ? Boolean(inApp) : true,
        email: email !== undefined ? Boolean(email) : false,
      }
    });
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

/* ==========================================================================
   MULTI-TENANT EVENTS, TRACKS, PRIZES, SPONSORS & SCHEDULE (B1)
   ========================================================================== */

// List all public or user's events
router.get('/events', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { visibility: 'public' },
      include: {
        tracks: true,
        prizes: true,
        sponsors: true,
        schedule: { orderBy: { startTime: 'asc' } },
        organizer: { select: { id: true, name: true, email: true } },
        _count: { select: { teams: true } }
      },
      orderBy: { startDate: 'desc' }
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get event by ID or slug
router.get('/events/:idOrSlug', async (req, res) => {
  const { idOrSlug } = req.params;
  try {
    const event = await prisma.event.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }]
      },
      include: {
        tracks: true,
        prizes: { include: { track: true, sponsor: true } },
        sponsors: true,
        schedule: { orderBy: { startTime: 'asc' } },
        organizer: { select: { id: true, name: true, email: true } },
        teams: {
          select: {
            id: true,
            name: true,
            leader: { select: { name: true } },
            _count: { select: { members: true } }
          }
        }
      }
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event details' });
  }
});

// Create new event
router.post('/events', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { name, slug, description, banner, startDate, endDate, status, visibility } = req.body;
  const organizerId = req.user!.id;

  if (!name || !slug || !startDate || !endDate) {
    return res.status(400).json({ error: 'Name, slug, startDate, and endDate are required' });
  }

  try {
    const event = await prisma.event.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        description: description || '',
        banner: banner || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status || 'draft',
        visibility: visibility || 'public',
        organizerId
      },
      include: { tracks: true, prizes: true, sponsors: true, schedule: true }
    });
    res.status(201).json(event);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'An event with this slug already exists' });
    }
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/events/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, description, banner, startDate, endDate, status, visibility } = req.body;

  try {
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (existing.organizerId !== req.user!.id && req.user!.role !== 'Organizer' && req.user!.role !== 'Leader') {
      return res.status(403).json({ error: 'Forbidden: Only the event organizer can update this event' });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description : undefined,
        banner: banner !== undefined ? banner : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: status !== undefined ? status : undefined,
        visibility: visibility !== undefined ? visibility : undefined,
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Add Track to Event
router.post('/events/:id/tracks', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { id: eventId } = req.params;
  const { name, description, judgingCriteria } = req.body;

  if (!name) return res.status(400).json({ error: 'Track name is required' });

  const canManage = await canManageEvent(req.user!.id, req.user!.role, eventId);
  if (canManage === null) return res.status(404).json({ error: 'Event not found' });
  if (!canManage) return res.status(403).json({ error: 'Forbidden: only the event organizer can modify this event' });

  try {
    const track = await prisma.track.create({
      data: {
        eventId,
        name,
        description: description || '',
        judgingCriteria: typeof judgingCriteria === 'string' ? judgingCriteria : JSON.stringify(judgingCriteria || [])
      }
    });
    res.status(201).json(track);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create track' });
  }
});

// Add Prize to Event
router.post('/events/:id/prizes', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { id: eventId } = req.params;
  const { title, description, value, trackId, sponsorId } = req.body;

  if (!title) return res.status(400).json({ error: 'Prize title is required' });

  const canManage = await canManageEvent(req.user!.id, req.user!.role, eventId);
  if (canManage === null) return res.status(404).json({ error: 'Event not found' });
  if (!canManage) return res.status(403).json({ error: 'Forbidden: only the event organizer can modify this event' });

  try {
    const prize = await prisma.prize.create({
      data: {
        eventId,
        title,
        description: description || '',
        value: value || '',
        trackId: trackId || null,
        sponsorId: sponsorId || null
      }
    });
    res.status(201).json(prize);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create prize' });
  }
});

// Add Sponsor to Event
router.post('/events/:id/sponsors', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { id: eventId } = req.params;
  const { name, logo, url, tier } = req.body;

  if (!name) return res.status(400).json({ error: 'Sponsor name is required' });

  const canManage = await canManageEvent(req.user!.id, req.user!.role, eventId);
  if (canManage === null) return res.status(404).json({ error: 'Event not found' });
  if (!canManage) return res.status(403).json({ error: 'Forbidden: only the event organizer can modify this event' });

  try {
    const sponsor = await prisma.sponsor.create({
      data: {
        eventId,
        name,
        logo: logo || null,
        url: url || null,
        tier: tier || 'silver'
      }
    });
    res.status(201).json(sponsor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sponsor' });
  }
});

// Add Schedule Item to Event
router.post('/events/:id/schedule', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { id: eventId } = req.params;
  const { title, type, startTime, endTime, locationOrLink } = req.body;

  if (!title || !startTime || !endTime) {
    return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
  }

  const canManage = await canManageEvent(req.user!.id, req.user!.role, eventId);
  if (canManage === null) return res.status(404).json({ error: 'Event not found' });
  if (!canManage) return res.status(403).json({ error: 'Forbidden: only the event organizer can modify this event' });

  try {
    const scheduleItem = await prisma.scheduleItem.create({
      data: {
        eventId,
        title,
        type: type || 'workshop',
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        locationOrLink: locationOrLink || ''
      }
    });
    res.status(201).json(scheduleItem);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create schedule item' });
  }
});

export const apiRouter = router;
export default router;


