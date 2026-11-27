import React, { useEffect, useRef } from 'react';
import type { AudioPulseState, LyricLine, VibeBlueprint } from '../types';
import { getWordVisualIcon } from '../services/lyricSync';

interface FisheyeLyricsStageProps {
  currentLine: LyricLine;
  prevLine: LyricLine | null;
  nextLine: LyricLine | null;
  activeLineIdx: number;
  activeWordIdx: number;
  blueprint: VibeBlueprint;
  visualIcons: boolean;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
}

export const FisheyeLyricsStage: React.FC<FisheyeLyricsStageProps> = React.memo(({
  currentLine,
  prevLine,
  nextLine,
  activeLineIdx,
  activeWordIdx,
  blueprint,
  visualIcons,
  audioPulseRef,
}) => {
  const lensRef = useRef<HTMLDivElement | null>(null);
  const { primary, secondary, accent } = blueprint.palette;

  useEffect(() => {
    let rafId = 0;
    let lastSc = -1;
    let lastTickMs = 0;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - lastTickMs < 16) return;
      lastTickMs = now;
      if (lensRef.current) {
        const p = audioPulseRef.current;
        const sub = p.subBass ?? p.bass;
        const voc = p.vocal ?? p.mid;
        const sc = Math.round((1 + sub * 0.045 + p.beat * 0.038 + voc * 0.015) * 160) / 160;
        if (sc !== lastSc) {
          lastSc = sc;
          lensRef.current.style.transform = `translate3d(0,0,0) scale(${sc.toFixed(4)})`;
        }
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioPulseRef]);

  const words = currentLine.words;
  const safeIdx = Math.max(0, activeWordIdx);
  const heroWord = words[safeIdx]?.text || currentLine.text;
  const prevWord = safeIdx > 0 ? words[safeIdx - 1]?.text : prevLine?.words[prevLine.words.length - 1]?.text || '';
  const nextWord =
    safeIdx < words.length - 1 ? words[safeIdx + 1]?.text : nextLine?.words[0]?.text || '';
  const heroIcon = visualIcons ? getWordVisualIcon(heroWord) : null;
  const impactKey = `${activeLineIdx}-${safeIdx}`;
  const heroSizeClass =
    heroWord.length >= 10
      ? 'text-2xl sm:text-4xl'
      : heroWord.length >= 7
        ? 'text-3xl sm:text-5xl'
        : 'text-4xl sm:text-6xl';

  return (
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 pt-14 pb-28 select-none">
      {/* Optical Fisheye Glass Dome */}
      <div
        ref={lensRef}
        className="relative shrink-0 aspect-square flex flex-col items-center justify-center w-[min(78vw,350px)] sm:w-[min(48vh,400px)] rounded-full border border-white/[0.14] overflow-hidden"
        style={{
          background: `radial-gradient(circle at 50% 48%, ${primary}22 0%, rgba(12,12,18,0.86) 56%, rgba(0,0,0,0.98) 100%)`,
          boxShadow: `0 0 90px ${primary}33, inset 0 0 70px ${secondary}2a, inset 0 2px 20px rgba(255,255,255,0.16)`,
        }}
      >
        {/* Chromatic Lens Rings */}
        <div
          aria-hidden
          className="absolute inset-4 rounded-full border pointer-events-none opacity-45"
          style={{ borderColor: `${primary}66` }}
        />
        <div
          aria-hidden
          className="absolute inset-9 rounded-full border pointer-events-none opacity-25"
          style={{ borderColor: `${secondary}88` }}
        />

        {/* Top Curving Previous Word */}
        <div className="min-h-[30px] text-base sm:text-xl font-grotesk font-semibold text-white/30 tracking-tight scale-90 transition-opacity duration-200 px-10 truncate max-w-full">
          {prevWord}
        </div>

        {/* Center Optical Bulge Hero Word */}
        <div
          key={impactKey}
          className="relative my-2.5 px-7 max-w-full flex items-center justify-center gap-1.5 animate-fisheye-in"
        >
          {/* Chromatic Lens Fringe */}
          <span
            aria-hidden
            className={`absolute font-display ${heroSizeClass} font-black tracking-tight -translate-x-1 opacity-45 pointer-events-none`}
            style={{ color: primary }}
          >
            {heroWord}
          </span>
          <span
            aria-hidden
            className={`absolute font-display ${heroSizeClass} font-black tracking-tight translate-x-1 opacity-45 pointer-events-none`}
            style={{ color: secondary }}
          >
            {heroWord}
          </span>
          <span
            className={`relative font-display ${heroSizeClass} font-black tracking-tight text-center leading-none`}
            style={{
              color: accent,
              textShadow: `0 0 36px ${primary}, 0 0 70px ${secondary}88`,
            }}
          >
            {heroWord}
          </span>
          {heroIcon && (
            <span className="relative text-2xl sm:text-3xl shrink-0 animate-aura-word-bloom">{heroIcon}</span>
          )}
        </div>

        {/* Bottom Curving Next Word */}
        <div className="min-h-[30px] text-base sm:text-xl font-grotesk font-semibold text-white/30 tracking-tight scale-90 transition-opacity duration-200 px-10 truncate max-w-full">
          {nextWord}
        </div>
      </div>

      {/* Full Active Line Progress Ribbon */}
      <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 max-w-2xl shrink-0">
        {words.map((wd, idx) => {
          const isAct = idx === activeWordIdx;
          const isSung = idx < activeWordIdx;
          return (
            <span
              key={`${activeLineIdx}-fe-${idx}`}
              className={`font-grotesk text-sm sm:text-lg font-medium transition-all duration-150 ${
                isAct ? 'scale-110 font-bold' : ''
              }`}
              style={{
                color: isAct ? primary : isSung ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)',
                textShadow: isAct ? `0 0 16px ${primary}` : 'none',
              }}
            >
              {wd.text}
            </span>
          );
        })}
      </div>
    </div>
  );
});
