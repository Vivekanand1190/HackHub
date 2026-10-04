import React, { useState, useEffect } from 'react';
import { Award, Zap, Trophy, ShieldCheck, User } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface LeaderboardMember {
  id: string;
  name: string;
  role: string;
  xp: number;
  level: number;
  completedTasks: number;
  roleBadge: string;
  rank: number;
  badge: string;
}

interface LeaderboardProps {
  teamId: string;
}

export default function Leaderboard({ teamId }: LeaderboardProps) {
  const [members, setMembers] = useState<LeaderboardMember[]>([]);
  const [totalXp, setTotalXp] = useState(0);

  const fetchLeaderboard = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/leaderboard`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.leaderboard || []);
        setTotalXp(data.totalTeamXp || 0);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [teamId]);

  return (
    <div className="glass-panel p-5 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#4d7cff] bg-[#16161d] flex flex-col gap-4 font-sans">
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-black border-2 border-[#4d7cff] text-[#4d7cff]">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-[#f5f1e6] uppercase tracking-wider">Team XP Leaderboard</h3>
            <p className="text-[10px] text-slate-400">Total Team XP Accumulated: {totalXp} XP</p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-1 bg-black border border-slate-700 text-[#ffe500] font-bold">
          Sprint Ranks
        </span>
      </div>

      {members.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 font-mono">
          No leaderboard data available yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {members.map((m) => (
            <div
              key={m.id}
              className={`p-3 border-2 flex items-center justify-between gap-3 font-mono text-xs transition ${
                m.rank === 1
                  ? 'bg-black border-[#ffe500] shadow-[3px_3px_0_#ffe500]'
                  : m.rank === 2
                  ? 'bg-black border-[#4d7cff] shadow-[3px_3px_0_#4d7cff]'
                  : m.rank === 3
                  ? 'bg-black border-[#ff4d8d] shadow-[3px_3px_0_#ff4d8d]'
                  : 'bg-black border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold font-mono w-6 text-center">
                  {m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : `#${m.rank}`}
                </span>
                <div className="flex flex-col">
                  <span className="font-bold text-[#f5f1e6]">{m.name}</span>
                  <span className="text-[9px] text-slate-400">
                    {m.role} • Lvl {m.level} • {m.completedTasks} Tasks Done
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-900 border border-slate-700 text-[#b8ff3c]">
                  {m.xp} XP
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
