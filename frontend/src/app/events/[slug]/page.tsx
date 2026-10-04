'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Calendar, Award, Tag, Users, Clock, Plus, ExternalLink, Shield, CheckCircle, Sparkles } from 'lucide-react';
import { API_BASE } from '../../../utils/api';

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tracks' | 'prizes' | 'sponsors' | 'schedule'>('overview');

  // Modal forms state
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Track Form
  const [trackName, setTrackName] = useState('');
  const [trackDesc, setTrackDesc] = useState('');

  // Prize Form
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDesc, setPrizeDesc] = useState('');
  const [prizeValue, setPrizeValue] = useState('');

  // Sponsor Form
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [sponsorTier, setSponsorTier] = useState('gold');

  // Schedule Form
  const [schedTitle, setSchedTitle] = useState('');
  const [schedType, setSchedType] = useState('workshop');
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [schedLocation, setSchedLocation] = useState('');

  const fetchEventDetails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setEvent(data);
      }
    } catch (err) {
      console.error('Failed to fetch event:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventDetails();
  }, [slug]);

  const addTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackName || !event) return;
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/events/${event.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: trackName, description: trackDesc })
      });
      if (res.ok) {
        setShowTrackModal(false);
        setTrackName('');
        setTrackDesc('');
        fetchEventDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addPrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeTitle || !event) return;
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/events/${event.id}/prizes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: prizeTitle, description: prizeDesc, value: prizeValue })
      });
      if (res.ok) {
        setShowPrizeModal(false);
        setPrizeTitle('');
        setPrizeDesc('');
        setPrizeValue('');
        fetchEventDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sponsorName || !event) return;
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/events/${event.id}/sponsors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: sponsorName, url: sponsorUrl, tier: sponsorTier })
      });
      if (res.ok) {
        setShowSponsorModal(false);
        setSponsorName('');
        setSponsorUrl('');
        fetchEventDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedTitle || !schedStart || !schedEnd || !event) return;
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/events/${event.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: schedTitle,
          type: schedType,
          startTime: schedStart,
          endTime: schedEnd,
          locationOrLink: schedLocation
        })
      });
      if (res.ok) {
        setShowScheduleModal(false);
        setSchedTitle('');
        setSchedLocation('');
        fetchEventDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500 font-mono">Loading event details...</div>;
  if (!event) return <div className="p-12 text-center text-rose-500 font-mono">Event not found.</div>;

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#f5f1e6] font-mono p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/events" className="text-xs font-bold text-slate-400 hover:text-[#ffe500]">
            ← Back to Events Hub
          </Link>
          <span className="text-xs font-bold text-[#ffe500] uppercase border-2 border-black px-2 py-0.5 bg-black">
            ● {event.status} Event
          </span>
        </div>

        {/* Hero Banner Card */}
        <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 md:p-8 shadow-[6px_6px_0_#ffe500] mb-8">
          <h1 className="text-3xl md:text-5xl font-extrabold uppercase tracking-tight text-[#f5f1e6] mb-3">
            {event.name}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl leading-relaxed mb-6">
            {event.description || 'No description provided.'}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300 border-t-2 border-slate-800 pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#4d7cff]" />
              <span>{new Date(event.startDate).toLocaleDateString()} — {new Date(event.endDate).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#b8ff3c]" />
              <span>{event.teams?.length || 0} Registered Team(s)</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#ff4d8d]" />
              <span>Organizer: {event.organizer?.name || 'HackHub Admin'}</span>
            </div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-slate-800 pb-3 mb-8">
          {[
            { id: 'overview', label: 'Overview & Teams' },
            { id: 'tracks', label: `Tracks (${event.tracks?.length || 0})` },
            { id: 'prizes', label: `Prizes (${event.prizes?.length || 0})` },
            { id: 'sponsors', label: `Sponsors (${event.sponsors?.length || 0})` },
            { id: 'schedule', label: `Schedule Agenda (${event.schedule?.length || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-extrabold uppercase border-2 transition ${
                activeTab === tab.id
                  ? 'bg-[#ffe500] text-black border-black shadow-[3px_3px_0_#000]'
                  : 'bg-[#16161d] text-slate-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview & Teams */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 shadow-[4px_4px_0_#000]">
              <h3 className="text-base font-extrabold uppercase text-[#ffe500] mb-4">Registered Teams</h3>
              {event.teams?.length === 0 ? (
                <p className="text-xs text-slate-500">No teams registered for this event yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {event.teams?.map((t: any) => (
                    <div key={t.id} className="p-3 bg-black border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-[10px] text-slate-400">Leader: {t.leader?.name}</div>
                      </div>
                      <Link 
                        href={`/workspace/${t.id}`}
                        className="px-2.5 py-1 bg-[#ffe500] text-black font-bold text-[10px] border border-black"
                      >
                        Enter Workspace →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 shadow-[4px_4px_0_#000]">
              <h3 className="text-base font-extrabold uppercase text-[#ffe500] mb-4">Event Summary</h3>
              <ul className="text-xs flex flex-col gap-3 text-slate-300">
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Tracks Available:</span>
                  <span className="font-bold text-white">{event.tracks?.length || 0}</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Total Prizes:</span>
                  <span className="font-bold text-[#b8ff3c]">{event.prizes?.length || 0}</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Sponsors Backing:</span>
                  <span className="font-bold text-[#ff4d8d]">{event.sponsors?.length || 0}</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-2">
                  <span>Scheduled Workshops:</span>
                  <span className="font-bold text-[#4d7cff]">{event.schedule?.length || 0}</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Tracks */}
        {activeTab === 'tracks' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-[#ffe500] uppercase">Event Tracks</h3>
              <button
                onClick={() => setShowTrackModal(true)}
                className="px-3 py-1.5 bg-[#ffe500] text-black font-bold text-xs border border-black shadow-[2px_2px_0_#000]"
              >
                + Add Track
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {event.tracks?.map((tr: any) => (
                <div key={tr.id} className="bg-[#16161d] border-2 border-[#f5f1e6] p-4">
                  <h4 className="text-base font-extrabold text-[#ffe500] uppercase mb-1">{tr.name}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{tr.description || 'No track description.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Prizes */}
        {activeTab === 'prizes' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-[#b8ff3c] uppercase">Prizes & Bounties</h3>
              <button
                onClick={() => setShowPrizeModal(true)}
                className="px-3 py-1.5 bg-[#b8ff3c] text-black font-bold text-xs border border-black shadow-[2px_2px_0_#000]"
              >
                + Add Prize
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {event.prizes?.map((pz: any) => (
                <div key={pz.id} className="bg-[#16161d] border-2 border-[#b8ff3c] p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-[#b8ff3c] uppercase">{pz.value || 'Custom Prize'}</span>
                    <h4 className="text-base font-extrabold text-white uppercase mt-1">{pz.title}</h4>
                    <p className="text-xs text-slate-300 mt-2">{pz.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Sponsors */}
        {activeTab === 'sponsors' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-[#ff4d8d] uppercase">Event Sponsors</h3>
              <button
                onClick={() => setShowSponsorModal(true)}
                className="px-3 py-1.5 bg-[#ff4d8d] text-white font-bold text-xs border border-black shadow-[2px_2px_0_#000]"
              >
                + Add Sponsor
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {event.sponsors?.map((sp: any) => (
                <div key={sp.id} className="bg-[#16161d] border-2 border-[#f5f1e6] p-4 text-center">
                  <span className="text-[9px] font-extrabold text-[#ff4d8d] uppercase border border-[#ff4d8d] px-1.5 py-0.5">
                    {sp.tier} Tier
                  </span>
                  <h4 className="text-base font-extrabold text-white uppercase mt-3">{sp.name}</h4>
                  {sp.url && (
                    <a href={sp.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#ffe500] hover:underline mt-2 inline-block">
                      Visit Website ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Schedule */}
        {activeTab === 'schedule' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-[#4d7cff] uppercase">Schedule Agenda</h3>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-3 py-1.5 bg-[#4d7cff] text-white font-bold text-xs border border-black shadow-[2px_2px_0_#000]"
              >
                + Add Agenda Item
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {event.schedule?.map((item: any) => (
                <div key={item.id} className="bg-[#16161d] border-2 border-[#4d7cff] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-[#4d7cff] text-white">
                      {item.type}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-1">{item.title}</h4>
                    {item.locationOrLink && <div className="text-[10px] text-slate-400 mt-0.5">Location/Link: {item.locationOrLink}</div>}
                  </div>

                  <div className="text-xs text-[#ffe500] font-mono shrink-0">
                    {new Date(item.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Track Modal */}
      {showTrackModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 w-full max-w-md">
            <h3 className="text-sm font-bold uppercase text-[#ffe500] mb-4">Add Track</h3>
            <form onSubmit={addTrack} className="flex flex-col gap-3 text-xs">
              <input type="text" placeholder="Track Name" required value={trackName} onChange={e=>setTrackName(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <textarea placeholder="Track Description" value={trackDesc} onChange={e=>setTrackDesc(e.target.value)} className="bg-black text-white p-2 border border-slate-700" rows={3} />
              <button type="submit" className="bg-[#ffe500] text-black font-bold p-2">Save Track</button>
            </form>
          </div>
        </div>
      )}

      {/* Prize Modal */}
      {showPrizeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 w-full max-w-md">
            <h3 className="text-sm font-bold uppercase text-[#b8ff3c] mb-4">Add Prize</h3>
            <form onSubmit={addPrize} className="flex flex-col gap-3 text-xs">
              <input type="text" placeholder="Prize Title" required value={prizeTitle} onChange={e=>setPrizeTitle(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <input type="text" placeholder="Prize Value (e.g. $5,000 Cash)" value={prizeValue} onChange={e=>setPrizeValue(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <textarea placeholder="Description" value={prizeDesc} onChange={e=>setPrizeDesc(e.target.value)} className="bg-black text-white p-2 border border-slate-700" rows={2} />
              <button type="submit" className="bg-[#b8ff3c] text-black font-bold p-2">Save Prize</button>
            </form>
          </div>
        </div>
      )}

      {/* Sponsor Modal */}
      {showSponsorModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 w-full max-w-md">
            <h3 className="text-sm font-bold uppercase text-[#ff4d8d] mb-4">Add Sponsor</h3>
            <form onSubmit={addSponsor} className="flex flex-col gap-3 text-xs">
              <input type="text" placeholder="Sponsor Name" required value={sponsorName} onChange={e=>setSponsorName(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <input type="url" placeholder="Website URL" value={sponsorUrl} onChange={e=>setSponsorUrl(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <select value={sponsorTier} onChange={e=>setSponsorTier(e.target.value)} className="bg-black text-white p-2 border border-slate-700">
                <option value="title">Title Tier</option>
                <option value="gold">Gold Tier</option>
                <option value="silver">Silver Tier</option>
              </select>
              <button type="submit" className="bg-[#ff4d8d] text-white font-bold p-2">Save Sponsor</button>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16161d] border-3 border-[#f5f1e6] p-6 w-full max-w-md">
            <h3 className="text-sm font-bold uppercase text-[#4d7cff] mb-4">Add Agenda Item</h3>
            <form onSubmit={addSchedule} className="flex flex-col gap-3 text-xs">
              <input type="text" placeholder="Title" required value={schedTitle} onChange={e=>setSchedTitle(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <select value={schedType} onChange={e=>setSchedType(e.target.value)} className="bg-black text-white p-2 border border-slate-700">
                <option value="workshop">Workshop</option>
                <option value="talk">Talk</option>
                <option value="ceremony">Ceremony</option>
                <option value="deadline">Submission Deadline</option>
              </select>
              <input type="datetime-local" required value={schedStart} onChange={e=>setSchedStart(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <input type="datetime-local" required value={schedEnd} onChange={e=>setSchedEnd(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <input type="text" placeholder="Location or Zoom link" value={schedLocation} onChange={e=>setSchedLocation(e.target.value)} className="bg-black text-white p-2 border border-slate-700" />
              <button type="submit" className="bg-[#4d7cff] text-white font-bold p-2">Save Agenda Item</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
