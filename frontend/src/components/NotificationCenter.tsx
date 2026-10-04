'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Settings, ExternalLink, MessageSquare, CheckSquare, Calendar, Award, Volume2, Megaphone } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { API_BASE } from '../utils/api';

export interface NotificationItem {
  id: string;
  type: string;
  actorName?: string;
  title: string;
  body: string;
  targetUrl?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  inApp: boolean;
  email: boolean;
  discordWebhook?: string;
  slackWebhook?: string;
}

interface NotificationCenterProps {
  socket: Socket | null;
  onNavigate?: (url: string) => void;
}

export default function NotificationCenter({ socket, onNavigate }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'preferences'>('notifications');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference>({
    inApp: true,
    email: false,
    discordWebhook: '',
    slackWebhook: ''
  });
  const [loading, setLoading] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const fetchPreferences = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences({
          inApp: data.inApp ?? true,
          email: data.email ?? false,
          discordWebhook: data.discordWebhook || '',
          slackWebhook: data.slackWebhook || ''
        });
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNewNotification = (item: NotificationItem) => {
      setNotifications(prev => [item, ...prev]);
    };

    socket.on('notification:new', handleNewNotification);
    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('hackhub_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const savePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });
      if (res.ok) {
        alert('Notification preferences saved!');
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'mention': return <MessageSquare className="h-4 w-4 text-[#ffe500]" />;
      case 'task_assignment': return <CheckSquare className="h-4 w-4 text-[#ff4d8d]" />;
      case 'deadline': return <Calendar className="h-4 w-4 text-[#4d7cff]" />;
      case 'judge_score': return <Award className="h-4 w-4 text-[#b8ff3c]" />;
      case 'huddle_invite': return <Volume2 className="h-4 w-4 text-[#ffe500]" />;
      default: return <Megaphone className="h-4 w-4 text-white" />;
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-[#16161d] text-[#f5f1e6] border-2 border-[#f5f1e6] hover:bg-[#ffe500] hover:text-black transition shadow-[2px_2px_0_#000]"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-[#ff4d8d] text-white text-[10px] font-extrabold px-1.5 py-0.5 border-2 border-black font-mono">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-[#0b0b0f] border-3 border-[#f5f1e6] shadow-[4px_4px_0_#000] z-50 flex flex-col max-h-[500px] overflow-hidden font-mono">
          {/* Header */}
          <div className="bg-black p-3 border-b-2 border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#ffe500]" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#f5f1e6]">Notifications</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('notifications')}
                className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${
                  activeTab === 'notifications'
                    ? 'bg-[#ffe500] text-black border-black'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                Feed
              </button>
              <button
                onClick={() => setActiveTab('preferences')}
                className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${
                  activeTab === 'preferences'
                    ? 'bg-[#ffe500] text-black border-black'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                <Settings className="h-3 w-3 inline mr-1" />
                Prefs
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white font-bold ml-2 text-xs"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Feed Tab */}
          {activeTab === 'notifications' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {unreadCount > 0 && (
                <div className="px-3 py-1.5 bg-[#16161d] border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{unreadCount} unread notification(s)</span>
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] text-[#ffe500] hover:underline font-bold flex items-center gap-1"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 bg-[#0b0b0f]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-mono">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 transition flex items-start gap-2.5 ${
                        item.read ? 'bg-[#0b0b0f] opacity-75' : 'bg-[#16161d] border-l-3 border-[#ffe500]'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0 p-1.5 bg-black border border-slate-800">
                        {getTypeIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          <span className="text-[9px] text-slate-500 shrink-0">
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{item.body}</p>
                        {item.targetUrl && (
                          <button
                            onClick={() => {
                              markAsRead(item.id);
                              if (onNavigate) onNavigate(item.targetUrl!);
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#ffe500] hover:underline font-bold"
                          >
                            Open Link <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {!item.read && (
                        <button
                          onClick={() => markAsRead(item.id)}
                          className="text-slate-400 hover:text-[#ffe500] shrink-0 p-1"
                          title="Mark read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <form onSubmit={savePreferences} className="p-4 flex flex-col gap-3 bg-[#16161d] text-xs">
              <h4 className="text-[11px] font-bold text-[#ffe500] uppercase tracking-wider mb-1">
                Notification Delivery Channels
              </h4>

              <label className="flex items-center justify-between p-2 bg-black border border-slate-800 cursor-pointer">
                <span>In-App Notifications</span>
                <input
                  type="checkbox"
                  checked={preferences.inApp}
                  onChange={(e) => setPreferences(prev => ({ ...prev, inApp: e.target.checked }))}
                  className="accent-[#ffe500] h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 bg-black border border-slate-800 cursor-pointer">
                <span>Email Digest Notifications</span>
                <input
                  type="checkbox"
                  checked={preferences.email}
                  onChange={(e) => setPreferences(prev => ({ ...prev, email: e.target.checked }))}
                  className="accent-[#ffe500] h-4 w-4"
                />
              </label>

              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Discord Webhook URL</label>
                <input
                  type="url"
                  value={preferences.discordWebhook}
                  onChange={(e) => setPreferences(prev => ({ ...prev, discordWebhook: e.target.value }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="bg-black text-white border border-slate-700 p-2 text-xs focus:outline-none focus:border-[#ffe500]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Slack Webhook URL</label>
                <input
                  type="url"
                  value={preferences.slackWebhook}
                  onChange={(e) => setPreferences(prev => ({ ...prev, slackWebhook: e.target.value }))}
                  placeholder="https://hooks.slack.com/services/..."
                  className="bg-black text-white border border-slate-700 p-2 text-xs focus:outline-none focus:border-[#ffe500]"
                />
              </div>

              <button
                type="submit"
                disabled={savingPrefs}
                className="mt-2 bg-[#ffe500] text-black font-extrabold py-2 px-4 border-2 border-black shadow-[2px_2px_0_#000] hover:translate-x-0.5 hover:translate-y-0.5 transition uppercase text-xs"
              >
                {savingPrefs ? 'Saving...' : 'Save Preferences'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
