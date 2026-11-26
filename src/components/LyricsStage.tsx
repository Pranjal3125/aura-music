import React from 'react';
import { Disc3, Radio } from 'lucide-react';
import { LyricLine, SongItem, VibeBlueprint } from '../types';
import { AudioPulseState, CanvasLyricMode, CosmosLyricsCanvas } from './CosmosLyricsCanvas';

interface LyricsStageProps {
  song: SongItem;
  lyrics: LyricLine[];
  lyricsLoading: boolean;
  activeLineIdx: number;
  activeWordIdx: number;
  blueprint: VibeBlueprint;
  isPlaying: boolean;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
}

const CANVAS_WORLDS: readonly string[] = [
  'constellation',
  'branches',
  'web',
  'tunnel',
  'mirror',
  'glitch',
];

export const LyricsStage: React.FC<LyricsStageProps> = ({
  song,
  lyrics,
  lyricsLoading,
  activeLineIdx,
  activeWordIdx,
  blueprint,
  isPlaying,
  audioPulseRef,
}) => {
  const { primary, secondary, accent } = blueprint.palette;
  const style = blueprint.lyricStyle;

  const hasLyrics = lyrics.length > 0;
  const currentLine = hasLyrics && activeLineIdx >= 0 ? lyrics[activeLineIdx] : null;
  const prevLine = hasLyrics && activeLineIdx > 0 ? lyrics[activeLineIdx - 1] : null;
  const nextLine = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 1 ? lyrics[activeLineIdx + 1] : null;
  const nextLine2 = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 2 ? lyrics[activeLineIdx + 2] : null;

  const isCanvasWorld = CANVAS_WORLDS.includes(style);
  const isLiveStream = song.source === 'live_tab' || song.source === 'live_mic';

  // No synced lyrics OR Live Audio Capture OR Intro -> Luxury Vinyl + Sonic Halo Centerpiece
  if (!hasLyrics || !currentLine || isLiveStream) {
    return (
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute w-80 h-80 rounded-full blur-[95px] opacity-45 pointer-events-none"
            style={{ backgroundColor: primary }}
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

        <div className="mt-5 text-[11px] font-mono-code tracking-widest uppercase text-white/40">
          {lyricsLoading
            ? 'Syncing celestial lyrics...'
            : isLiveStream
              ? 'Live Audio Edge Aura · Reacting in real time'
              : hasLyrics
                ? '♫  Intro — lyrics igniting shortly  ♫'
                : 'Ambient Edge Aura Mode'}
        </div>
      </div>
    );
  }

  const lineProgPct =
    currentLine.words.length > 0
      ? Math.min(100, Math.max(4, ((Math.max(0, activeWordIdx) + 1) / currentLine.words.length) * 100))
      : 100;

  return (
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 sm:px-12 select-none">
      {/* 120FPS CANVAS WORLDS: CONSTELLATION · BRANCHES · WEB · HYPERWARP · PRISM · CYBER */}
      {isCanvasWorld && (
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

      {/* KINETIC SLAM: Shockwave Halo + Spring Slam + Chromatic Echo + Watermark */}
      {style === 'kinetic' && (
        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center space-y-6">
          <div className="text-sm sm:text-lg font-grotesk uppercase tracking-[0.18em] text-white/25 min-h-[24px] transition-all duration-300">
            {prevLine?.text || ''}
          </div>

          {(() => {
            const safeIdx = Math.max(0, activeWordIdx);
            const word = currentLine.words[safeIdx]?.text || currentLine.text;
            const impactKey = `${activeLineIdx}-${safeIdx}`;
            return (
              <div className="relative flex items-center justify-center py-4">
                {/* Faint Monumental Echo Backdrop */}
                <span
                  aria-hidden
                  className="absolute font-display text-6xl sm:text-8xl md:text-9xl font-black uppercase tracking-tighter opacity-[0.045] scale-125 pointer-events-none select-none blur-[1px]"
                  style={{ color: primary }}
                >
                  {word}
                </span>

                {/* Radial Impact Shockwave Ring on Word Ignition */}
                <div
                  key={`ring-${impactKey}`}
                  aria-hidden
                  className="absolute w-32 h-32 sm:w-44 sm:h-44 rounded-full border-2 pointer-events-none animate-aura-shock"
                  style={{
                    borderColor: primary,
                    boxShadow: `0 0 36px ${primary}, inset 0 0 24px ${secondary}88`,
                  }}
                />

                {/* Chromatic Left & Right Echo */}
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

                {/* Hero Word Spring Slam */}
                <span
                  key={impactKey}
                  className="relative font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight animate-aura-slam"
                  style={{
                    color: accent,
                    textShadow: `0 0 36px ${primary}, 0 0 80px ${primary}77`,
                  }}
                >
                  {word}
                </span>
              </div>
            );
          })()}

          {/* Full line highlighted smoothly underneath */}
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

      {/* LIQUID GLASS APPLE LYRICS + FLOATING BIOLUMINESCENT AURORAS */}
      {style === 'liquid' && (
        <>
          {song.artworkUrl && (
            <div
              className="fixed inset-0 pointer-events-none z-0 opacity-30 scale-125"
              style={{
                backgroundImage: `url(${song.artworkUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(90px) saturate(175%)',
              }}
            />
          )}

          {/* Moving Bioluminescent Aurora Spheres */}
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            <div
              className="absolute top-[18%] left-[18%] w-[36vw] h-[36vw] max-w-[440px] max-h-[440px] rounded-full blur-[110px] opacity-28 animate-aura-float"
              style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)` }}
            />
            <div
              className="absolute bottom-[18%] right-[16%] w-[32vw] h-[32vw] max-w-[400px] max-h-[400px] rounded-full blur-[110px] opacity-24 animate-aura-float"
              style={{
                background: `radial-gradient(circle, ${secondary}, transparent 70%)`,
                animationDelay: '-5.5s',
              }}
            />
          </div>

          <div className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-7">
            <div className="min-h-[30px] text-xl sm:text-2xl font-grotesk font-medium text-white/22 blur-[0.8px] transition-all duration-300">
              {prevLine?.text || ''}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2.5 leading-tight">
              {currentLine.words.map((wd, idx) => {
                const isActive = idx === activeWordIdx;
                const isSung = idx < activeWordIdx;
                return (
                  <span
                    key={`${activeLineIdx}-${idx}`}
                    className={`relative font-display text-3xl sm:text-5xl md:text-6xl font-bold transition-all duration-200 ease-apple ${
                      isActive ? 'animate-aura-word-bloom px-2 rounded-2xl' : ''
                    }`}
                    style={{
                      color: isActive ? accent : isSung ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.22)',
                      backgroundColor: isActive ? `${primary}1c` : 'transparent',
                      textShadow: isActive
                        ? `0 0 28px ${primary}, 0 0 64px ${primary}aa, 0 0 90px ${secondary}66`
                        : 'none',
                    }}
                  >
                    {wd.text}
                  </span>
                );
              })}
            </div>

            <div className="space-y-3 pt-2">
              <div className="text-xl sm:text-2xl font-grotesk font-medium text-white/26 blur-[0.6px] transition-all duration-300">
                {nextLine?.text || ''}
              </div>
              <div className="text-base sm:text-lg font-grotesk text-white/12 blur-[1.2px] transition-all duration-300">
                {nextLine2?.text || ''}
              </div>
            </div>
          </div>
        </>
      )}

      {/* EDITORIAL POETIC SERIF + GOLDEN SPOTLIGHT & PROGRESS HAIRLINE */}
      {style === 'editorial' && (
        <div className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-7">
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
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className={`font-serif-editorial italic text-4xl sm:text-6xl font-semibold transition-all duration-200 ease-apple ${
                    isAct ? 'animate-aura-word-bloom' : ''
                  }`}
                  style={{
                    color: isAct ? accent : isSung ? 'rgba(255,250,240,0.9)' : 'rgba(255,255,255,0.24)',
                    textShadow: isAct ? `0 0 32px ${primary}, 0 0 64px ${primary}88` : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
          </div>

          {/* Ornamental Line Progress Hairline + Glowing Diamond */}
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
      {style === 'codestyle' && (
        <div className="relative z-10 w-full max-w-3xl text-left font-mono-code rounded-2xl oled-surface p-5 sm:p-7 space-y-4">
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
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className={`transition-all duration-150 ${isActive ? 'animate-aura-word-bloom' : ''}`}
                  style={{
                    color: isActive ? accent : isSung ? primary : 'rgba(255,255,255,0.28)',
                    textShadow: isActive ? `0 0 20px ${primary}, 0 0 40px ${primary}66` : 'none',
                    borderBottom: isActive ? `2px solid ${primary}` : '2px solid transparent',
                  }}
                >
                  {wd.text}
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
};
