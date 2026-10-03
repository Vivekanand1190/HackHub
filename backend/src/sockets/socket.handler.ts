import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { config } from '../config';

interface UserPresence {
  id: string;
  name: string;
  role: string;
  socketId: string;
}

interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// In-memory active presence map: teamId -> Map(socketId -> UserPresence)
const activePresence = new Map<string, Map<string, UserPresence>>();

// Active screenshare presenters: teamId -> { socketId, username }
const activePresenters = new Map<string, { socketId: string; username: string }>();

// Team countdown timers: teamId -> { endTime, running, duration }
const activeTimers = new Map<string, { endTime: number | null; running: boolean; duration: number }>();

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
  // Identity is derived server-side from the token — never trusted from the client.
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
    console.log(`[Socket] New connection: ${socket.id} (${user?.name || 'unknown'})`);

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

      // Broadcast system message
      socket.to(teamId).emit('chat-message', {
        id: `sys-${Date.now()}`,
        text: `${user.name} has joined the workspace.`,
        system: true,
        timestamp: new Date().toISOString(),
      });
    });

    // Chat Message
    socket.on('chat-message', async (data) => {
      const { teamId, text, attachment } = data || {};
      if (!inTeamRoom(teamId)) return;

      try {
        const message = (await prisma.message.create({
          data: {
            text,
            userId: user.id,
            teamId,
            // The column is a JSON string — normalise objects before storing.
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
          userId: message.userId,
          user: message.user ? { name: message.user.name, role: message.user.role } : null,
          attachment: message.attachment ? JSON.parse(message.attachment) : null,
          timestamp: message.timestamp.toISOString(),
        });
      } catch (err) {
        console.error('[Socket] Chat error:', err);
      }
    });

    // Monaco Code Update
    socket.on('code-update', (data) => {
      const { teamId, snippetId, code } = data || {};
      if (!inTeamRoom(teamId)) return;

      // Broadcast changes to other members
      socket.to(teamId).emit('code-update', { snippetId, code });
    });

    // Document Editor Update
    socket.on('document-update', (data) => {
      const { teamId, documentId, title, content } = data || {};
      if (!inTeamRoom(teamId)) return;

      // Broadcast changes to other members
      socket.to(teamId).emit('document-update', { documentId, title, content });
    });

    // Cursor Presence Update
    socket.on('cursor-update', (data) => {
      const { teamId, cursor } = data || {}; // { lineNumber, column }
      if (!inTeamRoom(teamId)) return;

      socket.to(teamId).emit('cursor-update', {
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        cursor,
      });
    });

    // Canvas Draw actions
    socket.on('draw-action', async (data) => {
      const { teamId, action } = data || {};
      if (!inTeamRoom(teamId)) return;

      // Broadcast draw action (draw path, square, sticky, etc.) to others
      socket.to(teamId).emit('draw-action', action);

      // Persist in database
      try {
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (team) {
          const currentActions = JSON.parse(team.whiteboardData || '[]');

          if (action.type === 'sticky-move') {
            // Find the sticky and update its coordinates
            const idx = currentActions.findIndex((a: any) => a.id === action.id);
            if (idx !== -1) {
              currentActions[idx].x = action.x;
              currentActions[idx].y = action.y;
            }
          } else if (action.type === 'sticky-edit') {
            // Find the sticky and update text/color
            const idx = currentActions.findIndex((a: any) => a.id === action.id);
            if (idx !== -1) {
              if (action.text !== undefined) currentActions[idx].text = action.text;
              if (action.color !== undefined) currentActions[idx].color = action.color;
            }
          } else if (action.type === 'sticky-delete') {
            // Find and remove the sticky
            const idx = currentActions.findIndex((a: any) => a.id === action.id);
            if (idx !== -1) {
              currentActions.splice(idx, 1);
            }
          } else if (action.type === 'laser') {
            // Transient laser pointers are not persisted in the database
          } else {
            // Standard action, add to list
            currentActions.push(action);
          }

          await prisma.team.update({
            where: { id: teamId },
            data: { whiteboardData: JSON.stringify(currentActions) },
          });
        }
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
        await prisma.team.update({
          where: { id: teamId },
          data: { whiteboardData: '[]' },
        });
      } catch (err) {
        console.error('[Socket] Failed to clear whiteboard database state:', err);
      }
    });

    // Task Board Updates
    socket.on('task-update', (data) => {
      const { teamId } = data || {};
      if (!inTeamRoom(teamId)) return;

      // Notify clients to refresh tasks
      io.to(teamId).emit('task-update');
    });

    // Team Timer Management
    socket.on('timer-start', (data) => {
      const { teamId, durationMs } = data || {};
      if (!inTeamRoom(teamId)) return;

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
        // Direct target signal relay
        io.to(to).emit('webrtc-signal', { signal, from: socket.id });
      } else {
        // Broadcast signaling
        socket.to(teamId).emit('webrtc-signal', { signal, from: socket.id });
      }
    });

    // Remote Control Relay Events (targeted at a specific socket, not a room)
    socket.on('remote-control-request', (data) => {
      const { to, fromName } = data || {};
      if (!to) return;
      io.to(to).emit('remote-control-request', { from: socket.id, fromName: fromName || user.name });
    });

    socket.on('remote-control-response', (data) => {
      const { to, accepted } = data || {};
      if (!to) return;
      io.to(to).emit('remote-control-response', { from: socket.id, accepted });
    });

    socket.on('remote-control-cursor', (data) => {
      const { to, position } = data || {};
      if (!to) return;
      io.to(to).emit('remote-control-cursor', { from: socket.id, position });
    });

    socket.on('remote-control-input', (data) => {
      const { to, inputType, eventData } = data || {};
      if (!to) return;
      io.to(to).emit('remote-control-input', { from: socket.id, inputType, eventData });
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const { teamId } = socket.data;
      const name = user?.name;
      console.log(`[Socket] Disconnected: ${socket.id} (${name || 'unknown'})`);

      if (teamId && activePresence.has(teamId)) {
        const presenceMap = activePresence.get(teamId)!;
        presenceMap.delete(socket.id);

        if (presenceMap.size === 0) {
          activePresence.delete(teamId);
        } else {
          // Broadcast updated presence list
          io.to(teamId).emit('members-update', Array.from(presenceMap.values()));
        }

        // Check if user was the presenter
        if (activePresenters.has(teamId) && activePresenters.get(teamId)!.socketId === socket.id) {
          activePresenters.delete(teamId);
          io.to(teamId).emit('screenshare-stop');
        }

        // Broadcast leave message
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
