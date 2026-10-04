import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, 
  MonitorOff, 
  MousePointer, 
  Terminal, 
  Play, 
  StopCircle, 
  AlertCircle, 
  Loader2, 
  Activity, 
  Wifi, 
  User, 
  CheckCircle2, 
  X,
  Keyboard,
  Maximize2,
  ChevronRight
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface ScreenSharePanelProps {
  socket: Socket | null;
  teamId: string;
  user: { id: string; name: string; role: string } | null;
}

export default function ScreenSharePanel({ socket, teamId, user }: ScreenSharePanelProps) {
  const [sharing, setSharing] = useState(false);
  const [shareType, setShareType] = useState<'full' | 'half'>('full');
  
  // Presenter details: socketId, username, shareType
  const [presenter, setPresenter] = useState<{ socketId: string; username: string; shareType?: 'full' | 'half' } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Remote Control state
  const [remoteControlAllowed, setRemoteControlAllowed] = useState(true);
  const [controlRequest, setControlRequest] = useState<{ fromSocketId: string; fromName: string } | null>(null);
  const [controllingUser, setControllingUser] = useState<string | null>(null); // name of user currently controlling
  const [controllingSocketId, setControllingSocketId] = useState<string | null>(null);
  const [isControlling, setIsControlling] = useState(false); // am I controlling the presenter?
  
  // Remote logs and actions
  const [actionLogs, setActionLogs] = useState<string[]>(['System: Remote Desktop session ready.']);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [remoteTerminalOutput, setRemoteTerminalOutput] = useState<string[]>([
    'HackHub OS v1.0.0 (x86_64-node-sandbox)',
    'Type commands to execute on the presenter\'s shell...'
  ]);

  // Cursors presence
  const [remoteCursor, setRemoteCursor] = useState<{ x: number; y: number; name: string } | null>(null);
  const [clickRipples, setClickRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Render stream in video element when stream state is set
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Sync initial presenter status
  useEffect(() => {
    if (!socket) return;

    // Listen to screenshare events
    socket.on('screenshare-start', (data: { socketId: string; username: string; shareType?: 'full' | 'half' }) => {
      setPresenter(data);
      setActionLogs(prev => [...prev, `System: ${data.username} started sharing their screen.`]);
    });

    socket.on('screenshare-stop', () => {
      setPresenter(null);
      setControllingUser(null);
      setControllingSocketId(null);
      setIsControlling(false);
      setRemoteCursor(null);
      setActionLogs(prev => [...prev, 'System: Screenshare session terminated.']);
    });

    // Remote Control Requests
    socket.on('remote-control-request', (data: { from: string; fromName: string }) => {
      if (remoteControlAllowed) {
        setControlRequest({ fromSocketId: data.from, fromName: data.fromName });
      } else {
        // Auto-deny if disallowed
        socket.emit('remote-control-response', { to: data.from, accepted: false });
      }
    });

    socket.on('remote-control-response', (data: { from: string; accepted: boolean }) => {
      if (data.accepted) {
        setIsControlling(true);
        setActionLogs(prev => [...prev, 'System: Remote control access GRANTED. You are now controlling their screen.']);
      } else {
        setActionLogs(prev => [...prev, 'System: Remote control access DENIED by the presenter.']);
        alert('Presenter denied your remote control request.');
      }
    });

    // Remote cursor positions
    socket.on('remote-control-cursor', (data: { from: string; position: { x: number; y: number } }) => {
      if (presenter && presenter.socketId === socket.id) {
        // Show cursor locally
        setRemoteCursor({
          x: data.position.x,
          y: data.position.y,
          name: controllingUser || 'Remote Controller'
        });
      }
    });

    // Remote control inputs (clicks / terminal commands)
    socket.on('remote-control-input', (data: { from: string; inputType: 'click' | 'terminal'; eventData: any }) => {
      if (data.inputType === 'click') {
        const { x, y } = data.eventData;
        
        // Trigger ripple effect locally for the presenter to see where controller clicked
        const id = Date.now();
        setClickRipples(prev => [...prev, { x, y, id }]);
        setActionLogs(prev => [...prev, `Click: Received remote click at (${Math.round(x * 100)}%, ${Math.round(y * 100)}%)`]);
        
        setTimeout(() => {
          setClickRipples(prev => prev.filter(r => r.id !== id));
        }, 1000);
      } else if (data.inputType === 'terminal') {
        const { command } = data.eventData;
        setActionLogs(prev => [...prev, `Terminal: Executing remote command '${command}'`]);
        runMockCommandLocally(command);
      }
    });

    return () => {
      socket.off('screenshare-start');
      socket.off('screenshare-stop');
      socket.off('remote-control-request');
      socket.off('remote-control-response');
      socket.off('remote-control-cursor');
      socket.off('remote-control-input');
    };
  }, [socket, remoteControlAllowed, presenter, controllingUser]);

  // Request actual screen stream using MediaDevices API
  const handleStartShare = async () => {
    try {
      setSharing(true);
      const captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: shareType === 'full' ? 'monitor' : 'window'
        },
        audio: false
      });

      setStream(captureStream);
      if (videoRef.current) {
        videoRef.current.srcObject = captureStream;
      }

      // Track stream termination via browser's overlay UI stop sharing button
      captureStream.getVideoTracks()[0].onended = () => {
        handleStopShare();
      };

      // Notify team members
      socket?.emit('screenshare-start', {
        teamId,
        username: user?.name || 'Hacker',
        shareType
      });

      // Mirror state
      setPresenter({
        socketId: socket?.id || 'me',
        username: user?.name || 'Me',
        shareType
      });

      setActionLogs(prev => [...prev, `Local: Started sharing ${shareType} screen.`]);
    } catch (err) {
      console.warn('Real screen share denied/failed, falling back to mock screenshare', err);
      
      // Fallback: Mock desktop screen
      setStream(null);
      setPresenter({
        socketId: socket?.id || 'me',
        username: user?.name || 'Me',
        shareType
      });

      socket?.emit('screenshare-start', {
        teamId,
        username: user?.name || 'Hacker',
        shareType
      });

      setActionLogs(prev => [...prev, `Local: Started sharing mock ${shareType} screen.`]);
    }
  };

  const handleStopShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    socket?.emit('screenshare-stop', { teamId });
    setPresenter(null);
    setSharing(false);
    setControllingUser(null);
    setControllingSocketId(null);
    setIsControlling(false);
    setRemoteCursor(null);
    setActionLogs(prev => [...prev, 'Local: Stopped screenshare session.']);
  };

  // Request Remote Control of the active presenter
  const requestRemoteControl = () => {
    if (!presenter) return;
    setActionLogs(prev => [...prev, `Request: Asking ${presenter.username} for remote control permission...`]);
    socket?.emit('remote-control-request', {
      teamId,
      to: presenter.socketId,
      fromName: user?.name || 'Hacker'
    });
  };

  // Grant Remote Control Access
  const acceptControlRequest = () => {
    if (!controlRequest) return;
    
    setControllingUser(controlRequest.fromName);
    setControllingSocketId(controlRequest.fromSocketId);
    
    socket?.emit('remote-control-response', {
      teamId,
      to: controlRequest.fromSocketId,
      accepted: true
    });
    
    setActionLogs(prev => [...prev, `Grant: Control request accepted for ${controlRequest.fromName}`]);
    setControlRequest(null);
  };

  // Deny Remote Control Access
  const denyControlRequest = () => {
    if (!controlRequest) return;
    
    socket?.emit('remote-control-response', {
      teamId,
      to: controlRequest.fromSocketId,
      accepted: false
    });
    
    setActionLogs(prev => [...prev, `Deny: Control request rejected for ${controlRequest.fromName}`]);
    setControlRequest(null);
  };

  // Revoke current controller's access
  const revokeControl = () => {
    if (!controllingSocketId) return;
    
    socket?.emit('remote-control-input', {
      teamId,
      to: controllingSocketId,
      inputType: 'terminal',
      eventData: { command: 'exit' }
    });
    
    setActionLogs(prev => [...prev, `Revoke: Stopped control access for ${controllingUser}`]);
    setControllingUser(null);
    setControllingSocketId(null);
    setRemoteCursor(null);
  };

  // Controller sending cursor coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isControlling || !presenter || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    socket?.emit('remote-control-cursor', {
      teamId,
      to: presenter.socketId,
      position: { x, y }
    });
  };

  // Controller sending click inputs
  const handleViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isControlling || !presenter || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    socket?.emit('remote-control-input', {
      teamId,
      to: presenter.socketId,
      inputType: 'click',
      eventData: { x, y }
    });

    setActionLogs(prev => [...prev, `Click: Sent mouse click to remote system at (${Math.round(x*100)}%, ${Math.round(y*100)}%)`]);
  };

  // Controller sending remote shell command
  const sendTerminalCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalCommand.trim() || !presenter) return;

    socket?.emit('remote-control-input', {
      teamId,
      to: presenter.socketId,
      inputType: 'terminal',
      eventData: { command: terminalCommand.trim() }
    });

    setActionLogs(prev => [...prev, `Terminal: Sent command '${terminalCommand}'`]);
    setTerminalCommand('');
  };

  // Execute terminal inputs on presenter side (or simulated client CLI)
  const runMockCommandLocally = (command: string) => {
    setRemoteTerminalOutput(prev => [...prev, `$ ${command}`]);
    
    setTimeout(() => {
      let response: string[] = [];
      const cleanCmd = command.toLowerCase().trim();

      if (cleanCmd === 'npm run dev' || cleanCmd === 'npm start') {
        response = [
          'Ready on http://localhost:3000',
          '▲ Next.js 16.2.7',
          '- Local: http://localhost:3000',
          '- Network: http://localhost:192.168.1.15:3000',
          '⚡ Compilation successful in 850ms.'
        ];
      } else if (cleanCmd === 'git status') {
        response = [
          'On branch main',
          'Your branch is up to date with \'origin/main\'.',
          'Changes not staged for commit:',
          '  (use "git add <file>..." to update what will be committed)',
          '  modified:   src/app/workspace/page.tsx',
          '  modified:   src/components/ScreenSharePanel.tsx',
          'no changes added to commit (use "git add" and/or "git commit -a")'
        ];
      } else if (cleanCmd === 'docker-compose up' || cleanCmd === 'docker up') {
        response = [
          'Creating network "hackhub_default" with the default driver',
          'Creating volume "hackhub_db_data" with local driver',
          'Creating postgres_container ... done',
          'Creating redis_container    ... done',
          'Creating hackhub_backend     ... done',
          'Attaching to postgres_container, redis_container, hackhub_backend',
          'postgres_container  | database system is ready to accept connections',
          'hackhub_backend     | Server running on port 8888'
        ];
      } else if (cleanCmd.startsWith('cat') || cleanCmd.startsWith('ls')) {
        response = [
          'ls: displaying working directory tree',
          '├── package.json',
          '├── tsconfig.json',
          '├── src',
          '│   ├── app',
          '│   ├── components',
          '│   └── utils'
        ];
      } else if (cleanCmd === 'exit') {
        response = ['Closing remote shell connection...'];
        setControllingUser(null);
        setControllingSocketId(null);
        setRemoteCursor(null);
      } else {
        response = [
          `bash: command not found: ${command.split(' ')[0]}`,
          'Try typing: "npm run dev", "git status", "ls", or "docker-compose up"'
        ];
      }

      setRemoteTerminalOutput(prev => [...prev, ...response]);
    }, 500);
  };

  return (
    <div className="grid grid-cols-12 gap-5 h-[80vh]">
      {/* Remote Sessions Controller Sidebar */}
      <aside className="col-span-3 glass-panel p-4 rounded-2xl border-slate-800 flex flex-col justify-between h-full bg-slate-950/20">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-900">
            <Wifi className="h-4.5 w-4.5 text-indigo-400 animate-pulse" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">Share &amp; Control Hub</h3>
          </div>

          {/* Local Presenter Configuration */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] uppercase font-bold text-slate-500">Local Share settings</span>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setShareType('full')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  shareType === 'full' 
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' 
                    : 'border-slate-800 bg-slate-900/10 text-slate-400 hover:border-slate-700'
                }`}
              >
                Full Screen
              </button>
              <button 
                onClick={() => setShareType('half')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  shareType === 'half' 
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' 
                    : 'border-slate-800 bg-slate-900/10 text-slate-400 hover:border-slate-700'
                }`}
              >
                Half Screen
              </button>
            </div>

            {!sharing ? (
              <button
                onClick={handleStartShare}
                disabled={presenter !== null}
                className="w-full glass-button text-xs py-2! flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50"
              >
                <Monitor className="h-4 w-4" /> Start Screen Share
              </button>
            ) : (
              <button
                onClick={handleStopShare}
                className="w-full py-2 bg-rose-500 hover:bg-rose-600 border border-rose-600 rounded-lg text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <StopCircle className="h-4 w-4" /> Stop Sharing
              </button>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900">
              <span className="text-[10px] text-slate-400 font-semibold">Allow Remote Control</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={remoteControlAllowed} 
                  onChange={() => setRemoteControlAllowed(!remoteControlAllowed)}
                  className="sr-only peer" 
                />
                <div className="w-8 h-4.5 bg-slate-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-indigo-500/30 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>
          </div>

          {/* Active Presenter Stats */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-slate-900 bg-slate-950/40">
            <span className="text-[10px] uppercase font-bold text-slate-500">Active Presenter</span>
            {presenter ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-xs shrink-0">
                  {presenter.username.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <span className="text-xs font-bold text-white block truncate">{presenter.username}</span>
                  <span className="text-[9px] text-indigo-400 font-semibold block uppercase">{presenter.shareType || 'full'} screen</span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 py-1">
                <AlertCircle className="h-3.5 w-3.5" /> No active stream
              </div>
            )}

            {presenter && presenter.socketId !== socket?.id && !isControlling && (
              <button
                onClick={requestRemoteControl}
                className="w-full glass-button text-xs py-1.5! mt-2 flex items-center justify-center gap-1.5"
              >
                <MousePointer className="h-3.5 w-3.5" /> Request Remote Control
              </button>
            )}

            {presenter && presenter.socketId === socket?.id && controllingUser && (
              <div className="border-t border-slate-900 pt-2.5 mt-2.5 flex flex-col gap-2">
                <div className="text-[9px] text-indigo-300 font-bold uppercase">Controlled By:</div>
                <div className="flex items-center justify-between text-xs text-white bg-indigo-950/10 border border-indigo-500/10 p-2 rounded-lg">
                  <span className="font-semibold">{controllingUser}</span>
                  <button 
                    onClick={revokeControl} 
                    className="text-[9px] uppercase font-extrabold text-rose-400 hover:text-rose-300"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Remote Action Logger */}
        <div className="flex flex-col gap-2.5 border-t border-slate-900 pt-4 max-h-[200px] overflow-hidden">
          <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
            <Activity className="h-3 w-3" /> Action Log
          </span>
          <div className="overflow-y-auto text-[9px] font-mono text-slate-400 flex flex-col gap-1 pr-1 max-h-[120px] bg-black/20 p-2 rounded-lg border border-slate-950">
            {actionLogs.map((log, idx) => (
              <div key={idx} className="truncate">{log}</div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Stream Viewport and Remote Command Shell */}
      <section className="col-span-9 flex flex-col gap-4 h-full">
        {/* Stream Header */}
        <div className="glass-panel px-4 py-3 rounded-2xl border-slate-800 flex items-center justify-between bg-slate-950/20">
          <div className="flex items-center gap-2">
            <Monitor className="h-4.5 w-4.5 text-indigo-400" />
            <span className="text-xs font-bold text-white">
              {presenter ? `${presenter.username}'s Screen Feed` : 'No active stream'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {presenter && (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-1 font-semibold uppercase ${
                presenter.socketId === socket?.id 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
              }`}>
                {presenter.socketId === socket?.id ? 'Broadcasting' : 'Live Feed'}
              </span>
            )}
            {isControlling && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold uppercase animate-pulse flex items-center gap-1">
                <MousePointer className="h-3 w-3" /> Control Mode Active
              </span>
            )}
          </div>
        </div>

        {/* Viewport Frame */}
        <div 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onClick={handleViewportClick}
          className={`flex-1 glass-panel border-[#f5f1e6] bg-[#16161d] relative overflow-hidden flex items-center justify-center p-1 group min-h-[300px] ${
            isControlling ? 'cursor-crosshair' : ''
          }`}
        >
          {presenter ? (
            <>
              {/* Real Stream Rendering element */}
              {stream ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-contain ${
                    presenter.shareType === 'half' ? 'scale-x-90 scale-y-90 border-2 border-[#ffe500]' : ''
                  }`} 
                />
              ) : (
                /* Falling back to visual mockup of a remote developer dashboard */
                <div className={`w-full h-full bg-[#0b0b0f] border-2 border-[#f5f1e6] p-4 font-mono text-[10px] flex flex-col justify-between relative ${
                  presenter.shareType === 'half' ? 'max-w-[85%] max-h-[85%] border-[#ffe500]' : ''
                }`}>
                  {/* Fake UI Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                      <span className="text-[9px] text-slate-500 ml-1.5">developer-sandbox-env</span>
                    </div>
                    <span className="text-[9px] text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded">
                      Localhost:3000
                    </span>
                  </div>

                  {/* Fake Source Code Editor UI */}
                  <div className="flex-1 grid grid-cols-12 gap-3 pt-3 overflow-hidden text-left font-mono">
                    <div className="col-span-2 border-r border-slate-900 pr-1 flex flex-col gap-1.5 text-slate-600 select-none">
                      <span className="text-[9px] text-indigo-300 font-semibold">📂 Project</span>
                      <span className="pl-1 truncate">├── components</span>
                      <span className="pl-2 text-indigo-400/80 truncate">└── ScreenShare.tsx</span>
                      <span className="pl-1 truncate">├── package.json</span>
                      <span className="pl-1 truncate">└── index.ts</span>
                    </div>
                    <div className="col-span-10 flex flex-col justify-between overflow-y-auto">
                      <div className="flex flex-col gap-1 text-slate-300">
                        <div className="text-slate-500 leading-none select-none">1 | import React from 'react';</div>
                        <div className="text-slate-500 leading-none select-none">2 | import {'{'} Socket {'}'} from 'socket.io-client';</div>
                        <div className="leading-none"><span className="text-purple-400">export default function</span> <span className="text-indigo-300 font-bold">HackhubApp</span>() {'{'}</div>
                        <div className="leading-none pl-3"><span className="text-purple-400">const</span> [status, setStatus] = useState(<span className="text-emerald-400">'live'</span>);</div>
                        <div className="leading-none pl-3"><span className="text-slate-500 select-none">/* Syncing client workspaces */</span></div>
                        <div className="leading-none pl-3"><span className="text-purple-400">return</span> (</div>
                        <div className="leading-none pl-6 text-indigo-400">&lt;<span className="text-purple-400">div</span> className=<span className="text-emerald-400">"workspace-overlay"</span>&gt;</div>
                        <div className="leading-none pl-9 text-slate-400">&lt;<span className="text-indigo-400 font-bold">WorkspaceMeet</span> /&gt;</div>
                        <div className="leading-none pl-6 text-indigo-400">&lt;/<span className="text-purple-400">div</span>&gt;</div>
                        <div className="leading-none pl-3">);</div>
                        <div className="leading-none">{'}'}</div>
                      </div>
                      <div className="border-t border-slate-800 pt-2 text-[9px] text-slate-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                        Auto-sync enabled • Monaco Code editor sandbox
                      </div>
                    </div>
                  </div>

                  {/* Remote Cursor Overlay inside mock screen */}
                  {remoteCursor && (
                    <div 
                      className="absolute bg-rose-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-lg pointer-events-none transition-all duration-75 z-50"
                      style={{ 
                        left: `${remoteCursor.x * 90 + 5}%`, 
                        top: `${remoteCursor.y * 90 + 5}%` 
                      }}
                    >
                      <MousePointer className="h-3 w-3 fill-current rotate-90 transform translate-y-[-2px] translate-x-[-2px]" />
                      <span>{remoteCursor.name}</span>
                    </div>
                  )}

                  {/* Click ripples overlay */}
                  {clickRipples.map((ripple) => (
                    <div 
                      key={ripple.id}
                      className="absolute border border-rose-500 rounded-full w-8 h-8 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-ping bg-rose-500/20"
                      style={{ 
                        left: `${ripple.x * 90 + 5}%`, 
                        top: `${ripple.y * 90 + 5}%` 
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Presenter controls alert modal overlay */}
              {controlRequest && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                  <div className="glass-panel p-5 rounded-2xl border-indigo-500/30 text-center max-w-sm flex flex-col gap-4 animate-float-medium bg-slate-950">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto">
                      <MousePointer className="h-5.5 w-5.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Remote Control Request</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        <b>{controlRequest.fromName}</b> wants to request control of your screen. This allows them to hover cursors, trigger clicks, and run remote terminal commands.
                      </p>
                    </div>
                    <div className="flex gap-2.5">
                      <button 
                        onClick={denyControlRequest} 
                        className="flex-1 glass-button-secondary text-xs py-2!"
                      >
                        Deny
                      </button>
                      <button 
                        onClick={acceptControlRequest} 
                        className="flex-1 glass-button text-xs py-2!"
                      >
                        Accept &amp; Grant
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-500 flex flex-col items-center gap-3">
              <MonitorOff className="h-12 w-12 text-slate-700 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold text-slate-400">No screen is currently being shared</h4>
                <p className="text-[10px] text-slate-600 max-w-[240px] mt-1 mx-auto leading-relaxed">
                  Click "Start Screen Share" on the sidebar or wait for a teammate to share their workspace screen.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Remote control Console Terminal */}
        {presenter && (
          <div className="glass-panel p-4 rounded-2xl border-slate-800 bg-slate-950 flex flex-col gap-3 h-48">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Terminal className="h-3.5 w-3.5" /> Remote Shell terminal
              </div>
              {isControlling && (
                <span className="text-[9px] text-rose-400 font-semibold lowercase">
                  controlling presenter shell
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-[11px] text-emerald-400 flex flex-col gap-1 pr-1 bg-black/40 p-2.5 rounded-lg border border-slate-900">
              {remoteTerminalOutput.map((line, idx) => (
                <div key={idx} className={line.startsWith('$') ? 'text-indigo-300' : 'text-emerald-400'}>
                  {line}
                </div>
              ))}
            </div>

            {isControlling && (
              <form onSubmit={sendTerminalCommand} className="flex gap-2 items-center bg-black/20 p-1 rounded-lg border border-slate-900">
                <ChevronRight className="h-4.5 w-4.5 text-indigo-400" />
                <input 
                  type="text"
                  value={terminalCommand}
                  onChange={(e) => setTerminalCommand(e.target.value)}
                  placeholder="Type remote command (e.g. npm run dev, git status, docker-compose up)..."
                  className="flex-1 bg-transparent outline-none border-none text-[11px] text-white font-mono"
                />
                <button 
                  type="submit" 
                  className="glass-button text-[10px] py-1! px-2.5! rounded-md"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
