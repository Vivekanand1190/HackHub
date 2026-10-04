import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { config } from '../config';

interface UserPresence {
  id: string;
  name: string;
  role: string;
  socketId: string;
  color?: string;
}

interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface HuddleMember {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  color: string;
  audioMuted: boolean;
  videoOff: boolean;
  isSpeaking: boolean;
}

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

const ACCENT_COLORS = ['#ffe500', '#ff4d8d', '#4d7cff', '#b8ff3c', '#a78bfa', '#ff9f43', '#00d2d3', '#ff6b6b'];

function getUserColor(userId: string): string {
  if (!userId) return ACCENT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

// In-memory active presence map: teamId -> Map(socketId -> UserPresence)
const activePresence = new Map<string, Map<string, UserPresence>>();

// Active screenshare presenters: teamId -> { socketId, username }
const activePresenters = new Map<string, { socketId: string; username: string }>();

// Team countdown timers: teamId -> { endTime, running, duration }
const activeTimers = new Map<string, { endTime: number | null; running: boolean; duration: number }>();

// Team voice/video huddle presence: teamId -> Map(socketId -> HuddleMember)
const activeHuddles = new Map<string, Map<string, HuddleMember>>();

// Team video-call presence: teamId -> Set of socket ids currently in the call.
// The call itself is a LiveKit room; this only mirrors the count for the UI.
const activeCalls = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Whiteboard state.
//
// The board used to be read-modify-written in full for every single stroke:
// findUnique the team, parse the whole array, push, then update the whole array
// again. Two people drawing at once each read the same snapshot, and the later
// write silently discarded the other's strokes. Because every pointer move is
// one action, the cost also grew with the size of the drawing.
//
// The board is now held in memory as the source of truth, loaded once per team
// from the database, mutated in place, and flushed through a per-team
// serialised write chain so writes can never interleave.
// ---------------------------------------------------------------------------
const whiteboardState = new Map<string, any[]>();
const whiteboardWrites = new Map<string, Promise<unknown>>();
const WHITEBOARD_MAX_ACTIONS = 5000;

async function loadWhiteboard(teamId: string): Promise<any[]> {
  const cached = whiteboardState.get(teamId);
  if (cached) return cached;

  let actions: any[] = [];
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { whiteboardData: true },
    });
    const parsed = JSON.parse(team?.whiteboardData || '[]');
    if (Array.isArray(parsed)) actions = parsed;
  } catch (err) {
    console.error('[Socket] Failed to load whiteboard, starting empty:', err);
  }

  whiteboardState.set(teamId, actions);
  return actions;
}

/** Queue a database write for a team's board, never overlapping the previous one. */
function persistWhiteboard(teamId: string) {
  const previous = whiteboardWrites.get(teamId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const actions = whiteboardState.get(teamId) ?? [];
      await prisma.team.update({
        where: { id: teamId },
        data: { whiteboardData: JSON.stringify(actions) },
      });
    })
    .catch((err) => {
      console.error('[Socket] Failed to persist whiteboard:', err);
    });
  whiteboardWrites.set(teamId, next);
}

/** Apply one draw action to a board array, in place. */
function applyWhiteboardAction(actions: any[], action: any) {
  const idx = action.id ? actions.findIndex((a: any) => a.id === action.id) : -1;

  switch (action.type) {
    case 'sticky-move':
      if (idx !== -1) actions[idx] = { ...actions[idx], x: action.x, y: action.y };
      return;
    case 'sticky-edit':
      if (idx !== -1) {
        actions[idx] = {
          ...actions[idx],
          ...(action.text !== undefined ? { text: action.text } : {}),
          ...(action.color !== undefined ? { color: action.color } : {}),
        };
      }
      return;
    case 'sticky-delete':
      if (idx !== -1) actions.splice(idx, 1);
      return;
    case 'laser':
      // Transient laser pointers are never persisted.
      return;
    default:
      // Skip a replayed action we already hold, and stop the board growing
      // without bound.
      if (idx === -1 && actions.length < WHITEBOARD_MAX_ACTIONS) actions.push(action);
  }
}

function broadcastCallPresence(io: Server, teamId: string) {
  const set = activeCalls.get(teamId);
  const participantCount = set ? set.size : 0;
  io.to(teamId).emit('call-presence', { callActive: participantCount > 0, participantCount });
}

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

export function registerSocketHandlers(io: Server) {
  // Authenticate every connection with the same JWT the REST API uses.
  io.use((socket: Socket, next) => {
    try {
      const header = socket.handshake.headers.authorization;
      const bearer = header && header.startsWith('Bearer ') ? header.split(' ')[1] : undefined;
      const token = (socket.handshake.auth?.token as string) || bearer;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      socket.data.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      } as AuthedUser;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthedUser;
    if (!user) {
      socket.disconnect();
      return;
    }

    console.log(`[Socket] New connection: ${socket.id} (${user.name})`);

    // Only allow events scoped to the room this socket actually joined.
    const inTeamRoom = (teamId?: string) => !!teamId && socket.data.teamId === teamId;

    // Join team workspace
    socket.on('join-team', async ({ teamId }: { teamId?: string }) => {
      if (!teamId) return;

      try {
        if (!(await isTeamMember(user.id, teamId))) {
          socket.emit('team-access-denied', { teamId });
          return;
        }
      } catch (err) {
        console.error('[Socket] Membership check failed:', err);
        socket.emit('team-access-denied', { teamId });
        return;
      }

      socket.join(teamId);
      socket.data.teamId = teamId;

      // Initialize team presence maps
      if (!activePresence.has(teamId)) {
        activePresence.set(teamId, new Map());
      }
      activePresence.get(teamId)!.set(socket.id, {
        id: user.id,
        name: user.name,
        role: user.role,
        socketId: socket.id,
        color: getUserColor(user.id),
      });

      // Broadcast updated member list to the team
      const members = Array.from(activePresence.get(teamId)!.values());
      io.to(teamId).emit('members-update', members);

      // Send active screenshare presenter if exists
      if (activePresenters.has(teamId)) {
        socket.emit('screenshare-start', activePresenters.get(teamId));
      }

      // Send current timer if exists
      if (activeTimers.has(teamId)) {
        socket.emit('timer-sync', activeTimers.get(teamId));
      }

      // Send current call presence if a call is already live
      {
        const set = activeCalls.get(teamId);
        const participantCount = set ? set.size : 0;
        socket.emit('call-presence', { callActive: participantCount > 0, participantCount });
      }

      // Broadcast system message
      socket.to(teamId).emit('chat-message', {
        id: `sys-${Date.now()}`,
        text: `${user.name} has joined the workspace.`,
        system: true,
        timestamp: new Date().toISOString(),
      });
    });

    // Chat Message (including threaded replies and @mention notifications)
    socket.on('chat-message', async (data) => {
      const { teamId, text, attachment, parentId, channel } = data || {};
      if (!inTeamRoom(teamId) || !text) return;

      try {
        const message = (await prisma.message.create({
          data: {
            text,
            userId: user.id,
            teamId,
            channel: channel || 'general',
            parentId: parentId || null,
            attachment:
              attachment === undefined || attachment === null
                ? null
                : typeof attachment === 'string'
                  ? attachment
                  : JSON.stringify(attachment),
          },
          include: { user: true },
        })) as any;

        io.to(teamId).emit('chat-message', {
          id: message.id,
          text: message.text,
          system: false,
          channel: message.channel || 'general',
          parentId: message.parentId,
          userId: message.userId,
          user: message.user ? { name: message.user.name, role: message.user.role } : null,
          attachment: parseMaybeJson(message.attachment),
          reactions: {},
          timestamp: message.timestamp.toISOString(),
        });

        // Trigger @mention notifications if text contains @UserName
        const mentionMatches = text.match(/@([A-Za-z0-9_]+)/g);
        if (mentionMatches && mentionMatches.length > 0) {
          const mentionedNames = mentionMatches.map((m: string) => m.slice(1));
          const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: { members: true, leader: true }
          });

          if (team) {
            // The leader is usually also a member, so de-duplicate by id.
            const allMembers = [team.leader, ...team.members].filter(Boolean) as Array<{ id: string; name: string }>;
            const seen = new Set<string>();

            for (const member of allMembers) {
              if (seen.has(member.id) || member.id === user.id) continue;
              seen.add(member.id);

              if (mentionedNames.some((name: string) => name.toLowerCase() === member.name.toLowerCase())) {
                const notif = await prisma.notification.create({
                  data: {
                    userId: member.id,
                    type: 'mention',
                    actorName: user.name,
                    title: `Mentioned by ${user.name}`,
                    body: `${user.name}: "${text.slice(0, 80)}"`,
                    targetUrl: `/workspace/${teamId}`,
                  }
                });
                // A mention is for ONE person. Broadcasting it to the room told
                // everybody they had been mentioned.
                for (const client of io.sockets.sockets.values()) {
                  if (client.data.user?.id === member.id) client.emit('notification:new', notif);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[Socket] Chat error:', err);
      }
    });

    // Chat Edit
    socket.on('chat-edit', async (data) => {
      const { teamId, messageId, text } = data || {};
      if (!inTeamRoom(teamId) || !messageId || !text) return;

      try {
        const existing = await prisma.message.findUnique({
          where: { id: messageId },
          select: { userId: true, teamId: true },
        });
        // The message must belong to the room this socket actually joined,
        // otherwise a leader of one team could edit another team's messages.
        if (existing && existing.teamId === teamId && (existing.userId === user.id || user.role === 'Leader')) {
          const updated = await prisma.message.update({
            where: { id: messageId },
            data: { text, editedAt: new Date() },
          });

          io.to(teamId).emit('chat-edit', {
            messageId,
            text: updated.text,
            editedAt: updated.editedAt?.toISOString(),
          });
        }
      } catch (err) {
        console.error('[Socket] Chat edit error:', err);
      }
    });

    // Chat Delete
    socket.on('chat-delete', async (data) => {
      const { teamId, messageId } = data || {};
      if (!inTeamRoom(teamId) || !messageId) return;

      try {
        const existing = await prisma.message.findUnique({
          where: { id: messageId },
          select: { userId: true, teamId: true },
        });
        if (existing && existing.teamId === teamId && (existing.userId === user.id || user.role === 'Leader')) {
          // Replies hang off the parent, so remove the thread along with it.
          await prisma.message.deleteMany({ where: { parentId: messageId } });
          await prisma.message.delete({ where: { id: messageId } });
          io.to(teamId).emit('chat-delete', { messageId });
        }
      } catch (err) {
        console.error('[Socket] Chat delete error:', err);
      }
    });

    // Chat Reaction — persisted on the message, then broadcast authoritatively.
    socket.on('chat-reaction', async (data) => {
      const { teamId, messageId, emoji } = data || {};
      if (!inTeamRoom(teamId) || !messageId || !emoji || typeof emoji !== 'string') return;

      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, teamId: true, reactions: true },
        });
        if (!message || message.teamId !== teamId) return;

        // Never trust a client-supplied name — attribute to the authenticated user.
        const reactions = parseMaybeJson(message.reactions) || {};
        const users: string[] = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
        const alreadyReacted = users.includes(user.name);
        const updatedUsers = alreadyReacted
          ? users.filter((u) => u !== user.name)
          : [...users, user.name];

        if (updatedUsers.length > 0) reactions[emoji] = updatedUsers;
        else delete reactions[emoji];

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { reactions: JSON.stringify(reactions) },
        });

        // Send the whole map for this message so every client converges on the
        // same state instead of each toggling independently.
        io.to(teamId).emit('chat-reaction', {
          messageId,
          reactions: parseMaybeJson(updated.reactions) || {},
        });
      } catch (err) {
        console.error('[Socket] Chat reaction error:', err);
      }
    });

    // Chat Pin / Unpin — persisted so pins survive a reload.
    socket.on('chat-pin', async (data) => {
      const { teamId, messageId, isPinned } = data || {};
      if (!inTeamRoom(teamId) || !messageId) return;

      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, teamId: true, text: true, attachment: true, user: { select: { name: true } } },
        });
        if (!message || message.teamId !== teamId) return;

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { pinned: Boolean(isPinned) },
        });

        io.to(teamId).emit('chat-pin', {
          messageId,
          isPinned: updated.pinned,
          text: updated.text || (updated.attachment ? 'File attachment' : 'Message'),
          author: message.user?.name || 'Teammate',
        });
      } catch (err) {
        console.error('[Socket] Chat pin error:', err);
      }
    });

    // Monaco Code Update
    socket.on('code-update', (data) => {
      const { teamId, snippetId, code } = data || {};
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('code-update', { snippetId, code });
    });

    // Document Editor Update
    socket.on('document-update', (data) => {
      const { teamId, documentId, title, content } = data || {};
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('document-update', { documentId, title, content });
    });

    // Cursor Presence Update (Legacy & Code Editor)
    socket.on('cursor-update', (data) => {
      const { teamId, cursor } = data || {};
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('cursor-update', {
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        color: getUserColor(user.id),
        cursor,
      });
    });

    // Realtime Multi-User Cursor & Selection Broadcast
    socket.on('cursor-move', (data) => {
      const { teamId, target, x, y, line, col, selection } = data || {};
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('cursor-move', {
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        color: getUserColor(user.id),
        target: target || 'whiteboard',
        x,
        y,
        line,
        col,
        selection,
      });
    });

    socket.on('cursor-leave', (data) => {
      const { teamId, target } = data || {};
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('cursor-remove', {
        socketId: socket.id,
        userId: user.id,
        target,
      });
    });

    // Canvas Draw actions
    socket.on('draw-action', async (data) => {
      const { teamId, action } = data || {};
      if (!inTeamRoom(teamId) || !action || typeof action !== 'object') return;

      socket.to(teamId).emit('draw-action', action);

      try {
        const actions = await loadWhiteboard(teamId);
        applyWhiteboardAction(actions, action);
        persistWhiteboard(teamId);
      } catch (err) {
        console.error('[Socket] Failed to save draw action:', err);
      }
    });

    // Clear Whiteboard
    socket.on('draw-clear', async (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;
      socket.to(teamId).emit('draw-clear');

      try {
        whiteboardState.set(teamId, []);
        persistWhiteboard(teamId);
      } catch (err) {
        console.error('[Socket] Failed to clear whiteboard database state:', err);
      }
    });

    // Task Board Updates
    socket.on('task-update', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      io.to(teamId).emit('task-update');
    });

    // Team Timer Management
    socket.on('timer-start', (data) => {
      const { teamId, durationMs } = data || {};
      if (!inTeamRoom(teamId) || !durationMs) return;

      const timerState = {
        endTime: Date.now() + durationMs,
        running: true,
        duration: durationMs,
      };
      activeTimers.set(teamId, timerState);
      io.to(teamId).emit('timer-sync', timerState);
    });

    socket.on('timer-stop', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      const timerState = {
        endTime: null,
        running: false,
        duration: 0,
      };
      activeTimers.set(teamId, timerState);
      io.to(teamId).emit('timer-sync', timerState);
    });

    // WebRTC Screen Sharing & Video Calls
    socket.on('screenshare-start', (data) => {
      const { teamId, username } = data || {};
      if (!inTeamRoom(teamId)) return;

      const presenter = { socketId: socket.id, username: username || user.name };
      activePresenters.set(teamId, presenter);
      io.to(teamId).emit('screenshare-start', presenter);
    });

    socket.on('screenshare-stop', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      activePresenters.delete(teamId);
      io.to(teamId).emit('screenshare-stop');
    });

    socket.on('webrtc-signal', (data) => {
      const { teamId, signal, to } = data || {};
      if (!inTeamRoom(teamId)) return;

      if (to) {
        // Only relay to a socket that is actually in this team's room.
        const target = io.sockets.sockets.get(to);
        if (!target || target.data.teamId !== teamId) return;
        io.to(to).emit('webrtc-signal', { signal, from: socket.id });
      } else {
        socket.to(teamId).emit('webrtc-signal', { signal, from: socket.id });
      }
    });

    // Remote Control Relay Events
    // Relay to another socket ONLY if that socket is in the same team room —
    // otherwise any authenticated user could target any socket on the server.
    const relayToTeammate = (
      teamId: string | undefined,
      to: string | undefined,
      event: string,
      payload: Record<string, unknown>
    ) => {
      if (!inTeamRoom(teamId) || !to) return;
      const target = io.sockets.sockets.get(to);
      if (!target || target.data.teamId !== teamId) return;
      io.to(to).emit(event, { ...payload, from: socket.id });
    };

    socket.on('remote-control-request', (data) => {
      const { teamId, to, fromName } = data || {};
      relayToTeammate(teamId, to, 'remote-control-request', { fromName: fromName || user.name });
    });

    socket.on('remote-control-response', (data) => {
      const { teamId, to, accepted } = data || {};
      relayToTeammate(teamId, to, 'remote-control-response', { accepted });
    });

    socket.on('remote-control-cursor', (data) => {
      const { teamId, to, position } = data || {};
      relayToTeammate(teamId, to, 'remote-control-cursor', { position });
    });

    socket.on('remote-control-input', (data) => {
      const { teamId, to, inputType, eventData } = data || {};
      relayToTeammate(teamId, to, 'remote-control-input', { inputType, eventData });
    });

    // Voice / Video Huddle Handlers
    socket.on('huddle-join', (data) => {
      const { teamId, audioMuted, videoOff } = data || {};
      if (!inTeamRoom(teamId)) return;

      if (!activeHuddles.has(teamId)) {
        activeHuddles.set(teamId, new Map());
      }
      activeHuddles.get(teamId)!.set(socket.id, {
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        role: user.role,
        color: getUserColor(user.id),
        audioMuted: !!audioMuted,
        videoOff: !!videoOff,
        isSpeaking: false,
      });

      const members = Array.from(activeHuddles.get(teamId)!.values());
      io.to(teamId).emit('huddle-update', members);

      socket.to(teamId).emit('chat-message', {
        id: `sys-${Date.now()}`,
        text: `🎧 ${user.name} joined the voice/video huddle.`,
        system: true,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('huddle-state-toggle', (data) => {
      const { teamId, audioMuted, videoOff, isSpeaking } = data || {};
      if (!inTeamRoom(teamId)) return;

      if (activeHuddles.has(teamId) && activeHuddles.get(teamId)!.has(socket.id)) {
        const member = activeHuddles.get(teamId)!.get(socket.id)!;
        if (audioMuted !== undefined) member.audioMuted = audioMuted;
        if (videoOff !== undefined) member.videoOff = videoOff;
        if (isSpeaking !== undefined) member.isSpeaking = isSpeaking;

        const members = Array.from(activeHuddles.get(teamId)!.values());
        io.to(teamId).emit('huddle-update', members);
      }
    });

    socket.on('huddle-leave', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      if (activeHuddles.has(teamId)) {
        const huddleMap = activeHuddles.get(teamId)!;
        huddleMap.delete(socket.id);
        if (huddleMap.size === 0) {
          activeHuddles.delete(teamId);
        }
        const members = Array.from(activeHuddles.get(teamId)?.values() || []);
        io.to(teamId).emit('huddle-update', members);
      }
    });

    // Team video-call presence (mirrors the LiveKit room membership count)
    socket.on('call-join', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      if (!activeCalls.has(teamId)) activeCalls.set(teamId, new Set());
      activeCalls.get(teamId)!.add(socket.id);
      broadcastCallPresence(io, teamId);
    });

    socket.on('call-leave', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      const set = activeCalls.get(teamId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) activeCalls.delete(teamId);
      }
      broadcastCallPresence(io, teamId);
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const { teamId } = socket.data;
      const name = user?.name;
      console.log(`[Socket] Disconnected: ${socket.id} (${name || 'unknown'})`);

      if (teamId && activeHuddles.has(teamId)) {
        const huddleMap = activeHuddles.get(teamId)!;
        huddleMap.delete(socket.id);
        if (huddleMap.size === 0) {
          activeHuddles.delete(teamId);
        } else {
          io.to(teamId).emit('huddle-update', Array.from(huddleMap.values()));
        }
      }

      if (teamId) {
        const callSet = activeCalls.get(teamId);
        if (callSet) {
          callSet.delete(socket.id);
          if (callSet.size === 0) activeCalls.delete(teamId);
          broadcastCallPresence(io, teamId);
        }
      }

      if (teamId && activePresence.has(teamId)) {
        const presenceMap = activePresence.get(teamId)!;
        presenceMap.delete(socket.id);

        if (presenceMap.size === 0) {
          activePresence.delete(teamId);
        } else {
          io.to(teamId).emit('members-update', Array.from(presenceMap.values()));
        }

        if (activePresenters.has(teamId) && activePresenters.get(teamId)!.socketId === socket.id) {
          activePresenters.delete(teamId);
          io.to(teamId).emit('screenshare-stop');
        }

        io.to(teamId).emit('chat-message', {
          id: `sys-${Date.now()}`,
          text: `${name || 'A user'} has left the workspace.`,
          system: true,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });
}
