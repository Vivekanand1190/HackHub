'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageSquare,
  ListChecks,
  Code2,
  GitCommit,
  FileText,
  Vote,
  Activity as ActivityIcon,
  RefreshCw,
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import { Card, Badge, EmptyState, Spinner, Button } from './ui';

type Kind = 'message' | 'task' | 'snippet' | 'revision' | 'document' | 'poll';

interface ActivityEvent {
  id: string;
  kind: Kind;
  at: string;
  actor: string;
  title: string;
  detail?: string;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'message', label: 'Chat' },
  { key: 'task', label: 'Tasks' },
  { key: 'snippet', label: 'Code' },
  { key: 'revision', label: 'Revisions' },
  { key: 'document', label: 'Notes' },
  { key: 'poll', label: 'Polls' },
] as const;

const ICON: Record<Kind, React.ReactNode> = {
  message: <MessageSquare className="h-4 w-4" />,
  task: <ListChecks className="h-4 w-4" />,
  snippet: <Code2 className="h-4 w-4" />,
  revision: <GitCommit className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  poll: <Vote className="h-4 w-4" />,
};

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ActivityFeed({ teamId }: { teamId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/activity?limit=120`), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Could not load activity (HTTP ${res.status})`);
      }
      const data = await res.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const visible = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: ActivityEvent[] }> = [];
    for (const ev of visible) {
      const label = dayLabel(ev.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(ev);
      else out.push({ label, items: [ev] });
    }
    return out;
  }, [visible]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Activity</h2>
          <p className="text-xs text-ink-dim">
            Everything the team has done, newest first — aggregated from chat, tasks, code, notes and polls.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={[
              'border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors',
              filter === f.key
                ? 'border-primary bg-primary text-on-primary'
                : 'border-line-strong text-ink-dim hover:text-ink',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-ink-dim">
            <Spinner size="sm" /> <span className="text-sm">Loading activity…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon={<ActivityIcon className="h-8 w-8" />}
            title="Could not load activity"
            description={error}
            action={<Button size="sm" onClick={() => void load()}>Try again</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-8 w-8" />}
            title="Nothing here yet"
            description="Send a message, move a task or save a snippet and it will show up here."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <section key={group.label}>
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-widest text-ink-dim">
                  {group.label}
                </p>
                <Card padding="none">
                  {group.items.map((ev, i) => (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}
                    >
                      <span className="mt-0.5 text-ink-dim" aria-hidden="true">{ICON[ev.kind]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{ev.title}</p>
                        <p className="mt-0.5 text-xs text-ink-dim">
                          {ev.actor}
                          {ev.detail ? ` · ${ev.detail}` : ''}
                        </p>
                      </div>
                      <span className="flex-none font-mono text-[11px] text-ink-dim">{relative(ev.at)}</span>
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{visible.length} events</Badge>
          {filter !== 'all' && <Badge tone="primary">filtered</Badge>}
        </div>
      )}
    </div>
  );
}
