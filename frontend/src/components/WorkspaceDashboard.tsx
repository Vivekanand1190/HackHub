import React, { useState } from 'react';
import { 
  Award, 
  Zap, 
  Code, 
  CheckCircle, 
  MessageSquare, 
  Clock, 
  Download, 
  FileText, 
  Image, 
  User, 
  Calendar,
  AlertTriangle,
  Github,
  Plus,
  Lock,
  Check,
  ShoppingBag,
  Flag
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import TeamPolls from './TeamPolls';
import Leaderboard from './Leaderboard';

interface Member {
  id: string;
  name: string;
  role: string;
  xp: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  column: string;
  assignee: { name: string } | null;
  deadline: string | null;
}

interface Attachment {
  originalName: string;
  url: string;
  size: number;
  mimetype: string;
}

interface Message {
  id: string;
  text: string;
  system: boolean;
  user: { name: string; role: string } | null;
  attachment: Attachment | null;
  timestamp: string;
}

interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

interface WorkspaceDashboardProps {
  teamId: string;
  user: { id: string; name: string; role: string; xp?: number } | null;
  teamName: string;
  joinCode: string;
  members: Member[];
  tasks: Task[];
  messages: Message[];
  snippetsCount: number;
  readinessScore: number;
  formattedTime?: string;
  githubRepo: string;
  milestones: Milestone[];
  unlockedAvatars: string[];
  onTeamUpdate: (updatedFields: { githubRepo?: string; milestones?: Milestone[]; unlockedAvatars?: string[] }) => void;
  onUserXpUpdate: (newXp: number) => void;
}

export default function WorkspaceDashboard({
  teamId,
  user,
  teamName,
  joinCode,
  members,
  tasks,
  messages,
  snippetsCount,
  readinessScore,
  formattedTime = '24:00:00',
  githubRepo,
  milestones,
  unlockedAvatars,
  onTeamUpdate,
  onUserXpUpdate
}: WorkspaceDashboardProps) {
  const completedTasks = tasks.filter(t => t.column === 'done').length;
  const totalTasks = tasks.length;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // State
  const [gitInput, setGitInput] = useState(githubRepo);
  const [savingGit, setSavingGit] = useState(false);
  const [gitSummary, setGitSummary] = useState<any>(null);
  const [loadingGitSummary, setLoadingGitSummary] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [showShop, setShowShop] = useState(false);
  const [buyingItem, setBuyingItem] = useState<string | null>(null);

  const fetchActivities = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/activities`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    }
  };

  const fetchGitSummary = async () => {
    if (!githubRepo) return;
    setLoadingGitSummary(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/github/summary`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGitSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub summary:', err);
    } finally {
      setLoadingGitSummary(false);
    }
  };

  React.useEffect(() => {
    fetchGitSummary();
    fetchActivities();
  }, [githubRepo, teamId]);

  // Default milestones if none exist yet
  const defaultMilestones: Milestone[] = [
    { id: 'm1', title: 'Define Problem & System Architecture', done: true },
    { id: 'm2', title: 'Create DB Schema & Initial Migrations', done: false },
    { id: 'm3', title: 'Implement Express API Routing endpoints', done: false },
    { id: 'm4', title: 'Build Core Frontend Layout & Monaco editor', done: false },
    { id: 'm5', title: 'Run Code Audit & AI Coach Scan fixes', done: false },
    { id: 'm6', title: 'Pitch Presentation Deck Draft & Code Freeze', done: false }
  ];

  const activeMilestones = milestones && milestones.length > 0 ? milestones : defaultMilestones;

  // Get current user XP from members list (synchronized)
  const currentUserXp = members.find(m => m.id === user?.id)?.xp ?? (user?.xp ?? 0);

  // Shop Items Configuration
  const shopItems = [
    { id: 'frame-neon', name: 'Neon Indigo Glow Frame', cost: 25, badge: 'Indigo Glow', color: 'shadow-lg shadow-indigo-500/20 border-indigo-400' },
    { id: 'frame-amber', name: 'Cyberpunk Amber Border', cost: 50, badge: 'Amber Border', color: 'shadow-lg shadow-amber-500/20 border-amber-400' },
    { id: 'frame-gold', name: 'Golden Champion Ring', cost: 100, badge: 'Gold Crown', color: 'shadow-lg shadow-yellow-500/20 border-yellow-400' },
    { id: 'pointer-laser', name: 'Laser Pointer Trail Unlock', cost: 150, badge: 'Laser Trail', color: 'shadow-lg shadow-rose-500/20 border-rose-400' }
  ];

  // 1. Save GitHub Repo URL
  const saveGithubRepo = async () => {
    setSavingGit(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          githubRepo: gitInput
        })
      });

      if (res.ok) {
        onTeamUpdate({ githubRepo: gitInput });
        alert('GitHub repository URL successfully integrated!');
        fetchGitSummary();
      } else {
        alert('Failed to save GitHub repo URL.');
      }
    } catch (err) {
      console.error('Git integration failed:', err);
    } finally {
      setSavingGit(false);
    }
  };

  // 2. Toggle Milestone completion state
  const toggleMilestone = async (mId: string) => {
    const updatedMilestones = activeMilestones.map(m => 
      m.id === mId ? { ...m, done: !m.done } : m
    );

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          milestones: updatedMilestones
        })
      });

      if (res.ok) {
        onTeamUpdate({ milestones: updatedMilestones });
      }
    } catch (err) {
      console.error('Milestone save failed:', err);
    }
  };

  // 3. Add Custom Milestone
  const addCustomMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;

    const newMilestone: Milestone = {
      id: `m-${Date.now()}`,
      title: newMilestoneTitle.trim(),
      done: false
    };

    const updatedMilestones = [...activeMilestones, newMilestone];

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          milestones: updatedMilestones
        })
      });

      if (res.ok) {
        onTeamUpdate({ milestones: updatedMilestones });
        setNewMilestoneTitle('');
      }
    } catch (err) {
      console.error('Milestone addition failed:', err);
    }
  };

  // 4. Shop Item Purchase
  const buyShopItem = async (itemId: string, cost: number) => {
    if (currentUserXp < cost) {
      alert('Insufficient XP to purchase this item! Solve tasks or trigger Copilot scans to earn XP.');
      return;
    }

    setBuyingItem(itemId);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/shop`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          itemName: itemId,
          cost,
          userId: user?.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        onUserXpUpdate(data.newXp);
        onTeamUpdate({ unlockedAvatars: data.unlocked });
        alert(`Successfully unlocked: "${shopItems.find(s => s.id === itemId)?.name}"!`);
      } else {
        const errorData = await res.json();
        alert(`Purchase failed: ${errorData.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Shop purchase failed:', err);
      alert('Connection error during shop transaction.');
    } finally {
      setBuyingItem(null);
    }
  };

  // 5. Workload Balancer Calculations
  // Find open tasks (todo / inprogress)
  const openTasks = tasks.filter(t => t.column !== 'done');
  const openCount = openTasks.length;
  
  // Calculate assignments
  const workloadAlerts: { memberName: string; percent: number }[] = [];
  if (openCount > 2) {
    const assignments: Record<string, number> = {};
    openTasks.forEach(t => {
      if (t.assignee) {
        assignments[t.assignee.name] = (assignments[t.assignee.name] || 0) + 1;
      }
    });

    Object.entries(assignments).forEach(([name, count]) => {
      const percent = Math.round((count / openCount) * 100);
      if (percent >= 70) {
        workloadAlerts.push({ memberName: name, percent });
      }
    });
  }

  // 6. SVG Burndown Chart Calculations
  // Generate mock sprint data points based on tasks
  // Point 0: Total tasks
  // Point 1: Total tasks - (in progress * 0.4)
  // Point 2: Total tasks - in progress
  // Point 3: Total tasks - in progress - completed tasks
  const idealPoints = [totalTasks, Math.max(0, totalTasks * 0.7), Math.max(0, totalTasks * 0.35), 0];
  const remainingCount = totalTasks - completedTasks;
  const actualPoints = [
    totalTasks,
    totalTasks - Math.round(tasks.filter(t => t.column === 'inprogress').length * 0.4),
    remainingCount + Math.round(tasks.filter(t => t.column === 'inprogress').length * 0.3),
    remainingCount
  ];

  // SVG Coordinates mapping
  const chartHeight = 120;
  const chartWidth = 360;
  const mapY = (val: number) => {
    if (totalTasks === 0) return chartHeight - 10;
    return 10 + (chartHeight - 20) * (1 - val / totalTasks);
  };
  const mapX = (idx: number) => {
    return 10 + (chartWidth - 20) * (idx / 3);
  };

  const idealPath = idealPoints.map((val, idx) => `${mapX(idx)},${mapY(val)}`).join(' L ');
  const actualPath = actualPoints.map((val, idx) => `${mapX(idx)},${mapY(val)}`).join(' L ');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  };

  const sharedFiles = messages
    .filter(m => m.attachment)
    .map(m => ({
      id: m.id,
      originalName: m.attachment!.originalName,
      url: m.attachment!.url,
      size: m.attachment!.size,
      mimetype: m.attachment!.mimetype,
      uploadedBy: m.user?.name || 'System',
      timestamp: m.timestamp
    }))
    .reverse()
    .slice(0, 5);

  const getAvatarBadge = (memberId: string) => {
    const isCurrentUser = memberId === user?.id;
    // Render unlocked badges in leaderboard
    const unlockedList = unlockedAvatars || [];
    if (unlockedList.includes('frame-gold')) return '🏆';
    if (unlockedList.includes('frame-amber')) return '🔥';
    if (unlockedList.includes('frame-neon')) return '⚡';
    return null;
  };

  const getAvatarBorder = (memberId: string) => {
    const unlockedList = unlockedAvatars || [];
    // Only apply border effects to Leaderboard entries if unlocked
    if (unlockedList.includes('frame-gold')) return 'ring-2 ring-yellow-450 ring-offset-2 ring-offset-slate-950 shadow-yellow-500/25';
    if (unlockedList.includes('frame-amber')) return 'ring-2 ring-amber-450 ring-offset-2 ring-offset-slate-950 shadow-amber-500/25';
    if (unlockedList.includes('frame-neon')) return 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950 shadow-indigo-500/25';
    return '';
  };

  // Parse countdown timer digits
  const [hours, minutes, seconds] = formattedTime.split(':');

  return (
    <div className="flex flex-col gap-6 h-full max-h-full overflow-y-auto pb-8 pr-1">
      
      {/* Workload Alerts Warning Banner */}
      {workloadAlerts.map((alert, idx) => (
        <div key={idx} className="flex items-center gap-3.5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 shadow-md">
          <AlertTriangle className="h-5.5 w-5.5 text-amber-400 shrink-0 animate-bounce" />
          <div className="text-xs">
            <span className="font-extrabold text-white">Workload Imbalance Warning: </span>
            {alert.memberName} is currently assigned to <span className="font-bold text-amber-450">{alert.percent}%</span> of all active team tasks. Re-assign task cards to prevent development sprint bottlenecks.
          </div>
        </div>
      ))}

      {/* Welcome Banner / Header */}
      <div className="glass-panel p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/25 to-slate-900 border-indigo-500/25 flex flex-col xl:flex-row xl:items-center justify-between gap-6 shadow-xl glow-card">
        <div>
          <h2 className="text-2xl font-extrabold text-white mb-1.5 flex items-center gap-2">
            Welcome to {teamName} Workspace!
            <span className="text-[9px] py-0.5 px-2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/35 uppercase tracking-widest font-bold">
              Premium Dashboard
            </span>
          </h2>
          <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
            Collaboratively code in Monaco, whiteboard ideas, sync sprint tasks, and review with the AI Copilot to deliver a world-class submission.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {/* Digital Countdown Clock */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Deadline Countdown</span>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div className="bg-slate-950 border border-slate-800/80 w-11 h-11 rounded-xl flex items-center justify-center font-mono text-base font-bold text-glow-cyan text-accent">
                  {hours}
                </div>
                <span className="text-[7px] text-slate-500 font-bold uppercase mt-1">hrs</span>
              </div>
              <span className="text-slate-600 font-bold mb-4 animate-pulse">:</span>
              <div className="flex flex-col items-center">
                <div className="bg-slate-950 border border-slate-800/80 w-11 h-11 rounded-xl flex items-center justify-center font-mono text-base font-bold text-glow-cyan text-accent">
                  {minutes}
                </div>
                <span className="text-[7px] text-slate-500 font-bold uppercase mt-1">min</span>
              </div>
              <span className="text-slate-600 font-bold mb-4 animate-pulse">:</span>
              <div className="flex flex-col items-center">
                <div className="bg-slate-950 border border-slate-800/80 w-11 h-11 rounded-xl flex items-center justify-center font-mono text-base font-bold text-glow-cyan text-accent">
                  {seconds}
                </div>
                <span className="text-[7px] text-slate-500 font-bold uppercase mt-1">sec</span>
              </div>
            </div>
          </div>

          {/* Join Code Box & Export Zip */}
          <div className="flex items-center gap-3">
            <div className="glass-panel py-2 px-5 rounded-xl border-slate-800 text-center bg-slate-950/40 shrink-0">
              <span className="text-[8px] text-slate-500 uppercase tracking-widest font-extrabold block">Teammate Join Code</span>
              <span className="text-xl font-mono font-extrabold text-indigo-400 tracking-widest">{joinCode}</span>
            </div>

            <a
              href={apiUrl(`/api/teams/${teamId}/export/zip`)}
              download
              className="glass-button text-xs py-2.5! px-3.5! flex items-center gap-1.5 font-bold"
              title="Download Project ZIP Archive"
            >
              <Download className="h-4 w-4" /> Export Zip
            </a>
          </div>
        </div>
      </div>

      {/* GitHub Repo Integration Card */}
      <div className="glass-panel p-5 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#ffe500] flex flex-col gap-4 bg-[#16161d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-black border-2 border-[#ffe500] text-[#ffe500]">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f5f1e6]">GitHub Integration</h3>
              <p className="text-[10px] text-slate-400 leading-normal">Link your repository for real-time commit tracking and code scan reviews</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto max-w-md flex-1 md:justify-end">
            <input
              type="text"
              value={gitInput}
              onChange={(e) => setGitInput(e.target.value)}
              placeholder="https://github.com/user/project-repo"
              className="glass-input text-xs w-full"
            />
            <button
              onClick={saveGithubRepo}
              disabled={savingGit}
              className="glass-button text-xs py-2! px-4! shrink-0 font-bold"
            >
              {savingGit ? 'Saving...' : 'Link Repo'}
            </button>
          </div>
        </div>

        {/* Live Repo Stats & Commits Feed */}
        {gitSummary && gitSummary.connected && (
          <div className="border-t-2 border-slate-800 pt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-[#ffe500]">{gitSummary.fullRepoName || gitSummary.repoName}</span>
                {gitSummary.defaultBranch && (
                  <span className="px-2 py-0.5 bg-black border border-[#4d7cff] text-[#4d7cff] text-[10px] font-mono font-bold">
                    branch: {gitSummary.defaultBranch}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-300">
                <span>⭐ {gitSummary.stars ?? 0} stars</span>
                <span>🍴 {gitSummary.forks ?? 0} forks</span>
                <span>❗ {gitSummary.openIssues ?? 0} issues</span>
                <a 
                  href={gitSummary.repoUrl || `https://github.com/${gitSummary.fullRepoName}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-bold text-[#ffe500] hover:underline ml-2"
                >
                  View Repo ↗
                </a>
              </div>
            </div>

            {/* Recent Commits List */}
            {gitSummary.recentCommits && gitSummary.recentCommits.length > 0 && (
              <div className="bg-black border border-slate-800 p-2.5 flex flex-col gap-1.5 text-xs font-mono">
                <span className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-900 pb-1">Recent Repository Commits</span>
                {gitSummary.recentCommits.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[#ffe500] font-bold">{c.sha}</span>
                      <span className="text-slate-200 truncate">{c.message}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{c.author}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3.5 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Readiness Score</span>
              <span className="text-2xl font-extrabold text-indigo-400">{readinessScore}%</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Zap className="h-5 w-5 animate-pulse" />
            </div>
          </div>
          <div className="w-full bg-slate-905 h-2 rounded-full overflow-hidden border border-slate-900">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${readinessScore}%` }}
            />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3.5 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Task Progress</span>
              <span className="text-2xl font-extrabold text-emerald-400">{completedTasks}/{totalTasks}</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="w-full bg-slate-905 h-2 rounded-full overflow-hidden border border-slate-900">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${taskProgress}%` }}
            />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between shadow-md">
          <div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Shared Snippets</span>
            <span className="text-2xl font-extrabold text-purple-400">{snippetsCount}</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Code className="h-5 w-5" />
          </div>
        </div>

        {/* User Shop Wallet balance widget */}
        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between shadow-md cursor-pointer hover:border-slate-750 transition" onClick={() => setShowShop(true)}>
          <div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">XP Rewards Shop</span>
            <span className="text-xl font-extrabold text-amber-400 flex items-center gap-1">
              <ShoppingBag className="h-4.5 w-4.5" /> Buy Avatar Glow
            </span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Award className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Columns (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Sprint Burndown Velocity Chart */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-lg border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-400" />
                Sprint Burndown Velocity
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Remaining Tasks: {remainingCount}</span>
            </div>

            <div className="w-full flex flex-col items-center">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32 bg-slate-950/40 rounded-xl p-2 border border-slate-900">
                {/* Horizontal Grid lines */}
                {[0, 1, 2, 3].map((g) => (
                  <line 
                    key={g} 
                    x1="10" 
                    y1={mapY(totalTasks * (g / 3))} 
                    x2={chartWidth - 10} 
                    y2={mapY(totalTasks * (g / 3))} 
                    stroke="#1e293b" 
                    strokeWidth="0.5" 
                    strokeDasharray="2" 
                  />
                ))}

                {/* Line: Ideal Burndown */}
                <path 
                  d={`M ${idealPath}`} 
                  fill="none" 
                  stroke="#475569" 
                  strokeWidth="2.5" 
                  strokeDasharray="4 2" 
                />

                {/* Line: Actual Burndown */}
                {totalTasks > 0 && (
                  <path 
                    d={`M ${actualPath}`} 
                    fill="none" 
                    stroke="url(#chart-gradient)" 
                    strokeWidth="3.5" 
                    strokeLinecap="round"
                  />
                )}

                {/* Gradient Definitions */}
                <defs>
                  <linearGradient id="chart-gradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>

                {/* Dots on points */}
                {actualPoints.map((val, idx) => (
                  <circle 
                    key={idx} 
                    cx={mapX(idx)} 
                    cy={mapY(val)} 
                    r="4" 
                    fill="#ec4899" 
                    stroke="#1e1b4b" 
                    strokeWidth="2.5" 
                  />
                ))}
              </svg>

              <div className="flex items-center justify-between w-full text-[9px] text-slate-500 font-mono font-bold mt-2 px-1 uppercase tracking-wide">
                <span>Start</span>
                <span>Day 1</span>
                <span>Day 2</span>
                <span>Demo Ready</span>
              </div>

              <div className="flex items-center gap-5 mt-3 self-start text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-1 border-t-2.5 border-dashed border-slate-600 block" />
                  <span>Ideal Sprint Burndown</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-1 border-t-3 border-indigo-500 block" />
                  <span>Actual Remaining Tasks</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Project Milestone Timeline */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-lg border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Flag className="h-5 w-5 text-indigo-400" />
                Interactive Project Timeline
              </h3>
              <form onSubmit={addCustomMilestone} className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Custom milestone..."
                  className="bg-slate-950 border border-slate-900 py-1 px-2.5 rounded-lg text-[10px] font-bold text-slate-300 focus:outline-none focus:border-indigo-500/40"
                />
                <button type="submit" className="p-1 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/35 rounded-lg text-indigo-400 transition">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            <div className="relative pl-6 border-l-2.5 border-slate-900 flex flex-col gap-5 py-2">
              {activeMilestones.map((m) => (
                <div 
                  key={m.id} 
                  onClick={() => toggleMilestone(m.id)}
                  className="relative flex items-center gap-3.5 cursor-pointer group"
                >
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[30px] w-4.5 h-4.5 rounded-full border-2.5 flex items-center justify-center transition ${
                    m.done 
                      ? 'bg-emerald-500 border-emerald-400 shadow-md shadow-emerald-500/20 text-white' 
                      : 'bg-slate-950 border-slate-900 group-hover:border-slate-800'
                  }`}>
                    {m.done && <Check className="h-2 w-2 stroke-[3]" />}
                  </div>

                  <div>
                    <span className={`text-xs font-bold transition ${
                      m.done ? 'text-slate-500 line-through' : 'text-slate-200 group-hover:text-white'
                    }`}>
                      {m.title}
                    </span>
                    <span className={`text-[8px] block font-mono font-semibold uppercase mt-0.5 ${
                      m.done ? 'text-emerald-500' : 'text-slate-500'
                    }`}>
                      {m.done ? 'Completed' : 'Pending sprint action'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-Time Activity Feed Card */}
          <div className="glass-panel p-5 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#ff4d8d] bg-[#16161d] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[#f5f1e6] uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-[#ff4d8d]" /> Live Activity Stream
              </h3>
              <span className="text-[10px] font-mono text-slate-400">({activities.length} recent events)</span>
            </div>

            {activities.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 font-mono">
                No recent workspace activities recorded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                {activities.map((act) => (
                  <div key={act.id} className="bg-black border border-slate-800 p-2.5 flex items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-slate-900 border border-slate-700 text-[#ffe500]">
                        {act.category}
                      </span>
                      <span className="text-slate-200 truncate">{act.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{act.author}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team Sprint Polls Card */}
          <TeamPolls teamId={teamId} userId={user?.id} />

          {/* Team Leaderboard Card */}
          <Leaderboard teamId={teamId} />

          {/* Active Tasks Overview */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-lg border-slate-800">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-indigo-400" />
              Active Project Tasks
            </h3>
            
            {tasks.length === 0 ? (
              <div className="border border-dashed border-slate-850 rounded-xl p-8 text-center text-xs text-slate-550">
                No tasks in the Kanban board. Go to Kanban Board to create tasks.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/40 border border-slate-900 hover:border-slate-800 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{task.title}</div>
                      <div className="flex items-center gap-3.5 mt-1.5 text-[9px] text-slate-500">
                        {task.assignee ? (
                          <span className="flex items-center gap-1 font-semibold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850">
                            <User className="h-3 w-3" /> {task.assignee.name}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-semibold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850">Unassigned</span>
                        )}
                        {task.deadline && (
                          <span className="flex items-center gap-1 font-semibold text-slate-450">
                            <Calendar className="h-3 w-3" /> {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 pl-3">
                      <span className={`text-[9px] px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider ${
                        task.column === 'done' 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/5' 
                          : task.column === 'inprogress'
                          ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-sm shadow-purple-500/5'
                          : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-sm shadow-indigo-500/5'
                      }`}>
                        {task.column === 'done' ? 'Done' : task.column === 'inprogress' ? 'In Progress' : 'To Do'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Columns (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Team Leaderboard with custom frames */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-lg border-slate-800">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-400" />
              Team Leaderboard &amp; Experience
            </h3>
            
            <div className="flex flex-col gap-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/30 border border-slate-900 hover:border-slate-850 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-8.5 h-8.5 rounded-full bg-slate-855 border border-indigo-500/25 flex items-center justify-center font-extrabold text-indigo-300 text-xs relative ${getAvatarBorder(member.id)}`}>
                      {member.name.charAt(0)}
                      {getAvatarBadge(member.id) && (
                        <span className="absolute -top-1.5 -right-1.5 text-[10px]" title="Unlocked Frame Accessory">
                          {getAvatarBadge(member.id)}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                        {member.name}
                      </div>
                      <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">{member.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                      <Zap className="h-3 w-3 fill-current" /> {member.xp} XP
                    </span>
                    <span className="text-[9px] text-slate-500 block font-semibold mt-0.5">Level {Math.floor(member.xp / 100) + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Vault Shares */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col gap-4 shadow-lg border-slate-800">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              Recent Vault Shares
            </h3>
            
            {sharedFiles.length === 0 ? (
              <div className="border border-dashed border-slate-850 rounded-xl p-8 text-center text-xs text-slate-600">
                No shared files yet. Upload files to the vault to see them here.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sharedFiles.map((file) => (
                  <div key={file.id} className="p-3 bg-slate-900/40 border border-slate-900 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-slate-950 border border-slate-850 rounded-lg text-indigo-455 shrink-0">
                        {file.mimetype.startsWith('image/') ? (
                          <Image className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-200 truncate" title={file.originalName}>
                          {file.originalName}
                        </div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                          {formatFileSize(file.size)} • {file.uploadedBy}
                        </div>
                      </div>
                    </div>

                    <a 
                      href={file.url.startsWith('http') ? file.url : apiUrl(file.url)} 
                      download={file.originalName}
                      className="p-1.5 bg-slate-800 hover:bg-slate-705 text-slate-400 hover:text-white rounded-lg transition shrink-0 border border-slate-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: XP REWARDS SHOP */}
      {showShop && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 border-[#f5f1e6] border-3 max-w-md w-full flex flex-col gap-4 bg-[#16161d] relative shadow-[6px_6px_0_#ffe500]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-amber-400" />
                <h3 className="font-extrabold text-white text-base">XP Level Rewards Store</h3>
              </div>
              <button 
                onClick={() => setShowShop(false)}
                className="text-xs text-slate-550 hover:text-white bg-slate-900 border border-slate-800 py-1 px-2.5 rounded-lg transition"
              >
                Close Store
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase">Your Current XP Balance</span>
              <span className="text-sm font-extrabold text-amber-400 flex items-center gap-1.5">
                <Zap className="h-4 w-4 fill-current" /> {currentUserXp} XP
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
              {shopItems.map((item) => {
                const isUnlocked = (unlockedAvatars || []).includes(item.id);
                return (
                  <div key={item.id} className="p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-white">{item.name}</h4>
                      <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                        Unlocks the custom badge: <span className="font-bold text-slate-400">{item.badge}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => buyShopItem(item.id, item.cost)}
                      disabled={isUnlocked || buyingItem !== null}
                      className={`text-[10px] font-bold py-1.5 px-3 rounded-lg transition shrink-0 ${
                        isUnlocked 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                          : 'bg-slate-800 hover:bg-indigo-600 border border-slate-800 text-white'
                      }`}
                    >
                      {isUnlocked ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" /> Unlocked
                        </span>
                      ) : buyingItem === item.id ? (
                        'Buying...'
                      ) : (
                        `Buy for ${item.cost} XP`
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
