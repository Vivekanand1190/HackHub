import { API_BASE, apiUrl } from '../utils/api';
import type { JumpTarget } from './CommandPalette';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  FileText, 
  Image, 
  AlertCircle, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Monitor, 
  Settings, 
  Users, 
  Tv 
} from 'lucide-react';
import { Socket } from 'socket.io-client';

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
  userId?: string;
  attachment: Attachment | null;
  timestamp: string;
  channel?: string;
  parentId?: string | null;
  editedAt?: string | null;
  reactions?: Record<string, string[]>;
  pinned?: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  role?: string;
}

interface ChatWindowProps {
  socket: Socket | null;
  teamId: string;
  userId: string;
  userName: string;
  initialMessages: Message[];
  teamMembers?: TeamMember[];
  /** Set by the command palette to land on a specific message. */
  focusMessage?: JumpTarget | null;
  onFocusHandled?: () => void;
}

export default function ChatWindow({ socket, teamId, userId, userName, initialMessages, teamMembers = [], focusMessage = null, onFocusHandled }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'general' | 'development' | 'design'>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledFocusRef = useRef<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Array<{ id: string; text: string; author: string }>>([]);

  // Thread state
  const [activeThreadMessage, setActiveThreadMessage] = useState<Message | null>(null);
  const [threadText, setThreadText] = useState('');

  // Edit state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // @Mentions state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages(initialMessages);

    // Reactions and pins are persisted server-side now, so seed them from the
    // workspace payload instead of starting empty on every reload.
    const seededReactions: Record<string, Record<string, string[]>> = {};
    const seededPins: Array<{ id: string; text: string; author: string }> = [];

    for (const msg of initialMessages) {
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        seededReactions[msg.id] = msg.reactions;
      }
      if (msg.pinned) {
        seededPins.push({
          id: msg.id,
          text: msg.text || (msg.attachment ? 'File attachment' : 'Message'),
          author: msg.user?.name || 'Teammate',
        });
      }
    }

    setReactions(seededReactions);
    setPinnedMessages(seededPins);
  }, [initialMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleEditMessage = (data: { messageId: string; text: string; editedAt?: string }) => {
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, text: data.text, editedAt: data.editedAt || new Date().toISOString() } : m));
      setActiveThreadMessage(prev => prev && prev.id === data.messageId ? { ...prev, text: data.text, editedAt: data.editedAt || new Date().toISOString() } : prev);
    };

    const handleDeleteMessage = (data: { messageId: string }) => {
      setMessages(prev => prev.filter(m => m.id !== data.messageId));
      setActiveThreadMessage(prev => prev && prev.id === data.messageId ? null : prev);
    };

    const handleReaction = (data: { messageId: string; reactions?: Record<string, string[]> }) => {
      // Replace with the server's map — it is the single source of truth.
      setReactions(prev => ({
        ...prev,
        [data.messageId]: data.reactions || {}
      }));
    };

    const handlePin = (data: { messageId: string; isPinned: boolean; text: string; author: string }) => {
      setPinnedMessages(prev => {
        if (data.isPinned) {
          if (prev.some(p => p.id === data.messageId)) return prev;
          return [...prev, { id: data.messageId, text: data.text, author: data.author }];
        } else {
          return prev.filter(p => p.id !== data.messageId);
        }
      });
    };

    socket.on('chat-message', handleNewMessage);
    socket.on('chat-edit', handleEditMessage);
    socket.on('chat-delete', handleDeleteMessage);
    socket.on('chat-reaction', handleReaction);
    socket.on('chat-pin', handlePin);

    return () => {
      socket.off('chat-message', handleNewMessage);
      socket.off('chat-edit', handleEditMessage);
      socket.off('chat-delete', handleDeleteMessage);
      socket.off('chat-reaction', handleReaction);
      socket.off('chat-pin', handlePin);
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannel]);

  // Handle typing for @mentions
  const handleTextChange = (val: string) => {
    setText(val);
    const lastWord = val.split(' ').pop() || '';
    if (lastWord.startsWith('@')) {
      setShowMentionMenu(true);
      setMentionFilter(lastWord.slice(1).toLowerCase());
    } else {
      setShowMentionMenu(false);
    }
  };

  const insertMention = (memberName: string) => {
    const words = text.split(' ');
    words.pop();
    const newText = [...words, `@${memberName} `].join(' ');
    setText(newText);
    setShowMentionMenu(false);
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (socket) {
      // The server attributes the reaction to the authenticated user itself.
      socket.emit('chat-reaction', { teamId, messageId, emoji });
    }
  };

  const togglePin = (msg: Message) => {
    const isAlreadyPinned = pinnedMessages.some(p => p.id === msg.id);
    if (socket) {
      socket.emit('chat-pin', {
        teamId,
        messageId: msg.id,
        isPinned: !isAlreadyPinned,
        text: msg.text || (msg.attachment ? 'File attachment' : 'Message'),
        author: msg.user?.name || 'Teammate'
      });
    }
  };

  const handleSaveEdit = (messageId: string) => {
    if (!editingText.trim() || !socket) return;
    socket.emit('chat-edit', { teamId, messageId, text: editingText.trim() });
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleDelete = (messageId: string) => {
    if (!socket || !confirm('Are you sure you want to delete this message?')) return;
    socket.emit('chat-delete', { teamId, messageId });
  };

  const handleSend = async (e: React.FormEvent, parentId?: string | null) => {
    e.preventDefault();
    const messageText = parentId ? threadText : text;
    if (!messageText.trim() && !file) return;

    let attachment: Attachment | null = null;

    if (file && !parentId) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = localStorage.getItem('hackhub_token');
        const res = await fetch(`${API_BASE}/api/uploads`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        if (res.ok) {
          const uploaded = await res.json();
          attachment = {
            originalName: uploaded.originalName,
            url: uploaded.url,
            size: uploaded.size,
            mimetype: uploaded.mimetype
          };
        }
      } catch (err) {
        console.error('Upload error:', err);
      } finally {
        setUploading(false);
        setFile(null);
      }
    }

    if (socket) {
      socket.emit('chat-message', {
        teamId,
        userId,
        text: messageText.trim(),
        attachment,
        channel: activeChannel,
        parentId: parentId || null
      });

      if (parentId) {
        setThreadText('');
      } else {
        setText('');
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const renderMessageContent = (content: string, highlight?: string) => {
    if (!content) return null;

    // Highlight mentions and search terms
    const mentionRegex = /(@[A-Za-z0-9_]+)/g;
    const parts = content.split(mentionRegex);

    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span key={idx} className="bg-primary text-black font-extrabold px-1 border border-black text-[11px] inline-block my-0.5">
            {part}
          </span>
        );
      }
      if (highlight && highlight.trim()) {
        const hRegex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const hParts = part.split(hRegex);
        return hParts.map((hPart, hIdx) => 
          hPart.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={hIdx} className="bg-primary text-white font-bold px-0.5">{hPart}</mark>
          ) : (
            hPart
          )
        );
      }
      return part;
    });
  };

  // Land on a message chosen from the command palette: switch to its channel,
  // make sure it is in the list even when it predates the loaded window, then
  // scroll to it and flash a highlight.
  useEffect(() => {
    if (!focusMessage) return;
    if (handledFocusRef.current === focusMessage.id) return;
    handledFocusRef.current = focusMessage.id;

    const ch = focusMessage.channel;
    if (ch === 'general' || ch === 'development' || ch === 'design') {
      setActiveChannel(ch);
    }

    const asMessage: Message = {
      id: focusMessage.id,
      text: focusMessage.text,
      system: false,
      user: focusMessage.author ? { name: focusMessage.author, role: focusMessage.role } : null,
      attachment: (focusMessage.attachment as Attachment) ?? null,
      timestamp: focusMessage.timestamp,
      channel: focusMessage.channel,
      parentId: focusMessage.parentId ?? null,
      editedAt: focusMessage.editedAt ?? null,
      reactions: focusMessage.reactions ?? {},
    };

    setMessages(prev => (prev.some(m => m.id === focusMessage.id) ? prev : [...prev, asMessage]));

    const scrollTimer = setTimeout(() => {
      document.getElementById(`msg-${focusMessage.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightId(focusMessage.id);
      onFocusHandled?.();
    }, 150);
    const clearTimer = setTimeout(() => setHighlightId(null), 2600);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [focusMessage, onFocusHandled]);

  // Debounced full-history search.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('hackhub_token');
        const res = await fetch(
          apiUrl(`/api/teams/${teamId}/messages/search?q=${encodeURIComponent(q)}&channel=${activeChannel}`),
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: controller.signal },
        );
        if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
        const rows = await res.json();
        setSearchResults(
          rows.map((m: any): Message => ({
            id: m.id,
            text: m.text,
            system: false,
            user: m.author ? { name: m.author, role: m.role || 'Developer' } : null,
            userId: m.userId,
            attachment: m.attachment ?? null,
            timestamp: m.timestamp,
            channel: m.channel,
            parentId: m.parentId,
            editedAt: m.editedAt ?? null,
            reactions: m.reactions ?? {},
          })),
        );
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Message search failed:', err);
          setSearchResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeChannel, teamId]);

  // Filter messages by channel & top-level (parentId === null or undefined)
  const topLevelMessages = messages.filter(m => !m.parentId && (m.channel === activeChannel || m.system || !m.channel));

  // Search runs against the team's whole history on the server, not just the
  // 200 messages this workspace happened to load. Below two characters we just
  // show the channel as usual.
  const isSearching = searchQuery.trim().length >= 2;
  const filteredMessages = isSearching ? (searchResults ?? []) : topLevelMessages;

  const matchingMembers = teamMembers.filter(m => m.name.toLowerCase().includes(mentionFilter));

  const getThreadReplies = (parentId: string) => messages.filter(m => m.parentId === parentId);

  return (
    <div className="flex h-[80vh] border-3 border-ink bg-surface overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Navigation & Search Header */}
        <div className="px-4 py-3 border-b-2 border-slate-800 bg-black flex flex-col md:flex-row md:items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Channels:</span>
            {['general', 'development', 'design'].map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch as any)}
                className={`text-xs px-3 py-1 font-bold uppercase tracking-wider transition ${
                  activeChannel === ch
                    ? 'bg-primary text-black border-2 border-black shadow-[2px_2px_0_#000]'
                    : 'text-slate-400 border-2 border-transparent hover:text-white'
                }`}
              >
                # {ch}
              </button>
            ))}
          </div>

          {/* Message Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat..."
              className="bg-black text-ink border-2 border-ink text-xs py-1 px-3 w-48 font-mono focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Pinned Messages Banner */}
        {pinnedMessages.length > 0 && (
          <div className="bg-primary text-black px-4 py-1.5 border-b-2 border-black flex items-center justify-between text-xs font-bold shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span>📌 Pinned:</span>
              <span className="truncate">{pinnedMessages[pinnedMessages.length - 1].author}: "{pinnedMessages[pinnedMessages.length - 1].text}"</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider shrink-0 ml-2">({pinnedMessages.length} Pinned)</span>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-paper">
          {filteredMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
              {searching ? 'Searching all messages…' : searchQuery ? 'No messages match search query.' : 'No conversations in this channel yet. Send a message to start!'}
            </div>
          ) : (
            filteredMessages.map((msg) => {
              if (msg.system) {
                return (
                  <div key={msg.id} className="flex items-center justify-center gap-1.5 py-1 px-3 bg-black border border-slate-800 text-slate-400 text-[10px] font-mono self-center">
                    <AlertCircle className="h-3 w-3 text-primary" />
                    {msg.text}
                  </div>
                );
              }

              const isMe = msg.user && msg.user.name === userName;
              const msgReactions = reactions[msg.id] || {};
              const isPinned = pinnedMessages.some(p => p.id === msg.id);
              const replies = getThreadReplies(msg.id);

              return (
                <div 
                  key={msg.id} 
                  id={`msg-${msg.id}`}
                  className={`flex flex-col max-w-[85%] group ${isMe ? 'self-end items-end' : 'self-start items-start'} ${
                    highlightId === msg.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-[var(--paper)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold mb-0.5 px-1 font-mono">
                    <span>{msg.user?.name} ({msg.user?.role})</span>
                    {msg.editedAt && <span className="text-slate-500 italic">(edited)</span>}
                    <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1.5 ml-2">
                      <button 
                        onClick={() => togglePin(msg)}
                        className="hover:text-primary"
                        title={isPinned ? 'Unpin message' : 'Pin message'}
                      >
                        {isPinned ? '📌' : '📌'}
                      </button>
                      {isMe && (
                        <>
                          <button 
                            onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.text); }}
                            className="hover:text-primary"
                            title="Edit message"
                          >
                            ✏️
                          </button>
                          <button 
                            onClick={() => handleDelete(msg.id)}
                            className="hover:text-primary"
                            title="Delete message"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className={`p-3 text-xs relative ${
                    isMe 
                      ? 'bg-primary text-black border-2 border-black font-semibold shadow-[3px_3px_0_#000]' 
                      : 'bg-surface text-ink border-2 border-ink shadow-[3px_3px_0_var(--primary)]'
                  }`}>
                    {editingMessageId === msg.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="bg-black text-white p-2 text-xs border border-slate-700 w-full font-mono"
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleSaveEdit(msg.id)}
                            className="bg-black text-primary px-2 py-0.5 text-[10px] font-bold border border-primary"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingMessageId(null)}
                            className="text-slate-400 px-2 py-0.5 text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{renderMessageContent(msg.text, searchQuery)}</p>}

                        {msg.attachment && (
                          <div className="mt-2.5 flex flex-col gap-2 p-2.5 bg-black border border-slate-700 max-w-sm text-left">
                            {msg.attachment.mimetype.startsWith('image/') ? (
                              <div className="relative border border-slate-800 bg-black aspect-video flex items-center justify-center">
                                <img 
                                  src={msg.attachment.url.startsWith('http') ? msg.attachment.url : `${API_BASE}${msg.attachment.url}`} 
                                  alt={msg.attachment.originalName} 
                                  className="max-h-48 object-contain"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 p-2 bg-slate-900 border border-slate-800">
                                <FileText className="h-6 w-6 text-primary" />
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-white truncate">{msg.attachment.originalName}</div>
                                  <div className="text-[9px] text-slate-400">{formatFileSize(msg.attachment.size)}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Reaction & Thread Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 border-t border-black/20 pt-1.5">
                          <div className="flex items-center gap-1">
                            {['👍', '❤️', '🚀', '🔥', '🎉'].map(emoji => {
                              const count = (msgReactions[emoji] || []).length;
                              const hasReacted = (msgReactions[emoji] || []).includes(userName);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold transition flex items-center gap-1 ${
                                    hasReacted
                                      ? 'bg-black text-primary border border-primary'
                                      : 'bg-black/30 text-slate-300 hover:bg-black/60'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  {count > 0 && <span>{count}</span>}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => setActiveThreadMessage(msg)}
                            className="text-[10px] font-mono font-bold px-2 py-0.5 bg-black text-primary border border-black hover:bg-primary hover:text-black transition shrink-0"
                          >
                            💬 {replies.length > 0 ? `${replies.length} replies` : 'Reply in Thread'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Upload File Preview Bar */}
        {file && (
          <div className="px-4 py-2 border-t border-slate-900 bg-slate-950 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 text-primary font-semibold font-mono">
              <Paperclip className="h-4 w-4" />
              <span>{file.name}</span>
              <span className="text-[9px] text-slate-400">({formatFileSize(file.size)})</span>
            </div>
            <button 
              type="button" 
              onClick={() => setFile(null)} 
              className="text-slate-400 hover:text-white text-xs uppercase font-bold"
            >
              Remove
            </button>
          </div>
        )}

        {/* Mentions Autocomplete Popover */}
        {showMentionMenu && matchingMembers.length > 0 && (
          <div className="mx-3 mb-1 p-2 bg-black border-2 border-primary text-white flex flex-col gap-1 z-20">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest px-1">Mention Team Member:</div>
            {matchingMembers.map(m => (
              <button
                key={m.id}
                onClick={() => insertMention(m.name)}
                className="text-left text-xs font-mono p-1 hover:bg-primary hover:text-black font-bold border border-transparent hover:border-black transition"
              >
                @{m.name} ({m.role || 'Member'})
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Form */}
        <form onSubmit={(e) => handleSend(e, null)} className="p-3 border-t border-slate-800 bg-black flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />
          
          <button 
            type="button" 
            onClick={triggerFileInput}
            disabled={uploading}
            className="p-2.5 bg-surface text-white border-2 border-slate-700 hover:border-primary transition shrink-0"
            title="Attach File"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input 
            type="text" 
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={`Message #${activeChannel} (type @ to mention)...`}
            className="flex-1 bg-surface text-ink border-2 border-ink p-2 text-xs font-mono focus:outline-none focus:border-primary"
          />

          <button 
            type="submit" 
            disabled={uploading || (!text.trim() && !file)}
            className="bg-primary text-black font-extrabold text-xs px-4 py-2.5 border-2 border-black shadow-[2px_2px_0_#000] hover:translate-x-0.5 hover:translate-y-0.5 transition shrink-0 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Thread Drawer Side Panel */}
      {activeThreadMessage && (
        <div className="w-80 border-l-3 border-ink bg-paper flex flex-col shrink-0">
          <div className="p-3 bg-black border-b-2 border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-widest text-primary font-mono">Thread Replies</h4>
            <button 
              onClick={() => setActiveThreadMessage(null)}
              className="text-slate-400 hover:text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>

          {/* Original Parent Message */}
          <div className="p-3 border-b-2 border-slate-800 bg-surface text-xs text-ink font-mono">
            <div className="text-[10px] font-bold text-primary mb-1">
              {activeThreadMessage.user?.name} ({activeThreadMessage.user?.role})
            </div>
            <p className="whitespace-pre-wrap">{activeThreadMessage.text}</p>
          </div>

          {/* Thread Replies Feed */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {getThreadReplies(activeThreadMessage.id).length === 0 ? (
              <div className="text-[11px] text-slate-500 font-mono text-center py-6">
                No replies in this thread yet. Be the first to reply!
              </div>
            ) : (
              getThreadReplies(activeThreadMessage.id).map(reply => (
                <div key={reply.id} className="bg-surface border border-slate-800 p-2.5 text-xs text-ink font-mono">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">
                    {reply.user?.name} ({reply.user?.role})
                  </div>
                  <p className="whitespace-pre-wrap">{renderMessageContent(reply.text)}</p>
                </div>
              ))
            )}
          </div>

          {/* Thread Input Form */}
          <form onSubmit={(e) => handleSend(e, activeThreadMessage.id)} className="p-2 border-t-2 border-slate-800 bg-black flex gap-2">
            <input
              type="text"
              value={threadText}
              onChange={(e) => setThreadText(e.target.value)}
              placeholder="Reply to thread..."
              className="flex-1 bg-surface text-ink border border-slate-700 text-xs p-2 font-mono focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!threadText.trim()}
              className="bg-primary text-black font-bold text-xs px-3 py-2 border border-black disabled:opacity-50"
            >
              Reply
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
