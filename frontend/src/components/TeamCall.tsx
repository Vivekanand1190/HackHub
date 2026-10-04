'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Users,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { API_BASE } from '../utils/api';

interface TeamCallProps {
  teamId: string;
  user: { id: string; name: string; role: string } | null;
  socket: Socket | null;
}

type Phase = 'prejoin' | 'connecting' | 'joined' | 'error';

/**
 * Live team video call (managed SFU: LiveKit).
 *
 * The browser never sees the LiveKit API secret — it asks our backend for a
 * short-lived token scoped to `team-<teamId>`, then connects to that room.
 */
export default function TeamCall({ teamId, user, socket }: TeamCallProps) {
  const [phase, setPhase] = useState<Phase>('prejoin');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [inCallCount, setInCallCount] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // --- Pre-join local camera preview (plain getUserMedia; nothing published) ---
  useEffect(() => {
    if (phase !== 'prejoin') return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPreviewError('Camera preview needs a secure context (https, or localhost in dev). You can still join.');
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream;
        setPreviewError('');
      })
      .catch(() => {
        setPreviewError('Camera/mic permission was denied. Allow access in your browser, then reload.');
      });

    return () => {
      cancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [phase]);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setParticipants([]);
      return;
    }
    setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())]);
    setVersion((v) => v + 1);
  }, []);

  // --- Mirror the room's live membership to the team over Socket.IO ---
  useEffect(() => {
    if (!socket) return;
    const onPresence = (data: { participantCount?: number }) => {
      setInCallCount(data && typeof data.participantCount === 'number' ? data.participantCount : 0);
    };
    socket.on('call-presence', onPresence);
    return () => {
      socket.off('call-presence', onPresence);
    };
  }, [socket]);

  // --- Tear the room down on unmount ---
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  const joinCall = useCallback(async () => {
    if (!user) return;
    setPhase('connecting');
    setError('');

    try {
      const authToken = typeof window !== 'undefined' ? window.localStorage.getItem('hackhub_token') : null;
      const res = await fetch(`${API_BASE}/api/teams/${teamId}/call/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Could not start the call (HTTP ${res.status}).`);
      }

      const data = await res.json();
      const lkUrl: string = data.url;
      const lkToken: string = data.token;
      if (!lkUrl || !lkToken) throw new Error('The server did not return a call token.');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.ParticipantConnected, syncParticipants)
        .on(RoomEvent.ParticipantDisconnected, syncParticipants)
        .on(RoomEvent.TrackSubscribed, syncParticipants)
        .on(RoomEvent.TrackUnsubscribed, syncParticipants)
        .on(RoomEvent.TrackMuted, syncParticipants)
        .on(RoomEvent.TrackUnmuted, syncParticipants)
        .on(RoomEvent.LocalTrackPublished, syncParticipants)
        .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
        .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
        .on(RoomEvent.Reconnecting, () => setPhase('connecting'))
        .on(RoomEvent.Reconnected, () => {
          setPhase('joined');
          syncParticipants();
        })
        .on(RoomEvent.Disconnected, () => {
          setParticipants([]);
          setPhase('prejoin');
        });

      await room.connect(lkUrl, lkToken);
      await room.localParticipant.setMicrophoneEnabled(!muted);
      await room.localParticipant.setCameraEnabled(cameraOn);

      setPhase('joined');
      syncParticipants();
      socket?.emit('call-join', { teamId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join the call.');
      setPhase('error');
    }
  }, [teamId, user, muted, cameraOn, socket, syncParticipants]);

  const leaveCall = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }
    setParticipants([]);
    setSharing(false);
    setPhase('prejoin');
    socket?.emit('call-leave', { teamId });
  }, [teamId, socket]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    setCameraOn(next);
    await room.localParticipant.setCameraEnabled(next);
  }, [cameraOn]);

  const toggleShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !sharing;
    setSharing(next);
    try {
      await room.localParticipant.setScreenShareEnabled(next);
    } catch {
      setSharing(!next);
    }
  }, [sharing]);

  const copyInvite = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/workspace/${teamId}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [teamId]);

  const isJoined = phase === 'joined';
  const showPrejoin = !isJoined;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-2 border-black bg-[#16161d] px-4 py-3 shadow-[4px_4px_0_#000]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#4d7cff] shadow-[2px_2px_0_#000]">
            <Video className="h-4.5 w-4.5 text-black" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-white">Team Call</h2>
            <p className="text-[10px] font-mono text-slate-400">Room: team-{teamId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`border-2 border-black px-2.5 py-1 text-[10px] font-mono font-bold ${
              inCallCount > 0 ? 'bg-[#b8ff3c] text-black' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {inCallCount} in call
          </span>
          {isJoined && (
            <button
              onClick={leaveCall}
              className="flex items-center gap-1.5 border-2 border-black bg-rose-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-[3px_3px_0_#000] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#000]"
            >
              <PhoneOff className="h-3.5 w-3.5" /> Leave
            </button>
          )}
        </div>
      </div>

      {showPrejoin && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Local preview */}
          <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden border-2 border-black bg-black shadow-[4px_4px_0_#000]">
            <video ref={previewVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 border-2 border-black bg-[#ffe500] px-2 py-0.5 text-[9px] font-mono font-bold text-black">
              DEVICE CHECK
            </span>
            {previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-[#ffe500]" />
                <p className="max-w-[260px] text-[11px] leading-relaxed text-slate-300">{previewError}</p>
              </div>
            )}
          </div>

          {/* Join panel */}
          <div className="flex flex-col gap-3 border-2 border-black bg-[#16161d] p-4 shadow-[4px_4px_0_#000]">
            <p className="text-xs leading-relaxed text-slate-300">
              Everyone on your team connects to the same room. Camera and mic need a secure context
              (https, or localhost while developing).
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className={`flex flex-1 items-center justify-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-bold shadow-[3px_3px_0_#000] transition ${
                  muted ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {muted ? 'Mic off' : 'Mic on'}
              </button>
              <button
                onClick={() => setCameraOn((c) => !c)}
                className={`flex flex-1 items-center justify-center gap-2 border-2 border-black px-3 py-2 text-[11px] font-bold shadow-[3px_3px_0_#000] transition ${
                  cameraOn ? 'bg-slate-800 text-slate-200' : 'bg-rose-500 text-white'
                }`}
              >
                {cameraOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                {cameraOn ? 'Camera on' : 'Camera off'}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 border-2 border-rose-500/40 bg-rose-500/10 p-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="text-[11px] leading-relaxed text-rose-200">{error}</span>
              </div>
            )}

            <button
              onClick={joinCall}
              disabled={phase === 'connecting'}
              className="mt-auto flex items-center justify-center gap-2 border-2 border-black bg-[#4d7cff] px-4 py-2.5 text-xs font-black uppercase text-black shadow-[4px_4px_0_#000] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#000] disabled:opacity-50"
            >
              {phase === 'connecting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" /> Join call
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {isJoined && (
        <>
          {/* Tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((p) => (
              <ParticipantTile
                key={p.sid}
                participant={p}
                isLocal={p === roomRef.current?.localParticipant}
                version={version}
              />
            ))}
          </div>

          {participants.length <= 1 && (
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-slate-700 bg-slate-900/40 p-6 text-center">
              <Users className="h-7 w-7 text-slate-500" />
              <p className="text-xs text-slate-400">Waiting for teammates…</p>
              <button
                onClick={copyInvite}
                className="flex items-center gap-2 border-2 border-black bg-[#b8ff3c] px-3 py-1.5 text-[11px] font-bold text-black shadow-[3px_3px_0_#000]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Link copied' : 'Copy invite link'}
              </button>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 border-2 border-black bg-[#16161d] p-3 shadow-[4px_4px_0_#000]">
            <ControlButton active={!muted} onClick={toggleMic} label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </ControlButton>
            <ControlButton active={cameraOn} onClick={toggleCamera} label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>
              {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </ControlButton>
            <ControlButton active={sharing} onClick={toggleShare} label="Share screen">
              <Monitor className="h-5 w-5" />
            </ControlButton>
            <ControlButton active={false} danger onClick={leaveCall} label="Leave call">
              <PhoneOff className="h-5 w-5" />
            </ControlButton>
          </div>

          {/* Participant list */}
          <div className="border-2 border-black bg-[#16161d] p-3 shadow-[4px_4px_0_#000]">
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              In this call ({participants.length})
            </h3>
            <ul className="flex flex-col gap-1.5">
              {participants.map((p) => {
                const micPub = p.getTrackPublication(Track.Source.Microphone);
                const micOn = !!micPub?.track && !micPub.isMuted;
                return (
                  <li
                    key={p.sid}
                    className="flex items-center justify-between gap-2 border border-slate-800 bg-slate-900/40 px-2.5 py-1.5"
                  >
                    <span className="truncate text-[11px] font-bold text-slate-200">{p.name || p.identity}</span>
                    <span className="flex items-center gap-2 text-[9px] font-mono">
                      {p.isSpeaking && <span className="text-[#b8ff3c]">speaking</span>}
                      {micOn ? <Mic className="h-3 w-3 text-[#b8ff3c]" /> : <MicOff className="h-3 w-3 text-rose-400" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ParticipantTile({
  participant,
  isLocal,
  version,
}: {
  participant: Participant;
  isLocal: boolean;
  version: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = participant.getTrackPublication(Track.Source.Camera)?.track;
    if (el && track) {
      track.attach(el);
      return () => {
        track.detach(el);
      };
    }
    return undefined;
  }, [participant, version]);

  useEffect(() => {
    if (isLocal) return undefined;
    const el = audioRef.current;
    const track = participant.getTrackPublication(Track.Source.Microphone)?.track;
    if (el && track) {
      track.attach(el);
      return () => {
        track.detach(el);
      };
    }
    return undefined;
  }, [participant, version, isLocal]);

  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const camOn = !!camPub?.track && !camPub.isMuted;
  const micOn = !!micPub?.track && !micPub.isMuted;
  const speaking = participant.isSpeaking;

  return (
    <div
      className={`relative min-h-[160px] border-2 bg-[#0b0b0f] shadow-[4px_4px_0_#000] ${
        speaking ? 'border-[#b8ff3c]' : 'border-black'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`h-full w-full object-cover ${camOn ? '' : 'opacity-0'}`}
      />
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {!camOn && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-slate-700">
          {(participant.name || participant.identity || '?').charAt(0).toUpperCase()}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 bg-black/70 px-2 py-1">
        <span className="truncate text-[10px] font-mono font-bold text-white">
          {participant.name || participant.identity}
          {isLocal ? ' (you)' : ''}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[9px] font-mono text-slate-400">{participant.connectionQuality}</span>
          {micOn ? <Mic className="h-3 w-3 text-[#b8ff3c]" /> : <MicOff className="h-3 w-3 text-rose-400" />}
          {camOn ? <Video className="h-3 w-3 text-[#b8ff3c]" /> : <VideoOff className="h-3 w-3 text-rose-400" />}
        </span>
      </div>
    </div>
  );
}

function ControlButton({
  active,
  danger,
  label,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tone = danger ? 'bg-rose-500 text-white' : active ? 'bg-[#b8ff3c] text-black' : 'bg-slate-800 text-slate-400';
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center border-2 border-black shadow-[3px_3px_0_#000] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#000] ${tone}`}
    >
      {children}
    </button>
  );
}
