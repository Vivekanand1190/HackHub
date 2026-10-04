import React, { useState, useEffect } from 'react';
import { Vote, Plus, CheckCircle, BarChart2, X } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface PollOption {
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  voters: string[];
  author: string;
  createdAt: string;
}

interface TeamPollsProps {
  teamId: string;
  userId?: string;
}

export default function TeamPolls({ teamId, userId = '' }: TeamPollsProps) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [opt1, setOpt1] = useState('');
  const [opt2, setOpt2] = useState('');
  const [opt3, setOpt3] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPolls = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/polls`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPolls(data);
      }
    } catch (err) {
      console.error('Failed to fetch polls:', err);
    }
  };

  useEffect(() => {
    fetchPolls();
  }, [teamId]);

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/polls/${pollId}/vote`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optionIndex })
      });

      if (res.ok) {
        fetchPolls();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to submit vote');
      }
    } catch (err) {
      console.error('Vote failed:', err);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !opt1.trim() || !opt2.trim()) return;

    setCreating(true);
    const options = [opt1, opt2, opt3].filter(o => o.trim().length > 0);

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/polls`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question, options })
      });

      if (res.ok) {
        setQuestion('');
        setOpt1('');
        setOpt2('');
        setOpt3('');
        setShowCreateModal(false);
        fetchPolls();
      }
    } catch (err) {
      console.error('Create poll failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="glass-panel p-5 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#ffe500] bg-[#16161d] flex flex-col gap-4 font-sans">
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-black border-2 border-[#ffe500] text-[#ffe500]">
            <Vote className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-[#f5f1e6] uppercase tracking-wider">Team Sprint Polls</h3>
            <p className="text-[10px] text-slate-400">Vote on team architecture and sprint decisions</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="glass-button text-xs py-1.5! px-3! flex items-center gap-1 font-bold"
        >
          <Plus className="h-4 w-4" /> New Poll
        </button>
      </div>

      {polls.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 font-mono">
          No active polls. Click "New Poll" to start a vote!
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {polls.map((poll) => {
            const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
            const hasVoted = Boolean(userId && poll.voters.includes(userId));

            return (
              <div key={poll.id} className="bg-black border-2 border-slate-800 p-4 flex flex-col gap-3 text-xs font-mono">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <span className="font-bold text-[#f5f1e6] text-sm">{poll.question}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{totalVotes} votes</span>
                </div>

                <div className="flex flex-col gap-2">
                  {poll.options.map((opt, idx) => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleVote(poll.id, idx)}
                        disabled={hasVoted}
                        className={`w-full text-left p-2.5 border-2 transition relative overflow-hidden flex items-center justify-between ${
                          hasVoted
                            ? 'border-slate-800 cursor-default bg-slate-950'
                            : 'border-slate-700 hover:border-[#ffe500] bg-slate-900'
                        }`}
                      >
                        {/* Progress Bar Background */}
                        <div
                          className="absolute inset-y-0 left-0 bg-[#ffe500]/20 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />

                        <span className="relative z-10 font-bold text-slate-200">{opt.text}</span>
                        <div className="relative z-10 flex items-center gap-2 font-mono font-bold text-[11px]">
                          <span className="text-[#ffe500]">{pct}%</span>
                          <span className="text-slate-400">({opt.votes})</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1">
                  <span>Created by {poll.author}</span>
                  {hasVoted && <span className="text-emerald-400 font-bold">✓ Vote Cast</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Poll */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 max-w-md w-full shadow-[8px_8px_0_#ffe500] flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2">
              <h4 className="font-extrabold text-sm text-[#f5f1e6] uppercase">Create Team Poll</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePoll} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Question</label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Which UI component framework should we use?"
                  className="glass-input text-xs"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Option 1</label>
                <input
                  type="text"
                  value={opt1}
                  onChange={(e) => setOpt1(e.target.value)}
                  placeholder="Option 1"
                  className="glass-input text-xs"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Option 2</label>
                <input
                  type="text"
                  value={opt2}
                  onChange={(e) => setOpt2(e.target.value)}
                  placeholder="Option 2"
                  className="glass-input text-xs"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Option 3 (Optional)</label>
                <input
                  type="text"
                  value={opt3}
                  onChange={(e) => setOpt3(e.target.value)}
                  placeholder="Option 3"
                  className="glass-input text-xs"
                />
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="glass-button-secondary text-xs py-1.5! px-3!"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="glass-button text-xs py-1.5! px-4!"
                >
                  {creating ? 'Creating...' : 'Launch Poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
