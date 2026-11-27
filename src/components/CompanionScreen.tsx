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

function discreteKey(d: CompanionSyncMessage): string {
  return [
    d.song.id,
    d.song.title,
    d.song.artist,
    d.song.artworkUrl,
    Math.round(d.song.duration),
    d.isPlaying ? '1' : '0',
    d.currentLineText,
    d.nextLineText || '',
    d.blueprint.moodName,
    d.blueprint.edgeStyle,
    d.blueprint.palette.primary,
    d.blueprint.palette.secondary,
    d.blueprint.palette.accent,
  ].join('|');
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
  const edgeRimRef = useRef<HTMLDivElement | null>(null);
  const edgeBeatRef = useRef<HTMLDivElement | null>(null);
  const edgeBloomRef = useRef<HTMLDivElement | null>(null);
  const edgeLaserRef = useRef<HTMLDivElement | null>(null);
  const edgeOrbsRef = useRef<HTMLDivElement | null>(null);
  const artCardRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);

  const lastPaletteRef = useRef({ p: '', s: '', a: '' });
  const lastDiscreteRef = useRef<string>(sync ? discreteKey(sync) : '');
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Live continuous targets driven by 120fps local rAF interpolation (ZERO 16Hz React re-renders)
  const liveTargetsRef = useRef({
    bass: sync?.bass ?? 0.1,
    beat: sync?.beat ?? 0,
    vocal: sync?.vocal ?? 0.1,
    currentTime: sync?.currentTime ?? 0,
    duration: sync?.song.duration ?? 0,
    isPlaying: sync?.isPlaying ?? false,
    lastMsgMs: performance.now(),
  });

  const applyPaletteVars = (d: CompanionSyncMessage) => {
    if (!rootRef.current) return;
    const lp = lastPaletteRef.current;
    if (d.blueprint.palette.primary !== lp.p) {
      lp.p = d.blueprint.palette.primary;
      rootRef.current.style.setProperty('--aura-primary', lp.p);
    }
    if (d.blueprint.palette.secondary !== lp.s) {
      lp.s = d.blueprint.palette.secondary;
      rootRef.current.style.setProperty('--aura-secondary', lp.s);
    }
    if (d.blueprint.palette.accent !== lp.a) {
      lp.a = d.blueprint.palette.accent;
      rootRef.current.style.setProperty('--aura-accent', lp.a);
    }
  };

  useEffect(() => {
    document.title = 'AURA Companion — Lumn Edge Display';
    if (sync) applyPaletteVars(sync);

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;

    const announcePresence = () => {
      try {
        channel.postMessage({ type: 'COMPANION_HELLO' } satisfies CompanionCommandMessage);
      } catch {
        // ignore
      }
    };
    announcePresence();
    const helloIv = window.setInterval(announcePresence, 2800);

    channel.onmessage = (ev: MessageEvent<CompanionSyncMessage>) => {
      if (ev.data?.type !== 'STATE_SYNC') return;
      const d = ev.data;
      applyPaletteVars(d);

      liveTargetsRef.current.bass = d.bass;
      liveTargetsRef.current.beat = d.beat;
      liveTargetsRef.current.vocal = d.vocal ?? d.bass;
      liveTargetsRef.current.currentTime = d.currentTime;
      liveTargetsRef.current.duration = d.song.duration;
      liveTargetsRef.current.isPlaying = d.isPlaying;
      liveTargetsRef.current.lastMsgMs = performance.now();

      const nextKey = discreteKey(d);
      if (nextKey !== lastDiscreteRef.current) {
        lastDiscreteRef.current = nextKey;
        setSync(d);
      }
    };

    let rafId = 0;
    let prevNow = performance.now();
    let sBass = liveTargetsRef.current.bass;
    let sBeat = liveTargetsRef.current.beat;
    let sVocal = liveTargetsRef.current.vocal;
    let lastTimeStr = '';

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) {
        prevNow = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;

      const tg = liveTargetsRef.current;
      const atk = 1 - Math.exp(-18 * dt);
      const rel = 1 - Math.exp(-6.5 * dt);
      sBass += (tg.bass - sBass) * (tg.bass > sBass ? atk : rel);
      sBeat += (tg.beat - sBeat) * (tg.beat > sBeat ? atk : rel);
      sVocal += (tg.vocal - sVocal) * (tg.vocal > sVocal ? atk : rel);

      const glow = Math.min(1, 0.36 + sBass * 0.56 + sBeat * 0.24);
      const bloom = Math.min(0.95, 0.16 + sBass * 0.48 + sBeat * 0.44);
      const beatFlash = Math.min(0.9, sBeat * 0.78);
      const rimOp = (0.52 + glow * 0.48).toFixed(2);
      const orbOp = (0.34 + glow * 0.56).toFixed(2);

      if (edgeRimRef.current) edgeRimRef.current.style.opacity = rimOp;
      if (edgeBeatRef.current) edgeBeatRef.current.style.opacity = beatFlash.toFixed(2);
      if (edgeBloomRef.current) edgeBloomRef.current.style.opacity = bloom.toFixed(2);
      if (edgeLaserRef.current) edgeLaserRef.current.style.opacity = rimOp;
      if (edgeOrbsRef.current) edgeOrbsRef.current.style.opacity = orbOp;

      if (artCardRef.current) {
        const sc = tg.isPlaying ? 1 + sBeat * 0.032 + sVocal * 0.01 : 0.96;
        artCardRef.current.style.transform = `translate3d(0,0,0) scale(${sc.toFixed(3)})`;
      }

      if (tg.duration > 0) {
        const elapsedSinceMsg = tg.isPlaying ? Math.min(0.4, (now - tg.lastMsgMs) * 0.001) : 0;
        const estSec = Math.min(tg.duration, tg.currentTime + elapsedSinceMsg);
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, estSec / tg.duration)).toFixed(4)})`;
        }
        if (timeLabelRef.current) {
          const formatted = fmt(estSec);
          if (formatted !== lastTimeStr) {
            lastTimeStr = formatted;
            timeLabelRef.current.textContent = formatted;
          }
        }
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      window.clearInterval(helloIv);
      cancelAnimationFrame(rafId);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const sendCommand = (action: 'toggle_play' | 'prev' | 'next') => {
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
          <div className="aura-edge-orbs">
            <div className="aura-edge-orb-h aura-orb-top" />
            <div className="aura-edge-orb-h aura-orb-bottom" />
            <div className="aura-edge-orb-v aura-orb-left" />
            <div className="aura-edge-orb-v aura-orb-right" />
          </div>
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

  const { song, blueprint, isPlaying, currentTime, currentLineText, nextLineText } = sync;
  const { primary, secondary, accent } = blueprint.palette;
  const initProgress = song.duration > 0 ? Math.min(1, Math.max(0, currentTime / song.duration)) : 0;

  return (
    <div ref={rootRef} className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="aura-oled-backdrop" />
      <ClickPulseOverlay />

      {/* Synced 120fps GPU Lumn Edge Frame (zero blur, pure pitch-black OLED center) */}
      {blueprint.edgeStyle !== 'off' && (
        <div
          className="aura-edge-frame"
          style={{ opacity: blueprint.edgeStyle === 'breathing_aura' ? 0.68 : 1 }}
        >
          <div ref={edgeRimRef} className="aura-edge-rim" />
          <div ref={edgeBeatRef} className="aura-edge-beat-flash" />
          <div ref={edgeBloomRef} className="aura-edge-bloom" />
          {(blueprint.edgeStyle === 'laser_orbit' || blueprint.edgeStyle === 'violet_prism') && (
            <div ref={edgeLaserRef} className="aura-edge-laser-ring" />
          )}
          {(blueprint.edgeStyle === 'lumn_vivid' ||
            blueprint.edgeStyle === 'laser_orbit' ||
            blueprint.edgeStyle === 'violet_prism') && (
            <div ref={edgeOrbsRef} className="aura-edge-orbs">
              <div className="aura-edge-orb-h aura-orb-top" />
              <div className="aura-edge-orb-h aura-orb-bottom" />
              <div className="aura-edge-orb-v aura-orb-left" />
              <div className="aura-edge-orb-v aura-orb-right" />
            </div>
          )}
        </div>
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

      {/* Reel-Style Centered Dark Floating Album-Art Player Card (matches Reel Laptop Screen) */}
      <div
        className="group relative z-10 mt-8 rounded-[32px] p-6 sm:p-7 flex flex-col items-center max-w-sm w-[88vw] text-center border border-white/[0.12]"
        style={{
          background: 'linear-gradient(155deg, rgba(16,16,24,0.94) 0%, rgba(5,5,8,0.98) 100%)',
          boxShadow: `0 34px 95px rgba(0,0,0,0.96), 0 0 54px ${primary}30, inset 0 1px 0 rgba(255,255,255,0.18)`,
        }}
      >
        <div
          ref={artCardRef}
          className="relative mb-5 w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border border-white/20 will-change-transform"
          style={{
            boxShadow: `0 24px 65px rgba(0,0,0,0.92), 0 0 42px ${primary}48`,
            transform: isPlaying ? 'translate3d(0,0,0) scale(1)' : 'translate3d(0,0,0) scale(0.96)',
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

        {/* Smooth 120fps GPU scaleX Progress Bar + Live Timestamps */}
        <div className="w-full mt-5 space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-white/12 overflow-hidden">
            <div
              ref={progressFillRef}
              className="h-full w-full rounded-full origin-left will-change-transform"
              style={{
                transform: `scaleX(${initProgress.toFixed(4)})`,
                background: `linear-gradient(90deg, ${primary}, ${secondary}, ${accent})`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono-code text-white/40 tabular-nums">
            <span ref={timeLabelRef}>{fmt(currentTime)}</span>
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
