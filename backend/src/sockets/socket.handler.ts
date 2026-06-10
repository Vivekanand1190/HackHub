import { Server, Socket } from 'socket.io';
import prisma from '../prisma';

interface UserPresence {
  id: string;
  name: string;
  role: string;
  socketId: string;
}

// In-memory active presence map: teamId -> Map(socketId -> UserPresence)
const activePresence = new Map<string, Map<string, UserPresence>>();

// Active screenshare presenters: teamId -> { socketId, username }
const activePresenters = new Map<string, { socketId: string; username: string }>();

// Team countdown timers: teamId -> { endTime: number, running: boolean }
const activeTimers = new Map<string, { endTime: number | null; running: boolean; duration: number }>();

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    // Join team workspace
    socket.on('join-team', async ({ teamId, userId, name, role }) => {
      socket.join(teamId);
      socket.data.teamId = teamId;
      socket.data.userId = userId;
      socket.data.name = name;
      socket.data.role = role;

      console.log(`[Socket] User ${name} (${role}) joined team workspace: ${teamId}`);

      // Initialize team presence maps
      if (!activePresence.has(teamId)) {
        activePresence.set(teamId, new Map());
      }
      activePresence.get(teamId)!.set(socket.id, { id: userId, name, role, socketId: socket.id });

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
        text: `${name} has joined the workspace.`,
        system: true,
        timestamp: new Date().toISOString()
      });
    });

    // Chat Message
    socket.on('chat-message', async (data) => {
      const { teamId, userId, text, attachment } = data;
      if (!teamId) return;

      try {
        const message = (await prisma.message.create({
          data: {
            text,
            userId,
            teamId,
            attachment: attachment ? (attachment as any) : null
          },
          include: { user: true }
        })) as any;

        io.to(teamId).emit('chat-message', {
          id: message.id,
          text: message.text,
          system: false,
          userId: message.userId,
          user: message.user ? { name: message.user.name, role: message.user.role } : null,
          attachment: message.attachment,
          timestamp: message.timestamp.toISOString()
        });
      } catch (err) {
        console.error('[Socket] Chat error:', err);
      }
    });

    // Monaco Code Update
    socket.on('code-update', (data) => {
      const { teamId, snippetId, code } = data;
      if (!teamId) return;

      // Broadcast changes to other members
      socket.to(teamId).emit('code-update', { snippetId, code });
    });

    // Document Editor Update
    socket.on('document-update', (data) => {
      const { teamId, documentId, title, content } = data;
      if (!teamId) return;

      // Broadcast changes to other members
      socket.to(teamId).emit('document-update', { documentId, title, content });
    });

    // Cursor Presence Update
    socket.on('cursor-update', (data) => {
      const { teamId, cursor } = data; // { lineNumber, column, name }
      if (!teamId) return;

      socket.to(teamId).emit('cursor-update', {
        socketId: socket.id,
        userId: socket.data.userId,
        name: socket.data.name,
        cursor
      });
    });

    // Canvas Draw actions
    socket.on('draw-action', async (data) => {
      const { teamId, action } = data;
      if (!teamId) return;

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
            data: { whiteboardData: JSON.stringify(currentActions) }
          });
        }
      } catch (err) {
        console.error('[Socket] Failed to save draw action:', err);
      }
    });

    // Clear Whiteboard
    socket.on('draw-clear', async (data) => {
      const { teamId } = data;
      if (!teamId) return;
      socket.to(teamId).emit('draw-clear');

      try {
        await prisma.team.update({
          where: { id: teamId },
          data: { whiteboardData: '[]' }
        });
      } catch (err) {
        console.error('[Socket] Failed to clear whiteboard database state:', err);
      }
    });

    // Task Board Updates
    socket.on('task-update', (data) => {
      const { teamId } = data;
      if (!teamId) return;

      // Notify clients to refresh tasks
      io.to(teamId).emit('task-update');
    });

    // Workspace Documents / Notes Update
    socket.on('document-update', (data) => {
      const { teamId, docId, content } = data;
      if (!teamId) return;

      socket.to(teamId).emit('document-update', { docId, content });
    });

    // Team Timer Management
    socket.on('timer-start', (data) => {
      const { teamId, durationMs } = data;
      if (!teamId) return;

      const timerState = {
        endTime: Date.now() + durationMs,
        running: true,
        duration: durationMs
      };
      activeTimers.set(teamId, timerState);
      io.to(teamId).emit('timer-sync', timerState);
    });

    socket.on('timer-stop', (data) => {
      const { teamId } = data;
      if (!teamId) return;

      const timerState = {
        endTime: null,
        running: false,
        duration: 0
      };
      activeTimers.set(teamId, timerState);
      io.to(teamId).emit('timer-sync', timerState);
    });

    // WebRTC Screen Sharing & Video Calls
    socket.on('screenshare-start', (data) => {
      const { teamId, username } = data;
      if (!teamId) return;

      const presenter = { socketId: socket.id, username };
      activePresenters.set(teamId, presenter);
      io.to(teamId).emit('screenshare-start', presenter);
    });

    socket.on('screenshare-stop', (data) => {
      const { teamId } = data;
      if (!teamId) return;

      activePresenters.delete(teamId);
      io.to(teamId).emit('screenshare-stop');
    });

    socket.on('webrtc-signal', (data) => {
      const { teamId, signal, to } = data;
      if (!teamId) return;

      if (to) {
        // Direct target signal relay
        io.to(to).emit('webrtc-signal', { signal, from: socket.id });
      } else {
        // Broadcast signaling
        socket.to(teamId).emit('webrtc-signal', { signal, from: socket.id });
      }
    });

    // Remote Control Relay Events
    socket.on('remote-control-request', (data) => {
      const { to, fromName } = data;
      io.to(to).emit('remote-control-request', { from: socket.id, fromName });
    });

    socket.on('remote-control-response', (data) => {
      const { to, accepted } = data;
      io.to(to).emit('remote-control-response', { from: socket.id, accepted });
    });

    socket.on('remote-control-cursor', (data) => {
      const { to, position } = data;
      io.to(to).emit('remote-control-cursor', { from: socket.id, position });
    });

    socket.on('remote-control-input', (data) => {
      const { to, inputType, eventData } = data;
      io.to(to).emit('remote-control-input', { from: socket.id, inputType, eventData });
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const { teamId, name } = socket.data;
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
          timestamp: new Date().toISOString()
        });
      }
    });
  });
}
