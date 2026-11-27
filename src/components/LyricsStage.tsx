import React, { useEffect, useRef } from 'react';
import { Disc3, Radio, Search, Sparkles } from 'lucide-react';
import { AudioPulseState, LyricLine, SongItem, VibeBlueprint } from '../types';
import { CanvasLyricMode, CosmosLyricsCanvas } from './CosmosLyricsCanvas';
import { AppleUiLyricsStage } from './AppleUiLyricsStage';
import { FisheyeLyricsStage } from './FisheyeLyricsStage';
import { getWordVisualIcon, type LyricPhase } from '../services/lyricSync';

interface LyricsStageProps {
  song: SongItem;
  lyrics: LyricLine[];
  lyricsLoading: boolean;
  activeLineIdx: number;
  activeWordIdx: number;
  upcomingLineIdx: number;
  secondsUntilNext: number;
  phase: LyricPhase;
  blueprint: VibeBlueprint;
  isPlaying: boolean;
  visualIcons: boolean;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
  onJumpToTime?: (sec: number) => void;
  onOpenLyricsSearch?: () => void;
}

const CANVAS_WORLDS: readonly string[] = [
  'constellation',
  'branches',
  'web',
  'tunnel',
  'mirror',
  'glitch',
];

function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const LyricsStage: React.FC<LyricsStageProps> = React.memo(({
  song,
  lyrics,
  lyricsLoading,
  activeLineIdx,
  activeWordIdx,
  upcomingLineIdx,
  secondsUntilNext,
  phase,
  blueprint,
  isPlaying,
  visualIcons,
  audioPulseRef,
  onJumpToTime,
  onOpenLyricsSearch,
}) => {
  const domPulseRef = useRef<HTMLDivElement | null>(null);
  const { primary, secondary, accent } = blueprint.palette;
  const style = blueprint.lyricStyle;

  const isDomReactiveWorld =
    style === 'kinetic' || style === 'liquid' || style === 'editorial' || style === 'codestyle';

  useEffect(() => {
    if (!isDomReactiveWorld) return;
    let rafId = 0;
    let lastSc = -1;
    let lastTy = -999;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden || !domPulseRef.current) return;
      const p = audioPulseRef.current;
      const voc = p.vocal ?? p.mid;
      const sc = Math.round((1 + p.beat * 0.022 + voc * 0.008) * 250) / 250;
      const ty = Math.round((-p.beat * 2.5) * 10) / 10;
      if (sc !== lastSc || ty !== lastTy) {
        lastSc = sc;
        lastTy = ty;
        domPulseRef.current.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isDomReactiveWorld, audioPulseRef]);

  const hasLyrics = lyrics.length > 0;
  const currentLine = hasLyrics && activeLineIdx >= 0 ? lyrics[activeLineIdx] : null;
  const prevLine = hasLyrics && activeLineIdx > 0 ? lyrics[activeLineIdx - 1] : null;
  const nextLine =
    hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 1 ? lyrics[activeLineIdx + 1] : null;
  const nextLine2 =
    hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 2 ? lyrics[activeLineIdx + 2] : null;

  const upcomingLine =
    hasLyrics && upcomingLineIdx >= 0 && upcomingLineIdx < lyrics.length
      ? lyrics[upcomingLineIdx]
      : null;
  const upcomingLine2 =
    hasLyrics && upcomingLineIdx >= 0 && upcomingLineIdx + 1 < lyrics.length
      ? lyrics[upcomingLineIdx + 1]
      : null;

  const isCanvasWorld = CANVAS_WORLDS.includes(style);
  const isLiveStream = song.source === 'live_tab' || song.source === 'live_mic';
  const showLiveOnlyCard = isLiveStream && !hasLyrics;

  // Flagship Viral Reel Mode: Apple UI (iMessage + Apple Pay + Dynamic Island + Frosted Cards)
  if (hasLyrics && style === 'apple_ui') {
    return (
      <AppleUiLyricsStage
        song={song}
        lyrics={lyrics}
        activeLineIdx={activeLineIdx}
        activeWordIdx={activeWordIdx}
        upcomingLineIdx={upcomingLineIdx}
        secondsUntilNext={secondsUntilNext}
        phase={phase}
        blueprint={blueprint}
        isPlaying={isPlaying}
        visualIcons={visualIcons}
        audioPulseRef={audioPulseRef}
        onJumpToTime={onJumpToTime}
      />
    );
  }

  const lineProgPct =
    currentLine && currentLine.words.length > 0
      ? Math.min(100, Math.max(4, ((Math.max(0, activeWordIdx) + 1) / currentLine.words.length) * 100))
      : 100;

  const showCanvasBg = isCanvasWorld && !showLiveOnlyCard;

  return (
    <div
      className={`relative z-10 w-full h-full flex flex-col items-center justify-center select-none ${
        !hasLyrics ? 'px-6 text-center' : 'px-6 sm:px-12 pt-14 pb-28'
      }`}
    >
      {/* 120FPS CANVAS WORLDS STAY CONTINUOUSLY MOUNTED ACROSS LOADING, ROLLOVERS, INTROS & OUTROS */}
      {showCanvasBg && (
        <CosmosLyricsCanvas
          mode={style as CanvasLyricMode}
          lyrics={lyrics}
          activeLineIdx={activeLineIdx}
          activeWordIdx={activeWordIdx}
          palette={blueprint.palette}
          audioPulseRef={audioPulseRef}
          particleMode={blueprint.particles}
        />
      )}

      {/* Live Audio Capture (without lyrics) OR No Lyrics Available Yet -> Transition Card or Luxury Artwork */}
      {!hasLyrics &&
        (showCanvasBg && lyricsLoading ? (
          <div className="relative z-10 oled-surface rounded-3xl px-6 py-5 flex items-center gap-4 border border-white/15 max-w-md w-full animate-panel-in">
            <div
              className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/15"
              style={{ boxShadow: `0 0 24px ${primary}44` }}
            >
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
              ) : (
                <Disc3 className="w-8 h-8 m-4 text-white/30 animate-vinyl-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 animate-pulse" style={{ color: primary }} />
                <span>Syncing lyrics...</span>
              </div>
              <div className="font-display text-lg font-bold text-white truncate mt-0.5">{song.title}</div>
              <div className="text-xs text-white/50 truncate">{song.artist}</div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative mb-8 flex items-center justify-center">
              <div
                className="absolute w-[420px] h-[420px] rounded-full opacity-55 pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${primary}66 0%, ${primary}22 36%, transparent 72%)`,
                }}
              />
              <div
                className="absolute w-72 h-72 rounded-full border pointer-events-none animate-aura-vinyl-pulse"
                style={{
                  borderColor: `${primary}55`,
                  boxShadow: `0 0 42px ${primary}33, inset 0 0 28px ${secondary}22`,
                  animationPlayState: isPlaying ? 'running' : 'paused',
                }}
              />
              <div
                className="absolute right-[-38px] w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-[#09090d] border border-white/10 shadow-2xl flex items-center justify-center animate-vinyl-spin"
                style={{
                  animationPlayState: isPlaying ? 'running' : 'paused',
                  backgroundImage:
                    'repeating-radial-gradient(circle, #0b0b10 0px, #0b0b10 3px, #16161f 4px, #0b0b10 5px)',
                }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: primary }}>
                  <div className="w-3 h-3 rounded-full bg-black" />
                </div>
              </div>

              <div
                className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border border-white/15 transition-transform duration-300 ease-apple"
                style={{
                  boxShadow: `0 28px 80px rgba(0,0,0,0.95), 0 0 48px ${primary}55`,
                  transform: isPlaying ? 'scale(1)' : 'scale(0.96)',
                }}
              >
                {song.artworkUrl ? (
                  <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
                ) : isLiveStream ? (
                  <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center gap-2">
                    <Radio className="w-14 h-14 animate-pulse" style={{ color: primary }} />
                    <span className="text-[10px] font-mono-code tracking-widest uppercase text-white/55">
                      LIVE DSP ACTIVE
                    </span>
                  </div>
                ) : (
                  <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                    <Disc3 className="w-16 h-16 text-white/25" />
                  </div>
                )}
              </div>
            </div>

            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white max-w-xl">
              {song.title}
            </h1>
            <p className="text-sm sm:text-base text-white/55 font-grotesk mt-1.5">{song.artist}</p>

            <div className="mt-5 flex flex-col items-center gap-3">
              <div className="text-[11px] font-mono-code tracking-widest uppercase text-white/45">
                {lyricsLoading
                  ? 'Syncing celestial lyrics...'
                  : isLiveStream
                    ? 'Live Audio Edge Aura · Reacting in real time'
                    : 'No synced lyrics matched automatically'}
              </div>
              {!lyricsLoading && onOpenLyricsSearch && (
                <button
                  type="button"
                  onClick={onOpenLyricsSearch}
                  className="oled-pill px-3.5 py-1.5 rounded-full text-xs text-white/85 hover:text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" style={{ color: primary }} />
                  <span>{isLiveStream ? 'Sync Lyrics to Live Audio' : 'Find / Sync Lyrics Manually'}</span>
                </button>
              )}
            </div>
          </div>
        ))}

      {/* OUTRO HOLD FOR NON-APPLE-UI, NON-CANVAS MODES */}
      {hasLyrics && !currentLine && !upcomingLine && !isCanvasWorld && (
        <div className="relative z-10 w-full max-w-xl flex flex-col items-center text-center space-y-3 animate-panel-in">
          <div className="text-[10px] font-mono-code uppercase tracking-[0.26em] text-white/40">
            Outro · {song.title}
          </div>
          <div
            className="font-display text-2xl sm:text-4xl font-bold text-white/80 leading-snug"
            style={{ textShadow: `0 0 28px ${primary}66` }}
          >
            {lyrics[lyrics.length - 1]?.text}
          </div>
        </div>
      )}

      {/* INTRO / INTERLUDE OVERLAY FOR NON-APPLE-UI MODES SO LYRICS ARE ALWAYS VISIBLE */}
      {hasLyrics && !currentLine && upcomingLine && (
        <div className="relative z-10 w-full max-w-2xl flex flex-col items-center text-center space-y-6 animate-panel-in">
          <div className="oled-surface rounded-3xl p-5 sm:p-6 flex items-center gap-4 border border-white/15 max-w-md w-full">
            <div
              className="w-16 h-16 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/15"
              style={{ boxShadow: `0 0 24px ${primary}44` }}
            >
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
              ) : (
                <Disc3 className="w-8 h-8 m-4 text-white/30 animate-vinyl-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" style={{ color: primary }} />
                <span>
                  {phase === 'intro' ? 'INTRO' : 'INTERLUDE'} · VOCALS IN {fmtCountdown(secondsUntilNext)}
                </span>
              </div>
              <div className="font-display text-lg font-bold text-white truncate mt-0.5">{song.title}</div>
              <div className="text-xs text-white/50 truncate">{song.artist}</div>
            </div>
            {song.isFullTrack && secondsUntilNext > 3.5 && onJumpToTime && (
              <button
                type="button"
                onClick={() => onJumpToTime(Math.max(0, upcomingLine.start - 0.8))}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold text-black shrink-0 cursor-pointer hover:brightness-110"
                style={{ backgroundColor: primary }}
              >
                Skip Intro
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-w-2xl">
            <div className="text-[10px] font-mono-code uppercase tracking-[0.24em] text-white/35">
              Incoming Lyric
            </div>
            <div
              className="font-display text-2xl sm:text-4xl font-bold text-white/88 leading-snug"
              style={{ textShadow: `0 0 28px ${primary}66` }}
            >
              {upcomingLine.text}
            </div>
            {upcomingLine2 && (
              <div className="font-grotesk text-sm sm:text-lg text-white/32">{upcomingLine2.text}</div>
            )}
          </div>
        </div>
      )}

      {/* VERCI OPTICAL FISHEYE LENS */}
      {currentLine && style === 'fisheye' && (
        <FisheyeLyricsStage
          currentLine={currentLine}
          prevLine={prevLine}
          nextLine={nextLine}
          activeLineIdx={activeLineIdx}
          activeWordIdx={activeWordIdx}
          blueprint={blueprint}
          visualIcons={visualIcons}
          audioPulseRef={audioPulseRef}
        />
      )}

      {/* KINETIC SLAM: Shockwave Halo + Spring Slam + Chromatic Echo + Watermark */}
      {currentLine && style === 'kinetic' && (
        <div ref={domPulseRef} className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center space-y-6 will-change-transform">
          <div className="text-sm sm:text-lg font-grotesk uppercase tracking-[0.18em] text-white/25 min-h-[24px] transition-opacity duration-300">
            {prevLine?.text || ''}
          </div>

          {(() => {
            const safeIdx = Math.max(0, activeWordIdx);
            const word = currentLine.words[safeIdx]?.text || currentLine.text;
            const icon = visualIcons ? getWordVisualIcon(word) : null;
            const impactKey = `${activeLineIdx}-${safeIdx}`;
            return (
              <div className="relative flex items-center justify-center py-4">
                <span
                  aria-hidden
                  className="absolute font-display text-6xl sm:text-8xl md:text-9xl font-black uppercase tracking-tighter opacity-[0.045] scale-125 pointer-events-none select-none"
                  style={{ color: primary }}
                >
                  {word}
                </span>

                <div
                  key={`ring-${impactKey}`}
                  aria-hidden
                  className="absolute w-32 h-32 sm:w-44 sm:h-44 rounded-full border-2 pointer-events-none animate-aura-shock"
                  style={{
                    borderColor: primary,
                    boxShadow: `0 0 36px ${primary}, inset 0 0 24px ${secondary}88`,
                  }}
                />

                <span
                  aria-hidden
                  key={`echo-l-${impactKey}`}
                  className="absolute font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight opacity-50 -translate-x-1.5 translate-y-0.5 animate-aura-slam"
                  style={{ color: primary }}
                >
                  {word}
                </span>
                <span
                  aria-hidden
                  key={`echo-r-${impactKey}`}
                  className="absolute font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight opacity-50 translate-x-1.5 -translate-y-0.5 animate-aura-slam"
                  style={{ color: secondary }}
                >
                  {word}
                </span>

                <span
                  key={impactKey}
                  className="relative font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight animate-aura-slam inline-flex items-center gap-3"
                  style={{
                    color: accent,
                    textShadow: `0 0 36px ${primary}, 0 0 80px ${primary}77`,
                  }}
                >
                  <span>{word}</span>
                  {icon && <span className="text-4xl sm:text-6xl">{icon}</span>}
                </span>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 max-w-3xl">
            {currentLine.words.map((wd, idx) => {
              const isAct = idx === activeWordIdx;
              const isPast = idx < activeWordIdx;
              return (
                <span
                  key={`${activeLineIdx}-sub-${idx}`}
                  className={`font-grotesk text-base sm:text-xl font-semibold transition-all duration-150 ${
                    isAct ? 'scale-110' : ''
                  }`}
                  style={{
                    color: isAct ? primary : isPast ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)',
                    textShadow: isAct ? `0 0 18px ${primary}` : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
          </div>

          <div className="text-xs sm:text-sm font-grotesk uppercase tracking-[0.16em] text-white/18 min-h-[20px]">
            {nextLine?.text || ''}
          </div>
        </div>
      )}

      {/* LIQUID GLASS APPLE LYRICS + ZERO-BLUR GPU BIOLUMINESCENT AURORAS */}
      {currentLine && style === 'liquid' && (
        <>
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden contain-strict">
            <div
              className="absolute top-[10%] left-[10%] w-[52vw] h-[52vw] max-w-[640px] max-h-[640px] rounded-full opacity-35 animate-aura-float will-change-transform"
              style={{
                background: `radial-gradient(circle, ${primary}66 0%, ${primary}24 34%, ${primary}08 58%, transparent 74%)`,
              }}
            />
            <div
              className="absolute bottom-[10%] right-[10%] w-[48vw] h-[48vw] max-w-[580px] max-h-[580px] rounded-full opacity-30 animate-aura-float will-change-transform"
              style={{
                background: `radial-gradient(circle, ${secondary}60 0%, ${secondary}20 34%, ${secondary}07 58%, transparent 74%)`,
                animationDelay: '-5.5s',
              }}
            />
          </div>

          <div ref={domPulseRef} className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-7 will-change-transform">
            <div className="min-h-[30px] text-xl sm:text-2xl font-grotesk font-medium text-white/24 transition-opacity duration-300">
              {prevLine?.text || ''}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2.5 leading-tight">
              {currentLine.words.map((wd, idx) => {
                const isActive = idx === activeWordIdx;
                const isSung = idx < activeWordIdx;
                const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                return (
                  <span
                    key={`${activeLineIdx}-${idx}`}
                    className={`relative inline-flex items-center gap-1.5 font-display text-3xl sm:text-5xl md:text-6xl font-bold transition-colors duration-200 ease-apple -mx-1.5 px-1.5 rounded-2xl ${
                      isActive ? 'animate-aura-word-bloom' : ''
                    }`}
                    style={{
                      color: isActive ? accent : isSung ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.22)',
                      backgroundColor: isActive ? `${primary}1c` : 'transparent',
                      textShadow: isActive
                        ? `0 0 28px ${primary}, 0 0 64px ${primary}aa, 0 0 90px ${secondary}66`
                        : 'none',
                    }}
                  >
                    <span>{wd.text}</span>
                    {icon && isActive && <span className="text-2xl sm:text-3xl">{icon}</span>}
                  </span>
                );
              })}
            </div>

            <div className="space-y-3 pt-2">
              <div className="text-xl sm:text-2xl font-grotesk font-medium text-white/26 transition-opacity duration-300">
                {nextLine?.text || ''}
              </div>
              <div className="text-base sm:text-lg font-grotesk text-white/14 transition-opacity duration-300">
                {nextLine2?.text || ''}
              </div>
            </div>
          </div>
        </>
      )}

      {/* EDITORIAL POETIC SERIF + GOLDEN SPOTLIGHT & PROGRESS HAIRLINE */}
      {currentLine && style === 'editorial' && (
        <div ref={domPulseRef} className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-7 will-change-transform">
          <div className="text-[10px] font-mono-code uppercase tracking-[0.28em] text-white/30">
            {song.title} · {song.artist}
          </div>

          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/22 min-h-[30px] transition-opacity duration-500">
            {prevLine?.text || ''}
          </p>

          <div className="relative flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2 py-2">
            {currentLine.words.map((wd, idx) => {
              const isAct = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className={`inline-flex items-center gap-1.5 font-serif-editorial italic text-4xl sm:text-6xl font-semibold transition-all duration-200 ease-apple ${
                    isAct ? 'animate-aura-word-bloom' : ''
                  }`}
                  style={{
                    color: isAct ? accent : isSung ? 'rgba(255,250,240,0.9)' : 'rgba(255,255,255,0.24)',
                    textShadow: isAct ? `0 0 32px ${primary}, 0 0 64px ${primary}88` : 'none',
                  }}
                >
                  <span>{wd.text}</span>
                  {icon && isAct && <span className="text-2xl not-italic">{icon}</span>}
                </span>
              );
            })}
          </div>

          <div className="relative w-52 h-[1px] bg-white/12">
            <div
              className="h-full transition-all duration-200 ease-apple relative"
              style={{
                width: `${lineProgPct}%`,
                background: `linear-gradient(90deg, transparent, ${primary}, ${accent})`,
                boxShadow: `0 0 12px ${primary}`,
              }}
            >
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rotate-45"
                style={{ backgroundColor: accent, boxShadow: `0 0 10px ${primary}` }}
              />
            </div>
          </div>

          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/18 min-h-[30px] transition-opacity duration-500">
            {nextLine?.text || ''}
          </p>
        </div>
      )}

      {/* CODESTYLE PRO CYBER IDE STREAM */}
      {currentLine && style === 'codestyle' && (
        <div ref={domPulseRef} className="relative z-10 w-full max-w-3xl text-left font-mono-code rounded-2xl oled-surface p-5 sm:p-7 space-y-4 will-change-transform">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-2 uppercase tracking-widest opacity-65 truncate max-w-[260px]" style={{ color: primary }}>
                {`aura.stream("${song.title}")`}
              </span>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded bg-white/[0.06] text-emerald-400">
              LIVE // {blueprint.moodName}
            </span>
          </div>

          {prevLine && (
            <div className="text-sm sm:text-base text-white/25 truncate">
              <span className="text-white/15 mr-3">
                {String(Math.max(1, activeLineIdx)).padStart(2, '0')}
              </span>
              {prevLine.text}
            </div>
          )}

          <div className="text-xl sm:text-3xl leading-relaxed flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2">
            <span style={{ color: secondary }} className="font-bold mr-1">
              $&gt;
            </span>
            {currentLine.words.map((wd, idx) => {
              const isActive = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              if (idx > activeWordIdx + 2) return null;
              const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className={`inline-flex items-center gap-1 transition-all duration-150 ${isActive ? 'animate-aura-word-bloom' : ''}`}
                  style={{
                    color: isActive ? accent : isSung ? primary : 'rgba(255,255,255,0.28)',
                    textShadow: isActive ? `0 0 20px ${primary}, 0 0 40px ${primary}66` : 'none',
                    borderBottom: isActive ? `2px solid ${primary}` : '2px solid transparent',
                  }}
                >
                  <span>{wd.text}</span>
                  {icon && isActive && <span className="text-lg sm:text-2xl">{icon}</span>}
                </span>
              );
            })}
            <span
              className="inline-block w-2.5 h-6 sm:h-7 align-middle animate-cursor"
              style={{ backgroundColor: primary, boxShadow: `0 0 14px ${primary}` }}
            />
          </div>

          {nextLine && (
            <div className="text-sm text-white/18 pt-1 truncate">
              <span className="text-white/12 mr-3">
                {String(activeLineIdx + 2).padStart(2, '0')}
              </span>
              <span style={{ color: secondary }}>//</span> {nextLine.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
