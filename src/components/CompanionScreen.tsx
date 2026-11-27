import React, { useEffect, useRef, useState } from 'react';
import { Disc3, MonitorSmartphone, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type {
  AudioPulseState,
  CompanionBroadcastMessage,
  CompanionCommandMessage,
  CompanionSyncMessage,
  EdgeStyleId,
  VibePalette,
} from '../types';
import { ClickPulseOverlay } from './ClickPulseOverlay';
import { LumnEdgeCanvas } from './LumnEdgeCanvas';
import { SignalSculpture } from './SignalSculpture';

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
    d.blueprint.lyricStyle,
    d.sculptureForm,
    d.blueprint.edgeStyle,
    d.blueprint.palette.primary,
    d.blueprint.palette.secondary,
    d.blueprint.palette.accent,
  ].join('|');
}

const DEFAULT_PALETTE: VibePalette = { primary: '#a855f7', secondary: '#e879f9', accent: '#f5f3ff' };

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
  const [idleVisual, setIdleVisual] = useState<{ edgeStyle: EdgeStyleId; palette: VibePalette }>({
    edgeStyle: 'lumn_vivid',
    palette: DEFAULT_PALETTE,
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const artCardRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);

  const lastPaletteRef = useRef({ p: '', s: '', a: '' });
  const lastDiscreteRef = useRef<string>(sync ? discreteKey(sync) : '');
  const channelRef = useRef<BroadcastChannel | null>(null);

  const audioPulseRef = useRef<AudioPulseState>({
    bass: sync?.bass ?? 0.12,
    subBass: sync?.bass ?? 0.1,
    beat: sync?.beat ?? 0,
    mid: sync?.vocal ?? 0.1,
    vocal: sync?.vocal ?? 0.1,
    treble: 0.08,
    energy: sync?.energy ?? 0.12,
    beatPhase: 0,
    lineProgress: 0,
    wordProgress: 0,
    isLiveFft: false,
    spectrum: new Float32Array(32),
  });

  // Live continuous targets driven by 120fps local rAF interpolation (ZERO 16Hz React re-renders)
  const liveTargetsRef = useRef({
    bass: sync?.bass ?? 0.1,
    beat: sync?.beat ?? 0,
    vocal: sync?.vocal ?? 0.1,
    energy: sync?.energy ?? 0.1,
    currentTime: sync?.currentTime ?? 0,
    duration: sync?.song.duration ?? 0,
    isPlaying: sync?.isPlaying ?? false,
    lastMsgMs: performance.now(),
  });

  const applyPaletteVars = (pal: VibePalette) => {
    if (!rootRef.current) return;
    const lp = lastPaletteRef.current;
    if (pal.primary !== lp.p) {
      lp.p = pal.primary;
      rootRef.current.style.setProperty('--aura-primary', lp.p);
    }
    if (pal.secondary !== lp.s) {
      lp.s = pal.secondary;
      rootRef.current.style.setProperty('--aura-secondary', lp.s);
    }
    if (pal.accent !== lp.a) {
      lp.a = pal.accent;
      rootRef.current.style.setProperty('--aura-accent', lp.a);
    }
  };

  useEffect(() => {
    document.title = 'AURA Companion — Lumn Edge Display';
    if (sync) applyPaletteVars(sync.blueprint.palette);

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

    channel.onmessage = (ev: MessageEvent<CompanionBroadcastMessage>) => {
      if (ev.data?.type === 'STATE_CLEAR') {
        liveTargetsRef.current.isPlaying = false;
        liveTargetsRef.current.bass = 0.08;
        liveTargetsRef.current.beat = 0;
        liveTargetsRef.current.vocal = 0.08;
        liveTargetsRef.current.energy = 0.08;
        if (ev.data.blueprint) {
          applyPaletteVars(ev.data.blueprint.palette);
          setIdleVisual({
            edgeStyle: ev.data.blueprint.edgeStyle,
            palette: ev.data.blueprint.palette,
          });
        }
        lastDiscreteRef.current = '';
        setSync(null);
        return;
      }
      if (ev.data?.type !== 'STATE_SYNC') return;
      const d = ev.data;
      applyPaletteVars(d.blueprint.palette);

      liveTargetsRef.current.bass = d.bass;
      liveTargetsRef.current.beat = d.beat;
      liveTargetsRef.current.vocal = d.vocal ?? d.bass;
      liveTargetsRef.current.energy = d.energy ?? d.bass;
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
    let lastTimeStr = '';
    let lastArtScale = -1;
    let lastProgScale = -1;
    let lastDomTick = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) {
        prevNow = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;

      const tg = liveTargetsRef.current;
      const ap = audioPulseRef.current;
      const atk = 1 - Math.exp(-20 * dt);
      const rel = 1 - Math.exp(-6.5 * dt);
      ap.bass += (tg.bass - ap.bass) * (tg.bass > ap.bass ? atk : rel);
      ap.subBass = ap.bass;
      ap.beat += (tg.beat - ap.beat) * (tg.beat > ap.beat ? atk : rel);
      ap.vocal += (tg.vocal - ap.vocal) * (tg.vocal > ap.vocal ? atk : rel);
      ap.mid = ap.vocal;
      ap.energy += (tg.energy - ap.energy) * (tg.energy > ap.energy ? atk : rel);
      ap.treble = Math.min(1, ap.vocal * 0.65 + ap.beat * 0.35);

      const tSec = now * 0.001;
      for (let i = 0; i < 32; i++) {
        const w = 0.55 + 0.45 * Math.sin(tSec * (2.6 + (i % 5) * 0.4) + i * 0.55);
        ap.spectrum[i] = Math.min(1, (i < 10 ? ap.bass : ap.vocal) * w + ap.beat * 0.25);
      }

      if (now - lastDomTick < 24) return;
      lastDomTick = now;

      if (artCardRef.current) {
        const sc = Math.round((tg.isPlaying ? 1 + ap.beat * 0.028 + ap.vocal * 0.01 : 0.96) * 150) / 150;
        if (sc !== lastArtScale) {
          lastArtScale = sc;
          artCardRef.current.style.transform = `translate3d(0,0,0) scale(${sc.toFixed(3)})`;
        }
      }

      if (tg.duration > 0) {
        // Smoothly extrapolate up to 1.8s if the primary window is background-throttled to 1Hz
        const elapsedSinceMsg = tg.isPlaying ? Math.min(1.8, (now - tg.lastMsgMs) * 0.001) : 0;
        const estSec = Math.min(tg.duration, tg.currentTime + elapsedSinceMsg);
        if (progressFillRef.current) {
          const ratio = Math.round(Math.min(1, Math.max(0, estSec / tg.duration)) * 240) / 240;
          if (ratio !== lastProgScale) {
            lastProgScale = ratio;
            progressFillRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
          }
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
        {idleVisual.edgeStyle !== 'off' && (
          <div className="aura-edge-frame" style={{ opacity: idleVisual.edgeStyle === 'breathing_aura' ? 0.72 : 1 }}>
            <LumnEdgeCanvas
              edgeStyle={idleVisual.edgeStyle}
              palette={idleVisual.palette}
              audioPulseRef={audioPulseRef}
            />
            <div className="aura-edge-rim" />
          </div>
        )}
        <div className="relative z-10 oled-surface rounded-[30px] p-8 max-w-md space-y-3 font-apple-sf">
          <MonitorSmartphone className="w-9 h-9 mx-auto text-purple-400" />
          <h1 className="text-xl font-semibold text-white">AURA Companion Display</h1>
          <p className="text-xs text-white/55 leading-relaxed">
            Play a track in the main window. Its artwork, lyrics and lights will appear here.
          </p>
        </div>
      </div>
    );
  }

  const { song, blueprint, isPlaying, currentTime, currentLineText, nextLineText } = sync;
  const { primary, secondary, accent } = blueprint.palette;
  const initProgress = song.duration > 0 ? Math.min(1, Math.max(0, currentTime / song.duration)) : 0;

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full bg-black flex flex-col items-center justify-center overflow-hidden font-apple-sf select-none"
    >
      <div className="aura-oled-backdrop" />
      <ClickPulseOverlay />

      {/* Synced 120fps GPU WebGL2 Lumn Liquid Perimeter (matches Reel right MacBook Pro!) */}
      {blueprint.edgeStyle !== 'off' && (
        <div className="aura-edge-frame">
          <LumnEdgeCanvas
            edgeStyle={blueprint.edgeStyle}
            palette={blueprint.palette}
            audioPulseRef={audioPulseRef}
          />
          <div className="aura-edge-rim" />
        </div>
      )}

      {/* Reel-Identical Pure-OLED Freely Floating Album Art + Ambient Halo + Minimal macOS Dock */}
      <div className="relative z-10 flex flex-col items-center max-w-[360px] w-[86vw] text-center px-4">
        {/* Soft Circular Album Halo Bleeding Gently into Pitch Black (zero blur filter) */}
        <div className="relative flex items-center justify-center mb-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-[320px] h-[320px] sm:w-[380px] sm:h-[380px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${primary}38 0%, ${secondary}16 36%, transparent 68%)`,
            }}
          />

          <div
            ref={artCardRef}
            className="relative w-52 h-52 sm:w-64 sm:h-64 rounded-[20px] overflow-hidden border border-white/[0.12] will-change-transform"
            style={{
              boxShadow: '0 28px 80px rgba(0,0,0,0.95)',
              transform: isPlaying ? 'translate3d(0,0,0) scale(1)' : 'translate3d(0,0,0) scale(0.96)',
            }}
          >
            {blueprint.lyricStyle === 'sculpture' ? (
              <SignalSculpture form={sync.sculptureForm ?? 'Knot'} palette={blueprint.palette} pulseRef={audioPulseRef} playing={isPlaying} />
            ) : song.artworkUrl ? (
              <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                <Disc3 className="w-14 h-14 text-white/25 animate-vinyl-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Clean Minimal Centered Song Title & Artist */}
        <h1 className="text-lg sm:text-xl font-semibold text-white/95 tracking-tight truncate max-w-full">
          {song.title}
        </h1>
        <p className="text-xs sm:text-sm text-white/48 mt-0.5 truncate max-w-full">{song.artist}</p>

        {/* Minimal Slim Progress Hairline */}
        <div className="w-full max-w-[260px] mt-4 space-y-1.5">
          <div className="w-full h-1 rounded-full bg-white/[0.12] overflow-hidden">
            <div
              ref={progressFillRef}
              className="h-full w-full rounded-full origin-left will-change-transform"
              style={{
                transform: `scaleX(${initProgress.toFixed(4)})`,
                background: `linear-gradient(90deg, ${primary}, ${accent})`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono-code text-white/35 tabular-nums">
            <span ref={timeLabelRef}>{fmt(currentTime)}</span>
            <span>{fmt(song.duration)}</span>
          </div>
        </div>

        {/* Minimal macOS-Style Glass Media Transport Controls (matches Reel MacBook bottom controls!) */}
        <div className="mt-4 flex items-center justify-center gap-3 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.09]">
          <button
            type="button"
            onClick={() => sendCommand('prev')}
            className="p-2 rounded-full text-white/65 hover:text-white hover:bg-white/[0.1] cursor-pointer"
            title="Previous track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>
          <button
            type="button"
            onClick={() => sendCommand('toggle_play')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 cursor-pointer"
            title="Play / Pause"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => sendCommand('next')}
            className="p-2 rounded-full text-white/65 hover:text-white hover:bg-white/[0.1] cursor-pointer"
            title="Next track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Subtle Synced Lyric Whisper */}
        <div className="mt-4 min-h-[36px] flex flex-col items-center justify-center gap-0.5 max-w-full">
          <p className="text-xs sm:text-sm text-white/75 font-medium truncate max-w-full">
            {currentLineText || (isPlaying ? '♪' : 'Paused')}
          </p>
          {nextLineText && (
            <p className="text-[11px] text-white/28 truncate max-w-full">{nextLineText}</p>
          )}
        </div>
      </div>
    </div>
  );
};
