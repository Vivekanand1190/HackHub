import React, { useState, useEffect } from 'react';
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

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions';
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
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectTab,
  onRunCopilotScan,
  onOpenShop,
  onExportZip
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  const filteredCommands = commands.filter(c => 
    c.title.toLowerCase().includes(query.toLowerCase()) || 
    c.category.toLowerCase().includes(query.toLowerCase())
  );

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
              No matching commands found.
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
