import React, { useMemo } from 'react';
import { Disc3, Minus, Plus } from 'lucide-react';
import { LyricLine, SongItem, VibeBlueprint } from '../types';

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
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
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
}) => {
  const { primary, accent } = blueprint.palette;
  const style = blueprint.lyricStyle;

  const hasLyrics = lyrics.length > 0;
  const currentLine = hasLyrics && activeLineIdx >= 0 ? lyrics[activeLineIdx] : null;
  const prevLine = hasLyrics && activeLineIdx > 0 ? lyrics[activeLineIdx - 1] : null;
  const nextLine = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 1 ? lyrics[activeLineIdx + 1] : null;
  const nextLine2 = hasLyrics && activeLineIdx >= 0 && activeLineIdx < lyrics.length - 2 ? lyrics[activeLineIdx + 2] : null;

  // Deterministic constellation node positions (percentage coords inside safe center box)
  const constellationNodes = useMemo(() => {
    if (!currentLine) return [];
    const words = currentLine.words;
    const count = words.length;
    return words.map((w, i) => {
      const seed = (activeLineIdx + 1) * 43 + i * 19;
      const xPct = count === 1 ? 50 : 12 + (i / (count - 1)) * 76;
      const zig = i % 2 === 0 ? -1 : 1;
      const yPct = 50 + zig * (11 + seeded(seed) * 17);
      return { word: w, xPct, yPct, idx: i };
    });
  }, [currentLine, activeLineIdx]);

  // No synced lyrics available OR song at intro before first line -> Luxury Minimalist Album Centerpiece
  if (!hasLyrics || !currentLine) {
    return (
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="relative mb-7 flex items-center justify-center">
          {/* Spinning vinyl peeking behind cover */}
          <div
            className="absolute right-[-34px] w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-[#09090c] border border-white/10 shadow-2xl flex items-center justify-center animate-vinyl-spin"
            style={{
              animationPlayState: isPlaying ? 'running' : 'paused',
              backgroundImage:
                'repeating-radial-gradient(circle, #0c0c10 0px, #0c0c10 3px, #16161d 4px, #0c0c10 5px)',
            }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: primary }}>
              <div className="w-3 h-3 rounded-full bg-black" />
            </div>
          </div>

          {/* Crisp HD Album Art */}
          <div
            className="relative w-52 h-52 sm:w-60 sm:h-60 rounded-2xl overflow-hidden border border-white/15 transition-transform duration-300"
            style={{
              boxShadow: `0 24px 70px rgba(0,0,0,0.9), 0 0 42px ${primary}44`,
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
            ? 'Syncing lyrics...'
            : hasLyrics
              ? '♫  Instrumental intro — lyrics coming up  ♫'
              : 'Ambient Aura Mode · No synced lyrics found for this track'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 sm:px-12 select-none">
      {/* ========================================================
          STYLE 1: CONSTELLATION (Exact Upgraded Verci Star-Map!)
          ======================================================== */}
      {style === 'constellation' && (
        <div className="relative w-full max-w-5xl h-[54vh] min-h-[300px] flex items-center justify-center">
          {/* Ghost previous line */}
          {prevLine && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-full text-center text-xs sm:text-sm font-grotesk text-white/20 truncate px-6 transition-opacity duration-500">
              {prevLine.text}
            </div>
          )}

          {/* Razor-sharp SVG Constellation Filaments */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
            {constellationNodes.map((node, i) => {
              if (i === constellationNodes.length - 1) return null;
              const next = constellationNodes[i + 1];
              const lit = i <= activeWordIdx;
              const activeEdge = i === activeWordIdx || i + 1 === activeWordIdx;
              return (
                <line
                  key={`edge-${activeLineIdx}-${i}`}
                  x1={`${node.xPct}%`}
                  y1={`${node.yPct}%`}
                  x2={`${next.xPct}%`}
                  y2={`${next.yPct}%`}
                  stroke={activeEdge ? primary : lit ? accent : '#ffffff'}
                  strokeOpacity={activeEdge ? 0.85 : lit ? 0.42 : 0.14}
                  strokeWidth={activeEdge ? 1.6 : 1}
                />
              );
            })}
          </svg>

          {/* Constellation Star Nodes & Words */}
          {constellationNodes.map((node) => {
            const isActive = node.idx === activeWordIdx;
            const isSung = node.idx < activeWordIdx;
            const labelAbove = node.idx % 2 === 0;

            return (
              <div
                key={`node-${activeLineIdx}-${node.idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-200"
                style={{ left: `${node.xPct}%`, top: `${node.yPct}%` }}
              >
                {/* Word Text */}
                <span
                  className={`font-grotesk whitespace-nowrap transition-all duration-200 ${
                    labelAbove ? '-translate-y-7' : 'translate-y-7'
                  } ${
                    isActive
                      ? 'text-2xl sm:text-4xl font-bold scale-110'
                      : isSung
                        ? 'text-lg sm:text-2xl font-medium opacity-70'
                        : 'text-base sm:text-xl font-normal opacity-25'
                  }`}
                  style={
                    isActive
                      ? {
                          color: accent,
                          textShadow: `0 0 18px ${primary}, 0 0 38px ${primary}`,
                        }
                      : isSung
                        ? { color: accent }
                        : { color: '#ffffff' }
                  }
                >
                  {node.word.text}
                </span>

                {/* Glowing Celestial Star Vertex */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {isActive ? (
                    <div className="relative flex items-center justify-center">
                      <span
                        className="absolute w-10 h-10 rounded-full blur-md opacity-85"
                        style={{ backgroundColor: primary }}
                      />
                      <svg width="18" height="18" viewBox="0 0 24 24" className="relative">
                        <path
                          d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z"
                          fill={accent}
                        />
                      </svg>
                    </div>
                  ) : (
                    <span
                      className={`block rounded-full ${node.idx % 2 === 0 ? 'animate-twinkle' : ''}`}
                      style={{
                        width: isSung ? 6 : 4,
                        height: isSung ? 6 : 4,
                        backgroundColor: isSung ? accent : 'rgba(255,255,255,0.4)',
                        boxShadow: isSung ? `0 0 8px ${primary}` : 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Ghost next line */}
          {nextLine && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-full text-center text-xs sm:text-sm font-grotesk text-white/18 truncate px-6">
              {nextLine.text}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          STYLE 2: SPOTLIGHT (Apple Music / Minimal Luxury Sync)
          ======================================================== */}
      {style === 'spotlight' && (
        <div className="w-full max-w-4xl flex flex-col items-center text-center space-y-6">
          <div className="min-h-[28px] text-lg sm:text-2xl font-grotesk font-medium text-white/20 transition-all duration-300">
            {prevLine?.text || ''}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 leading-tight">
            {currentLine.words.map((wd, idx) => {
              const isActive = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className={`font-display text-3xl sm:text-5xl md:text-6xl font-bold transition-all duration-150 ${
                    isActive ? 'scale-105' : ''
                  }`}
                  style={{
                    color: isActive ? accent : isSung ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.25)',
                    textShadow: isActive ? `0 0 24px ${primary}, 0 0 50px ${primary}88` : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="text-lg sm:text-2xl font-grotesk font-medium text-white/28 transition-all duration-300">
              {nextLine?.text || ''}
            </div>
            <div className="text-sm sm:text-lg font-grotesk text-white/12 transition-all duration-300">
              {nextLine2?.text || ''}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          STYLE 3: EDITORIAL SERIF (Midnight Bollywood / Lofi)
          ======================================================== */}
      {style === 'editorial' && (
        <div className="w-full max-w-4xl flex flex-col items-center text-center space-y-7">
          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/22 min-h-[30px]">
            {prevLine?.text || ''}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5">
            {currentLine.words.map((wd, idx) => {
              const isActive = idx === activeWordIdx;
              const isSung = idx < activeWordIdx;
              return (
                <span
                  key={`${activeLineIdx}-${idx}`}
                  className="font-serif-editorial italic text-4xl sm:text-6xl font-semibold transition-all duration-200"
                  style={{
                    color: isActive ? accent : isSung ? 'rgba(255,250,240,0.84)' : 'rgba(255,255,255,0.24)',
                    textShadow: isActive ? `0 0 28px ${primary}` : 'none',
                    transform: isActive ? 'translateY(-3px)' : 'none',
                  }}
                >
                  {wd.text}
                </span>
              );
            })}
          </div>

          <p className="font-serif-editorial italic text-xl sm:text-2xl text-white/18 min-h-[30px]">
            {nextLine?.text || ''}
          </p>
        </div>
      )}

      {/* ========================================================
          STYLE 4: CODESTYLE (Verci Signature Minimal Terminal)
          ======================================================== */}
      {style === 'codestyle' && (
        <div className="w-full max-w-3xl text-left font-mono-code space-y-4 px-4">
          <div className="text-[11px] uppercase tracking-widest opacity-55" style={{ color: primary }}>
            {`// now_playing("${song.title}") · ${blueprint.moodName}`}
          </div>

          {prevLine && (
            <div className="text-sm sm:text-base text-white/24">
              <span className="text-white/15 mr-3">&gt;</span>
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
                    color: isActive ? accent : isSung ? primary : 'rgba(255,255,255,0.28)',
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
            <div className="text-sm text-white/15 pt-1">
              <span className="mr-3">...</span>
              {nextLine.text}
            </div>
          )}
        </div>
      )}

      {/* Subtle Lyrics Timing Nudge (super handy for 30s Apple Previews or remix tracks!) */}
      {!song.isFullTrack && hasLyrics && (
        <div className="mt-8 flex items-center gap-2 text-[10px] font-mono-code text-white/35 hover:text-white/70 transition-colors">
          <span>30s Preview · Lyrics sync</span>
          <button
            type="button"
            onClick={() => onAdjustOffset(-2)}
            className="p-1 rounded-md bg-white/[0.06] hover:bg-white/[0.14] cursor-pointer"
            title="Shift lyrics -2s"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span>{lyricOffset >= 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}</span>
          <button
            type="button"
            onClick={() => onAdjustOffset(2)}
            className="p-1 rounded-md bg-white/[0.06] hover:bg-white/[0.14] cursor-pointer"
            title="Shift lyrics +2s"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
