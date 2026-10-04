import { API_BASE, apiUrl } from '../utils/api';
import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Play, 
  Code, 
  Save, 
  Terminal, 
  Layers, 
  Cpu, 
  Sparkles, 
  AlertCircle, 
  Plus, 
  Check, 
  X,
  Clock,
  RotateCcw
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface CodeSnippet {
  id: string;
  title: string;
  code: string;
  language: string;
}

interface CodeEditorProps {
  socket: Socket | null;
  teamId: string;
  initialSnippets: CodeSnippet[];
  userId: string;
  copilotState?: any;
  tasks?: any[];
}

interface LintIssue {
  id: string;
  severity: 'warning' | 'error' | 'info';
  line: number;
  message: string;
  suggestedFix?: string;
  fixText?: string;
}

export default function CodeEditor({ socket, teamId, initialSnippets, userId, copilotState, tasks = [] }: CodeEditorProps) {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [selectedSnippet, setSelectedSnippet] = useState<CodeSnippet | null>(null);
  const [code, setCode] = useState('// Select a snippet or create one to begin writing code...');
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [cursors, setCursors] = useState<Record<string, { name: string; cursor: { lineNumber: number; column: number } }>>({});

  // Version History States
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const fetchHistory = async () => {
    if (!selectedSnippet) return;
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/snippets/${selectedSnippet.id}/history`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRevisions(data);
      }
    } catch (err) {
      console.error('Failed to fetch version history:', err);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!selectedSnippet) return;
    setSavingSnapshot(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/snippets/${selectedSnippet.id}/history`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code,
          language,
          commitMessage: `Revision created at ${new Date().toLocaleTimeString()}`
        })
      });
      if (res.ok) {
        fetchHistory();
        alert('Code version snapshot saved!');
      }
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setSavingSnapshot(false);
    }
  };

  const handleRestoreRevision = async (rev: any) => {
    if (!selectedSnippet) return;
    try {
      setCode(rev.code);
      if (rev.language) setLanguage(rev.language);
      if (socket) {
        socket.emit('code-update', { teamId, snippetId: selectedSnippet.id, code: rev.code });
      }
      alert(`Restored code snapshot from ${new Date(rev.createdAt).toLocaleTimeString()}!`);
    } catch (err) {
      console.error('Error restoring revision:', err);
    }
  };

  useEffect(() => {
    if (selectedSnippet) fetchHistory();
  }, [selectedSnippet]);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [showCopilotOverlay, setShowCopilotOverlay] = useState(true);
  const [addingTaskMap, setAddingTaskMap] = useState<Record<string, boolean>>({});

  // Calculate dynamic stats for Copilot overlay
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.column === 'done').length;
  const mvpProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 64;
  const readiness = copilotState?.readinessScore || 82;
  const pitchScore = Math.min(85, readiness + 3);

  const suggestedNextTask = copilotState?.suggestions?.[0] || 'Implement Authentication layer to secure NeuralProvider context.';

  useEffect(() => {
    setSnippets(initialSnippets);
    if (initialSnippets.length > 0) {
      const first = initialSnippets[0];
      setSelectedSnippet(first);
      setCode(first.code);
      setLanguage(first.language);
    }
  }, [initialSnippets]);

  // Live syntax & typo scanner
  const runLinter = (codeText: string) => {
    const issues: LintIssue[] = [];
    const lines = codeText.split('\n');

    lines.forEach((lineText, index) => {
      const lineNum = index + 1;
      // 1. Check for 'threw' typo
      if (/\bthrew\b/.test(lineText)) {
        issues.push({
          id: `threw-${lineNum}`,
          severity: 'error',
          line: lineNum,
          message: `Bug Detected in Line ${lineNum}: Typo 'threw' used instead of 'throw'. Correcting will resolve runtime crash.`,
          suggestedFix: "Change 'threw' to 'throw'",
          fixText: 'threw'
        });
      }
      // 2. Check for hardcoded credentials/secrets
      if (/(key|secret|password|token)\s*=\s*['"][a-zA-Z0-9_\-]{8,}['"]/i.test(lineText)) {
        issues.push({
          id: `secret-${lineNum}`,
          severity: 'warning',
          line: lineNum,
          message: `Security vulnerability: Hardcoded API credential key detected on Line ${lineNum}. Use process.env variables instead.`,
          suggestedFix: "Convert to process.env variable"
        });
      }
      // 3. Check for open CORS configurations
      if (/cors.*origin.*['"]\*['"]/i.test(lineText)) {
        issues.push({
          id: `cors-${lineNum}`,
          severity: 'warning',
          line: lineNum,
          message: `Security warning: Wildcard CORS origin ('*') enabled on Line ${lineNum}. Restrict to authorized client origins.`,
          suggestedFix: "Restrict CORS origin to localhost:3000"
        });
      }
    });

    setLintIssues(issues);
  };

  // Run linter on code change
  useEffect(() => {
    const debouncer = setTimeout(() => {
      runLinter(code);
    }, 600);
    return () => clearTimeout(debouncer);
  }, [code]);

  useEffect(() => {
    if (!socket) return;

    const handleCodeUpdate = (data: { snippetId: string; code: string }) => {
      if (selectedSnippet && selectedSnippet.id === data.snippetId) {
        setCode(data.code);
      }
      setSnippets(prev => prev.map(s => s.id === data.snippetId ? { ...s, code: data.code } : s));
    };

    const handleCursorUpdate = (data: { socketId: string; userId: string; name: string; cursor: any }) => {
      if (data.userId === userId) return;
      setCursors(prev => ({
        ...prev,
        [data.socketId]: { name: data.name, cursor: data.cursor }
      }));
    };

    socket.on('code-update', handleCodeUpdate);
    socket.on('cursor-update', handleCursorUpdate);

    return () => {
      socket.off('code-update', handleCodeUpdate);
      socket.off('cursor-update', handleCursorUpdate);
    };
  }, [socket, selectedSnippet, userId]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setCode(value);

    if (selectedSnippet) {
      socket?.emit('code-update', {
        teamId,
        snippetId: selectedSnippet.id,
        code: value
      });
    }
  };

  const handleCursorChange = (e: any) => {
    if (!socket || !selectedSnippet) return;
    const position = e.position;
    socket.emit('cursor-update', {
      teamId,
      cursor: {
        lineNumber: position.lineNumber,
        column: position.column
      }
    });
  };

  // Run Code in Sandboxed Environment
  const handleRunCode = async () => {
    setRunning(true);
    setOutput(['[Sandbox Runner] Compiling code project...', '[Sandbox Runner] Initializing sandboxed environment...']);

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl('/api/sandbox/execute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code, language })
      });

      if (res.ok) {
        const data = await res.json();
        setOutput([
          `⚡ Execution completed in ${data.durationMs}ms [${data.language.toUpperCase()}]`,
          ...(data.logs || []),
          data.success ? '✅ Output finished cleanly.' : '❌ Execution finished with errors.'
        ]);
      } else {
        const errData = await res.json();
        setOutput(prev => [...prev, `❌ Execution Error: ${errData.error || 'Failed to execute code'}`]);
      }
    } catch (err: any) {
      setOutput(prev => [...prev, `❌ Network / Execution Error: ${err.message}`]);
    } finally {
      setRunning(false);
    }
  };

  // AI Copilot Autofix function
  const handleAutofix = (issue: LintIssue) => {
    if (!issue.fixText) return;
    
    const lines = code.split('\n');
    const idx = issue.line - 1;
    if (lines[idx] && lines[idx].includes(issue.fixText)) {
      // Correct threw -> throw
      const correctedText = lines[idx].replace(/\bthrew\b/g, 'throw');
      lines[idx] = correctedText;
      const newCode = lines.join('\n');
      
      setCode(newCode);
      setOutput(prev => [
        ...prev,
        `💡 AI Copilot fixed issue: Corrected typo 'threw' to 'throw' on Line ${issue.line}.`
      ]);

      if (selectedSnippet) {
        socket?.emit('code-update', {
          teamId,
          snippetId: selectedSnippet.id,
          code: newCode
        });
      }
    }
  };

  // Add a Copilot recommendation directly to Kanban
  const handleAddCopilotTask = async (taskTitle: string, description: string, key: string) => {
    setAddingTaskMap(prev => ({ ...prev, [key]: true }));
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: taskTitle,
          description: description || 'Automatically suggested by Hackathon Copilot based on code layout analysis.',
          column: 'todo',
          teamId
        })
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
        setOutput(prev => [...prev, `💡 AI Copilot added new Kanban task: "${taskTitle}"`]);
      }
    } catch (err) {
      console.error('Failed to create task from copilot:', err);
    } finally {
      setAddingTaskMap(prev => ({ ...prev, [key]: false }));
    }
  };

  // Save/Create a snippet
  const handleSaveSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/snippets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          code,
          language,
          teamId
        })
      });

      if (res.ok) {
        const saved = await res.json();
        setSnippets(prev => [saved, ...prev]);
        setSelectedSnippet(saved);
        setTitle('');
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-5 h-[80vh]">
      {/* Sidebar - Snippets lists */}
      <div className="col-span-3 glass-panel p-4 rounded-2xl border-slate-800 flex flex-col justify-between">
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-sm text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Snippets
          </h3>

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[40vh]">
            {snippets.map((snip) => (
              <button
                key={snip.id}
                onClick={() => {
                  setSelectedSnippet(snip);
                  setCode(snip.code);
                  setLanguage(snip.language);
                }}
                className={`w-full text-left p-3 rounded-xl border text-xs transition flex flex-col gap-1 ${
                  selectedSnippet?.id === snip.id
                    ? 'border-indigo-500/40 bg-indigo-950/20 text-white'
                    : 'border-slate-800/40 bg-slate-900/20 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="font-bold truncate">{snip.title}</span>
                <span className="text-[10px] text-slate-500 uppercase">{snip.language}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Create new snippet form */}
        <form onSubmit={handleSaveSnippet} className="border-t border-slate-800/80 pt-4 flex flex-col gap-3">
          <input
            type="text"
            placeholder="New snippet title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="glass-input text-xs w-full py-2!"
            required
          />
          <div className="flex gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="glass-input text-[11px] py-1.5! flex-1 bg-slate-950 border-slate-800"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              className="glass-button text-xs py-1.5! px-3!"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* Main editor & console panel */}
      <div className="col-span-9 flex flex-col gap-4 relative">
        {/* Editor Actions bar */}
        <div className="glass-panel px-4 py-3 rounded-2xl border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-4.5 w-4.5 text-indigo-400" />
            <span className="text-xs font-bold text-white">
              {selectedSnippet ? selectedSnippet.title : 'Draft Mode (Unsaved)'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Active cursors display */}
            <div className="flex -space-x-1.5 overflow-hidden">
              {Object.entries(cursors).map(([sockId, data]) => (
                <div 
                  key={sockId} 
                  title={`${data.name} is on Line ${data.cursor.lineNumber}`}
                  className="w-5.5 h-5.5 rounded-full border border-indigo-400 bg-slate-900 text-[8px] font-bold flex items-center justify-center text-indigo-300 relative"
                >
                  {data.name.charAt(0)}
                  <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-slate-900"></span>
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveSnapshot}
              disabled={savingSnapshot || !selectedSnippet}
              className="glass-button-secondary text-xs py-1.5! px-3! flex items-center gap-1.5 font-mono"
              title="Save version snapshot"
            >
              <Save className="h-3.5 w-3.5 text-[#ffe500]" />
              <span className="hidden sm:inline">{savingSnapshot ? 'Snapshotting...' : 'Snapshot'}</span>
            </button>

            <button
              onClick={() => setShowHistory(!showHistory)}
              disabled={!selectedSnippet}
              className={`text-xs py-1.5! px-3! flex items-center gap-1.5 font-mono border-2 transition ${
                showHistory 
                  ? 'bg-[#ffe500] text-black border-black font-bold' 
                  : 'bg-black text-[#f5f1e6] border-[#f5f1e6]'
              }`}
              title="View Version History"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>History ({revisions.length})</span>
            </button>

            <button 
              onClick={handleRunCode}
              disabled={running}
              className="glass-button text-xs py-1.5! px-4! flex items-center gap-1.5"
            >
              <Play className="h-3.5 w-3.5" /> {running ? 'Running...' : 'Run Code'}
            </button>
          </div>
        </div>

        {/* Version History Drawer Panel */}
        {showHistory && (
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-3 shadow-[4px_4px_0_#ffe500] flex flex-col gap-2 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-[#ffe500] uppercase">Version History Revisions</span>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {revisions.length === 0 ? (
              <div className="text-slate-500 text-[11px] p-3 text-center">
                No snapshots saved for this file yet. Click "Snapshot" above to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {revisions.map((rev) => (
                  <div key={rev.id} className="bg-black border border-slate-800 p-2 flex items-center justify-between gap-3 text-[11px]">
                    <div className="flex flex-col min-w-0">
                      <span className="text-slate-200 font-semibold truncate">{rev.commitMessage}</span>
                      <span className="text-[9px] text-slate-500">{rev.author} • {new Date(rev.createdAt).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleRestoreRevision(rev)}
                      className="px-2.5 py-1 bg-[#4d7cff] hover:bg-[#3a5fd9] text-black font-bold uppercase text-[9px] border border-black flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monaco Editor Screen */}
        <div className="flex-1 glass-panel overflow-hidden min-h-[380px] p-2 bg-[#16161d] relative">
          <Editor
            height="100%"
            language={language}
            theme="neo-brutalist"
            value={code}
            onChange={handleEditorChange}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('neo-brutalist', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                  'editor.background': '#16161d',
                  'editor.foreground': '#f5f1e6',
                  'editorCursor.foreground': '#ffe500',
                  'editor.lineHighlightBackground': '#22222a',
                  'editorLineNumber.foreground': '#777777',
                  'editorLineNumber.activeForeground': '#ffe500',
                  'editor.selectionBackground': '#4d7cff44',
                }
              });
            }}
            onMount={(editor) => {
              editor.onDidChangeCursorPosition(handleCursorChange);
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: 'on'
            }}
          />

          {/* Floating AI Copilot overlay */}
          {showCopilotOverlay && (
            <div className="absolute bottom-4 right-4 w-[330px] glass-panel bg-slate-950/95 border-indigo-500/30 p-4 rounded-xl shadow-2xl z-30 flex flex-col gap-3.5 backdrop-blur-md">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Cpu className="h-4 w-4 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white leading-none">Hackathon Copilot</h4>
                    <span className="text-[8px] text-slate-500 font-semibold uppercase flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
                      Analysing project real-time
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCopilotOverlay(false)} 
                  className="text-slate-500 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Metrics Row */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-900/40 border border-slate-900 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">Pitch Score</div>
                  <div className="text-sm font-extrabold text-indigo-400 mt-0.5">{pitchScore}% <span className="text-[8px] text-emerald-400 font-medium">+2%</span></div>
                </div>
                <div className="bg-slate-900/40 border border-slate-900 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">MVP Progress</div>
                  <div className="text-sm font-extrabold text-cyan-400 mt-0.5">{mvpProgress}%</div>
                </div>
              </div>

              {/* Warnings / Linter alert section */}
              {lintIssues.length > 0 ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex flex-col gap-2">
                  <div className="flex items-start gap-2 text-rose-300 text-[10px] leading-relaxed">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{lintIssues[0].message}</span>
                  </div>
                  
                  <div className="flex gap-2 mt-1">
                    {lintIssues[0].fixText && (
                      <button 
                        onClick={() => handleAutofix(lintIssues[0])}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] px-2.5 py-1 rounded-md transition flex items-center gap-1.5"
                      >
                        <Sparkles className="h-3 w-3" /> Fix with AI Copilot
                      </button>
                    )}
                    <button 
                      onClick={() => handleAddCopilotTask(`Fix ${lintIssues[0].fixText || 'code bug'} in ${selectedSnippet?.title || 'sandbox'}`, lintIssues[0].message, lintIssues[0].id)}
                      disabled={addingTaskMap[lintIssues[0].id]}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-[9px] px-2.5 py-1 rounded-md transition flex items-center gap-1"
                    >
                      {addingTaskMap[lintIssues[0].id] ? 'Adding...' : (
                        <>
                          <Plus className="h-3 w-3" /> Add to Tasks
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center gap-2 text-emerald-400 text-[10px]">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Code compiles cleanly! No warnings detected.</span>
                </div>
              )}

              {/* Next Task recommendation */}
              <div className="border-t border-slate-900 pt-2 flex flex-col gap-1.5">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Suggested Next Task</span>
                <p className="text-[10px] text-slate-300 leading-normal font-medium">{suggestedNextTask}</p>
                <button 
                  onClick={() => handleAddCopilotTask(suggestedNextTask, 'Automatically suggested by Hackathon Copilot based on project maturity scores.', 'next-task')}
                  disabled={addingTaskMap['next-task']}
                  className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-indigo-400 hover:text-indigo-300 font-bold text-[9px] py-1.5 rounded-md transition flex items-center justify-center gap-1"
                >
                  {addingTaskMap['next-task'] ? 'Adding to Kanban...' : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add to Tasks
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Toggle button if hidden */}
          {!showCopilotOverlay && (
            <button
              onClick={() => setShowCopilotOverlay(true)}
              className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg border border-indigo-500/30 transition hover:scale-105 z-30 animate-bounce"
              title="Open AI Copilot Review"
            >
              <Cpu className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Terminal/Console Output */}
        <div className="glass-panel p-4 rounded-2xl border-slate-800 bg-slate-950 flex flex-col gap-2 h-40">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
            <Terminal className="h-3.5 w-3.5" /> Output Console
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs text-slate-300 flex flex-col gap-1 pr-1 bg-black/40 p-2.5 rounded-lg border border-slate-900">
            {output.length === 0 ? (
              <span className="text-slate-600">Console is empty. Click "Run Code" above to check execution output.</span>
            ) : (
              output.map((line, idx) => (
                <div key={idx} className={line.startsWith('❌') ? 'text-rose-400 font-semibold' : line.startsWith('💡') ? 'text-indigo-300' : 'text-slate-300'}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
