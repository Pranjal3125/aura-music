import React from 'react';
import { Disc3, Minus, Plus } from 'lucide-react';
import { LyricLine, SongItem, VibeBlueprint } from '../types';
import { CosmosLyricsCanvas } from './CosmosLyricsCanvas';

interface LyricsStageProps {
  song: SongItem;
  lyrics: LyricLine[];
  lyricsLoading: boolean;
  activeLineIdx: number;
  activeWordIdx: number;
  blueprint: VibeBlueprint;
  isPlaying: boolean;
  lyricOffset: number;
  onAdjustOffset: (delta: number) => void;
  audioPulseRef: React.MutableRefObject<{ bass: number; beat: number; mid: number }>;
  pureCinema: boolean;
}

export const LyricsStage: React.FC<LyricsStageProps> = ({
  song,
  lyrics,
  lyricsLoading,
  activeLineIdx,
  activeWordIdx,
  blueprint,
  isPlaying,
  lyricOffset,
  onAdjustOffset,
  audioPulseRef,
  pureCinema,
}) => {
  const { primary, accent } = blueprint.palette;
  const style = blueprint.lyricStyle;

  const hasLyrics = lyrics.length > 0;
  const currentLine = hasLyrics && activeLineIdx >= 0 ? lyrics[activeLineIdx] : null;
  const prevLine = hasLyrics && activeLineIdx > 0 ? lyrics[activeLineIdx - 1] : null;
  const nextLine = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 1 ? lyrics[activeLineIdx + 1] : null;
  const nextLine2 = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 2 ? lyrics[activeLineIdx + 2] : null;

  const isCanvasWorld = style === 'constellation' || style === 'branches' || style === 'web';

  // No synced lyrics or during song intro -> Stunning Lumn Liquid-Glass Vinyl Centerpiece!
  if (!hasLyrics || !currentLine) {
    return (
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="relative mb-8 flex items-center justify-center">
          {/* Ambient volumetric album aura */}
          <div
            className="absolute w-72 h-72 rounded-full blur-[90px] opacity-40 pointer-events-none"
            style={{ backgroundColor: primary }}
          />
          {/* Spinning vinyl peeking behind cover */}
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

          {/* Crisp HD Album Art */}
          <div
            className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border border-white/15 transition-transform duration-300"
            style={{
              boxShadow: `0 28px 80px rgba(0,0,0,0.95), 0 0 48px ${primary}55`,
              transform: isPlaying ? 'scale(1)' : 'scale(0.96)',
            }}
          >
            {song.artworkUrl ? (
              <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
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

        <div className="mt-5 text-[11px] font-mono-code tracking-widest uppercase text-white/35">
          {lyricsLoading
            ? 'Syncing celestial lyrics...'
            : hasLyrics
              ? '♫  Intro — lyrics igniting shortly  ♫'
              : 'Ambient Edge Aura Mode'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 sm:px-12 select-none">
      {/* ========================================================================
          120FPS HDR CANVAS WORLDS: CONSTELLATION CAMERA · NEURAL BRANCHES · WEB
          ======================================================================== */}
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

      {/* ========================================================================
          LIQUID GLASS APPLE LYRICS (Soft Blurred Album Aura + Spring Glow Text)
          ======================================================================== */}
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
                    className={`font-display text-3xl sm:text-5xl md:text-6xl font-bold transition-all duration-150 ${
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

      {/* ========================================================================
          VERCI CODESTYLE (Crisp 2AM IDE Live-Typed Lyrics)
          ======================================================================== */}
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

      {/* Subtle Sync Offset Nudge ONLY for 30s Previews (hidden in Pure Cinema mode!) */}
      {!song.isFullTrack && hasLyrics && !pureCinema && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 text-[10px] font-mono-code text-white/35 hover:text-white/80 transition-colors">
          <span>30s sync</span>
          <button
            type="button"
            onClick={() => onAdjustOffset(-2)}
            className="p-1 rounded-md bg-white/[0.06] hover:bg-white/[0.15] cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span>{lyricOffset >= 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}</span>
          <button
            type="button"
            onClick={() => onAdjustOffset(2)}
            className="p-1 rounded-md bg-white/[0.06] hover:bg-white/[0.15] cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
