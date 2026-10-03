import { Response, NextFunction } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from './auth';

/**
 * Team-scoped authorization.
 *
 * `authMiddleware` only proves *who* the caller is — it says nothing about
 * which teams they may touch. Without these guards, any authenticated user
 * could read or mutate any team's data simply by knowing its id (IDOR).
 */

async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      OR: [{ leaderId: userId }, { members: { some: { id: userId } } }],
    },
    select: { id: true },
  });
  return !!team;
}

/** Requires the caller to be a member of the team id found in the route params. */
export function requireTeamMember(param = 'teamId') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const teamId = req.params[param];
    if (!teamId) return res.status(400).json({ error: 'Missing team id' });

    try {
      if (!(await isTeamMember(req.user.id, teamId))) {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      return next();
    } catch (err) {
      console.error('Team access check failed:', err);
      return res.status(500).json({ error: 'Server error verifying team access' });
    }
  };
}

/** Requires the caller to be a member of the team id found in the request body. */
export function requireTeamMemberFromBody(field = 'teamId') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const teamId = req.body?.[field];
    if (!teamId) return res.status(400).json({ error: 'Missing team id' });

    try {
      if (!(await isTeamMember(req.user.id, teamId))) {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      return next();
    } catch (err) {
      console.error('Team access check failed:', err);
      return res.status(500).json({ error: 'Server error verifying team access' });
    }
  };
}

/** Resolves a task's team from `:taskId` and requires the caller to be a member. */
export function requireTaskTeamMember() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { taskId } = req.params;
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { teamId: true },
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      if (!(await isTeamMember(req.user.id, task.teamId))) {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      return next();
    } catch (err) {
      console.error('Task access check failed:', err);
      return res.status(500).json({ error: 'Server error verifying team access' });
    }
  };
}

/**
 * Documents are created with a `teamId` in the body but updated by `id`, so
 * resolve the owning team either way before authorizing.
 */
export function requireDocumentTeamMember() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { id, teamId } = req.body || {};
    try {
      let targetTeamId: string | undefined = teamId;

      if (id) {
        const doc = await prisma.document.findUnique({
          where: { id },
          select: { teamId: true },
        });
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        targetTeamId = doc.teamId;
      }

      if (!targetTeamId) return res.status(400).json({ error: 'Missing team id' });

      if (!(await isTeamMember(req.user.id, targetTeamId))) {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      return next();
    } catch (err) {
      console.error('Document access check failed:', err);
      return res.status(500).json({ error: 'Server error verifying team access' });
    }
  };
}
