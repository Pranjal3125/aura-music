import React, { useEffect, useRef, useState } from 'react';
import { Disc3, MonitorSmartphone, Sparkles } from 'lucide-react';
import { CompanionSyncMessage } from '../types';

export const CompanionScreen: React.FC = () => {
  const [sync, setSync] = useState<CompanionSyncMessage | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = 'AURA Companion — Liquid Glass Edge Player';
    const channel = new BroadcastChannel('aura-vibe-sync');
    channel.onmessage = (ev: MessageEvent<CompanionSyncMessage>) => {
      if (ev.data?.type === 'STATE_SYNC') {
        const d = ev.data;
        if (rootRef.current) {
          rootRef.current.style.setProperty('--aura-primary', d.blueprint.palette.primary);
          rootRef.current.style.setProperty('--aura-secondary', d.blueprint.palette.secondary);
          rootRef.current.style.setProperty('--aura-glow-alpha', Math.min(1, 0.35 + d.bass * 0.65).toFixed(3));
          rootRef.current.style.setProperty('--aura-pulse-alpha', Math.min(0.95, 0.25 + d.bass * 0.55 + d.beat * 0.35).toFixed(3));
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
            Drag this window onto your laptop / second monitor — it mirrors the viral dual-screen Liquid Glass album
            player + synced Lumn edge lighting automatically!
          </p>
        </div>
      </div>
    );
  }

  const { song, blueprint, isPlaying, currentTime, currentLineText, beat } = sync;
  const { primary, accent } = blueprint.palette;
  const progress = song.duration > 0 ? Math.min(100, (currentTime / song.duration) * 100) : 0;

  return (
    <div ref={rootRef} className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="aura-oled-backdrop" />

      {/* Synced 120fps GPU Lumn Edge Frame */}
      <div className="aura-edge-frame">
        <div className="aura-edge-rim" />
        <div className="aura-edge-bloom" />
        <div className="aura-edge-orb-h aura-orb-top" />
        <div className="aura-edge-orb-h aura-orb-bottom" />
        <div className="aura-edge-orb-v aura-orb-left" />
        <div className="aura-edge-orb-v aura-orb-right" />
      </div>

      {/* Top Mood Pill */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 oled-pill px-3.5 py-1.5 rounded-full flex items-center gap-2 text-[11px] font-mono-code text-white/80">
        <Sparkles className="w-3 h-3" style={{ color: primary }} />
        <span>{blueprint.moodName}</span>
      </div>

      {/* Viral Starboy Laptop-Style Minimal Liquid Glass Album Card */}
      <div className="relative z-10 liquid-glass-card rounded-[32px] p-7 sm:p-9 flex flex-col items-center max-w-sm w-[88vw] text-center">
        <div
          className="relative mb-6 w-52 h-52 sm:w-60 sm:h-60 rounded-2xl overflow-hidden border border-white/20 transition-transform duration-200 ease-apple"
          style={{
            boxShadow: `0 24px 65px rgba(0,0,0,0.92), 0 0 42px ${primary}55`,
            transform: `scale(${isPlaying ? 1 + beat * 0.035 : 0.96})`,
          }}
        >
          {song.artworkUrl ? (
            <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
              <Disc3 className="w-14 h-14 text-white/25 animate-vinyl-spin" />
            </div>
          )}
        </div>

        <h1 className="font-display text-2xl font-bold text-white tracking-tight">{song.title}</h1>
        <p className="text-xs sm:text-sm text-white/55 mt-1">{song.artist}</p>

        <div className="w-full mt-5 h-1 rounded-full bg-white/12 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${primary}, ${accent})` }}
          />
        </div>

        <p
          className="mt-5 min-h-[36px] text-xs sm:text-sm font-grotesk text-white/75 italic transition-opacity duration-300"
          style={{ textShadow: `0 0 18px ${primary}88` }}
        >
          {currentLineText}
        </p>
      </div>
    </div>
  );
};
