import React, { useEffect, useRef, useState } from 'react';
import { Disc3, MonitorSmartphone, Pause, Play, SkipBack, SkipForward, Sparkles } from 'lucide-react';
import type { CompanionCommandMessage, CompanionSyncMessage } from '../types';
import { ClickPulseOverlay } from './ClickPulseOverlay';

export const COMPANION_SNAPSHOT_KEY = 'aura_companion_snapshot_v1';

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const CompanionScreen: React.FC = () => {
  const [sync, setSync] = useState<CompanionSyncMessage | null>(() => {
    try {
      const raw = localStorage.getItem(COMPANION_SNAPSHOT_KEY);
      if (raw) return JSON.parse(raw) as CompanionSyncMessage;
    } catch {
      // ignore
    }
    return null;
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const applyRootTheme = (d: CompanionSyncMessage) => {
    if (!rootRef.current) return;
    rootRef.current.style.setProperty('--aura-primary', d.blueprint.palette.primary);
    rootRef.current.style.setProperty('--aura-secondary', d.blueprint.palette.secondary);
    rootRef.current.style.setProperty('--aura-accent', d.blueprint.palette.accent);
    rootRef.current.style.setProperty('--aura-glow-alpha', Math.min(1, 0.4 + d.bass * 0.6).toFixed(3));
    rootRef.current.style.setProperty(
      '--aura-pulse-alpha',
      Math.min(0.95, 0.25 + d.bass * 0.55 + d.beat * 0.35).toFixed(3)
    );
    rootRef.current.style.setProperty(
      '--aura-edge-opacity',
      d.blueprint.edgeStyle === 'off' ? '0' : d.blueprint.edgeStyle === 'breathing_aura' ? '0.68' : '1'
    );
  };

  useEffect(() => {
    document.title = 'AURA Companion — Lumn Edge Display';
    if (sync) applyRootTheme(sync);

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;
    channel.onmessage = (ev: MessageEvent<CompanionSyncMessage>) => {
      if (ev.data?.type === 'STATE_SYNC') {
        applyRootTheme(ev.data);
        setSync(ev.data);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const sendCommand = (action: CompanionCommandMessage['action']) => {
    channelRef.current?.postMessage({ type: 'CMD', action } satisfies CompanionCommandMessage);
  };

  if (!sync) {
    return (
      <div ref={rootRef} className="relative w-full h-full bg-black flex items-center justify-center p-8 text-center">
        <div className="aura-oled-backdrop" />
        <ClickPulseOverlay />
        <div className="aura-edge-frame">
          <div className="aura-edge-rim" />
          <div className="aura-edge-bloom" />
          <div className="aura-edge-orb-h aura-orb-top" />
          <div className="aura-edge-orb-h aura-orb-bottom" />
          <div className="aura-edge-orb-v aura-orb-left" />
          <div className="aura-edge-orb-v aura-orb-right" />
        </div>
        <div className="relative z-10 oled-surface rounded-[32px] p-8 max-w-md space-y-3">
          <MonitorSmartphone className="w-9 h-9 mx-auto text-purple-400" />
          <h1 className="font-display text-xl font-bold text-white">AURA Companion Display</h1>
          <p className="text-xs text-white/55 leading-relaxed">
            Move this window onto your laptop / second monitor — it mirrors the Reel&apos;s dark floating album-art card + synced Lumn neon edge aura automatically!
          </p>
        </div>
      </div>
    );
  }

  const { song, blueprint, isPlaying, currentTime, currentLineText, nextLineText, beat } = sync;
  const { primary, secondary, accent } = blueprint.palette;
  const progress = song.duration > 0 ? Math.min(100, (currentTime / song.duration) * 100) : 0;

  return (
    <div ref={rootRef} className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="aura-oled-backdrop" />
      <ClickPulseOverlay />

      {/* Synced 120fps GPU Lumn Edge Frame */}
      {blueprint.edgeStyle !== 'off' && (
        <div className="aura-edge-frame">
          <div className="aura-edge-rim" />
          <div className="aura-edge-bloom" />
          {(blueprint.edgeStyle === 'laser_orbit' || blueprint.edgeStyle === 'violet_prism') && (
            <div className="aura-edge-laser-ring" />
          )}
          {(blueprint.edgeStyle === 'lumn_vivid' ||
            blueprint.edgeStyle === 'laser_orbit' ||
            blueprint.edgeStyle === 'violet_prism') && (
            <>
              <div className="aura-edge-orb-h aura-orb-top" />
              <div className="aura-edge-orb-h aura-orb-bottom" />
              <div className="aura-edge-orb-v aura-orb-left" />
              <div className="aura-edge-orb-v aura-orb-right" />
            </>
          )}
        </div>
      )}

      {/* Diffused Artwork Aura Halo behind Card */}
      {song.artworkUrl && (
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none z-0 opacity-20 scale-125"
          style={{
            backgroundImage: `url(${song.artworkUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(90px) saturate(165%)',
          }}
        />
      )}

      {/* Top Mood Pill */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 oled-pill px-4 py-1.5 rounded-full flex items-center gap-2 text-[11px] font-mono-code text-white/80">
        <Sparkles className="w-3 h-3" style={{ color: primary }} />
        <span>{blueprint.moodName}</span>
        {song.isFullTrack !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[9px] text-white/60">
            {song.isFullTrack ? 'FULL' : '30s'}
          </span>
        )}
      </div>

      {/* Reel-Style Centered Dark Floating Album-Art Player Card */}
      <div
        className="group relative z-10 mt-10 rounded-[32px] p-6 sm:p-7 flex flex-col items-center max-w-sm w-[88vw] text-center border border-white/[0.14] backdrop-blur-2xl"
        style={{
          background: 'linear-gradient(155deg, rgba(18,18,26,0.92) 0%, rgba(7,7,11,0.96) 100%)',
          boxShadow: `0 34px 95px rgba(0,0,0,0.95), 0 0 60px ${primary}38, inset 0 1px 0 rgba(255,255,255,0.2)`,
        }}
      >
        <div
          className="relative mb-5 w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border border-white/20 transition-transform duration-200 ease-apple"
          style={{
            boxShadow: `0 24px 65px rgba(0,0,0,0.92), 0 0 46px ${primary}55`,
            transform: `scale(${isPlaying ? 1 + beat * 0.032 : 0.96})`,
          }}
        >
          {song.artworkUrl ? (
            <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
              <Disc3 className="w-14 h-14 text-white/25 animate-vinyl-spin" />
            </div>
          )}

          {/* Subtle Hover / Focus Remote Transport Overlay */}
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => sendCommand('prev')}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              title="Previous track"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => sendCommand('toggle_play')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-black cursor-pointer"
              style={{ backgroundColor: primary, boxShadow: `0 0 22px ${primary}` }}
              title="Play / Pause"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => sendCommand('next')}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              title="Next track"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h1 className="font-display text-2xl font-bold text-white tracking-tight truncate max-w-full">
          {song.title}
        </h1>
        <p className="text-xs sm:text-sm text-white/55 mt-1 truncate max-w-full">{song.artist}</p>

        {/* Progress Bar + Live Timestamps */}
        <div className="w-full mt-5 space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-white/12 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${primary}, ${secondary}, ${accent})` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono-code text-white/40">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(song.duration)}</span>
          </div>
        </div>

        {/* Synced Lyric Whisper */}
        <div className="mt-4 min-h-[42px] flex flex-col items-center justify-center gap-1">
          <p
            className="text-xs sm:text-sm font-grotesk text-white/85 font-medium transition-opacity duration-300"
            style={{ textShadow: `0 0 18px ${primary}88` }}
          >
            {currentLineText || (isPlaying ? '♪' : 'Paused')}
          </p>
          {nextLineText && (
            <p className="text-[11px] font-grotesk text-white/30 truncate max-w-full">
              {nextLineText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
