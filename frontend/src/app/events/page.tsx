'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Trophy, Users, Plus, Award, Tag, Sparkles, ArrowRight } from 'lucide-react';
import { API_BASE } from '../../utils/api';

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Event Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [creating, setCreating] = useState(false);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug || !startDate || !endDate) return;

    setCreating(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, slug, description, startDate, endDate, status, visibility: 'public' })
      });

      if (res.ok) {
        const newEvent = await res.json();
        setEvents(prev => [newEvent, ...prev]);
        setShowCreateModal(false);
        setName('');
        setSlug('');
        setDescription('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create event');
      }
    } catch (err) {
      console.error('Create error:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#f5f1e6] font-mono p-4 md:p-8">
      {/* Top Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-3 border-[#f5f1e6] pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-[#ffe500] text-xs font-bold uppercase tracking-widest mb-1">
            <Sparkles className="h-4 w-4" /> Multi-Tenant Platform
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold uppercase tracking-tight text-[#f5f1e6]">
            Hackathon Events Hub
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/" 
            className="px-4 py-2 text-xs font-bold bg-[#16161d] text-white border-2 border-white hover:bg-white hover:text-black transition shadow-[2px_2px_0_#fff]"
          >
            ← Home
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-xs font-extrabold bg-[#ffe500] text-black border-2 border-black hover:translate-x-0.5 hover:translate-y-0.5 transition shadow-[3px_3px_0_#000] flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create Event
          </button>
        </div>
      </div>

      {/* Main Grid Feed */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-20 text-slate-500 text-sm">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-800 p-8">
            <Trophy className="h-12 w-12 text-[#ffe500] mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-2 uppercase">No Events Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
              Organize your first hackathon event with tracks, custom prizes, sponsors, and schedule agenda!
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-xs font-extrabold bg-[#ffe500] text-black border-2 border-black"
            >
              + Create First Event
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((evt) => (
              <div 
                key={evt.id}
                className="bg-[#16161d] border-3 border-[#f5f1e6] p-5 flex flex-col justify-between shadow-[4px_4px_0_#ff4d8d] hover:-translate-y-1 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 border uppercase ${
                      evt.status === 'live' 
                        ? 'bg-[#b8ff3c] text-black border-black' 
                        : evt.status === 'ended' 
                          ? 'bg-slate-800 text-slate-300 border-slate-700' 
                          : 'bg-[#ffe500] text-black border-black'
                    }`}>
                      ● {evt.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {evt._count?.teams || 0} Team(s)
                    </span>
                  </div>

                  <h2 className="text-xl font-extrabold text-[#f5f1e6] uppercase tracking-tight mb-2">
                    {evt.name}
                  </h2>
                  <p className="text-xs text-slate-300 line-clamp-2 mb-4 leading-relaxed">
                    {evt.description || 'No description provided.'}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 border-t border-slate-800 pt-3 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-[#4d7cff]" />
                      <span>{new Date(evt.startDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-[#ffe500]" />
                      <span>{evt.tracks?.length || 0} Track(s)</span>
                    </div>
                  </div>

                  <Link
                    href={`/events/${evt.slug || evt.id}`}
                    className="w-full py-2 bg-[#ffe500] text-black font-extrabold text-xs uppercase border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center gap-2 hover:bg-[#ff4d8d] hover:text-white transition"
                  >
                    View Event Details <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 w-full max-w-lg shadow-[6px_6px_0_#ffe500]">
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-extrabold uppercase text-[#ffe500]">Create Hackathon Event</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Event Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                  }}
                  placeholder="e.g. HackHub Global 2026"
                  className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1 focus:border-[#ffe500] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">URL Slug</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="hackhub-global-2026"
                  className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1 focus:border-[#ffe500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your hackathon goals, theme, and rules..."
                  className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1 focus:border-[#ffe500] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-black text-white border-2 border-[#f5f1e6] p-2 mt-1"
                >
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="mt-3 py-3 bg-[#ffe500] text-black font-extrabold uppercase border-2 border-black shadow-[3px_3px_0_#000] hover:translate-x-0.5 hover:translate-y-0.5 transition"
              >
                {creating ? 'Creating Event...' : 'Publish Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
