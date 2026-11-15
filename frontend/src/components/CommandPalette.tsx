import React, { useState, useEffect, useRef } from 'react';
import { apiUrl } from '../utils/api';
import { 
  Search, 
  LayoutDashboard, 
  Code, 
  Edit3, 
  Trello, 
  Cpu, 
  Monitor, 
  FolderOpen, 
  Zap, 
  ShoppingBag, 
  Download,
  X,
  Sparkles
} from 'lucide-react';

export interface JumpTarget {
  id: string;
  text: string;
  channel?: string;
  author: string;
  role: string;
  timestamp: string;
  attachment?: unknown;
  reactions?: Record<string, string[]>;
  editedAt?: string | null;
  parentId?: string | null;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions' | 'Messages';
  icon: React.ElementType;
  action: () => void;
  badge?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  onRunCopilotScan?: () => void;
  onOpenShop?: () => void;
  onExportZip?: () => void;
  /** Required for content search; without it the palette stays navigation-only. */
  teamId?: string;
  onJumpToMessage?: (target: JumpTarget) => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectTab,
  onRunCopilotScan,
  onOpenShop,
  onExportZip,
  teamId,
  onJumpToMessage
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [contentResults, setContentResults] = useState<CommandItem[]>([]);
  const [searching, setSearching] = useState(false);
  // Latest callbacks, so the debounced search effect can stay keyed on
  // [query, isOpen, teamId] instead of re-firing on every parent render.
  const callbacksRef = useRef({ jump: onJumpToMessage, close: onClose });
  useEffect(() => {
    callbacksRef.current = { jump: onJumpToMessage, close: onClose };
  });

  const commands: CommandItem[] = [
    {
      id: 'nav-dashboard',
      title: 'Go to Workspace Dashboard',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => { onSelectTab('dashboard'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-editor',
      title: 'Open Shared Code Editor',
      category: 'Navigation',
      icon: Code,
      action: () => { onSelectTab('editor'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-whiteboard',
      title: 'Open Live Whiteboard',
      category: 'Navigation',
      icon: Edit3,
      action: () => { onSelectTab('whiteboard'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-kanban',
      title: 'Open Kanban Task Board',
      category: 'Navigation',
      icon: Trello,
      action: () => { onSelectTab('kanban'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-copilot',
      title: 'Open AI Hackathon Copilot',
      category: 'Navigation',
      icon: Cpu,
      action: () => { onSelectTab('copilot'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-[#ffe500]',
      title: 'Open Screen Share & Remote Huddle',
      category: 'Navigation',
      icon: Monitor,
      action: () => { onSelectTab('screenshare'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'nav-vault',
      title: 'Open File & Asset Vault',
      category: 'Navigation',
      icon: FolderOpen,
      action: () => { onSelectTab('vault'); onClose(); },
      badge: 'Tab'
    },
    {
      id: 'action-copilot-scan',
      title: 'Run Real-Time AI Readiness Audit',
      category: 'Actions',
      icon: Zap,
      action: () => {
        if (onRunCopilotScan) onRunCopilotScan();
        onSelectTab('copilot');
        onClose();
      },
      badge: 'AI Review'
    },
    {
      id: 'action-shop',
      title: 'Open XP Rewards Shop',
      category: 'Actions',
      icon: ShoppingBag,
      action: () => {
        if (onOpenShop) onOpenShop();
        onClose();
      },
      badge: 'XP Rewards'
    },
    {
      id: 'action-export',
      title: 'Export Workspace & Project Zip Archive',
      category: 'Actions',
      icon: Download,
      action: () => {
        if (onExportZip) onExportZip();
        onClose();
      },
      badge: 'Download'
    }
  ];

  // Content search runs against the team's whole message history. Only
  // messages are included: they are the one result type that can land on an
  // exact item. Snippet and note results would open a panel without opening
  // the thing itself, which is a fake affordance.
  useEffect(() => {
    const q = query.trim();
    if (!isOpen || !teamId || q.length < 2) {
      setContentResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('hackhub_token');
        const res = await fetch(
          apiUrl(`/api/teams/${teamId}/messages/search?q=${encodeURIComponent(q)}`),
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: controller.signal },
        );
        if (!res.ok) throw new Error(`search ${res.status}`);
        const rows = await res.json();
        setContentResults(
          (Array.isArray(rows) ? rows : []).slice(0, 8).map((m: any): CommandItem => ({
            id: `msg-${m.id}`,
            title: (m.text || '(attachment)').slice(0, 80),
            category: 'Messages',
            icon: Search,
            badge: m.channel ? `#${m.channel}` : 'Chat',
            action: () => {
              const jump = callbacksRef.current.jump;
              if (jump) {
                jump({
                  id: m.id,
                  text: m.text || '',
                  channel: m.channel,
                  author: m.author || 'Teammate',
                  role: m.role || 'Developer',
                  timestamp: m.timestamp,
                  attachment: m.attachment ?? null,
                  reactions: m.reactions ?? {},
                  editedAt: m.editedAt ?? null,
                  parentId: m.parentId ?? null,
                });
              }
              callbacksRef.current.close();
            },
          })),
        );
      } catch (err: any) {
        if (err?.name !== 'AbortError') setContentResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen, teamId]);

  const filteredCommands = query.trim()
    ? [
        ...commands.filter(c =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()),
        ),
        ...contentResults,
      ]
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open triggered
        }
      }

      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % (filteredCommands.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + (filteredCommands.length || 1)) % (filteredCommands.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-[100] flex items-start justify-center pt-20 p-4">
      <div className="w-full max-w-xl bg-[#16161d] border-3 border-[#f5f1e6] shadow-[8px_8px_0_#ffe500] flex flex-col overflow-hidden relative font-sans">
        {/* Input Bar */}
        <div className="p-4 border-b-3 border-[#f5f1e6] bg-black flex items-center gap-3">
          <Search className="h-5 w-5 text-[#ffe500] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search workspace... (Cmd / Ctrl + K)"
            className="w-full bg-transparent border-none text-[#f5f1e6] text-sm font-mono focus:outline-none placeholder:text-slate-500"
          />
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white border-2 border-slate-700 bg-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command list */}
        <div className="max-h-96 overflow-y-auto p-2 flex flex-col gap-1 bg-[#0b0b0f]">
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-xs">
              {searching ? 'Searching messages…' : 'No matching commands found.'}
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition font-mono text-xs border-2 ${
                    isSelected 
                      ? 'bg-[#ffe500] text-black border-black font-bold shadow-[2px_2px_0_#000]' 
                      : 'bg-[#16161d] text-[#f5f1e6] border-transparent hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${isSelected ? 'text-black' : 'text-[#ffe500]'}`} />
                    <span>{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-2 py-0.5 uppercase font-bold border ${
                      isSelected ? 'bg-black text-[#ffe500] border-black' : 'bg-black text-slate-400 border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts tip */}
        <div className="p-2.5 border-t-2 border-slate-800 bg-black flex items-center justify-between text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 text-white">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 text-white">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 text-white">ESC</kbd> Close</span>
          </div>
          <span className="text-[#ffe500] font-bold">HackHub Command Palette</span>
        </div>
      </div>
    </div>
  );
}
