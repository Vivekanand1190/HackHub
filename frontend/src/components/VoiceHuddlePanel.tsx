import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  Users,
  Volume2,
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface HuddleMember {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  color: string;
  audioMuted: boolean;
  videoOff: boolean;
  isSpeaking: boolean;
}

interface VoiceHuddlePanelProps {
  socket: Socket | null;
  teamId: string;
  teamName: string;
  user: { id: string; name: string; role: string } | null;
}

/**
 * ICE configuration.
 *
 * Deliberately empty by default. With no STUN/TURN the browser only gathers
 * host candidates, which is all a localhost or same-LAN call needs - and it
 * means the call touches no third-party service at all.
 *
 * To also reach peers behind NAT on other networks, point NEXT_PUBLIC_TURN_URL
 * at a relay you run yourself (e.g. coturn). It stays a variable reference so
 * the noExternalHosts audit in CI still passes.
 */
const ICE_SERVERS: RTCIceServer[] = (() => {
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (!url) return [];
  const server: RTCIceServer = { urls: url };
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (username) server.username = username;
  if (credential) server.credential = credential;
  return [server];
})();

interface PeerEntry {
  pc: RTCPeerConnection;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  stream: MediaStream;
  pendingIce: RTCIceCandidateInit[];
}

/** Average frequency-bin magnitude above which a stream counts as "speaking". */
const SPEAKING_THRESHOLD = 14;

function tileClass(isSpeaking: boolean): string {
  return [
    'relative bg-[#16161d] border-2 min-h-[140px] overflow-hidden shadow-[3px_3px_0px_0px_#000]',
    isSpeaking ? 'border-[#b8ff3c] ring-2 ring-[#b8ff3c]' : 'border-black',
  ].join(' ');
}

export default function VoiceHuddlePanel({ socket, teamId, teamName, user }: VoiceHuddlePanelProps) {
  const [inHuddle, setInHuddle] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  const [huddleMembers, setHuddleMembers] = useState<HuddleMember[]>([]);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const inHuddleRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const cameraOffRef = useRef(true);

  /* ------------------------------------------------------------------ *
   * Audio level metering. Purely local: it reads the same MediaStreams
   * the peer connections already carry, so no extra network traffic is
   * generated to drive the "speaking" highlight.
   * ------------------------------------------------------------------ */

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  const registerAnalyser = useCallback(
    (id: string, stream: MediaStream) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        analysersRef.current.delete(id);
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        // Intentionally not connected to ctx.destination - routing the mic
        // back to the speakers would echo the caller at themselves.
        source.connect(analyser);
        analysersRef.current.set(id, analyser);
      } catch (err) {
        console.error('[huddle] could not meter stream', err);
      }
    },
    [ensureAudioContext]
  );

  /* ------------------------------------------------------------------ *
   * Peer plumbing
   * ------------------------------------------------------------------ */

  const closePeer = useCallback((id: string) => {
    const entry = peersRef.current.get(id);
    if (entry) {
      entry.pc.onnegotiationneeded = null;
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      try {
        entry.pc.close();
      } catch {
        /* already closed */
      }
      peersRef.current.delete(id);
    }
    analysersRef.current.delete(id);
    const el = videoElsRef.current.get(id);
    if (el) el.srcObject = null;
  }, []);

  const closeAllPeers = useCallback(() => {
    const ids: string[] = [];
    peersRef.current.forEach((_entry, id) => ids.push(id));
    ids.forEach(closePeer);
  }, [closePeer]);

  const flushPendingIce = useCallback(async (entry: PeerEntry) => {
    const queued = entry.pendingIce.splice(0, entry.pendingIce.length);
    for (const candidate of queued) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch (err) {
        console.error('[huddle] failed to apply queued ICE candidate', err);
      }
    }
  }, []);

  const attachVideo = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (!el) {
      videoElsRef.current.delete(id);
      return;
    }
    videoElsRef.current.set(id, el);
    const entry = peersRef.current.get(id);
    if (entry) {
      el.srcObject = entry.stream;
      void el.play().catch(() => {
        /* autoplay may wait for a gesture; the join click usually covers it */
      });
    }
  }, []);

  const ensurePeer = useCallback(
    (remoteId: string): PeerEntry | null => {
      const selfId = myIdRef.current;
      if (!selfId || remoteId === selfId) return null;

      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = new MediaStream();
      const entry: PeerEntry = { pc, audioSender: null, videoSender: null, stream, pendingIce: [] };

      // Pre-create both m-lines so mute and camera toggles only ever swap a
      // track, never needing a renegotiation round trip.
      entry.audioSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      entry.videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;

      const local = localStreamRef.current;
      void entry.audioSender.replaceTrack(local?.getAudioTracks()[0] ?? null);
      void entry.videoSender.replaceTrack(local?.getVideoTracks()[0] ?? null);

      pc.ontrack = (event) => {
        const inbound = event.streams[0];
        if (inbound) {
          inbound.getTracks().forEach((track) => {
            if (!stream.getTracks().some((t) => t.id === track.id)) stream.addTrack(track);
          });
        } else if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        const el = videoElsRef.current.get(remoteId);
        if (el) {
          el.srcObject = stream;
          void el.play().catch(() => {});
        }
        registerAnalyser(remoteId, stream);
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket?.emit('webrtc-signal', {
          teamId,
          to: remoteId,
          signal: { candidate: event.candidate.toJSON() },
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {
            /* not supported everywhere */
          }
        }
      };

      // Exactly one side of a pair offers - the one with the lower socket id.
      // Without this both peers offer at once and the negotiation glares.
      if (selfId < remoteId) {
        pc.onnegotiationneeded = async () => {
          if (pc.signalingState !== 'stable') return;
          try {
            await pc.setLocalDescription();
            socket?.emit('webrtc-signal', {
              teamId,
              to: remoteId,
              signal: { sdp: pc.localDescription },
            });
          } catch (err) {
            console.error('[huddle] failed to create offer', err);
          }
        };
      }

      peersRef.current.set(remoteId, entry);
      return entry;
    },
    [registerAnalyser, socket, teamId]
  );

  /* ------------------------------------------------------------------ *
   * Inbound signalling
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!socket) return;

    const handleSignal = async (payload: {
      signal?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      from?: string;
    }) => {
      const from = payload?.from;
      const signal = payload?.signal;
      if (!from || !signal || !inHuddleRef.current) return;

      const entry = ensurePeer(from);
      if (!entry) return;
      const { pc } = entry;

      try {
        if (signal.sdp) {
          await pc.setRemoteDescription(signal.sdp);
          await flushPendingIce(entry);
          if (signal.sdp.type === 'offer') {
            await pc.setLocalDescription();
            socket.emit('webrtc-signal', {
              teamId,
              to: from,
              signal: { sdp: pc.localDescription },
            });
          }
        } else if (signal.candidate) {
          // Candidates can outrun the description; hold them until it lands.
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else entry.pendingIce.push(signal.candidate);
        }
      } catch (err) {
        console.error('[huddle] signalling error', err);
      }
    };

    socket.on('webrtc-signal', handleSignal);
    return () => {
      socket.off('webrtc-signal', handleSignal);
    };
  }, [socket, teamId, ensurePeer, flushPendingIce]);

  /* ------------------------------------------------------------------ *
   * Roster -> peer reconciliation
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!socket) return;
    const handleHuddleUpdate = (members: HuddleMember[]) => setHuddleMembers(members || []);
    socket.on('huddle-update', handleHuddleUpdate);
    return () => {
      socket.off('huddle-update', handleHuddleUpdate);
    };
  }, [socket]);

  useEffect(() => {
    if (!inHuddle) return;
    const selfId = myIdRef.current;
    if (!selfId) return;

    const others = huddleMembers.filter((m) => m.socketId !== selfId);
    others.forEach((m) => ensurePeer(m.socketId));

    // Drop connections for anyone who has left the huddle.
    const live: string[] = [];
    peersRef.current.forEach((_entry, id) => live.push(id));
    live.forEach((id) => {
      if (!others.some((m) => m.socketId === id)) closePeer(id);
    });
  }, [huddleMembers, inHuddle, ensurePeer, closePeer]);

  /* ------------------------------------------------------------------ *
   * Speaking meter loop
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!inHuddle) return;
    let previous: Record<string, boolean> = {};
    let frame = 0;
    const buffer = new Uint8Array(256);

    const tick = () => {
      const next: Record<string, boolean> = {};
      let changed = false;
      analysersRef.current.forEach((analyser, id) => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i];
        const active = sum / buffer.length > SPEAKING_THRESHOLD;
        next[id] = active;
        if (previous[id] !== active) changed = true;
      });
      if (changed) {
        previous = next;
        setSpeaking(next);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inHuddle]);

  /* ------------------------------------------------------------------ *
   * Reconnect: socket.io hands out a new id, so rebuild the mesh.
   * ------------------------------------------------------------------ */

  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      if (!inHuddleRef.current) return;
      myIdRef.current = socket.id ?? null;
      setMyId(socket.id ?? null);
      closeAllPeers();
      socket.emit('huddle-join', {
        teamId,
        audioMuted: mutedRef.current,
        videoOff: cameraOffRef.current,
      });
    };
    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket, teamId, closeAllPeers]);

  /* ------------------------------------------------------------------ *
   * Teardown on unmount
   * ------------------------------------------------------------------ */

  useEffect(() => {
    return () => {
      peersRef.current.forEach((entry) => {
        entry.pc.onnegotiationneeded = null;
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.onconnectionstatechange = null;
        try {
          entry.pc.close();
        } catch {
          /* already closed */
        }
      });
      peersRef.current.clear();
      analysersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioCtxRef.current) void audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  /* ------------------------------------------------------------------ *
   * Join / leave / toggles
   * ------------------------------------------------------------------ */

  const handleJoinHuddle = async () => {
    if (!socket) return;
    setNotice(null);
    myIdRef.current = socket.id ?? null;
    setMyId(socket.id ?? null);
    inHuddleRef.current = true;
    setInHuddle(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: !cameraOff,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play().catch(() => {});
      }
      const selfId = myIdRef.current;
      if (selfId) registerAnalyser(selfId, stream);
    } catch (err) {
      // Mic denied, or no device present. Stay in the room so the user can
      // still hear everyone; the roster will show them as muted.
      console.error('[huddle] microphone unavailable', err);
      setMuted(true);
      mutedRef.current = true;
      setNotice('Microphone unavailable - joined in listen-only mode.');
    }

    socket.emit('huddle-join', {
      teamId,
      audioMuted: mutedRef.current,
      videoOff: cameraOffRef.current,
    });
  };

  const handleLeaveHuddle = () => {
    closeAllPeers();
    analysersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    inHuddleRef.current = false;
    setInHuddle(false);
    setSpeaking({});
    setNotice(null);
    socket?.emit('huddle-leave', { teamId });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    socket?.emit('huddle-state-toggle', { teamId, audioMuted: next });
  };

  const toggleCamera = async () => {
    const nextOff = !cameraOff;
    setCameraOff(nextOff);
    cameraOffRef.current = nextOff;

    try {
      if (!nextOff) {
        if (!localStreamRef.current) localStreamRef.current = new MediaStream();
        if (localStreamRef.current.getVideoTracks().length === 0) {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const track = videoStream.getVideoTracks()[0];
          localStreamRef.current.addTrack(track);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
            void localVideoRef.current.play().catch(() => {});
          }
          peersRef.current.forEach((entry) => {
            void entry.videoSender?.replaceTrack(track);
          });
        }
      } else {
        const track = localStreamRef.current?.getVideoTracks()[0] ?? null;
        peersRef.current.forEach((entry) => {
          void entry.videoSender?.replaceTrack(null);
        });
        if (track) {
          track.stop();
          localStreamRef.current?.removeTrack(track);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      }
    } catch (err) {
      console.error('[huddle] camera unavailable', err);
      setCameraOff(true);
      cameraOffRef.current = true;
    }

    socket?.emit('huddle-state-toggle', { teamId, videoOff: cameraOffRef.current });
  };

  const others = huddleMembers.filter((m) => m.socketId !== myId);
  const showEmptyState = !inHuddle && others.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#0b0b0f] text-[#f5f1e6] font-mono p-4 gap-4">
      {/* Top Banner & Room Info */}
      <div className="bg-[#16161d] border-2 border-black p-4 shadow-[4px_4px_0px_0px_#000] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-400 border border-black animate-pulse"></span>
            <h2 className="text-lg font-bold uppercase tracking-tight">{teamName} Voice/Video Huddle</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Peer-to-peer WebRTC huddle - audio and video flow directly between members.
          </p>
        </div>
      </div>

      {notice && (
        <div className="border-2 border-[#ffe500] bg-[#ffe500]/10 text-[#ffe500] text-xs font-bold px-3 py-2 shadow-[3px_3px_0px_0px_#000]">
          {notice}
        </div>
      )}

      {/* Main Huddle Room Area */}
      <div className="flex-1 bg-black border-2 border-slate-800 p-4 relative flex flex-col justify-between overflow-hidden">
        {/* Active Members Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols1- sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
          {showEmptyState ? (
            <div className="col-span-full flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <Users className="h-8 w-8 text-slate-700" />
              <p className="text-xs">
                No active participants in the huddle. Click &quot;Join Huddle&quot; below to start!
              </p>
            </div>
          ) : (
            <>
              {inHuddle && (
                <div className={tileClass(!!speaking[myId ?? ''])}>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {cameraOff && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 border-2 border-black bg-[#ffe500] text-black font-extrabold text-xl flex items-center justify-center shadow-[3px_3px_0px_0px_#000]">
                        {(user?.name || 'You').charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {muted ? (
                      <span className="p-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[9px] font-bold">
                        MUTED
                      </span>
                    ) : (
                      <span className="p-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-bold flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> LIVE
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 border-t border-slate-800 px-2 py-1">
                    <span className="text-xs font-bold block truncate text-white">You</span>
                    <span className="text-[9px] text-slate-400 block truncate">{user?.role || ''}</span>
                  </div>
                </div>
              )}

              {others.map((member) => (
                <div key={member.socketId} className={tileClass(!!speaking[member.socketId])}>
                  <video
                    ref={(el) => {
                      attachVideo(member.socketId, el);
                    }}
                    autoPlay
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {member.videoOff && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        style={{ backgroundColor: member.color || '#ffe500' }}
                        className="w-14 h-14 border-2 border-black text-black font-extrabold text-xl flex items-center justify-center shadow-[3px_3px_0px_0px_#000]"
                      >
                        {member.name.charAt(0)}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {member.audioMuted ? (
                      <span className="p-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[9px] font-bold">
                        MUTED
                      </span>
                    ) : (
                      <span className="p-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-bold flex items-center gap-1">
                        <Volume2 className="h-3 w-3 animate-pulse" /> LIVE
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 border-t border-slate-800 px-2 py-1">
                    <span className="text-xs font-bold block truncate text-white">{member.name}</span>
                    <span className="text-[9px] text-slate-400 block truncate">{member.role}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="mt-4 pt-4 border-t-2 border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">
              {huddleMembers.length} Participant{huddleMembers.length === 1 ? '' : 's'} Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            {inHuddle && (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-3 border-2 border-black font-bold transition shadow-[2px_2px_0px_0px_#000] ${
                    muted ? 'bg-rose-500 text-black' : 'bg-[#ffe500] text-black'
                  }`}
                  title={muted ? 'Unmute Mic' : 'Mute Mic'}
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                <button
                  onClick={toggleCamera}
                  className={`p-3 border-2 border-black font-bold transition shadow-[2px_2px_0px_0px_#000] ${
                    cameraOff ? 'bg-slate-800 text-slate-300' : 'bg-[#ff4d8d] text-black'
                  }`}
                  title={cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  {cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>
              </>
            )}

            {!inHuddle ? (
              <button
                onClick={handleJoinHuddle}
                className="px-5 py-3 bg-[#b8ff3c] text-black font-bold border-2 border-black text-xs hover:bg-[#ffe500] transition flex items-center gap-2 shadow-[3px_3px_0px_0px_#000]"
              >
                <PhoneCall className="h-4 w-4" />
                Join Huddle
              </button>
            ) : (
              <button
                onClick={handleLeaveHuddle}
                className="px-5 py-3 bg-rose-500 text-black font-bold border-2 border-black text-xs hover:bg-rose-600 transition flex items-center gap-2 shadow-[3px_3px_0px_0px_#000]"
              >
                <PhoneOff className="h-4 w-4" />
                Leave Huddle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
