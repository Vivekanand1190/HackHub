'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Terminal, 
  Users, 
  MessageSquare, 
  Award, 
  Cpu, 
  Layers, 
  Sparkles, 
  ArrowRight, 
  Play, 
  Code, 
  Trello, 
  Video, 
  FileText 
} from 'lucide-react';
import { apiUrl } from '@/utils/api';

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  // Auth Form states
  const [isLogin, setIsLogin] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Developer');
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auth State
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Stats countdown timer
  const [timeLeft, setTimeLeft] = useState({ hours: 23, minutes: 59, seconds: 59 });

  const fetchUserTeams = async (authToken: string) => {
    setLoadingTeams(true);
    try {
      const res = await fetch(apiUrl('/api/teams'), {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUserTeams(data);
      } else if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('hackhub_token');
        localStorage.removeItem('hackhub_user');
        setToken(null);
        setUser(null);
        setUserTeams([]);
      }
    } catch (err) {
      console.error('Failed to fetch user teams:', err);
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hackhub_token');
    localStorage.removeItem('hackhub_user');
    setToken(null);
    setUser(null);
    setUserTeams([]);
  };

  useEffect(() => {
    setMounted(true);
    const savedToken = localStorage.getItem('hackhub_token');
    const savedUser = localStorage.getItem('hackhub_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        fetchUserTeams(savedToken);
      } catch (e) {
        console.error(e);
      }
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { hours: prev.hours, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 23, minutes: 59, seconds: 59 }; // Loop countdown
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) return null;

  // Handle Create Team and Registration
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let activeToken = token;

      if (!activeToken) {
        // 1. Register User
        const regRes = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, role })
        });
        const regData = await regRes.json();
        if (!regRes.ok) throw new Error(regData.error || 'Registration failed');

        // Store Auth Token & details
        activeToken = regData.token;
        localStorage.setItem('hackhub_token', regData.token);
        localStorage.setItem('hackhub_user', JSON.stringify(regData.user));
        setToken(regData.token);
        setUser(regData.user);
      }

      // 2. Create Team
      const teamRes = await fetch(apiUrl('/api/teams/create'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ name: teamName })
      });
      const teamData = await teamRes.json();
      if (!teamRes.ok) {
        if (teamRes.status === 401 || teamRes.status === 403) {
          localStorage.removeItem('hackhub_token');
          localStorage.removeItem('hackhub_user');
          setToken(null);
          setUser(null);
          throw new Error('Session expired or token invalid. Please log in or register below to continue.');
        }
        throw new Error(teamData.error || 'Failed to create workspace');
      }

      // Redirect to newly created workspace
      router.push(`/workspace/${teamData.id}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Handle Join Team
  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let activeToken = token;

      // If user is not logged in, authenticate or register first
      if (!activeToken) {
        const authEndpoint = isLogin ? 'login' : 'register';
        const payload = isLogin 
          ? { email, password } 
          : { email, password, name, role };

        const authRes = await fetch(apiUrl(`/api/auth/${authEndpoint}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const authData = await authRes.json();
        if (!authRes.ok) throw new Error(authData.error || 'Authentication failed');

        activeToken = authData.token;
        localStorage.setItem('hackhub_token', activeToken || '');
        localStorage.setItem('hackhub_user', JSON.stringify(authData.user));
        setToken(activeToken || null);
        setUser(authData.user);
      }

      // Join Team
      const joinRes = await fetch(apiUrl('/api/teams/join'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken || ''}`
        },
        body: JSON.stringify({ joinCode })
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) {
        if (joinRes.status === 401 || joinRes.status === 403) {
          localStorage.removeItem('hackhub_token');
          localStorage.removeItem('hackhub_user');
          setToken(null);
          setUser(null);
          throw new Error('Session expired or token invalid. Please log in or register below to continue.');
        }
        throw new Error(joinData.error || 'Failed to join workspace');
      }

      // Redirect to joined workspace
      router.push(`/workspace/${joinData.teamId}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0b0f]">
      {/* Background grid design */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-60"></div>
      
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#ffe500] shadow-[4px_4px_0_#000]">
            <Layers className="h-5.5 w-5.5 text-black" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-[#f5f1e6]">
            HACK<span className="text-[#ffe500]">HUB</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {token && user ? (
            <>
              <div className="flex items-center gap-2.5 glass-panel px-3.5 py-1.5 rounded-xl border-slate-800 bg-slate-950/20">
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center justify-center">
                  {user.name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <span className="text-xs font-bold text-slate-200 block leading-tight">{user.name}</span>
                  <span className="text-[9px] text-slate-500 block leading-none">{user.role}</span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => { setIsLogin(true); setShowJoinModal(true); }}
                className="text-sm font-semibold text-slate-300 hover:text-white transition cursor-pointer"
              >
                Sign In
              </button>
              <button 
                onClick={() => { setIsLogin(false); setShowJoinModal(true); }}
                className="glass-button-secondary text-sm py-2! px-4!"
              >
                Join Workspace
              </button>
              <button 
                onClick={() => setShowStartModal(true)}
                className="glass-button text-sm py-2! px-4!"
              >
                Start Workspace
              </button>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-24 text-center">
        {/* Floating Wallpaper Icons (Upgraded & Premium Curation) */}
        <div className="absolute left-10 top-1/4 animate-float-slow opacity-30 hidden md:block">
          <Code className="h-10 w-10 text-indigo-400" />
        </div>
        <div className="absolute right-12 top-1/3 animate-float-medium opacity-20 hidden md:block">
          <MessageSquare className="h-9 w-9 text-cyan-400" />
        </div>
        <div className="absolute left-1/4 bottom-1/3 animate-float-medium opacity-25 hidden md:block">
          <Trello className="h-10 w-10 text-purple-400" />
        </div>
        <div className="absolute right-1/4 top-1/4 animate-float-slow opacity-15 hidden md:block">
          <Cpu className="h-9 w-9 text-pink-400" />
        </div>
        <div className="absolute left-12 bottom-1/4 animate-float-slow opacity-20 hidden md:block">
          <Terminal className="h-9.5 w-9.5 text-emerald-400" />
        </div>
        <div className="absolute right-10 bottom-1/3 animate-float-medium opacity-25 hidden md:block">
          <Award className="h-10 w-10 text-amber-400" />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-6 uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
          AI-Powered Hackathon Hub
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1] max-w-4xl mx-auto">
          <span className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">Collaborate on Hackathons</span> <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Without Switching Apps</span>
        </h1>

        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          The ultimate platform for team hackathons. Real-time chat, collaborative coding, interactive whiteboards, Kanban tasks, and our signature <b>AI Hackathon Copilot</b> to guarantee submission readiness.
        </p>

        {/* Action Buttons / Workspaces Dashboard */}
        {!token ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button 
              onClick={() => setShowStartModal(true)}
              className="glass-button text-base px-6! py-3! w-full sm:w-auto"
            >
              Create Team Workspace <ArrowRight className="h-5 w-5" />
            </button>
            <button 
              onClick={() => { setIsLogin(false); setShowJoinModal(true); }}
              className="glass-button-secondary text-base px-6! py-3! w-full sm:w-auto"
            >
              Join Team Workspace
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto glass-panel p-6 rounded-2xl border-indigo-500/20 shadow-2xl mb-16 text-left relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-indigo-400" /> Your Active Workspaces
                </h3>
                <p className="text-xs text-slate-400">Launch one of your teams or connect to a new one.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setIsLogin(false); setShowJoinModal(true); }} 
                  className="glass-button-secondary text-xs py-1.5! px-3!"
                >
                  Join Team
                </button>
                <button 
                  onClick={() => setShowStartModal(true)} 
                  className="glass-button text-xs py-1.5! px-3!"
                >
                  Create Team
                </button>
              </div>
            </div>

            {loadingTeams ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mx-auto mb-2.5" />
                Loading your workspaces...
              </div>
            ) : userTeams.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs border border-dashed border-slate-800/80 rounded-xl bg-slate-900/10">
                You haven't joined any workspaces yet. Create a new team or enter a join code to get started!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userTeams.map((team) => (
                  <div 
                    key={team.id}
                    onClick={() => router.push(`/workspace/${team.id}`)}
                    className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/20 hover:border-indigo-500/30 hover:bg-indigo-950/10 transition cursor-pointer flex justify-between items-center group"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{team.name}</h4>
                      <span className="text-[10px] text-slate-500 block mt-1">Join Code: <b className="font-mono text-indigo-400">{team.joinCode}</b></span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-slate-800 group-hover:bg-indigo-500/10 border border-slate-700/50 group-hover:border-indigo-500/30 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        

        {/* Platform Demo Showcase */}
        <div className="relative max-w-5xl mx-auto glass-panel p-2 rounded-2xl border-slate-800 shadow-2xl shadow-indigo-950/30 overflow-hidden">
          <div className="aspect-video w-full rounded-xl bg-slate-950/90 relative flex flex-col justify-between p-4 border border-slate-900/50">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs text-slate-500 ml-2">hackhub.com/workspace/alpha-team</span>
              </div>
              <div className="text-xs px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 animate-spin" /> Copilot Active
              </div>
            </div>

            {/* Mock Dashboard content */}
            <div className="grid grid-cols-12 gap-4 flex-1 pt-4 overflow-hidden text-left">
              {/* Left sidebar */}
              <div className="col-span-3 border-r border-slate-800/60 pr-2 flex flex-col gap-2">
                <div className="p-2 rounded bg-slate-900/80 border border-indigo-500/20 text-xs text-indigo-300 font-medium">💻 Live Workspace</div>
                <div className="p-2 rounded hover:bg-slate-900/40 text-xs text-slate-400 transition cursor-pointer">💬 Team Channels</div>
                <div className="p-2 rounded hover:bg-slate-900/40 text-xs text-slate-400 transition cursor-pointer">📝 Code Editor</div>
                <div className="p-2 rounded hover:bg-slate-900/40 text-xs text-slate-400 transition cursor-pointer">🎨 Whiteboard</div>
                <div className="p-2 rounded hover:bg-slate-900/40 text-xs text-slate-400 transition cursor-pointer">📊 Kanban Tasks</div>
              </div>
              
              {/* Center workspace view */}
              <div className="col-span-6 flex flex-col gap-3">
                <div className="glass-panel p-3 rounded-xl border-slate-800 flex-1 flex flex-col justify-between">
                  <div className="text-xs text-slate-400 font-semibold mb-1">Pair Programming Sandbox</div>
                  <pre className="text-[10px] text-indigo-300 font-mono bg-slate-950 p-2.5 rounded border border-slate-900 overflow-x-auto">
                    {`import { Copilot } from '@hackhub/copilot';

// Initialize Hackathon Coach
const copilot = new Copilot({ teamId: "alpha" });
await copilot.runScan();`}
                  </pre>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-[10px] text-slate-500">Alex (Leader) is typing...</span>
                  </div>
                </div>
              </div>

              {/* Right Copilot suggestions panel */}
              <div className="col-span-3 flex flex-col gap-3">
                <div className="glass-panel p-3 rounded-xl border-indigo-500/30 flex-1 bg-gradient-to-b from-slate-900/50 to-indigo-950/20">
                  <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold mb-2">
                    <Cpu className="h-3.5 w-3.5 animate-pulse" />
                    COPILOT SUGGESTS
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-slate-300">
                      💡 <b>Next Step:</b> Connect the database connection string in your Docker configs.
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-slate-300">
                      🐛 <b>Bug Alert:</b> Missing CORS handler in express setup file.
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 mt-1">
                      <span className="text-[10px] text-slate-400">Readiness:</span>
                      <span className="text-xs text-emerald-400 font-extrabold">78%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900">
        <h2 className="text-3xl font-bold text-center mb-16 bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
          Equipped with Everything a Winning Team Needs
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-5 text-indigo-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">Live Team Workspace</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Integrated real-time workspace with dedicated channels, threads, screen sharing, and audio connections. Say goodbye to switching tabs.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-5 text-purple-400">
              <Code className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">Pair Code Sandbox</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Monaco-powered collaborative editor supporting multi-user code creation, auto-saving, execution, and real-time cursor presence.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-5 text-cyan-400">
              <Cpu className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">AI Hackathon Copilot</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              An intelligent companion that scans team chat log, whiteboard layouts, and code draft to generate project suggestions, bugs, and pitch tips.
            </p>
          </div>

          {/* Card 4 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5 text-emerald-400">
              <Trello className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">Kanban Project Manager</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Organize hackathon sprints, assign roles, set milestones, track task completion, and view team productivity score in real-time.
            </p>
          </div>

          {/* Card 5 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-400">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">Vector Whiteboard</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Brainstorm and outline your interface, design flows, sticky notes, and drawing paths together live with your teammates.
            </p>
          </div>

          {/* Card 6 */}
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-5 text-rose-400">
              <Award className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-100">XP & Badge Gamification</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Earn XP points, unlock team badges (like "Clean Code", "Pitch Masters"), and trace productivity metrics in real-time.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/40 py-8 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} HackHub Platform. All Rights Reserved. Built with Next.js, Express, and Socket.IO.</p>
      </footer>


      {/* MODAL: START HACKATHON WORKSPACE */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border-indigo-500/30 relative animate-float-medium bg-slate-950">
            <h3 className="text-xl font-bold mb-1 text-slate-100">Create Hackathon Workspace</h3>
            <p className="text-xs text-slate-400 mb-6">Initialize a collaborative environment for your team.</p>
            
            {error && <div className="p-3 mb-4 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{error}</div>}

            {token ? (
              <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Team Name</label>
                  <input 
                    type="text" 
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Cyber Knights" 
                    className="glass-input text-sm"
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end mt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowStartModal(false)}
                    className="glass-button-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="glass-button text-sm"
                  >
                    {loading ? 'Creating...' : 'Launch Workspace'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* Google OAuth Button */}
                <button
                  type="button"
                  id="google-oauth-start"
                  onClick={() => { window.location.href = apiUrl('/api/auth/google'); }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-700/80 hover:border-indigo-500/50 text-slate-200 text-sm font-semibold transition-all duration-200 group cursor-pointer"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                  <span className="text-slate-500 group-hover:text-indigo-400 transition-colors ml-auto text-xs font-normal">Fast &amp; Secure</span>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-slate-700/60" />
                  <span className="text-slate-500 text-xs font-medium">or continue with email</span>
                  <div className="flex-1 h-px bg-slate-700/60" />
                </div>

                <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Team Name</label>
                    <input 
                      type="text" 
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Cyber Knights" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Your Full Name</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Role</label>
                    <select 
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="glass-input text-sm"
                    >
                      <option value="Team Leader">Team Leader</option>
                      <option value="Developer">Developer</option>
                      <option value="Designer">Designer</option>
                      <option value="Presenter">Presenter</option>
                      <option value="Mentor">Mentor</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Email Address</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Password</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="flex gap-3 justify-end mt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowStartModal(false)}
                      className="glass-button-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="glass-button text-sm"
                    >
                      {loading ? 'Creating...' : 'Launch Workspace'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}


      {/* MODAL: JOIN TEAM WORKSPACE */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border-indigo-500/30 relative bg-slate-950">
            <h3 className="text-xl font-bold mb-1 text-slate-100">
              {token ? 'Join Team Workspace' : isLogin ? 'Sign In & Join Workspace' : 'Join Team Workspace'}
            </h3>
            <p className="text-xs text-slate-400 mb-6">Enter details and code to connect with your teammates.</p>
            
            {error && <div className="p-3 mb-4 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{error}</div>}

            {token ? (
              <form onSubmit={handleJoinTeam} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Workspace Join Code</label>
                  <input 
                    type="text" 
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="e.g. 8FB2AD" 
                    className="glass-input text-sm text-center font-bold tracking-widest uppercase"
                    maxLength={6}
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end mt-4">
                  <button 
                    type="button" 
                    onClick={() => { setShowJoinModal(false); setError(''); }}
                    className="glass-button-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="glass-button text-sm"
                  >
                    {loading ? 'Connecting...' : 'Join Workspace'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* Google OAuth Button */}
                <button
                  type="button"
                  id="google-oauth-join"
                  onClick={() => { window.location.href = apiUrl('/api/auth/google'); }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-700/80 hover:border-indigo-500/50 text-slate-200 text-sm font-semibold transition-all duration-200 group cursor-pointer"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                  <span className="text-slate-500 group-hover:text-indigo-400 transition-colors ml-auto text-xs font-normal">Fast &amp; Secure</span>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-slate-700/60" />
                  <span className="text-slate-500 text-xs font-medium">or continue with email</span>
                  <div className="flex-1 h-px bg-slate-700/60" />
                </div>

                <form onSubmit={handleJoinTeam} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Workspace Join Code</label>
                    <input 
                      type="text" 
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="e.g. 8FB2AD" 
                      className="glass-input text-sm text-center font-bold tracking-widest uppercase"
                      maxLength={6}
                      required
                    />
                  </div>

                  {!isLogin && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Full Name</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe" 
                        className="glass-input text-sm"
                        required
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Email</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Password</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="glass-input text-sm"
                      required
                    />
                  </div>

                  {!isLogin && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Role</label>
                      <select 
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="glass-input text-sm"
                      >
                        <option value="Developer">Developer</option>
                        <option value="Designer">Designer</option>
                        <option value="Presenter">Presenter</option>
                        <option value="Mentor">Mentor</option>
                      </select>
                    </div>
                  )}

                  <button 
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(''); }}
                    className="text-indigo-400 text-xs hover:underline text-left mt-1"
                  >
                    {isLogin ? "Don't have an account? Sign Up Instead" : "Already have an account? Sign In Instead"}
                  </button>

                  <div className="flex gap-3 justify-end mt-4">
                    <button 
                      type="button" 
                      onClick={() => { setShowJoinModal(false); setIsLogin(false); setError(''); }}
                      className="glass-button-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="glass-button text-sm"
                    >
                      {loading ? 'Connecting...' : 'Join Workspace'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
