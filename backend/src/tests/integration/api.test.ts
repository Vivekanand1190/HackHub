import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teamMember: {
    findFirst: jest.fn(),
  },
  codeSnippet: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  }
};

jest.mock('../../prisma', () => ({
  __esModule: true,
  default: mockPrisma
}));

import prisma from '../../prisma';
import { app } from '../../app';
import { config } from '../../config';

describe('Integration Tests: API Endpoints', () => {
  const validToken = jwt.sign(
    { id: 'test-user-id', email: 'test@example.com', role: 'MEMBER', name: 'Test User' },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: 'team-123' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      xp: 500,
      role: 'MEMBER',
      teams: [{ id: 'team-123', name: 'Test Team', joinCode: 'TEST12', createdAt: new Date().toISOString() }]
    });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({
      id: 'team-123',
      name: 'Test Team',
      joinCode: 'TEST12',
      createdAt: new Date(),
      githubRepo: 'owner/repo',
      members: [{ id: 'test-user-id', name: 'Test User', role: 'MEMBER', xp: 500 }],
      snippets: [],
      tasks: [],
      copilotState: JSON.stringify({ judgeEvaluations: [], readinessScore: 85 })
    });
    (prisma.codeSnippet.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.codeSnippet.findUnique as jest.Mock).mockResolvedValue({
      id: 'snip-1',
      teamId: 'team-123',
      code: 'console.log("test")',
      title: 'index.js'
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 OK with status active', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/teams', () => {
    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app).get('/api/teams');
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden when an invalid token is provided', async () => {
      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', 'Bearer invalid.token.here');
      expect([401, 403]).toContain(res.status);
    });

    it('should return user teams when a valid token is provided', async () => {
      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/sandbox/execute', () => {
    it('should execute javascript code in sandbox environment', async () => {
      const res = await request(app)
        .post('/api/sandbox/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'javascript', code: 'console.log("Hello from sandbox test!");' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.logs.join('\n')).toContain('Hello from sandbox test!');
    });

    it('should handle runtime errors in sandbox gracefully', async () => {
      const res = await request(app)
        .post('/api/sandbox/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'javascript', code: 'throw new Error("Sandbox error test");' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Sandbox error test');
    });
  });

  describe('Team Endpoints Authentication & Authorization', () => {
    const teamId = 'team-123';

    it('should block unauthenticated requests to GitHub summary', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/github/summary`);
      expect([401, 403]).toContain(res.status);
    });

    it('should allow authenticated request to GitHub summary', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/github/summary`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('repo');
      expect(res.body).toHaveProperty('recentCommits');
    });

    it('should allow authenticated request to Judge Score', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/judge/score`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('teamId', teamId);
    });

    it('should allow authenticated request to ZIP export', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/export/zip`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
    });

    it('should allow authenticated request to Team Polls', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/polls`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should allow authenticated request to Leaderboard', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/leaderboard`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('leaderboard');
    });

    it('should allow authenticated request to Third-Party Integrations', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/integrations`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(200);
    });
  });
});
