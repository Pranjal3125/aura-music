import React, { useEffect, useRef, useState } from 'react';
import { Disc3, MonitorSmartphone, Sparkles } from 'lucide-react';
import { CompanionSyncMessage } from '../types';

export const CompanionScreen: React.FC = () => {
  const [sync, setSync] = useState<CompanionSyncMessage | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = 'AURA Companion — Synced Edge Lighting';
    const channel = new BroadcastChannel('aura-vibe-sync');
    channel.onmessage = (ev: MessageEvent<CompanionSyncMessage>) => {
      if (ev.data?.type === 'STATE_SYNC') {
        const d = ev.data;
        if (rootRef.current) {
          rootRef.current.style.setProperty('--aura-primary', d.blueprint.palette.primary);
          rootRef.current.style.setProperty('--aura-secondary', d.blueprint.palette.secondary);
          rootRef.current.style.setProperty('--aura-bass', d.bass.toFixed(3));
          rootRef.current.style.setProperty('--aura-beat', d.beat.toFixed(3));
        }
        setSync(d);
      }
    };
    return () => channel.close();
  }, []);

  if (!sync) {
    return (
      <div ref={rootRef} className="w-full h-full bg-black flex items-center justify-center p-8 text-center">
        <div className="oled-surface rounded-3xl p-8 max-w-md space-y-3">
          <MonitorSmartphone className="w-9 h-9 mx-auto text-rose-400" />
          <h1 className="font-display text-xl font-bold">AURA Companion Screen</h1>
          <p className="text-xs text-white/55 leading-relaxed">
            Move this window to your second screen or laptop. Play any song in the main AURA window to sync the
            ambient edge lighting and dark vinyl player automatically.
          </p>
        </div>
      </div>
    );
  }

  const { song, blueprint, isPlaying, currentTime, currentLineText } = sync;
  const { primary, accent } = blueprint.palette;
  const progress = song.duration > 0 ? Math.min(100, (currentTime / song.duration) * 100) : 0;

  return (
    <div ref={rootRef} className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="aura-oled-backdrop" />

      {/* Synced GPU-composited Lumn Edge Glow */}
      <div className="aura-edge-frame">
        <div className="aura-edge-glow-inner" />
        <div className="aura-edge-orb-h aura-orb-top" />
        <div className="aura-edge-orb-h aura-orb-bottom" />
        <div className="aura-edge-orb-v aura-orb-left" />
        <div className="aura-edge-orb-v aura-orb-right" />
      </div>

      {/* Top Mood Tag */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 oled-pill px-3.5 py-1.5 rounded-full flex items-center gap-2 text-[11px] font-mono-code text-white/80">
        <Sparkles className="w-3 h-3" style={{ color: primary }} />
        <span>{blueprint.moodName}</span>
      </div>

      {/* Minimalist Vinyl + Album Art */}
      <div className="relative z-10 flex flex-col items-center px-8 max-w-md w-full text-center">
        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute right-[-36px] w-56 h-56 rounded-full bg-[#09090d] border border-white/10 shadow-2xl flex items-center justify-center animate-vinyl-spin"
            style={{
              animationPlayState: isPlaying ? 'running' : 'paused',
              backgroundImage:
                'repeating-radial-gradient(circle, #0d0d12 0px, #0d0d12 3px, #171720 4px, #0d0d12 5px)',
            }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: primary }}>
              <div className="w-3 h-3 rounded-full bg-black" />
            </div>
          </div>

          <div
            className="relative w-60 h-60 rounded-2xl overflow-hidden border border-white/15"
            style={{ boxShadow: `0 25px 65px rgba(0,0,0,0.9), 0 0 38px ${primary}44` }}
          >
            {song.artworkUrl ? (
              <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                <Disc3 className="w-14 h-14 text-white/25" />
              </div>
            )}
          </div>
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{song.title}</h1>
        <p className="text-sm text-white/55 mt-1">{song.artist}</p>

        <div className="w-full mt-6 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${primary}, ${accent})` }}
          />
        </div>

        <p
          className="mt-6 min-h-[40px] text-sm font-grotesk text-white/75 italic"
          style={{ textShadow: `0 0 18px ${primary}88` }}
        >
          {currentLineText}
        </p>
      </div>
    </div>
  );
};
