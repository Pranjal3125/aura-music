import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Disc3, Heart, Sparkles, Wifi } from 'lucide-react';
import type { AudioPulseState, LyricLine, SongItem, VibeBlueprint } from '../types';
import { getWordVisualIcon, type LyricPhase } from '../services/lyricSync';

interface AppleUiLyricsStageProps {
  song: SongItem;
  lyrics: LyricLine[];
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
}

type CardVariant = 'imessage' | 'apple_pay' | 'frosted_card' | 'macos_pill';

function pickCardVariant(lineIdx: number): CardVariant {
  if (lineIdx < 0) return 'imessage';
  const cycle = Math.floor(lineIdx / 2) % 4;
  switch (cycle) {
    case 0:
      return 'imessage';
    case 1:
      return 'apple_pay';
    case 2:
      return 'frosted_card';
    default:
      return 'macos_pill';
  }
}

function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const AppleUiLyricsStage: React.FC<AppleUiLyricsStageProps> = React.memo(({
  song,
  lyrics,
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
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const orbPrimaryRef = useRef<HTMLDivElement | null>(null);
  const orbSecondaryRef = useRef<HTMLDivElement | null>(null);
  const cardTiltRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const eqBar0Ref = useRef<HTMLSpanElement | null>(null);
  const eqBar1Ref = useRef<HTMLSpanElement | null>(null);
  const eqBar2Ref = useRef<HTMLSpanElement | null>(null);
  const eqBar3Ref = useRef<HTMLSpanElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const { primary, secondary, accent } = blueprint.palette;

  // Single lightweight 120fps compositor-only GPU pulse loop (strictly transform + opacity)
  useEffect(() => {
    let rafId = 0;
    let lastS1 = -1;
    let lastO1 = -1;
    let lastS2 = -1;
    let lastO2 = -1;
    let lastSc = -1;
    let lastTy = -999;
    let lastProg = -1;
    const eqBins = [1, 5, 11, 18];
    const eqRefs = [eqBar0Ref, eqBar1Ref, eqBar2Ref, eqBar3Ref];
    const lastEq = [-1, -1, -1, -1];

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;
      const p = audioPulseRef.current;
      const sub = p.subBass ?? p.bass;
      const voc = p.vocal ?? p.mid;
      const beat = p.beat;
      const playing = isPlayingRef.current;

      if (orbPrimaryRef.current) {
        const s1 = Math.round((0.96 + sub * 0.22 + beat * 0.1) * 100) / 100;
        const o1 = Math.round(Math.min(0.46, 0.14 + sub * 0.22 + beat * 0.1) * 50) / 50;
        if (s1 !== lastS1) {
          lastS1 = s1;
          orbPrimaryRef.current.style.transform = `translate3d(-72px, -36px, 0) scale(${s1.toFixed(2)})`;
        }
        if (o1 !== lastO1) {
          lastO1 = o1;
          orbPrimaryRef.current.style.opacity = o1.toFixed(2);
        }
      }
      if (orbSecondaryRef.current) {
        const s2 = Math.round((0.96 + voc * 0.2) * 100) / 100;
        const o2 = Math.round(Math.min(0.38, 0.1 + voc * 0.22) * 50) / 50;
        if (s2 !== lastS2) {
          lastS2 = s2;
          orbSecondaryRef.current.style.transform = `translate3d(84px, 46px, 0) scale(${s2.toFixed(2)})`;
        }
        if (o2 !== lastO2) {
          lastO2 = o2;
          orbSecondaryRef.current.style.opacity = o2.toFixed(2);
        }
      }
      if (cardTiltRef.current) {
        const sc = Math.round((1 + beat * 0.022 + voc * 0.01) * 250) / 250;
        const ty = Math.round((-beat * 3.2 - voc * 1.1) * 10) / 10;
        if (sc !== lastSc || ty !== lastTy) {
          lastSc = sc;
          lastTy = ty;
          cardTiltRef.current.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
        }
      }
      if (progressBarRef.current) {
        const prog = Math.round(Math.min(1, Math.max(0.02, p.lineProgress ?? 0)) * 200) / 200;
        if (prog !== lastProg) {
          lastProg = prog;
          progressBarRef.current.style.transform = `scaleX(${prog.toFixed(3)})`;
        }
      }
      const spec = p.spectrum;
      for (let i = 0; i < 4; i++) {
        const el = eqRefs[i].current;
        if (!el) continue;
        const raw = playing ? (spec[eqBins[i]] || 0) : 0.06;
        const sy = Math.round(Math.min(1, Math.max(0.18, 0.2 + raw * 0.95)) * 40) / 40;
        if (sy !== lastEq[i]) {
          lastEq[i] = sy;
          el.style.transform = `scaleY(${sy.toFixed(2)})`;
        }
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioPulseRef]);

  const currentLine = activeLineIdx >= 0 ? lyrics[activeLineIdx] : null;
  const prevLine = activeLineIdx > 0 ? lyrics[activeLineIdx - 1] : null;
  const nextLine =
    activeLineIdx >= 0 && activeLineIdx < lyrics.length - 1
      ? lyrics[activeLineIdx + 1]
      : upcomingLineIdx >= 0
        ? lyrics[upcomingLineIdx]
        : null;
  const nextLine2 =
    upcomingLineIdx >= 0 && upcomingLineIdx + 1 < lyrics.length
      ? lyrics[upcomingLineIdx + 1]
      : null;

  const variant = pickCardVariant(activeLineIdx);
  const wordCount = currentLine?.words.length || 0;
  const wordProgress = wordCount > 0 ? (Math.max(0, activeWordIdx) + 1) / wordCount : 0;

  const [singleWordDone, setSingleWordDone] = useState(false);
  useEffect(() => {
    setSingleWordDone(false);
    if (variant === 'apple_pay' && wordCount <= 1 && currentLine) {
      const timer = window.setTimeout(() => setSingleWordDone(true), 280);
      return () => window.clearTimeout(timer);
    }
  }, [variant, activeLineIdx, wordCount, currentLine]);

  const payDone =
    variant === 'apple_pay' &&
    (wordCount <= 1 ? singleWordDone : activeWordIdx >= Math.max(1, Math.floor(wordCount / 2)));

  const variantLabel =
    phase === 'intro' || phase === 'interlude'
      ? 'Incoming Lyrics'
      : variant === 'imessage'
        ? 'iMessage'
        : variant === 'apple_pay'
          ? 'Apple Pay'
          : variant === 'frosted_card'
            ? 'Frosted Card'
            : 'macOS Pill';

  const primaryArtist = song.artist.split(/[,&]/)[0]?.trim() || song.artist;

  return (
    <div
      ref={stageRef}
      className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 sm:px-8 pt-14 pb-28 select-none overflow-hidden"
    >
      {/* Subtle Pure-OLED Center Aura behind Cards (Zero-Blur Multi-Stop GPU Gradients) */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div
          ref={orbPrimaryRef}
          className="absolute w-[48vw] h-[48vw] max-w-[540px] max-h-[540px] rounded-full will-change-transform"
          style={{
            background: `radial-gradient(circle, ${primary}48 0%, ${primary}1c 32%, ${primary}06 58%, transparent 74%)`,
            opacity: 0.22,
            transform: 'translate3d(-72px, -36px, 0)',
          }}
        />
        <div
          ref={orbSecondaryRef}
          className="absolute w-[42vw] h-[42vw] max-w-[460px] max-h-[460px] rounded-full will-change-transform"
          style={{
            background: `radial-gradient(circle, ${secondary}40 0%, ${secondary}18 32%, ${secondary}05 58%, transparent 74%)`,
            opacity: 0.16,
            transform: 'translate3d(84px, 46px, 0)',
          }}
        />
      </div>

      {/* Main Verci Apple UI Stage Stack */}
      <div className="relative z-10 w-full max-w-[640px] flex flex-col items-center gap-5">
        {/* Compact Apple Dynamic Island Status Pill with Live 120fps Spectrum Bars */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#08080c]/95 border border-white/[0.12] transition-colors duration-300"
          style={{
            boxShadow: `0 12px 36px rgba(0,0,0,0.92), 0 0 18px ${primary}28`,
          }}
        >
          <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-900 shrink-0 border border-white/15">
            {song.artworkUrl ? (
              <img
                src={song.artworkUrl}
                alt={song.title}
                className={`w-full h-full object-cover ${isPlaying ? 'animate-vinyl-spin' : ''}`}
              />
            ) : (
              <Disc3 className="w-3.5 h-3.5 m-1 text-white/50" />
            )}
          </div>
          <div className="min-w-0 max-w-[165px] sm:max-w-[230px] text-left">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{song.title}</div>
            <div className="text-[9.5px] text-white/45 truncate leading-tight">{song.artist}</div>
          </div>

          <div className="h-3.5 w-[1px] bg-white/12 mx-0.5" />

          <div className="flex items-center gap-1.5 text-[10px] font-mono-code uppercase tracking-wider text-white/70">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#0A84FF', boxShadow: '0 0 8px #0A84FF' }}
            />
            <span>{variantLabel}</span>
          </div>

          {/* Live 120fps Music-Driven Mini EQ Bars (GPU scaleY) */}
          <div className="flex items-end gap-[2.5px] h-3.5 pl-1">
            {[eqBar0Ref, eqBar1Ref, eqBar2Ref, eqBar3Ref].map((barRef, bIdx) => (
              <span
                key={bIdx}
                ref={barRef}
                className="w-[2.5px] h-full rounded-full origin-bottom will-change-transform"
                style={{
                  backgroundColor: bIdx % 2 === 0 ? primary : '#0A84FF',
                  transform: 'scaleY(0.28)',
                }}
              />
            ))}
          </div>
        </div>

        {/* OUTRO: Track Ending Hold Card */}
        {!currentLine && !nextLine && lyrics.length > 0 && (
          <div
            ref={cardTiltRef}
            className="w-full max-w-[500px] rounded-[28px] p-6 sm:p-7 border border-white/[0.14] animate-imessage-pop text-center space-y-2 will-change-transform"
            style={{
              background: `linear-gradient(140deg, ${primary}22 0%, rgba(10,10,16,0.95) 60%, #0A84FF1c 100%)`,
              boxShadow: `0 24px 64px rgba(0,0,0,0.92), 0 0 32px ${primary}28, inset 0 1px 0 rgba(255,255,255,0.18)`,
            }}
          >
            <div className="text-[10px] font-mono-code uppercase tracking-[0.22em] text-white/45">
              Outro · {song.title}
            </div>
            <div className="font-display text-xl sm:text-3xl font-bold text-white/80 leading-snug">
              {lyrics[lyrics.length - 1]?.text}
            </div>
          </div>
        )}

        {/* INTRO OR INTERLUDE: Incoming iOS Typing Pill + Frosted Upcoming Preview */}
        {!currentLine && nextLine && (
          <div
            ref={cardTiltRef}
            className="w-full max-w-[520px] flex flex-col items-stretch gap-3 animate-imessage-pop will-change-transform"
          >
            <div className="self-start flex items-center gap-3 px-4 py-2 rounded-2xl rounded-bl-md bg-[#1C1C1E]/95 border border-white/[0.1] shadow-2xl">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white/75 animate-typing-dot-1" />
                <span className="w-2 h-2 rounded-full bg-white/75 animate-typing-dot-2" />
                <span className="w-2 h-2 rounded-full bg-white/75 animate-typing-dot-3" />
              </div>
              <span className="text-[11px] font-mono-code text-white/55">
                {phase === 'intro' ? 'INTRO' : 'INTERLUDE'} · {fmtCountdown(secondsUntilNext)}
              </span>
              {song.isFullTrack && secondsUntilNext > 3.5 && onJumpToTime && (
                <button
                  type="button"
                  onClick={() => onJumpToTime(Math.max(0, nextLine.start - 0.8))}
                  className="ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white bg-[#0A84FF] hover:brightness-110 cursor-pointer"
                >
                  Jump to Vocals
                </button>
              )}
            </div>

            <div
              className="rounded-[28px] p-6 sm:p-7 border border-white/[0.15] text-left space-y-2.5 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primary}26 0%, rgba(14,14,22,0.95) 55%, #0A84FF22 100%)`,
                boxShadow: `0 24px 64px rgba(0,0,0,0.92), 0 0 36px ${primary}28, inset 0 1px 0 rgba(255,255,255,0.22)`,
              }}
            >
              <div className="text-[10px] font-mono-code uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" style={{ color: primary }} />
                <span>Next Lyric Up</span>
              </div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug">
                {nextLine.text}
              </div>
              {nextLine2 && (
                <div className="text-sm sm:text-base text-white/38 font-grotesk">{nextLine2.text}</div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE REEL-FAITHFUL VERCI APPLE UI ARCHETYPES */}
        {currentLine && (
          <div ref={cardTiltRef} className="w-full flex flex-col items-center gap-3 will-change-transform">
            {/* 1. iMESSAGE SPEECH BUBBLES (Bright Apple Blue #0A84FF + Authentic Curved Tail) */}
            {variant === 'imessage' && (
              <div
                key={`imsg-${activeLineIdx}`}
                className="w-full max-w-[540px] flex flex-col items-stretch gap-3 animate-imessage-pop"
              >
                {prevLine && (
                  <div className="self-start max-w-[80%] px-4 py-2.5 rounded-[22px] rounded-bl-[6px] bg-[#1C1C1E]/92 border border-white/[0.08] text-white/55 text-sm sm:text-base font-medium shadow-lg">
                    {prevLine.text}
                  </div>
                )}

                <div className="self-end relative max-w-[92%]">
                  <div
                    className="relative px-5 sm:px-7 py-4 sm:py-5 rounded-[26px] rounded-br-[8px] border border-white/25"
                    style={{
                      background: 'linear-gradient(165deg, #2194FF 0%, #0A84FF 48%, #0066EC 100%)',
                      boxShadow: '0 18px 48px rgba(10,132,255,0.44), inset 0 1px 0 rgba(255,255,255,0.34)',
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-left leading-tight">
                      {currentLine.words.map((wd, idx) => {
                        const isAct = idx === activeWordIdx;
                        const isSung = idx < activeWordIdx;
                        const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                        return (
                          <span
                            key={`${activeLineIdx}-msg-${idx}`}
                            className={`inline-flex items-center gap-1 font-grotesk text-2xl sm:text-4xl font-bold transition-transform duration-150 ease-apple ${
                              isAct ? 'animate-aura-word-bloom' : ''
                            }`}
                            style={{
                              color: isAct
                                ? '#ffffff'
                                : isSung
                                  ? 'rgba(255,255,255,0.94)'
                                  : 'rgba(255,255,255,0.52)',
                              textShadow: isAct ? '0 0 18px rgba(255,255,255,0.75)' : 'none',
                            }}
                          >
                            <span>{wd.text}</span>
                            {icon && isAct && (
                              <span className="text-lg sm:text-2xl">{icon}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Authentic Apple iMessage Speech Bubble Tail */}
                    <svg
                      viewBox="0 0 20 20"
                      className="absolute -right-[7px] bottom-0 w-5 h-5 fill-[#0066EC]"
                      aria-hidden
                    >
                      <path d="M0,20 L10,20 C14.5,20 18,18.5 20,16.5 C16.5,15.5 14.5,12 14,5 L14,0 L0,0 Z" />
                    </svg>
                  </div>

                  <div className="mt-1.5 pr-2 text-right text-[11px] font-medium text-[#0A84FF] tracking-wide">
                    {wordProgress >= 0.85 ? 'Read' : 'Delivered'}
                  </div>
                </div>

                {nextLine && (
                  <div className="self-start flex items-center gap-2.5 px-4 py-2 rounded-[20px] rounded-bl-[6px] bg-[#1C1C1E]/80 border border-white/[0.07] max-w-[82%]">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-1" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-2" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-3" />
                    </div>
                    <span className="text-xs text-white/38 truncate">{nextLine.text}</span>
                  </div>
                )}
              </div>
            )}

            {/* 2. REEL SIGNATURE APPLE PAY SHEET (Pay {Artist} + Arrow -> Solid Blue Checkmark "Done" + Paired Reply) */}
            {variant === 'apple_pay' && (
              <div
                key={`pay-${activeLineIdx}`}
                className="w-full max-w-[520px] flex flex-col items-stretch gap-2.5 animate-applepay-in"
              >
                {/* Top Translucent Context Strip with Authentic White Apple Pay Badge (matches Reel Shot 3) */}
                <div
                  className="mx-3 px-4 py-2.5 rounded-2xl border border-white/[0.1] flex items-center justify-between gap-3"
                  style={{
                    background: 'linear-gradient(180deg, rgba(24,24,32,0.88) 0%, rgba(12,12,17,0.92) 100%)',
                  }}
                >
                  <div className="min-w-0 text-left">
                    <div className="text-xs font-medium text-white/75 truncate">
                      {prevLine?.text || song.title}
                    </div>
                    <div className="text-[10px] text-white/38 truncate">
                      {song.album || song.artist}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-white font-semibold text-sm tracking-tight shrink-0">
                    <svg viewBox="0 0 14 17" className="w-3 h-3.5 fill-current -mt-0.5" aria-hidden>
                      <path d="M11.6 9.1c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.7-.7-1.4 0-2.6.8-3.3 2-.1.2-1.4 2.5-.3 6 .6 1.7 1.6 3.5 2.9 3.5 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.3 0 2.1-1.6 2.8-3.3.5-1 .8-2 .9-2.1-.1-.1-1.7-.7-1.7-2.4zM9.6 3.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" />
                    </svg>
                    <span>Pay</span>
                  </span>
                </div>

                {/* Main Dark Apple Pay Confirmation Sheet */}
                <div
                  className="rounded-[28px] p-5 sm:p-6 border border-white/[0.16] relative overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(160deg, rgba(22,22,30,0.96) 0%, rgba(9,9,13,0.985) 100%)',
                    boxShadow: `0 26px 72px rgba(0,0,0,0.94), 0 0 36px ${payDone ? 'rgba(10,132,255,0.28)' : `${primary}28`}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0 text-left space-y-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-white/48 font-medium">
                        <span>Pay {primaryArtist}</span>
                        <Wifi className="w-3 h-3 text-white/30 rotate-90" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        {currentLine.words.map((wd, idx) => {
                          const isAct = idx === activeWordIdx;
                          const isSung = idx < activeWordIdx;
                          const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                          return (
                            <span
                              key={`${activeLineIdx}-pay-${idx}`}
                              className={`inline-flex items-center gap-1 font-display text-2xl sm:text-4xl font-bold tracking-tight transition-colors duration-150 ${
                                isAct ? 'animate-aura-word-bloom' : ''
                              }`}
                              style={{
                                color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.34)',
                                textShadow: isAct ? `0 0 22px ${primary}cc` : 'none',
                              }}
                            >
                              <span>{wd.text}</span>
                              {icon && isAct && <span className="text-xl">{icon}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Iconic Reel Apple Pay Button: Arrow Ring -> Solid Apple Blue Circle + Crisp White Checkmark "Done" */}
                    <div className="shrink-0 flex flex-col items-center gap-1.5">
                      <div
                        key={payDone ? `done-${activeLineIdx}` : `wait-${activeLineIdx}`}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 transition-colors duration-200 ${
                          payDone ? 'animate-pay-done-pop' : ''
                        }`}
                        style={{
                          borderColor: payDone ? '#0A84FF' : 'rgba(10,132,255,0.65)',
                          backgroundColor: payDone ? '#0A84FF' : 'rgba(10,132,255,0.08)',
                          boxShadow: payDone
                            ? '0 0 28px rgba(10,132,255,0.68)'
                            : '0 0 14px rgba(10,132,255,0.22)',
                        }}
                      >
                        {payDone ? (
                          <svg
                            viewBox="0 0 28 28"
                            className="w-6 h-6 sm:w-7 sm:h-7 fill-none stroke-white stroke-[3]"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M6.5 14.5 L11.8 19.8 L21.5 9.2" className="animate-checkmark-draw" />
                          </svg>
                        ) : (
                          <ArrowRight className="w-5 h-5 text-[#0A84FF]" />
                        )}
                      </div>
                      <span
                        className="text-[11px] font-semibold tracking-wide transition-colors duration-200"
                        style={{ color: payDone ? '#ffffff' : 'rgba(255,255,255,0.38)' }}
                      >
                        {payDone ? 'Done' : 'Confirming'}
                      </span>
                    </div>
                  </div>

                  {/* Silky 120fps Line Progress Hairline */}
                  <div className="mt-4 h-[2px] w-full rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      ref={progressBarRef}
                      className="h-full w-full origin-left will-change-transform"
                      style={{
                        background: `linear-gradient(90deg, ${primary}, #0A84FF, #ffffff)`,
                        transform: `scaleX(${Math.max(0.05, wordProgress).toFixed(3)})`,
                      }}
                    />
                  </div>
                </div>

                {/* Paired Popping Blue iMessage Follow-up Bubble tucked below-right (matches Reel Shot 4!) */}
                {payDone && nextLine && (
                  <div className="self-end pr-2 animate-reply-pop">
                    <div
                      className="relative px-4 py-2 rounded-[20px] rounded-br-[6px] text-white text-sm sm:text-base font-semibold tracking-tight max-w-[340px]"
                      style={{
                        background: 'linear-gradient(155deg, #2194FF 0%, #0A84FF 60%, #0066EC 100%)',
                        boxShadow: '0 10px 28px rgba(10,132,255,0.45)',
                      }}
                    >
                      <span className="block truncate">{nextLine.text}</span>
                      <svg
                        viewBox="0 0 16 16"
                        className="absolute -right-[5px] bottom-0 w-4 h-4 fill-[#0066EC]"
                        aria-hidden
                      >
                        <path d="M0,16 L8,16 C11.5,16 14.5,14.8 16,13.2 C13.2,12.4 11.6,9.6 11.2,4 L11.2,0 L0,0 Z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. REEL IRIDESCENT FROSTED GRADIENT GLASS CARD + FLOATING BLUE ECHO BUBBLE */}
            {variant === 'frosted_card' && (
              <div
                key={`frost-${activeLineIdx}`}
                className="w-full max-w-[560px] flex flex-col items-stretch gap-3 animate-imessage-pop"
              >
                <div
                  className="w-full rounded-[30px] p-7 sm:p-9 border border-white/25 relative overflow-hidden text-center"
                  style={{
                    background: `linear-gradient(125deg, rgba(165,216,255,0.28) 0%, ${primary}55 38%, rgba(236,72,153,0.34) 72%, ${secondary}44 100%)`,
                    boxShadow: `0 28px 72px rgba(0,0,0,0.92), 0 0 46px ${primary}38, inset 0 1px 0 rgba(255,255,255,0.38)`,
                  }}
                >
                  {/* Smooth GPU-composited specular glass sheen */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-frosted-sheen"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)',
                    }}
                  />

                  <div className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-2 leading-tight">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                      return (
                        <span
                          key={`${activeLineIdx}-fr-${idx}`}
                          className={`inline-flex items-center gap-1.5 font-display text-3xl sm:text-5xl font-bold transition-colors duration-150 -mx-1.5 px-1.5 rounded-xl ${
                            isAct ? 'animate-aura-word-bloom bg-white/14' : ''
                          }`}
                          style={{
                            color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.38)',
                            textShadow: isAct ? `0 0 24px ${primary}, 0 0 48px ${secondary}88` : 'none',
                          }}
                        >
                          <span>{wd.text}</span>
                          {icon && isAct && <span className="text-2xl sm:text-3xl">{icon}</span>}
                        </span>
                      );
                    })}
                  </div>

                  {/* Live 120fps glass shimmer progress hairline */}
                  <div className="relative mt-6 h-[2px] w-full rounded-full bg-white/15 overflow-hidden">
                    <div
                      ref={progressBarRef}
                      className="h-full w-full origin-left will-change-transform bg-white/85"
                      style={{ transform: `scaleX(${Math.max(0.05, wordProgress).toFixed(3)})` }}
                    />
                  </div>
                </div>

                {/* Paired Floating Blue iMessage Echo Bubble (matches Reel final_step_35!) */}
                {nextLine && (
                  <div className="self-end pr-2 animate-reply-pop">
                    <div
                      className="relative px-4 py-1.5 rounded-full text-white text-xs sm:text-sm font-semibold max-w-[280px] truncate"
                      style={{
                        background: 'linear-gradient(155deg, #2194FF 0%, #0A84FF 65%, #0066EC 100%)',
                        boxShadow: '0 8px 24px rgba(10,132,255,0.45)',
                      }}
                    >
                      {nextLine.text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. REEL STACKED TRANSLUCENT macOS / iOS LIVE STATUS PILLS (matches Reel Shot 2!) */}
            {variant === 'macos_pill' && (
              <div
                key={`mac-${activeLineIdx}`}
                className="w-full max-w-[540px] flex flex-col items-stretch gap-2.5 animate-pill-rise"
              >
                {/* Top Faded Translucent Violet Status Pill (previous lyric) */}
                {prevLine && (
                  <div
                    className="mx-5 px-4 py-2 rounded-full border border-white/[0.08] flex items-center justify-center gap-2 text-xs text-white/45 truncate"
                    style={{
                      background: `linear-gradient(90deg, ${primary}24 0%, rgba(20,18,30,0.85) 50%, ${primary}20 100%)`,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: primary }} />
                    <span className="truncate">{prevLine.text}</span>
                  </div>
                )}

                {/* Center Hero Translucent Glass Live Notification Pill */}
                <div
                  className="w-full rounded-[28px] p-4 sm:p-5 border border-white/[0.16] flex items-center gap-4 text-left relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(160deg, rgba(28,28,40,0.95) 0%, rgba(11,11,16,0.97) 100%)',
                    boxShadow: `0 24px 64px rgba(0,0,0,0.94), 0 0 34px ${primary}30, inset 0 1px 0 rgba(255,255,255,0.22)`,
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/15 flex items-center justify-center relative"
                    style={{ boxShadow: `0 0 20px ${primary}44` }}
                  >
                    {song.artworkUrl ? (
                      <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
                    ) : (
                      <Heart className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-white/75 tracking-wide truncate">
                        AURA · {song.artist}
                      </span>
                      <span className="text-white/35 shrink-0">now</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug">
                      {currentLine.words.map((wd, idx) => {
                        const isAct = idx === activeWordIdx;
                        const isSung = idx < activeWordIdx;
                        const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                        return (
                          <span
                            key={`${activeLineIdx}-mc-${idx}`}
                            className={`inline-flex items-center gap-1 font-grotesk text-xl sm:text-3xl font-bold transition-colors duration-150 ${
                              isAct ? 'animate-aura-word-bloom' : ''
                            }`}
                            style={{
                              color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.34)',
                              textShadow: isAct ? `0 0 20px ${primary}` : 'none',
                            }}
                          >
                            <span>{wd.text}</span>
                            {icon && isAct && <span className="text-lg sm:text-2xl">{icon}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Bottom Glowing Emerald/Accent Status Pill (matches Reel Shot 2's glowing green heart bar!) */}
                {nextLine && (
                  <div
                    className="mx-3 px-4 py-2 rounded-full border border-emerald-400/20 flex items-center justify-between gap-3 overflow-hidden relative"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(16,185,129,0.22) 0%, rgba(12,26,22,0.88) 55%, rgba(16,185,129,0.16) 100%)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Heart className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-100/75 truncate font-grotesk">{nextLine.text}</span>
                    </div>
                    <div className="w-16 h-1 rounded-full bg-white/15 overflow-hidden shrink-0">
                      <div
                        ref={progressBarRef}
                        className="h-full w-full origin-left bg-emerald-400 will-change-transform"
                        style={{ transform: `scaleX(${Math.max(0.05, wordProgress).toFixed(3)})` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Next line subtle whisper for non-paired single-card states */}
            {variant !== 'imessage' && variant !== 'macos_pill' && variant !== 'frosted_card' && !(variant === 'apple_pay' && payDone) && nextLine && (
              <div className="text-xs sm:text-sm text-white/30 font-grotesk truncate max-w-[90%] transition-opacity duration-300">
                {nextLine.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
