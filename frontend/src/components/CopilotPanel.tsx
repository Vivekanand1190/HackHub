import { API_BASE } from '../utils/api';
import React, { useState } from 'react';
import { 
  Cpu, 
  Sparkles, 
  CheckCircle, 
  Bug, 
  Lightbulb, 
  PlayCircle, 
  Loader2, 
  Plus,
  Shield,
  Code,
  Terminal,
  AlertTriangle,
  ChevronRight,
  Clipboard,
  Check,
  Zap,
  Gauge,
  Activity,
  UserCheck,
  Eye,
  FileCode
} from 'lucide-react';

interface CopilotPanelProps {
  teamId: string;
  initialState: {
    suggestions: string[];
    bugs: string[];
    features: string[];
    pitchTips: string[];
    readinessScore: number;
  } | null;
  onScanComplete: (newAnalysis: any) => void;
}

type TabType = 'coach' | 'playground' | 'audit';

export default function CopilotPanel({ teamId, initialState, onScanComplete }: CopilotPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('coach');
  const [analysis, setAnalysis] = useState(initialState || {
    suggestions: [
      'Create your first project task cards to build an implementation checklist.',
      'Draft your core application schemas inside the database dashboard.'
    ],
    bugs: [
      'No active project files found. Save your code to enable security vulnerability checks.'
    ],
    features: [
      'Implement a clean workspace dashboard showing member activities to win the judges over.'
    ],
    pitchTips: [
      'Define a clear problem statement before diving into complex database architectures.'
    ],
    readinessScore: 15
  });

  const [scanning, setScanning] = useState(false);
  const [addingSuggestionMap, setAddingSuggestionMap] = useState<Record<number, boolean>>({});

  // AI Playground State
  const [selectedTool, setSelectedTool] = useState('generate-api');
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [copiedPlayground, setCopiedPlayground] = useState(false);

  // Security Audit State
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<{
    securityScore: number;
    findings: any[];
    complexityAnalysis: any[];
    lighthouseScores: {
      performance: number;
      accessibility: number;
      seo: number;
      bestPractices: number;
    };
  } | null>(null);

  const toolPlaceholders: Record<string, string> = {
    'visualize-schema': 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id    String @id\n  email String\n  xp    Int\n}',
    'generate-api': 'GET /api/users\nResponse: { id: number, name: string, active: boolean }[]',
    'explain-code': 'function computeFibonacci(n) {\n  if (n <= 1) return n;\n  return computeFibonacci(n-1) + computeFibonacci(n-2);\n}',
    'generate-tests': 'function calculateDiscount(price, discountRate) {\n  return price - (price * discountRate);\n}',
    'commit-generator': 'diff --git a/src/index.js b/src/index.js\n- console.log("old logic");\n+ console.log("optimized build runtime");',
    'pitch-simulator': 'A blockchain-based carbon offset trading platform for small local organic farms.',
    'slide-outline': 'An AI-powered co-working hub for code security auditing and sprint burndowns.',
    'tagline-improver': 'A real-time whiteboard canvas with snapping guidelines and Notion-like scratchpads.'
  };

  const runAnalysis = async () => {
    setScanning(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/copilot/${teamId}/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        onScanComplete(data);
      }
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleAddSuggestionToKanban = async (suggestionText: string, index: number) => {
    setAddingSuggestionMap(prev => ({ ...prev, [index]: true }));
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: suggestionText,
          description: 'Suggested by Hackathon Copilot AI Coach.',
          column: 'todo',
          teamId
        })
      });

      if (res.ok) {
        alert(`Successfully added to Kanban tasks: "${suggestionText}"`);
      }
    } catch (err) {
      console.error('Failed to add suggestion to Kanban:', err);
    } finally {
      setAddingSuggestionMap(prev => ({ ...prev, [index]: false }));
    }
  };

  const executePlaygroundTool = async () => {
    if (!playgroundInput.trim()) {
      alert('Please enter some input text first.');
      return;
    }
    setPlaygroundLoading(true);
    setPlaygroundOutput('');
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/copilot/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          toolName: selectedTool,
          inputData: playgroundInput
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPlaygroundOutput(data.result);
      } else {
        const errorData = await res.json();
        setPlaygroundOutput(`Error executing AI tool: ${errorData.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Playground tool failed:', err);
      setPlaygroundOutput('Network connection error executing AI tool.');
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const runSecurityAudit = async () => {
    setAuditLoading(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/copilot/audit/${teamId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setAuditResults(data);
      } else {
        alert('Failed to execute code audit scan.');
      }
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPlayground(true);
    setTimeout(() => setCopiedPlayground(false), 2000);
  };

  const getScoreColor = (score: number) => {
    if (score < 40) return 'text-rose-500';
    if (score < 75) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getScoreGlow = (score: number) => {
    if (score < 40) return 'shadow-rose-500/20';
    if (score < 75) return 'shadow-amber-500/20';
    return 'shadow-emerald-500/20';
  };

  const handleToolChange = (val: string) => {
    setSelectedTool(val);
    setPlaygroundInput(toolPlaceholders[val] || '');
    setPlaygroundOutput('');
  };

  return (
    <div className="flex flex-col gap-6 h-full max-h-full overflow-y-auto pb-8 pr-1">
      
      {/* Tab Navigation Menu */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/40 border border-slate-900 self-start">
        <button
          onClick={() => setActiveTab('coach')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'coach'
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
          AI Coach Scan
        </button>
        <button
          onClick={() => {
            setActiveTab('playground');
            if (!playgroundInput) {
              setPlaygroundInput(toolPlaceholders[selectedTool]);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'playground'
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Playground Hub
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
            activeTab === 'audit'
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          Security & Code Quality Audit
        </button>
      </div>

      {/* TAB 1: AI COACH SCAN */}
      {activeTab === 'coach' && (
        <>
          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 border-indigo-500/25 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg shadow-indigo-500/10">
                <Cpu className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  AI Coach Scanner
                  <span className="text-[10px] py-0.5 px-2 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider font-semibold">
                    Live Analyzer
                  </span>
                </h2>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-2xl">
                  Run a check of all chat interactions, Kanban task progress, and Monaco file changes to generate personalized features, clean up code glitches, and compute the MVP validation meter.
                </p>
              </div>
            </div>

            <button
              onClick={runAnalysis}
              disabled={scanning}
              className="glass-button text-sm py-2.5! px-5! shrink-0 flex items-center gap-2 shadow-lg"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-white" /> Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4.5 w-4.5 text-white" /> Trigger AI Scan
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 flex flex-col gap-5">
              <div className={`glass-panel p-6 rounded-2xl border-slate-800 text-center flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-lg ${getScoreGlow(analysis.readinessScore)}`}>
                {scanning && (
                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-10">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                  </div>
                )}
                
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Submission Readiness</span>
                
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="60"
                      className="stroke-slate-900"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="72"
                      cy="72"
                      r="60"
                      className="stroke-indigo-500 transition-all duration-1000 ease-out"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 60}`}
                      strokeDashoffset={`${2 * Math.PI * 60 * (1 - analysis.readinessScore / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className={`text-4xl font-extrabold tracking-tight transition-colors duration-500 ${getScoreColor(analysis.readinessScore)}`}>
                      {analysis.readinessScore}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Ready Score</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px]">
                  Ready to submit? Reach <b>85%+</b> to ensure your project contains clean code and a solid pitch.
                </p>
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-5">
              <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                <h3 className="font-bold text-sm text-slate-200 mb-3.5 flex items-center gap-2">
                  <CheckCircle className="h-4.5 w-4.5 text-indigo-400" /> Actionable Next Steps
                </h3>
                <div className="flex flex-col gap-2.5">
                  {(analysis?.suggestions || []).map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900/30 border border-slate-900 text-xs text-slate-300 leading-relaxed flex items-center justify-between gap-4 hover:border-slate-800 transition">
                      <div className="flex items-start gap-2.5">
                        <span className="font-bold text-indigo-400 shrink-0">{idx + 1}.</span>
                        <span>{item}</span>
                      </div>
                      <button
                        onClick={() => handleAddSuggestionToKanban(item, idx)}
                        disabled={addingSuggestionMap[idx]}
                        className="bg-slate-800 hover:bg-slate-700/80 text-indigo-450 hover:text-indigo-300 text-[10px] font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1 shrink-0 border border-slate-800"
                      >
                        {addingSuggestionMap[idx] ? 'Adding...' : (
                          <>
                            <Plus className="h-3 w-3" /> Add to Kanban
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                <h3 className="font-bold text-sm text-rose-400 mb-3.5 flex items-center gap-2">
                  <Bug className="h-4.5 w-4.5 text-rose-450" /> Potential Bugs & Risks
                </h3>
                <div className="flex flex-col gap-2.5">
                  {(analysis?.bugs || []).map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-xs text-rose-200 leading-relaxed flex items-start gap-2.5 hover:border-rose-500/20 transition">
                      <span className="text-rose-400 font-bold">⚠️</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                <h3 className="font-bold text-sm text-purple-400 mb-3.5 flex items-center gap-2">
                  <Lightbulb className="h-4.5 w-4.5 text-purple-405" /> Killer Feature Recommendations
                </h3>
                <div className="flex flex-col gap-2.5">
                  {(analysis?.features || []).map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900/30 border border-slate-900 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5 hover:border-slate-800 transition">
                      <span className="text-purple-400 font-bold">✨</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                <h3 className="font-bold text-sm text-cyan-400 mb-3.5 flex items-center gap-2">
                  <PlayCircle className="h-4.5 w-4.5 text-cyan-450" /> Pitch &amp; Presentation Improvements
                </h3>
                <div className="flex flex-col gap-2.5">
                  {(analysis?.pitchTips || []).map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900/30 border border-slate-900 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5 hover:border-slate-800 transition">
                      <span className="text-cyan-400 font-bold">🎤</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: AI PLAYGROUND HUB */}
      {activeTab === 'playground' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Playground Tool Configurations */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col gap-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">AI Tools Sandbox</h3>
                  <p className="text-[10px] text-slate-500">Select an execution prompt helper</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {[
                  { id: 'generate-api', label: 'API Mock Data Generator', desc: 'Creates dummy JSON records' },
                  { id: 'visualize-schema', label: 'DB ERD Layout Generator', desc: 'Renders database relational SVG charts' },
                  { id: 'generate-tests', label: 'Jest Unit Test Suite Writer', desc: 'Automates mocking & testing assertions' },
                  { id: 'explain-code', label: '3-Line Code Explainer', desc: 'Explains complex script steps simply' },
                  { id: 'commit-generator', label: 'Git Commit Generator', desc: 'Summarizes edits conventional commits' },
                  { id: 'pitch-simulator', label: 'Judge technical Q&A Critic', desc: 'Creates challenging questions about code' },
                  { id: 'slide-outline', label: 'Pitch Deck Outlines', desc: 'Suggests visual layout for pitch decks' },
                  { id: 'tagline-improver', label: 'SaaS Tagline & Pitch Improver', desc: 'Creates hooks and selling slogans' }
                ].map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => handleToolChange(tool.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition group ${
                      selectedTool === tool.id
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-slate-900/20 border-slate-900/80 hover:border-slate-800'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                      selectedTool === tool.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-950 text-slate-500 group-hover:text-slate-300'
                    }`}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold transition ${selectedTool === tool.id ? 'text-indigo-400' : 'text-slate-300'}`}>
                        {tool.label}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{tool.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Playground Code Area */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <div className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Input Prompt / Source Payload</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-indigo-400 font-mono">
                  {selectedTool}
                </span>
              </div>

              <textarea
                value={playgroundInput}
                onChange={(e) => setPlaygroundInput(e.target.value)}
                className="w-full h-44 p-3 bg-slate-950 border border-slate-900 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500/40 transition resize-none leading-relaxed"
                placeholder="Paste code schemas or pitch briefs..."
              />

              <button
                onClick={executePlaygroundTool}
                disabled={playgroundLoading}
                className="glass-button text-sm py-2.5! px-4! flex items-center justify-center gap-2 self-end shadow-md disabled:opacity-50"
              >
                {playgroundLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" /> Running Qwen-Coder...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-indigo-450" /> Execute AI Tool
                  </>
                )}
              </button>
            </div>

            {/* Playground Output */}
            {(playgroundOutput || playgroundLoading) && (
              <div className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col gap-3.5 relative min-h-[160px]">
                {playgroundLoading && (
                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center rounded-2xl z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-indigo-400" /> AI Generated Result
                  </span>
                  {playgroundOutput && (
                    <button
                      onClick={() => copyToClipboard(playgroundOutput)}
                      className="text-xs text-slate-500 hover:text-white transition flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-3 py-1.5 rounded-lg"
                    >
                      {copiedPlayground ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-450" /> Copied
                        </>
                      ) : (
                        <>
                          <Clipboard className="h-3.5 w-3.5" /> Copy Code
                        </>
                      )}
                    </button>
                  )}
                </div>

                {selectedTool === 'visualize-schema' && playgroundOutput.includes('<svg') ? (
                  <div className="w-full flex justify-center bg-slate-950 p-4 border border-slate-900 rounded-xl overflow-x-auto shadow-inner border-indigo-500/10">
                    <div 
                      className="max-w-full text-indigo-400" 
                      dangerouslySetInnerHTML={{ __html: playgroundOutput }}
                    />
                  </div>
                ) : (
                  <pre className="p-4 bg-slate-950 border border-slate-900 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[300px] whitespace-pre-wrap">
                    {playgroundOutput}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SECURITY & CODE QUALITY AUDIT */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/10 to-slate-900 border-rose-500/25 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-450 shrink-0 shadow-lg shadow-rose-500/10">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Security &amp; Code Quality Auditor
                  <span className="text-[10px] py-0.5 px-2 rounded-full bg-rose-500/10 text-rose-450 border border-rose-500/20 uppercase tracking-wider font-semibold">
                    Local Rules Scanner
                  </span>
                </h2>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-2xl">
                  Analyze all code snippets within the team workspace workspace. Scans for credentials exposure, insecure JWT settings, open CORS policies, orphaned endpoints, database integrity issues, and calculates codebase file cyclomatic complexities.
                </p>
              </div>
            </div>

            <button
              onClick={runSecurityAudit}
              disabled={auditLoading}
              className="glass-button text-sm py-2.5! px-5! shrink-0 flex items-center gap-2 shadow-lg border-rose-500/30 text-rose-400 hover:text-white"
            >
              {auditLoading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-white" /> Scanning Snippets...
                </>
              ) : (
                <>
                  <Activity className="h-4.5 w-4.5 text-rose-400" /> Run Security Audit
                </>
              )}
            </button>
          </div>

          {/* Audit Results Panel */}
          {auditResults ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Security Score & Lighthouse Performance */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Security Score Meter */}
                <div className={`glass-panel p-6 rounded-2xl border-slate-800 text-center flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-lg ${getScoreGlow(auditResults.securityScore)}`}>
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Workspace Security Rating</span>
                  
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="72"
                        cy="72"
                        r="60"
                        className="stroke-slate-900"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="72"
                        cy="72"
                        r="60"
                        className={`transition-all duration-1000 ease-out ${
                          auditResults.securityScore < 50 ? 'stroke-rose-500' : auditResults.securityScore < 80 ? 'stroke-amber-500' : 'stroke-emerald-500'
                        }`}
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={`${2 * Math.PI * 60}`}
                        strokeDashoffset={`${2 * Math.PI * 60 * (1 - auditResults.securityScore / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className={`text-4xl font-extrabold tracking-tight transition-colors duration-500 ${getScoreColor(auditResults.securityScore)}`}>
                        {auditResults.securityScore}%
                      </span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">Audit Score</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px]">
                    Ensure no critical credentials or open access ports remain before building for final judge evaluations.
                  </p>
                </div>

                {/* Simulated Google Lighthouse Gauges */}
                <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Gauge className="h-4 w-4 text-indigo-400 animate-pulse" /> Lighthouse Simulator
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Performance', val: auditResults.lighthouseScores.performance, color: 'stroke-amber-500', text: 'text-amber-400' },
                      { label: 'Accessibility', val: auditResults.lighthouseScores.accessibility, color: 'stroke-emerald-500', text: 'text-emerald-400' },
                      { label: 'Best Practices', val: auditResults.lighthouseScores.bestPractices, color: 'stroke-emerald-500', text: 'text-emerald-400' },
                      { label: 'SEO Validation', val: auditResults.lighthouseScores.seo, color: 'stroke-emerald-500', text: 'text-emerald-400' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex flex-col items-center bg-slate-900/30 border border-slate-900 p-3.5 rounded-xl text-center">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="26" className="stroke-slate-950" strokeWidth="4.5" fill="transparent" />
                            <circle
                              cx="32"
                              cy="32"
                              r="26"
                              className={item.color}
                              strokeWidth="4.5"
                              fill="transparent"
                              strokeDasharray={`${2 * Math.PI * 26}`}
                              strokeDashoffset={`${2 * Math.PI * 26 * (1 - item.val / 100)}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className={`absolute text-xs font-extrabold ${item.text}`}>{item.val}%</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold mt-2.5 uppercase tracking-wide">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column: Findings & Cyclomatic Complexity Table */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* Findings List */}
                <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                  <h3 className="font-bold text-sm text-slate-200 mb-3.5 flex items-center gap-2">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-500" /> Vulnerability &amp; Insecurities Checklist
                  </h3>

                  <div className="flex flex-col gap-3">
                    {auditResults.findings.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500 border border-dashed border-slate-900 rounded-xl">
                        🎉 No security vulnerabilities detected in team snippet repositories. Excellent work!
                      </div>
                    ) : (
                      auditResults.findings.map((f) => (
                        <div 
                          key={f.id} 
                          className={`p-3 rounded-xl border text-xs leading-relaxed flex flex-col gap-1.5 transition ${
                            f.severity === 'critical' 
                              ? 'bg-rose-500/5 border-rose-500/15 text-rose-350' 
                              : f.severity === 'warning' 
                              ? 'bg-amber-500/5 border-amber-500/15 text-amber-300' 
                              : 'bg-indigo-500/5 border-indigo-500/15 text-indigo-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                f.severity === 'critical' ? 'bg-rose-500' : f.severity === 'warning' ? 'bg-amber-500' : 'bg-indigo-500'
                              } animate-ping`} />
                              {f.type}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              f.severity === 'critical' ? 'bg-rose-500/10 text-rose-400' : f.severity === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-indigo-500/10 text-indigo-400'
                            }`}>
                              {f.severity.toUpperCase()}
                            </span>
                          </div>

                          <h4 className="font-bold text-slate-200 mt-0.5">{f.title}</h4>
                          <p className="text-slate-400 text-[11px] leading-relaxed mt-0.5">{f.description}</p>
                          
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
                            <span>File: {f.file}</span>
                            {f.line > 0 && <span>• Line: {f.line}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cyclomatic Complexity Ratings */}
                <div className="glass-panel p-5 rounded-2xl border-slate-800 shadow-md">
                  <h3 className="font-bold text-sm text-slate-200 mb-3.5 flex items-center gap-2">
                    <FileCode className="h-4.5 w-4.5 text-indigo-400 animate-pulse" /> Cyclomatic Code Complexity Metrics
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-455 border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                          <th className="py-2 px-3">File Code Title</th>
                          <th className="py-2 px-3 text-center">Conditional Branches</th>
                          <th className="py-2 px-3 text-right">Complexity Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-950">
                        {auditResults.complexityAnalysis.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-slate-500">
                              No snippets uploaded to compute complexities.
                            </td>
                          </tr>
                        ) : (
                          auditResults.complexityAnalysis.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-900/10 transition">
                              <td className="py-2.5 px-3 font-mono text-slate-300 font-bold">{item.file}</td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-400">{item.score}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                                  item.rating === 'high' 
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                    : item.rating === 'medium'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  {item.rating.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          ) : (
            <div className="glass-panel p-8 rounded-2xl border-slate-900 text-center flex flex-col items-center justify-center gap-3">
              <Shield className="h-10 w-10 text-slate-600 mb-1" />
              <h3 className="font-bold text-sm text-slate-300">Security Reports Uninitialized</h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                Click the "Run Security Audit" scanner above to analyze script files for potential CORS misconfigurations, secrets exposure, route guards, and code complexity.
              </p>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
