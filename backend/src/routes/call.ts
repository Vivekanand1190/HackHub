import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { requireTeamMember } from '../middleware/teamAccess';

/**
 * Live team calls (managed SFU: LiveKit).
 *
 * The server is the only place that knows the LiveKit API secret. Clients ask
 * for a short-lived token scoped to their team's room; they never receive the
 * secret. Room isolation is by team id (`team-<teamId>`), and the token
 * endpoint is gated by the same team-membership guard used everywhere else.
 */

const router = Router();

/** True when the LiveKit credentials are configured. */
export function liveCallsEnabled(): boolean {
  return !!(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret);
}

// Rate-limit token minting (cheap, but this is an authenticated write-ish path).
const callTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many call-token requests — please slow down.' },
});

// Mint a short-lived LiveKit access token for the caller's team room.
router.post(
  '/teams/:teamId/call/token',
  callTokenLimiter,
  authMiddleware,
  requireTeamMember(),
  async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!liveCallsEnabled()) {
      return res.status(503).json({
        error:
          'Live calls are not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the backend.',
      });
    }

    const { teamId } = req.params;
    const roomName = `team-${teamId}`;

    try {
      const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
        identity: req.user.id,
        name: req.user.name,
        ttl: '2h',
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await at.toJwt();

      // Never log or return the API secret — only the signed, short-lived token.
      return res.json({ token, url: config.livekit.url, room: roomName });
    } catch (err) {
      console.error('LiveKit token error:', err);
      return res.status(500).json({ error: 'Failed to mint call token' });
    }
  }
);

export const callRouter = router;
export default router;
