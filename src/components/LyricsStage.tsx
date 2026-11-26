import React from 'react';
import { Disc3, Radio } from 'lucide-react';
import { LyricLine, SongItem, VibeBlueprint } from '../types';
import { AudioPulseState, CosmosLyricsCanvas } from './CosmosLyricsCanvas';

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

  const isCanvasWorld = style === 'constellation' || style === 'branches' || style === 'web';
  const isLiveStream = song.source === 'live_tab' || song.source === 'live_mic';

  // No synced lyrics OR Live Audio Capture OR Intro -> Luxury Vinyl + Live Aura Centerpiece!
  if (!hasLyrics || !currentLine || isLiveStream) {
    return (
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute w-72 h-72 rounded-full blur-[95px] opacity-45 pointer-events-none"
            style={{ backgroundColor: primary }}
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

  return (
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 sm:px-12 select-none">
      {/* 120FPS CANVAS WORLDS: CONSTELLATION · BRANCHES · WEB */}
      {isCanvasWorld && (
        <CosmosLyricsCanvas
          mode={style}
          lyrics={lyrics}
          activeLineIdx={activeLineIdx}
          activeWordIdx={activeWordIdx}
          palette={blueprint.palette}
          audioPulseRef={audioPulseRef}
          particleMode={blueprint.particles}
        />
      )}

      {/* KINETIC SLAM: Apple-Commercial High-Impact Word Centerpiece + Chromatic Echo */}
      {style === 'kinetic' && (
        <div className="relative z-10 w-full max-w-5xl flex flex-col items-center text-center space-y-6">
          <div className="text-sm sm:text-lg font-grotesk uppercase tracking-[0.18em] text-white/25 min-h-[24px]">
            {prevLine?.text || ''}
          </div>

          {/* Hero Word Slam */}
          {(() => {
            const word = currentLine.words[Math.max(0, activeWordIdx)]?.text || currentLine.text;
            return (
              <div className="relative flex items-center justify-center py-2">
                <span
                  aria-hidden
                  className="absolute font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight opacity-45 -translate-x-1"
                  style={{ color: primary }}
                >
                  {word}
                </span>
                <span
                  aria-hidden
                  className="absolute font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight opacity-45 translate-x-1"
                  style={{ color: secondary }}
                >
                  {word}
                </span>
                <span
                  key={`${activeLineIdx}-${activeWordIdx}`}
                  className="relative font-display text-5xl sm:text-7xl md:text-8xl font-extrabold uppercase tracking-tight transition-transform duration-150 ease-apple"
                  style={{
                    color: accent,
                    textShadow: `0 0 36px ${primary}, 0 0 72px ${primary}66`,
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
                  className="font-grotesk text-base sm:text-xl font-semibold transition-colors duration-150"
                  style={{
                    color: isAct ? primary : isPast ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)',
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

      {/* LIQUID GLASS APPLE LYRICS */}
      {style === 'liquid' && (
        <>
          {song.artworkUrl && (
            <div
              className="fixed inset-0 pointer-events-none z-0 opacity-28 scale-125"
              style={{
                backgroundImage: `url(${song.artworkUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(90px) saturate(165%)',
              }}
            />
          )}
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
                    className={`font-display text-3xl sm:text-5xl md:text-6xl font-bold transition-all duration-200 ease-apple ${
                      isActive ? 'scale-108 -translate-y-1' : ''
                    }`}
                    style={{
                      color: isActive ? accent : isSung ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.22)',
                      textShadow: isActive ? `0 0 26px ${primary}, 0 0 56px ${primary}99` : 'none',
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

      {/* EDITORIAL POETIC SERIF (Soulful Hindi / Monsoon / Acoustic) */}
      {style === 'editorial' && (
        <div className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-8">
          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/22 min-h-[30px] transition-opacity duration-500">
            {prevLine?.text || ''}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2">
            {currentLine.words.map((wd, idx) => {
              const isAct = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className="font-serif-editorial italic text-4xl sm:text-6xl font-semibold transition-all duration-200 ease-apple"
                  style={{
                    color: isAct ? accent : isSung ? 'rgba(255,250,240,0.88)' : 'rgba(255,255,255,0.24)',
                    textShadow: isAct ? `0 0 28px ${primary}, 0 0 54px ${primary}66` : 'none',
                    transform: isAct ? 'translateY(-3px) scale(1.04)' : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
          </div>

          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/18 min-h-[30px] transition-opacity duration-500">
            {nextLine?.text || ''}
          </p>
        </div>
      )}

      {/* CODESTYLE (Verci Signature Minimal IDE Stream) */}
      {style === 'codestyle' && (
        <div className="relative z-10 w-full max-w-3xl text-left font-mono-code space-y-4 px-4">
          <div className="text-[11px] uppercase tracking-widest opacity-55" style={{ color: primary }}>
            {`// aura.stream("${song.title}")  /* ${blueprint.moodName} */`}
          </div>

          {prevLine && (
            <div className="text-sm sm:text-base text-white/22">
              <span className="text-white/15 mr-3">01</span>
              {prevLine.text}
            </div>
          )}

          <div className="text-xl sm:text-3xl leading-relaxed flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span style={{ color: primary }} className="font-bold">
              &gt;
            </span>
            {currentLine.words.map((wd, idx) => {
              const isActive = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              if (idx > activeWordIdx + 2) return null;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className="transition-colors duration-150"
                  style={{
                    color: isActive ? accent : isSung ? primary : 'rgba(255,255,255,0.26)',
                    textShadow: isActive ? `0 0 18px ${primary}` : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
            <span
              className="inline-block w-2.5 h-6 sm:h-7 align-middle animate-cursor"
              style={{ backgroundColor: primary }}
            />
          </div>

          {nextLine && (
            <div className="text-sm text-white/14 pt-1">
              <span className="mr-3">...</span>
              {nextLine.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
