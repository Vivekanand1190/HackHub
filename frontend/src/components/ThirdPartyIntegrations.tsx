import React, { useState, useEffect } from 'react';
import { Share2, Check, ExternalLink, Send } from 'lucide-react';
import { apiUrl } from '../utils/api';

interface IntegrationsProps {
  teamId: string;
}

export default function ThirdPartyIntegrations({ teamId }: IntegrationsProps) {
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/integrations`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDiscordWebhook(data.discordWebhook || '');
        setSlackWebhook(data.slackWebhook || '');
        setFigmaUrl(data.figmaUrl || '');
        setDeployUrl(data.deployUrl || '');
      }
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, [teamId]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/integrations`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          discordWebhook,
          slackWebhook,
          figmaUrl,
          deployUrl
        })
      });

      if (res.ok) {
        alert('Third-party integrations updated successfully!');
      } else {
        alert('Failed to update integrations.');
      }
    } catch (err) {
      console.error('Error saving integrations:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async (channel: 'discord' | 'slack') => {
    setTestingChannel(channel);
    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(apiUrl(`/api/teams/${teamId}/integrations/notify`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          channel,
          message: 'Test notification from HackHub workspace.'
        })
      });

      if (res.ok) {
        alert(`Test message successfully sent to ${channel.toUpperCase()}!`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to dispatch test notification.');
      }
    } catch (err) {
      console.error('Test notification error:', err);
    } finally {
      setTestingChannel(null);
    }
  };

  return (
    <div className="glass-panel p-5 border-[#f5f1e6] border-3 shadow-[6px_6px_0_#ff4d8d] bg-[#16161d] flex flex-col gap-4 font-sans">
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-black border-2 border-[#ff4d8d] text-[#ff4d8d]">
            <Share2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-[#f5f1e6] uppercase tracking-wider">Third-Party Integrations</h3>
            <p className="text-[10px] text-slate-400">Connect Discord, Slack, Figma, and Vercel to your workspace</p>
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="glass-button text-xs py-1.5! px-3! font-bold"
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
        {/* Discord Webhook */}
        <div className="bg-black border-2 border-slate-800 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#4d7cff] flex items-center gap-1.5">
              💬 Discord Webhook
            </span>
            {discordWebhook ? (
              <span className="text-[9px] text-emerald-400 font-bold">● Active</span>
            ) : (
              <span className="text-[9px] text-slate-500 font-bold">Not Configured</span>
            )}
          </div>
          <input
            type="text"
            value={discordWebhook}
            onChange={(e) => setDiscordWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="glass-input text-[11px] py-1 px-2.5 w-full"
          />
          {discordWebhook && (
            <button
              onClick={() => handleTestNotification('discord')}
              disabled={testingChannel === 'discord'}
              className="px-2 py-1 bg-slate-900 border border-slate-700 text-[#ffe500] text-[10px] font-bold self-end flex items-center gap-1 hover:bg-slate-800"
            >
              <Send className="h-3 w-3" /> Test Webhook
            </button>
          )}
        </div>

        {/* Slack Webhook */}
        <div className="bg-black border-2 border-slate-800 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#ff4d8d] flex items-center gap-1.5">
              ⚡ Slack Webhook
            </span>
            {slackWebhook ? (
              <span className="text-[9px] text-emerald-400 font-bold">● Active</span>
            ) : (
              <span className="text-[9px] text-slate-500 font-bold">Not Configured</span>
            )}
          </div>
          <input
            type="text"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="glass-input text-[11px] py-1 px-2.5 w-full"
          />
          {slackWebhook && (
            <button
              onClick={() => handleTestNotification('slack')}
              disabled={testingChannel === 'slack'}
              className="px-2 py-1 bg-slate-900 border border-slate-700 text-[#ffe500] text-[10px] font-bold self-end flex items-center gap-1 hover:bg-slate-800"
            >
              <Send className="h-3 w-3" /> Test Webhook
            </button>
          )}
        </div>

        {/* Figma Design URL */}
        <div className="bg-black border-2 border-slate-800 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#ffe500] flex items-center gap-1.5">
              🎨 Figma Design Canvas
            </span>
            {figmaUrl && (
              <a href={figmaUrl} target="_blank" rel="noreferrer" className="text-[9px] text-[#ffe500] hover:underline flex items-center gap-0.5">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <input
            type="text"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/file/..."
            className="glass-input text-[11px] py-1 px-2.5 w-full"
          />
        </div>

        {/* Vercel / Netlify Deploy URL */}
        <div className="bg-black border-2 border-slate-800 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#b8ff3c] flex items-center gap-1.5">
              🚀 Vercel Live Deployment
            </span>
            {deployUrl && (
              <a href={deployUrl} target="_blank" rel="noreferrer" className="text-[9px] text-[#b8ff3c] hover:underline flex items-center gap-0.5">
                Visit <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <input
            type="text"
            value={deployUrl}
            onChange={(e) => setDeployUrl(e.target.value)}
            placeholder="https://your-project.vercel.app"
            className="glass-input text-[11px] py-1 px-2.5 w-full"
          />
        </div>
      </div>
    </div>
  );
}
