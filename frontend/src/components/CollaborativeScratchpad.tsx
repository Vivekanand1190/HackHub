import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  Plus, 
  Save, 
  Eye, 
  EyeOff, 
  Loader2, 
  Trash2, 
  BookOpen, 
  FileEdit,
  Sparkles,
  Heading
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface Document {
  id: string;
  title: string;
  content: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

interface CollaborativeScratchpadProps {
  socket: Socket | null;
  teamId: string;
  initialDocuments: Document[];
}

export default function CollaborativeScratchpad({ socket, teamId, initialDocuments }: CollaborativeScratchpadProps) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  
  // Status states
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Load initial documents
  useEffect(() => {
    if (initialDocuments && initialDocuments.length > 0) {
      setDocs(initialDocuments);
      setSelectedDocId(initialDocuments[0].id);
      setTitle(initialDocuments[0].title);
      setContent(initialDocuments[0].content);
    }
  }, [initialDocuments]);

  // Synchronize local doc state when list selection changes
  useEffect(() => {
    if (!selectedDocId) return;
    const current = docs.find(d => d.id === selectedDocId);
    if (current) {
      setTitle(current.title);
      setContent(current.content);
      setSaveStatus('saved');
    }
  }, [selectedDocId, docs]);

  // Socket listener for real-time document updates from other members
  useEffect(() => {
    if (!socket) return;

    const handleDocumentUpdate = (data: { documentId: string; title: string; content: string }) => {
      setDocs(prev => prev.map(d => d.id === data.documentId ? { ...d, title: data.title, content: data.content } : d));
      
      if (selectedDocId === data.documentId) {
        setTitle(data.title);
        setContent(data.content);
        setSaveStatus('saved');
      }
    };

    socket.on('document-update', handleDocumentUpdate);

    return () => {
      socket.off('document-update', handleDocumentUpdate);
    };
  }, [socket, selectedDocId]);

  // Save document handler
  const saveDocument = useCallback(async (docId: string, currentTitle: string, currentContent: string) => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch('http://localhost:8888/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: docId,
          title: currentTitle,
          content: currentContent,
          teamId
        })
      });

      if (res.ok) {
        const savedDoc = await res.json();
        setDocs(prev => prev.map(d => d.id === docId ? savedDoc : d));
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('[Scratchpad] Save error:', err);
      setSaveStatus('dirty');
    } finally {
      setSaving(false);
    }
  }, [teamId]);

  // Auto-save debounce effect
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerAutoSave = (docId: string, nextTitle: string, nextContent: string) => {
    setSaveStatus('dirty');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveDocument(docId, nextTitle, nextContent);
    }, 1500); // Save after 1.5 seconds of inactivity
  };

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Action handlers
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDocId) return;
    const nextTitle = e.target.value;
    setTitle(nextTitle);
    
    // Broadcast changes in real-time
    socket?.emit('document-update', {
      teamId,
      documentId: selectedDocId,
      title: nextTitle,
      content
    });

    triggerAutoSave(selectedDocId, nextTitle, content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedDocId) return;
    const nextContent = e.target.value;
    setContent(nextContent);

    // Broadcast changes in real-time
    socket?.emit('document-update', {
      teamId,
      documentId: selectedDocId,
      title,
      content: nextContent
    });

    triggerAutoSave(selectedDocId, title, nextContent);
  };

  const handleCreateDocument = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch('http://localhost:8888/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: 'Untitled Note',
          content: '',
          teamId
        })
      });

      if (res.ok) {
        const newDoc = await res.json();
        setDocs(prev => [newDoc, ...prev]);
        setSelectedDocId(newDoc.id);
        setTitle(newDoc.title);
        setContent(newDoc.content);
        setSaveStatus('saved');
      }
    } catch (err) {
      console.error('[Scratchpad] Create error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Simple Markdown parsing helper
  const renderMarkdown = (text: string) => {
    if (!text) return <p className="text-slate-500 italic text-xs">No content yet. Start typing to write Markdown...</p>;
    
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-bold text-white mb-3 mt-4 border-b border-slate-900 pb-1">{line.substring(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-lg font-bold text-slate-100 mb-2 mt-3">{line.substring(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-sm font-bold text-indigo-300 mb-1.5 mt-2">{line.substring(4)}</h3>;
      }
      // Lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="text-xs text-slate-300 ml-4 list-disc mb-1">{line.substring(2)}</li>;
      }
      // Bold & Italic replacements (basic regex rendering)
      let renderedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-900 px-1 py-0.5 rounded text-indigo-400 font-mono text-[10px]">$1</code>');

      // Empty line
      if (!line.trim()) return <div key={idx} className="h-2.5" />;
      
      return (
        <p 
          key={idx} 
          className="text-xs text-slate-350 leading-relaxed mb-1.5"
          dangerouslySetInnerHTML={{ __html: renderedLine }}
        />
      );
    });
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="grid grid-cols-12 gap-5 h-[80vh]">
      {/* Sidebar List of Documents */}
      <div className="col-span-3 glass-panel p-4 rounded-2xl border-slate-800 flex flex-col justify-between h-full bg-slate-950/20">
        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-indigo-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">Workspace Notes</h3>
            </div>
            <button 
              onClick={handleCreateDocument}
              className="p-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500 hover:text-white transition"
              title="New Note"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Notes list */}
          <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
            {docs.length === 0 ? (
              <div className="text-center p-6 text-slate-500 text-xs italic">
                No notes created. Click '+' to start.
              </div>
            ) : (
              docs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`p-3 rounded-xl text-left transition flex items-center gap-2.5 border ${
                    selectedDocId === doc.id 
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' 
                      : 'bg-slate-900/10 border-slate-900 hover:border-slate-800 text-slate-450 hover:text-slate-200'
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-bold truncate block">{doc.title || 'Untitled Note'}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-900 pt-3 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Notes auto-sync active</span>
          <Sparkles className="h-3.5 w-3.5 text-indigo-500/50" />
        </div>
      </div>

      {/* Editor & Preview Pane */}
      <section className="col-span-9 flex flex-col gap-4 h-full">
        {selectedDocId ? (
          <>
            {/* Toolbar */}
            <div className="glass-panel px-4 py-2.5 rounded-2xl border-slate-800 flex items-center justify-between bg-slate-950/20 z-10">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={handleTitleChange}
                  className="bg-transparent border-none outline-none text-xs font-bold text-white w-48 focus:ring-0 focus:border-indigo-500/50"
                  placeholder="Note Title"
                />
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900/80 text-slate-500 flex items-center gap-1.5 border border-slate-900">
                  {saveStatus === 'saved' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>}
                  {saveStatus === 'saving' && <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>}
                  {saveStatus === 'dirty' && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>}
                  {saveStatus}
                </span>
              </div>

              {/* View options */}
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-800/80">
                  <button
                    onClick={() => setMode('edit')}
                    className={`p-1 px-2.5 rounded-md text-[9px] uppercase font-bold transition flex items-center gap-1 ${
                      mode === 'edit' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-550 hover:text-slate-350'
                    }`}
                  >
                    <FileEdit className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => setMode('split')}
                    className={`p-1 px-2.5 rounded-md text-[9px] uppercase font-bold transition flex items-center gap-1 ${
                      mode === 'split' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-550 hover:text-slate-350'
                    }`}
                  >
                    <BookOpen className="h-3 w-3" /> Split
                  </button>
                  <button
                    onClick={() => setMode('preview')}
                    className={`p-1 px-2.5 rounded-md text-[9px] uppercase font-bold transition flex items-center gap-1 ${
                      mode === 'preview' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-550 hover:text-slate-350'
                    }`}
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                </div>

                <button
                  onClick={() => saveDocument(selectedDocId, title, content)}
                  disabled={saving || saveStatus === 'saved'}
                  className="p-1.5 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-650 text-white text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:hover:bg-indigo-500 transition shadow-md"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
              </div>
            </div>

            {/* Split panels */}
            <div className="flex-1 min-h-0 flex gap-4">
              {/* Write/Edit Panel */}
              {(mode === 'edit' || mode === 'split') && (
                <div className="flex-1 flex flex-col glass-panel rounded-2xl border-slate-800 bg-slate-950/10 p-4 h-full relative">
                  <textarea
                    value={content}
                    onChange={handleContentChange}
                    className="flex-1 bg-transparent border-none outline-none resize-none text-xs text-slate-200 leading-relaxed font-mono focus:ring-0"
                    placeholder="Write your markdown note here... (use # for titles, - for list bullet points, **text** for bold)"
                  />
                  <div className="border-t border-slate-900/60 pt-3 mt-2 flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    <span>Markdown Mode</span>
                    <span>{wordCount} words / {charCount} chars</span>
                  </div>
                </div>
              )}

              {/* Markdown Preview Panel */}
              {(mode === 'preview' || mode === 'split') && (
                <div className="flex-1 glass-panel rounded-2xl border-slate-800 bg-slate-950/15 p-5 h-full overflow-y-auto max-h-[66vh]">
                  <div className="prose prose-invert max-w-none">
                    <h1 className="text-xl font-bold text-white mb-4 border-b border-slate-900 pb-1">{title || 'Untitled Note'}</h1>
                    {renderMarkdown(content)}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-12 text-center gap-3">
            <FileText className="h-10 w-10 text-slate-700 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-slate-400">No Note Selected</h4>
              <p className="text-[10px] text-slate-600 max-w-[200px] mt-1 mx-auto leading-relaxed">
                Select a document from the left list or create a new note to start collaborating.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
