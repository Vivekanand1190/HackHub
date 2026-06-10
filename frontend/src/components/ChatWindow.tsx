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
  attachment: Attachment | null;
  timestamp: string;
}

interface ChatWindowProps {
  socket: Socket | null;
  teamId: string;
  userId: string;
  userName: string;
  initialMessages: Message[];
}

export default function ChatWindow({ socket, teamId, userId, userName, initialMessages }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'general' | 'development' | 'design'>('general');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Huddle Call Controls
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    };

    socket.on('chat-message', handleNewMessage);

    return () => {
      socket.off('chat-message', handleNewMessage);
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;

    let attachment: Attachment | null = null;

    if (file) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = localStorage.getItem('hackhub_token');
        const res = await fetch('http://localhost:8888/api/uploads', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
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
        text: text.trim(),
        attachment
      });
      setText('');
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

  // Mocked channel filtering (simulates message groups for hackathon)
  const filteredMessages = messages.filter(msg => {
    if (msg.system) return true;
    const lowerText = (msg.text || '').toLowerCase();
    if (activeChannel === 'development') {
      return lowerText.includes('api') || lowerText.includes('code') || lowerText.includes('test') || lowerText.includes('npm') || lowerText.includes('auth');
    }
    if (activeChannel === 'design') {
      return lowerText.includes('palette') || lowerText.includes('figma') || lowerText.includes('ui') || lowerText.includes('design') || lowerText.includes('color');
    }
    // general returns all
    return true;
  });

  return (
    <div className="flex flex-col h-[80vh] glass-panel rounded-2xl overflow-hidden border-slate-800">
      {/* Channel Navigation Header */}
      <div className="glass-panel px-4 py-3 border-b border-slate-900/60 bg-slate-950/40 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-2">Channels:</span>
          {['general', 'development', 'design'].map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch as any)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition ${
                activeChannel === ch
                  ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                  : 'text-slate-500 hover:text-slate-355'
              }`}
            >
              # {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            No conversations in this channel yet. Send a message to start!
          </div>
        ) : (
          filteredMessages.map((msg) => {
            if (msg.system) {
              return (
                <div key={msg.id} className="flex items-center justify-center gap-1.5 py-1 px-3 bg-slate-900/30 rounded-full border border-slate-950 text-slate-500 text-[9px] self-center">
                  <AlertCircle className="h-3 w-3 text-slate-605" />
                  {msg.text}
                </div>
              );
            }

            const isMe = msg.user && msg.user.name === userName;

            return (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[75%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div className="text-[10px] text-slate-450 font-bold mb-0.5 px-1.5">
                  {msg.user?.name} <span className="text-indigo-400/80 font-normal">({msg.user?.role})</span>
                </div>
                
                <div className={`p-3.5 rounded-2xl text-xs ${
                  isMe 
                    ? 'bg-gradient-to-br from-indigo-600/90 to-purple-600/90 text-white rounded-tr-none shadow-md shadow-indigo-500/5' 
                    : 'bg-[#10131d]/90 border border-slate-900 text-slate-200 rounded-tl-none shadow-sm'
                }`}>
                  {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}

                  {msg.attachment && (
                    <div className="mt-2.5 flex flex-col gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 max-w-sm text-left">
                      {msg.attachment.mimetype.startsWith('image/') ? (
                        <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
                          <img 
                            src={`http://localhost:8888${msg.attachment.url}`} 
                            alt={msg.attachment.originalName} 
                            className="max-h-48 object-contain w-full"
                          />
                        </div>
                      ) : msg.attachment.mimetype.startsWith('video/') ? (
                        <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                          <video 
                            src={`http://localhost:8888${msg.attachment.url}`} 
                            controls 
                            className="max-h-48 w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-300" />
                          <span className="text-slate-350 truncate font-semibold block">{msg.attachment.originalName}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1.5 text-[9px] text-slate-500">
                        <div className="overflow-hidden pr-2">
                          {(msg.attachment.mimetype.startsWith('image/') || msg.attachment.mimetype.startsWith('video/')) && (
                            <span className="truncate font-semibold block text-slate-300 mb-0.5">{msg.attachment.originalName}</span>
                          )}
                          <span>{formatFileSize(msg.attachment.size)}</span>
                        </div>
                        
                        <a 
                          href={`http://localhost:8888${msg.attachment.url}`} 
                          download={msg.attachment.originalName}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-slate-850 hover:bg-slate-805 text-[9px] py-1 px-2.5 rounded border border-slate-800 text-slate-350 hover:text-white transition"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                
                <span className="text-[8px] text-slate-500 mt-1 px-1.5">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload File Preview Bar */}
      {file && (
        <div className="px-4 py-2 border-t border-slate-900 bg-slate-950/40 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
            <Paperclip className="h-4 w-4" />
            <span>{file.name}</span>
            <span className="text-[9px] text-slate-550">({formatFileSize(file.size)})</span>
          </div>
          <button 
            type="button" 
            onClick={() => setFile(null)} 
            className="text-slate-500 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Chat Input Container */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-900 bg-slate-950/20 flex items-center gap-2">
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
          className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-850 transition shrink-0"
          title="Attach File"
        >
          <Paperclip className="h-4.5 w-4.5" />
        </button>

        <input 
          type="text" 
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message #${activeChannel}...`}
          className="flex-1 glass-input py-2! text-xs"
        />

        <button 
          type="submit" 
          disabled={uploading || (!text.trim() && !file)}
          className="glass-button py-2.5! px-4! rounded-xl shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
