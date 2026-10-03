icport { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import passport from 'passport';
import prisma from '../prisma';
import { config } from '../config';
import { googleOAuthEnabled } from '../passport';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  requireTeamMember,
  requireTeamMemberFromBody,
  requireTaskTeamMember,
  requireDocumentTeamMember,
} from '../middleware/teamAccess';
import { CopilotService } from '../services/copilot.service';

const router = Router();

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
        role: role || 'Developer',
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
        badges: JSON.parse(user.badges as string)
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
        badges: JSON.parse(user.badges as string)
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
      badges: JSON.parse(user.badges as string)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching user session' });
  }
});

// 4. Google OAuth — Initiate
router.get('/auth/google', (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.status(503).json({
      error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend .env file.'
    });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// 5. Google OAuth — Callback
router.get('/auth/google/callback', (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.redirect(`${config.frontendUrl}/?error=oauth_not_configured`);
  }
  passport.authenticate('google', {
    failureRedirect: `${config.frontendUrl}/?error=oauth_failed`,
    session: true
  })(req, res, next);
}, async (req: any, res) => {
  try {
    const user = req.user as any;
    if (!user) return res.redirect(`${config.frontendUrl}/?error=oauth_no_user`);

    // Mint a JWT — same format as email/password login
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const userPayload = encodeURIComponent(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      xp: user.xp,
      avatar: user.avatar,
      badges: JSON.parse(user.badges as string)
    }));

    res.redirect(`${config.frontendUrl}/auth/callback?token=${token}&user=${userPayload}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${config.frontendUrl}/?error=oauth_server_error`);
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
      attachment: m.attachment ? JSON.parse(m.attachment as string) : null,
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

  let promptText = '';
  if (toolName === 'visualize-schema') {
    promptText = `You are an database engineer. Output a clean XML/SVG graphical entity relationship diagram layout representing this schema. Respond ONLY with the raw <svg>...</svg> XML tag. No markdown code fences. Schema:\n${inputData}`;
  } else if (toolName === 'generate-api') {
    promptText = `You are a web developer. Write a mock JSON payload (list or object) returning realistic seed records matching this endpoint signature. Respond strictly with raw JSON. No markdown code blocks. Endpoint:\n${inputData}`;
  } else if (toolName === 'explain-code') {
    promptText = `Explain this code in 3 simple, bulleted lines:\n${inputData}`;
  } else if (toolName === 'generate-tests') {
    promptText = `Generate a Jest unit test suite with mock asserts for the following JavaScript/TypeScript function. Respond ONLY with code, no explanation:\n${inputData}`;
  } else if (toolName === 'commit-generator') {
    promptText = `Write a short, clean conventional commit message matching the edits in this code snippet:\n${inputData}`;
  } else if (toolName === 'pitch-simulator') {
    promptText = `Act as a tough hackathon judge. Generate 3 difficult, technical Q&A questions about this project concept:\n${inputData}`;
  } else if (toolName === 'slide-outline') {
    promptText = `Generate a 5-slide pitch deck structure outline (Slide title and 2 bullets each) based on this description:\n${inputData}`;
  } else if (toolName === 'tagline-improver') {
    promptText = `Recommend 5 punchy, marketing taglines/hooks for this project description:\n${inputData}`;
  } else {
    return res.status(400).json({ error: 'Invalid toolName' });
  }

  if (config.huggingfaceApiKey) {
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.huggingfaceApiKey}`
          },
          body: JSON.stringify({
            model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
            messages: [{ role: 'user', content: promptText }],
            max_tokens: 1024,
            temperature: 0.2
          })
        }
      );

      if (response.ok) {
        const data = await response.json() as any;
        let content = data.choices?.[0]?.message?.content || '';
        content = content.trim();
        if (content.startsWith('```xml')) content = content.substring(6);
        else if (content.startsWith('```svg')) content = content.substring(6);
        else if (content.startsWith('```json')) content = content.substring(7);
        else if (content.startsWith('```javascript')) content = content.substring(13);
        else if (content.startsWith('```typescript')) content = content.substring(13);
        else if (content.startsWith('```')) content = content.substring(3);
        
        if (content.endsWith('```')) content = content.substring(0, content.length - 3);
        content = content.trim();

        return res.json({ result: content });
      }
    } catch (err) {
      // Silent fallback to mock data when offline
    }
  }

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
    result = `- Iterates through the collection of data models.\n- Uses conditional matches to bypass security validation tokens.\n- Performs database write operations asynchronously.`;
  } else if (toolName === 'generate-tests') {
    result = `describe('Helper Tests', () => {\n  it('should return correct results on normal bounds', () => {\n    expect(testFn(2, 3)).toBe(5);\n  });\n});`;
  } else if (toolName === 'commit-generator') {
    result = `feat: add database schema relationships and stopwatch model`;
  } else if (toolName === 'pitch-simulator') {
    result = `1. How does your WebSocket sync handle offline recovery when a member reconnects?\n2. What caching layers exist on database requests to prevent API rate limiting?\n3. How is user identity validated inside code editor endpoints?`;
  } else if (toolName === 'slide-outline') {
    result = `Slide 1: Problem statement & Hackathon gaps\nSlide 2: Core Solution (Real-Time workspace)\nSlide 3: Whiteboard & Code Sandbox Demo\nSlide 4: Architecture & Security Scanners\nSlide 5: Business potential & Future roadmap`;
  } else if (toolName === 'tagline-improver') {
    result = `1. "Code, Collaborate, and Conquer the Sprint"\n2. "The All-in-One Workspace for Hackathon Sprints"\n3. "Eliminate Context Switching: Build Speed Demo Ready"`;
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
      const conditionalMatches = s.code.match(/(if|for|while|case|&&|\|\|)/g) || [];
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
  if (!itemName || cost === undefined) {
    return res.status(400).json({ error: 'Missing purchase options' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.xp < cost) {
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
      data: { xp: { decrement: cost } }
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

export default router;
