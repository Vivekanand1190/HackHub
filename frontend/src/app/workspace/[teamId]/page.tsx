'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Terminal, 
  Users, 
  MessageSquare, 
  Award, 
  Cpu, 
  Layers, 
  Sparkles, 
  Trello, 
  Code,
  LayoutDashboard,
  Clock,
  LogOut,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  UserPlus,
  FolderOpen,
  Link,
  Check,
  Menu,
  X,
  FileText,
  Search,
  Headphones
} from 'lucide-react';
import { getSocket, disconnectSocket } from '../../../utils/socket';
import { apiUrl } from '../../../utils/api';
import WorkspaceDashboard from '../../../components/WorkspaceDashboard';
import ChatWindow from '../../../components/ChatWindow';
import CodeEditor from '../../../components/CodeEditor';
import Whiteboard from '../../../components/Whiteboard';
import KanbanBoard from '../../../components/KanbanBoard';
import CopilotPanel from '../../../components/CopilotPanel';
import ScreenSharePanel from '../../../components/ScreenSharePanel';
import FileVault from '../../../components/FileVault';
import CollaborativeScratchpad from '../../../components/CollaborativeScratchpad';
import CommandPalette from '../../../components/CommandPalette';
import JudgeView from '../../../components/JudgeView';
import VoiceHuddlePanel from '@/components/VoiceHuddlePanel';
import NotificationCenter from '@/components/NotificationCenter';

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  type TabType = 'dashboard' | 'chat' | 'editor' | 'whiteboard' | 'tasks' | 'copilot' | 'screenshare' | 'files' | 'notes' | 'judge' | 'huddle';
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Session user details
  const [user, setUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Dynamic Workspace State from DB
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [snippets, setSnippets] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [whiteboardData, setWhiteboardData] = useState<any[]>([]);
  const [githubRepo, setGithubRepo] = useState('');
  const [milestones, setMilestones] = useState<any[]>([]);
  const [unlockedAvatars, setUnlockedAvatars] = useState<any[]>([]);
  
  // Real-time Sockets presence
  const [onlineMembers, setOnlineMembers] = useState<any[]>([]);
  const [socket, setSocket] = useState<any>(null);

  // Countdown timer state
  const [timerState, setTimerState] = useState<{ endTime: number | null; running: boolean; duration: number }>({
    endTime: null,
    running: false,
    duration: 0
  });
  const [formattedTime, setFormattedTime] = useState('24:00:00');
  const [customHours, setCustomHours] = useState(24);
  const [customMinutes, setCustomMinutes] = useState(0);
  const [customSeconds, setCustomSeconds] = useState(0);

  // Video call controls
  const [cameraActive, setCameraActive] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  // Copilot Analysis State
  const [copilotState, setCopilotState] = useState<any>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [huddleCount, setHuddleCount] = useState(0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    // 1. Fetch user details from localStorage
    const savedUser = localStorage.getItem('hackhub_user');
    const token = localStorage.getItem('hackhub_token');
    
    if (!savedUser || !token) {
      router.push('/');
      return;
    }

    const parsedUser = JSON.parse(savedUser);
    setUser(parsedUser);

    // 2. Fetch initial Workspace details
    const fetchWorkspace = async () => {
      try {
        const res = await fetch(apiUrl(`/api/teams/${teamId}/workspace`), {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!res.ok) {
          throw new Error('Failed to load workspace. Access denied.');
        }

        const data = await res.json();
        setTeamName(data.name);
        setJoinCode(data.joinCode);
        setMembers(data.members);
        setTasks(data.tasks);
        setMessages(data.messages);
        setSnippets(data.snippets);
        setDocuments(data.documents);
        setCopilotState(data.copilotState);
        setWhiteboardData(data.whiteboardData || []);
        setGithubRepo(data.githubRepo || '');
        setMilestones(data.milestones || []);
        setUnlockedAvatars(data.unlockedAvatars || []);
        setLoading(false);

        // 3. Connect Sockets
        const s = getSocket();
        s.connect();
        
        s.emit('join-team', {
          teamId,
          userId: parsedUser.id,
          name: parsedUser.name,
          role: parsedUser.role
        });

        setSocket(s);

        // Bind socket listeners
        s.on('members-update', (list: any[]) => {
          setOnlineMembers(list);
        });

        s.on('huddle-update', (list: any[]) => {
          setHuddleCount((list || []).length);
        });

        s.on('timer-sync', (timer: any) => {
          setTimerState(timer);
        });

        // Relativize dynamic data refreshes
        s.on('task-update', async () => {
          const r = await fetch(apiUrl(`/api/teams/${teamId}/workspace`), {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (r.ok) {
            const d = await r.json();
            setTasks(d.tasks);
          }
        });

      } catch (err: any) {
        setError(err.message || 'Server error loading workspace');
        setLoading(false);
      }
    };

    fetchWorkspace();

    return () => {
      disconnectSocket();
    };
  }, [teamId, router]);

  // Live Timer Countdowns
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timerState.running && timerState.endTime) {
      interval = setInterval(() => {
        const remaining = timerState.endTime! - Date.now();
        if (remaining <= 0) {
          setFormattedTime('00:00:00');
          setTimerState(prev => ({ ...prev, running: false }));
          clearInterval(interval);
        } else {
          const h = Math.floor(remaining / 3600000);
          const m = Math.floor((remaining % 3600000) / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          setFormattedTime(
            `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
          );
        }
      }, 1000);
    } else {
      setFormattedTime(
        `${customHours.toString().padStart(2, '0')}:${customMinutes.toString().padStart(2, '0')}:${customSeconds.toString().padStart(2, '0')}`
      );
    }

    return () => clearInterval(interval);
  }, [timerState, customHours, customMinutes, customSeconds]);

  const handleStartTimer = () => {
    const duration = ((customHours * 3600) + (customMinutes * 60) + customSeconds) * 1000;
    if (duration <= 0) {
      alert('Please enter a duration greater than 0.');
      return;
    }
    socket?.emit('timer-start', { teamId, durationMs: duration });
  };

  const handleStopTimer = () => {
    socket?.emit('timer-stop', { teamId });
  };

  const handleCopilotUpdate = (newAnalysis: any) => {
    setCopilotState(newAnalysis);
  };

  const handleExitWorkspace = () => {
    localStorage.removeItem('hackhub_token');
    localStorage.removeItem('hackhub_user');
    router.push('/');
  };

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0b0b0f] text-white">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mb-4" />
        <h3 className="text-sm font-semibold tracking-wider uppercase text-indigo-400">Loading HackHub Workspace...</h3>
      </div>
    );
  }

  if (error) {
    const isTokenError = error.toLowerCase().includes('token') || error.toLowerCase().includes('access denied') || error.toLowerCase().includes('expired');
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0b0b0f] text-white p-4">
        <div className="glass-panel p-6 rounded-2xl border-rose-500/30 text-center max-w-md">
          <h3 className="text-xl font-bold text-rose-400 mb-2">Workspace Access Error</h3>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button 
            onClick={() => {
              localStorage.removeItem('hackhub_token');
              localStorage.removeItem('hackhub_user');
              router.push('/');
            }} 
            className="glass-button text-sm w-full"
          >
            {isTokenError ? 'Please Sign In Again' : 'Back to Home'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden h-screen bg-[#0b0b0f] relative">
      {/* Mobile Sidebar overlay backdrop */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-all duration-300"
        />
      )}

      {/* LEFT MENU SIDEBAR */}
      <aside className={`w-64 border-r border-slate-900 bg-slate-950/95 md:bg-slate-950/60 backdrop-blur-md flex flex-col justify-between p-4 z-50 fixed inset-y-0 left-0 transform transition-transform duration-300 ease-out md:static md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 px-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#ffe500] shadow-[3px_3px_0_#000]">
                  <Layers className="h-5 w-5 text-black" />
                </div>
                <span className="font-extrabold text-xl tracking-tight text-white">
                  Hack<span className="text-indigo-400">Hub</span>
                </span>
              </div>
              <span className="text-[8px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">
                Elite Hackathon Suite
              </span>
            </div>
            
            <button 
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 -mx-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="h-4.5 w-4.5" /> Dashboard
            </button>
            
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'chat'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="h-4.5 w-4.5" /> Team Chat
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'editor'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Code className="h-4.5 w-4.5" /> Code Sandbox
            </button>

            <button
              onClick={() => setActiveTab('whiteboard')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'whiteboard'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Layers className="h-4.5 w-4.5" /> Drawing Canvas
            </button>

            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'tasks'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Trello className="h-4.5 w-4.5" /> Kanban Board
            </button>

            <button
              onClick={() => setActiveTab('copilot')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 relative ${
                activeTab === 'copilot'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Cpu className="h-4.5 w-4.5" /> AI Copilot
              <span className="absolute right-3 top-3 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
            </button>

            <button
              onClick={() => setActiveTab('screenshare')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'screenshare'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Monitor className="h-4.5 w-4.5" /> Share &amp; Control
            </button>

            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'files'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="h-4.5 w-4.5" /> File Vault
            </button>

            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'notes'
                  ? 'bg-indigo-500/10 border-indigo-500/20 border-l-indigo-450 text-indigo-300 font-extrabold'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <FileText className="h-4.5 w-4.5" /> Workspace Notes
            </button>

            <button
              onClick={() => setActiveTab('judge')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 ${
                activeTab === 'judge'
                  ? 'bg-[#ffe500] text-black border-l-black font-extrabold shadow-[2px_2px_0_#000]'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Award className="h-4.5 w-4.5 text-[#ffe500]" /> Judge Mode
            </button>

            <button
              onClick={() => setActiveTab('huddle')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-r-xl text-xs font-bold transition text-left border-l-2.5 relative ${
                activeTab === 'huddle'
                  ? 'bg-[#b8ff3c] text-black border-l-black font-extrabold shadow-[2px_2px_0_#000]'
                  : 'border-l-transparent text-slate-400 hover:bg-slate-900/30 hover:text-slate-200'
              }`}
            >
              <Headphones className="h-4.5 w-4.5 text-[#b8ff3c]" /> Voice Huddle
              {huddleCount > 0 && (
                <span className="ml-auto px-1.5 py-0.5 bg-black text-[#b8ff3c] border border-[#b8ff3c] text-[9px] font-mono font-bold">
                  {huddleCount} Active
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User session */}
        <div className="flex flex-col gap-4 border-t border-slate-900/60 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-300 text-xs border border-indigo-500/20">
                {user?.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <span className="text-xs font-bold text-white block truncate">{user?.name}</span>
                <span className="text-[10px] text-slate-500 block truncate">{user?.role}</span>
              </div>
            </div>
            <button 
              onClick={handleExitWorkspace}
              className="p-1.5 rounded hover:bg-slate-900 text-slate-505 hover:text-slate-200 transition"
              title="Leave Workspace"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0b0b0f] p-6 gap-6 relative">
        {/* Workspace Top Header */}
        <header className="flex items-center justify-between border-b border-slate-900/40 pb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-805 text-slate-400 hover:text-white"
              title="Open Navigation"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{teamName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Active Members:</span>
                <div className="flex items-center -space-x-1">
                  {onlineMembers.map((m) => (
                    <div 
                      key={m.socketId}
                      title={`${m.name} (${m.role}) — Online Now`}
                      style={{ backgroundColor: m.color || '#ffe500' }}
                      className="w-6 h-6 border-2 border-black text-[10px] font-mono font-bold flex items-center justify-center text-black relative shadow-[2px_2px_0px_#000]"
                    >
                      {m.name.charAt(0)}
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 border border-black animate-pulse"></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Active timer controls & search palette */}
          <div className="flex items-center gap-3">
            <NotificationCenter socket={socket} />

            <button
              onClick={() => setCmdPaletteOpen(true)}
              className="glass-button-secondary text-xs py-1.5! px-3! flex items-center gap-1.5 font-mono"
              title="Command Palette (Cmd / Ctrl + K)"
            >
              <Search className="h-3.5 w-3.5 text-[#ffe500]" />
              <span className="hidden sm:inline">Search / Cmd</span>
              <kbd className="px-1.5 py-0.5 bg-black border border-slate-700 text-[9px] text-slate-300">⌘K</kbd>
            </button>

            {/* Share link button */}
            <button 
              onClick={handleCopyShareLink}
              className={`text-xs py-1.5! px-3.5! flex items-center gap-1.5 transition-all glass-button ${
                copiedLink ? 'bg-emerald-600 border-emerald-550 hover:bg-emerald-500 shadow-emerald-500/20' : ''
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Link Copied!
                </>
              ) : (
                <>
                  <Link className="h-3.5 w-3.5" /> Share Link
                </>
              )}
            </button>

            <div className="glass-panel py-1.5 px-4 rounded-xl border-slate-800 flex items-center gap-3.5 bg-slate-950/40 shadow-inner">
              <Clock className="h-4 w-4 text-indigo-400" />
              {timerState.running ? (
                <span className="font-mono text-sm font-bold text-slate-200">{formattedTime}</span>
              ) : (
                <div className="flex items-center gap-1 font-mono text-sm">
                  <input 
                    type="number" 
                    min="0" 
                    max="99" 
                    value={customHours} 
                    onChange={(e) => setCustomHours(parseInt(e.target.value) || 0)} 
                    className="w-8 bg-slate-900 border border-slate-800 text-center text-slate-200 rounded py-0.5" 
                    title="Hours"
                  />
                  <span className="text-slate-500">:</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="59" 
                    value={customMinutes} 
                    onChange={(e) => setCustomMinutes(parseInt(e.target.value) || 0)} 
                    className="w-8 bg-slate-900 border border-slate-800 text-center text-slate-200 rounded py-0.5" 
                    title="Minutes"
                  />
                  <span className="text-slate-500">:</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="59" 
                    value={customSeconds} 
                    onChange={(e) => setCustomSeconds(parseInt(e.target.value) || 0)} 
                    className="w-8 bg-slate-900 border border-slate-800 text-center text-slate-200 rounded py-0.5" 
                    title="Seconds"
                  />
                </div>
              )}
              {timerState.running ? (
                <button 
                  onClick={handleStopTimer}
                  className="text-[10px] uppercase font-bold text-rose-400 hover:text-rose-300"
                >
                  Stop
                </button>
              ) : (
                <button 
                  onClick={handleStartTimer}
                  className="text-[10px] uppercase font-bold text-emerald-400 hover:text-emerald-300"
                >
                  Start
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Panel Display */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' && (
            <WorkspaceDashboard 
              teamId={teamId}
              user={user}
              teamName={teamName}
              joinCode={joinCode}
              members={members}
              tasks={tasks}
              messages={messages}
              snippetsCount={snippets.length}
              readinessScore={copilotState?.readinessScore || 15}
              formattedTime={formattedTime}
              githubRepo={githubRepo}
              milestones={milestones}
              unlockedAvatars={unlockedAvatars}
              onTeamUpdate={({ githubRepo: newRepo, milestones: newMilestones, unlockedAvatars: newAvatars }) => {
                if (newRepo !== undefined) setGithubRepo(newRepo);
                if (newMilestones !== undefined) setMilestones(newMilestones);
                if (newAvatars !== undefined) setUnlockedAvatars(newAvatars);
              }}
              onUserXpUpdate={(newXp) => {
                if (user) {
                  const updatedUser = { ...user, xp: newXp };
                  setUser(updatedUser as any);
                  localStorage.setItem('hackhub_user', JSON.stringify(updatedUser));
                }
                setMembers(prev => prev.map(m => m.id === user?.id ? { ...m, xp: newXp } : m));
              }}
            />
          )}

          {activeTab === 'chat' && (
            <ChatWindow 
              socket={socket}
              teamId={teamId}
              userId={user?.id || ''}
              userName={user?.name || ''}
              initialMessages={messages}
              teamMembers={members}
            />
          )}

          {activeTab === 'editor' && (
            <CodeEditor 
              socket={socket}
              teamId={teamId}
              initialSnippets={snippets}
              userId={user?.id || ''}
              copilotState={copilotState}
              tasks={tasks}
            />
          )}

          {activeTab === 'whiteboard' && (
            <Whiteboard 
              socket={socket}
              teamId={teamId}
              initialData={whiteboardData}
            />
          )}

          {activeTab === 'tasks' && (
            <KanbanBoard 
              socket={socket}
              teamId={teamId}
              members={members}
              initialTasks={tasks}
            />
          )}

          {activeTab === 'copilot' && (
            <CopilotPanel 
              teamId={teamId}
              initialState={copilotState}
              onScanComplete={handleCopilotUpdate}
            />
          )}

          {activeTab === 'screenshare' && (
            <ScreenSharePanel 
              socket={socket}
              teamId={teamId}
              user={user}
            />
          )}

          {activeTab === 'files' && (
            <FileVault 
              socket={socket}
              teamId={teamId}
              user={user}
              messages={messages}
            />
          )}

          {activeTab === 'notes' && (
            <CollaborativeScratchpad 
              socket={socket}
              teamId={teamId}
              initialDocuments={documents}
            />
          )}

          {activeTab === 'judge' && (
            <JudgeView 
              teamId={teamId}
              teamName={teamName}
            />
          )}

          {activeTab === 'huddle' && (
            <VoiceHuddlePanel
              socket={socket}
              teamId={teamId}
              teamName={teamName}
              user={user}
            />
          )}
        </div>

        <CommandPalette
          isOpen={cmdPaletteOpen}
          onClose={() => setCmdPaletteOpen(false)}
          onSelectTab={(tab) => setActiveTab(tab as TabType)}
          onRunCopilotScan={() => {
            setActiveTab('copilot');
          }}
          onExportZip={() => {
            window.location.href = apiUrl(`/api/teams/${teamId}/export/zip`);
          }}
        />

      </main>
    </div>
  );
}
