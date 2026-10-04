import React, { useState, useEffect } from 'react';
import { Award, CheckCircle, Star, MessageSquare, ShieldCheck, Send, Layers } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface JudgeViewProps {
  teamId: string;
  teamName: string;
}

interface Evaluation {
  id: string;
  judgeName: string;
  pitchScore: number;
  codeScore: number;
  innovationScore: number;
  designScore: number;
  overallScore: number;
  comments: string;
  timestamp: string;
}

export default function JudgeView({ teamId, teamName }: JudgeViewProps) {
  const [pitchScore, setPitchScore] = useState(85);
  const [codeScore, setCodeScore] = useState(90);
  const [innovationScore, setInnovationScore] = useState(88);
  const [designScore, setDesignScore] = useState(85);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [avgScore, setAvgScore] = useState(87);

  const calculatedOverall = Math.round(
    pitchScore * 0.25 + codeScore * 0.35 + innovationScore * 0.25 + designScore * 0.15
  );

  const fetchJudgeScores = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/judge/score`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluations(data.evaluations || []);
        if (data.avgScore) setAvgScore(data.avgScore);
      }
    } catch (err) {
      console.error('Failed to fetch judge scores:', err);
    }
  };

  useEffect(() => {
    fetchJudgeScores();
  }, [teamId]);

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/judge/score`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pitchScore,
          codeScore,
          innovationScore,
          designScore,
          comments
        })
      });

      if (res.ok) {
        alert('Judge evaluation submitted successfully!');
        setComments('');
        fetchJudgeScores();
      } else {
        alert('Failed to submit judge score.');
      }
    } catch (err) {
      console.error('Error submitting judge score:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Header Banner */}
      <div className="glass-panel p-6 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#ffe500] bg-[#16161d] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-black border-2 border-[#ffe500] text-[#ffe500]">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-[#f5f1e6]">Judge & Mentor Evaluation Portal</h2>
            <p className="text-xs text-slate-400">Scoring workspace for "{teamName}" submission</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-black border-2 border-[#f5f1e6] p-3 shadow-[3px_3px_0_#ff4d8d]">
          <div className="text-right">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Current Avg Score</span>
            <span className="text-2xl font-extrabold text-[#ffe500]">{avgScore} / 100</span>
          </div>
          <ShieldCheck className="h-8 w-8 text-[#b8ff3c]" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Scoring Form */}
        <div className="lg:col-span-7 glass-panel p-6 border-[#f5f1e6] border-3 bg-[#16161d] shadow-[6px_6px_0_#ff4d8d] flex flex-col gap-5">
          <h3 className="text-base font-extrabold text-[#f5f1e6] uppercase tracking-wider border-b-2 border-slate-800 pb-2">
            Rubric Criteria Scoring
          </h3>

          <form onSubmit={handleSubmitScore} className="flex flex-col gap-5">
            {/* Criteria 1: Pitch */}
            <div className="flex flex-col gap-2 bg-black p-3.5 border-2 border-slate-800">
              <div className="flex justify-between items-center text-xs font-bold font-mono">
                <span className="text-[#f5f1e6]">1. Pitch & Presentation (25%)</span>
                <span className="text-[#ffe500] text-sm">{pitchScore} pts</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={pitchScore}
                onChange={(e) => setPitchScore(Number(e.target.value))}
                className="w-full accent-[#ffe500] cursor-pointer"
              />
            </div>

            {/* Criteria 2: Code Quality */}
            <div className="flex flex-col gap-2 bg-black p-3.5 border-2 border-slate-800">
              <div className="flex justify-between items-center text-xs font-bold font-mono">
                <span className="text-[#f5f1e6]">2. Code Quality & Architecture (35%)</span>
                <span className="text-[#4d7cff] text-sm">{codeScore} pts</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={codeScore}
                onChange={(e) => setCodeScore(Number(e.target.value))}
                className="w-full accent-[#4d7cff] cursor-pointer"
              />
            </div>

            {/* Criteria 3: Innovation */}
            <div className="flex flex-col gap-2 bg-black p-3.5 border-2 border-slate-800">
              <div className="flex justify-between items-center text-xs font-bold font-mono">
                <span className="text-[#f5f1e6]">3. Innovation & Originality (25%)</span>
                <span className="text-[#ff4d8d] text-sm">{innovationScore} pts</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={innovationScore}
                onChange={(e) => setInnovationScore(Number(e.target.value))}
                className="w-full accent-[#ff4d8d] cursor-pointer"
              />
            </div>

            {/* Criteria 4: Design */}
            <div className="flex flex-col gap-2 bg-black p-3.5 border-2 border-slate-800">
              <div className="flex justify-between items-center text-xs font-bold font-mono">
                <span className="text-[#f5f1e6]">4. UX & Design Aesthetics (15%)</span>
                <span className="text-[#b8ff3c] text-sm">{designScore} pts</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={designScore}
                onChange={(e) => setDesignScore(Number(e.target.value))}
                className="w-full accent-[#b8ff3c] cursor-pointer"
              />
            </div>

            {/* Comments Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Judge Feedback & Suggestions
              </label>
              <textarea
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Write constructive feedback for the team..."
                className="glass-input text-xs"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-mono">
                <span className="text-slate-400">Total Score: </span>
                <span className="font-extrabold text-[#ffe500] text-lg">{calculatedOverall} / 100</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="glass-button text-xs font-bold"
              >
                {submitting ? 'Submitting...' : 'Submit Evaluation'}
              </button>
            </div>
          </form>
        </div>

        {/* Existing Reviews & Feedback list */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="glass-panel p-5 border-[#f5f1e6] border-3 bg-[#16161d] shadow-[6px_6px_0_#4d7cff] flex flex-col gap-4">
            <h3 className="text-sm font-extrabold text-[#f5f1e6] uppercase tracking-wider border-b-2 border-slate-800 pb-2">
              Submitted Judge Reviews ({evaluations.length})
            </h3>

            {evaluations.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-mono">
                No judge evaluations recorded yet. Be the first to evaluate this team!
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto">
                {evaluations.map((ev) => (
                  <div key={ev.id} className="bg-black border-2 border-slate-800 p-3 flex flex-col gap-2 text-xs font-mono">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="font-bold text-[#ffe500]">{ev.judgeName}</span>
                      <span className="font-extrabold text-sm text-[#b8ff3c]">{ev.overallScore} / 100</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 my-1">
                      <span>Pitch: {ev.pitchScore}</span>
                      <span>Code: {ev.codeScore}</span>
                      <span>Innovation: {ev.innovationScore}</span>
                      <span>Design: {ev.designScore}</span>
                    </div>

                    <p className="text-slate-200 text-[11px] italic bg-slate-900/60 p-2 border border-slate-800">
                      "{ev.comments}"
                    </p>

                    <span className="text-[9px] text-slate-500 self-end">
                      {new Date(ev.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
