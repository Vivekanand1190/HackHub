import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  PhoneCall, 
  Users, 
  Volume2
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

export default function VoiceHuddlePanel({ socket, teamId, teamName, user }: VoiceHuddlePanelProps) {
  const [inHuddle, setInHuddle] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  const [huddleMembers, setHuddleMembers] = useState<HuddleMember[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleHuddleUpdate = (members: HuddleMember[]) => {
      setHuddleMembers(members);
    };

    socket.on('huddle-update', handleHuddleUpdate);

    return () => {
      socket.off('huddle-update', handleHuddleUpdate);
    };
  }, [socket]);

  const handleJoinHuddle = async () => {
    try {
      let stream: MediaStream | null = null;
      if (!cameraOff) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }

      setInHuddle(true);
      socket?.emit('huddle-join', {
        teamId,
        audioMuted: muted,
        videoOff: cameraOff
      });
    } catch (err) {
      console.error('Failed to access media devices for huddle:', err);
      setInHuddle(true);
      socket?.emit('huddle-join', {
        teamId,
        audioMuted: muted,
        videoOff: true
      });
    }
  };

  const handleLeaveHuddle = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setInHuddle(false);
    socket?.emit('huddle-leave', { teamId });
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
    }
    socket?.emit('huddle-state-toggle', { teamId, audioMuted: nextMuted });
  };

  const toggleCamera = async () => {
    const nextCamOff = !cameraOff;
    setCameraOff(nextCamOff);

    if (!nextCamOff && !localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !muted });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error('Camera access error:', e);
      }
    } else if (nextCamOff && localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
    }

    socket?.emit('huddle-state-toggle', { teamId, videoOff: nextCamOff });
  };

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
            In-app self-hosted realtime audio &amp; video huddle.
          </p>
        </div>
      </div>

      {/* Main Huddle Room Area */}
      <div className="flex-1 bg-black border-2 border-slate-800 p-4 relative flex flex-col justify-between overflow-hidden">
        {/* Active Members Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
          {huddleMembers.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <Users className="h-8 w-8 text-slate-700" />
              <p className="text-xs">No active participants in the huddle. Click "Join Huddle" below to start!</p>
            </div>
          ) : (
            huddleMembers.map((member) => (
              <div
                key={member.socketId}
                className={`bg-[#16161d] border-2 p-3 flex flex-col items-center justify-between min-h-[140px] relative shadow-[3px_3px_0px_0px_#000] ${
                  member.isSpeaking ? 'border-[#b8ff3c] ring-2 ring-[#b8ff3c]' : 'border-black'
                }`}
              >
                {/* Audio Status Pill */}
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

                {/* Avatar / Camera Placeholder */}
                <div className="my-auto flex flex-col items-center gap-2">
                  <div
                    style={{ backgroundColor: member.color || '#ffe500' }}
                    className="w-14 h-14 border-2 border-black text-black font-extrabold text-xl flex items-center justify-center shadow-[3px_3px_0px_0px_#000]"
                  >
                    {member.name.charAt(0)}
                  </div>
                </div>

                {/* Member Info */}
                <div className="w-full text-center border-t border-slate-800 pt-2">
                  <span className="text-xs font-bold block truncate text-white">{member.name}</span>
                  <span className="text-[9px] text-slate-400 block truncate">{member.role}</span>
                </div>
              </div>
            ))
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
