import React, { useEffect, useRef, useState } from 'react';
import { Check, Disc3, Sparkles, Wifi } from 'lucide-react';
import type { LyricLine, SongItem, VibeBlueprint } from '../types';
import type { AudioPulseState } from './CosmosLyricsCanvas';
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

export const AppleUiLyricsStage: React.FC<AppleUiLyricsStageProps> = ({
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

  const { primary, secondary, accent } = blueprint.palette;

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const p = audioPulseRef.current;
      if (orbPrimaryRef.current) {
        const s1 = 1 + p.bass * 0.24 + p.beat * 0.1;
        orbPrimaryRef.current.style.transform = `translate3d(0,0,0) scale(${s1.toFixed(3)})`;
        orbPrimaryRef.current.style.opacity = Math.min(0.45, 0.16 + p.bass * 0.28).toFixed(3);
      }
      if (orbSecondaryRef.current) {
        const s2 = 1 + p.mid * 0.22;
        orbSecondaryRef.current.style.transform = `translate3d(0,0,0) scale(${s2.toFixed(3)})`;
        orbSecondaryRef.current.style.opacity = Math.min(0.38, 0.12 + p.mid * 0.24).toFixed(3);
      }
      if (cardTiltRef.current) {
        const sc = 1 + p.beat * 0.025;
        cardTiltRef.current.style.transform = `translate3d(0,0,0) scale(${sc.toFixed(4)})`;
      }
      rafId = requestAnimationFrame(tick);
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
      const timer = window.setTimeout(() => setSingleWordDone(true), 320);
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

  return (
    <div
      ref={stageRef}
      className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 sm:px-8 pt-14 pb-28 select-none overflow-hidden"
    >
      {/* Reactive Volumetric Violet / Song Aura Spheres */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div
          ref={orbPrimaryRef}
          className="absolute w-[42vw] h-[42vw] max-w-[520px] max-h-[520px] -translate-x-24 -translate-y-12 rounded-full blur-[120px]"
          style={{ background: `radial-gradient(circle, ${primary}, transparent 70%)`, opacity: 0.22 }}
        />
        <div
          ref={orbSecondaryRef}
          className="absolute w-[36vw] h-[36vw] max-w-[440px] max-h-[440px] translate-x-28 translate-y-16 rounded-full blur-[120px]"
          style={{ background: `radial-gradient(circle, ${secondary}, transparent 70%)`, opacity: 0.18 }}
        />
      </div>

      {/* Main Apple UI Stage Stack */}
      <div className="relative z-10 w-full max-w-[660px] flex flex-col items-center gap-5">
        {/* Top Floating Dynamic Island / macOS Status Pill */}
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-full bg-[#09090d]/95 border border-white/[0.14] shadow-[0_14px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300"
          style={{
            boxShadow: `0 14px 45px rgba(0,0,0,0.9), 0 0 24px ${primary}33`,
          }}
        >
          <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-900 shrink-0 border border-white/15">
            {song.artworkUrl ? (
              <img
                src={song.artworkUrl}
                alt={song.title}
                className={`w-full h-full object-cover ${isPlaying ? 'animate-vinyl-spin' : ''}`}
              />
            ) : (
              <Disc3 className="w-4 h-4 m-1.5 text-white/50" />
            )}
          </div>
          <div className="min-w-0 max-w-[180px] sm:max-w-[240px] text-left">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{song.title}</div>
            <div className="text-[10px] text-white/45 truncate leading-tight">{song.artist}</div>
          </div>

          <div className="h-4 w-[1px] bg-white/12 mx-0.5" />

          <div className="flex items-center gap-1.5 text-[10px] font-mono-code uppercase tracking-wider text-white/75">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: '#0A84FF', boxShadow: '0 0 8px #0A84FF' }}
            />
            <span>{variantLabel}</span>
          </div>

          {/* Reactive Mini Bars */}
          <div className="flex items-end gap-[2.5px] h-3.5 pl-1">
            {[0.55, 0.95, 0.7, 0.85].map((hMul, bIdx) => (
              <span
                key={bIdx}
                className="w-[2.5px] rounded-full transition-all duration-200"
                style={{
                  height: isPlaying ? `${Math.round(4 + hMul * 10)}px` : '4px',
                  backgroundColor: bIdx % 2 === 0 ? primary : '#0A84FF',
                  animation: isPlaying ? `aura-typing-dot ${0.7 + bIdx * 0.14}s infinite ease-in-out` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* OUTRO: Track Ending Hold Card */}
        {!currentLine && !nextLine && lyrics.length > 0 && (
          <div
            ref={cardTiltRef}
            className="w-full max-w-[520px] rounded-[28px] p-6 sm:p-7 border border-white/[0.14] backdrop-blur-2xl animate-imessage-pop text-center space-y-2"
            style={{
              background: `linear-gradient(140deg, ${primary}22 0%, rgba(12,12,18,0.92) 60%, #0A84FF1c 100%)`,
              boxShadow: `0 24px 70px rgba(0,0,0,0.92), 0 0 36px ${primary}2a, inset 0 1px 0 rgba(255,255,255,0.18)`,
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

        {/* INTRO OR INTERLUDE: iMessage Incoming Typing Pill + Upcoming Lyric Preview */}
        {!currentLine && nextLine && (
          <div
            ref={cardTiltRef}
            className="w-full max-w-[540px] flex flex-col items-stretch gap-3.5 animate-imessage-pop"
          >
            {/* Incoming iOS Typing Pill */}
            <div className="self-start flex items-center gap-3 px-4 py-2.5 rounded-2xl rounded-bl-md bg-[#1C1C1E]/95 border border-white/[0.1] shadow-2xl">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white/70 animate-typing-dot-1" />
                <span className="w-2 h-2 rounded-full bg-white/70 animate-typing-dot-2" />
                <span className="w-2 h-2 rounded-full bg-white/70 animate-typing-dot-3" />
              </div>
              <span className="text-[11px] font-mono-code text-white/55">
                {phase === 'intro' ? 'INTRO' : 'INTERLUDE'} · {fmtCountdown(secondsUntilNext)}
              </span>
              {song.isFullTrack && secondsUntilNext > 3.5 && onJumpToTime && (
                <button
                  type="button"
                  onClick={() => onJumpToTime(Math.max(0, nextLine.start - 0.8))}
                  className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-[#0A84FF] hover:brightness-110 cursor-pointer"
                >
                  Jump to Vocals
                </button>
              )}
            </div>

            {/* Frosted Preview Card of Upcoming Lyrics */}
            <div
              className="rounded-[28px] p-6 sm:p-7 border border-white/[0.15] shadow-[0_24px_70px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-left space-y-2.5"
              style={{
                background: `linear-gradient(135deg, ${primary}28 0%, rgba(18,18,26,0.92) 55%, #0A84FF22 100%)`,
                boxShadow: `0 24px 70px rgba(0,0,0,0.92), 0 0 38px ${primary}2e, inset 0 1px 0 rgba(255,255,255,0.22)`,
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
                <div className="text-sm sm:text-base text-white/40 font-grotesk">{nextLine2.text}</div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE LYRIC CARD ARCHETYPES */}
        {currentLine && (
          <div ref={cardTiltRef} className="w-full flex flex-col items-center gap-3.5">
            {/* Subtle Past Line Context Pill */}
            <div className="min-h-[24px] text-xs sm:text-sm text-white/35 font-grotesk truncate max-w-[90%] transition-all duration-300">
              {prevLine?.text || ''}
            </div>

            {/* 1. iMESSAGE SPEECH BUBBLES (Bright Apple Blue #0A84FF + SVG Tail + Word Glow) */}
            {variant === 'imessage' && (
              <div
                key={`imsg-${activeLineIdx}`}
                className="w-full max-w-[560px] flex flex-col items-stretch gap-3 animate-imessage-pop"
              >
                {prevLine && (
                  <div className="self-start max-w-[82%] px-4 py-2.5 rounded-[22px] rounded-bl-[6px] bg-[#1C1C1E]/90 border border-white/[0.08] text-white/60 text-sm sm:text-base font-medium shadow-lg">
                    {prevLine.text}
                  </div>
                )}

                <div className="self-end relative max-w-[92%]">
                  <div
                    className="relative px-5 sm:px-7 py-4 sm:py-5 rounded-[26px] rounded-br-[8px] shadow-[0_18px_50px_rgba(10,132,255,0.42)] border border-white/25"
                    style={{
                      background: 'linear-gradient(135deg, #0A84FF 0%, #0066EE 100%)',
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
                            className={`inline-flex items-center gap-1 font-grotesk text-2xl sm:text-4xl font-bold transition-all duration-150 ${
                              isAct ? 'scale-105 text-white' : ''
                            }`}
                            style={{
                              color: isAct
                                ? '#ffffff'
                                : isSung
                                  ? 'rgba(255,255,255,0.92)'
                                  : 'rgba(255,255,255,0.48)',
                              textShadow: isAct ? '0 0 22px rgba(255,255,255,0.85)' : 'none',
                            }}
                          >
                            <span>{wd.text}</span>
                            {icon && isAct && (
                              <span className="text-lg sm:text-2xl animate-aura-word-bloom">{icon}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Authentic Apple iMessage Speech Bubble Tail */}
                    <svg
                      viewBox="0 0 20 20"
                      className="absolute -right-[7px] bottom-0 w-5 h-5 fill-[#0066EE]"
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
                  <div className="self-start flex items-center gap-2.5 px-4 py-2 rounded-[20px] rounded-bl-[6px] bg-[#1C1C1E]/75 border border-white/[0.07] max-w-[82%]">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-typing-dot-1" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-typing-dot-2" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-typing-dot-3" />
                    </div>
                    <span className="text-xs text-white/35 truncate">{nextLine.text}</span>
                  </div>
                )}
              </div>
            )}

            {/* 2. APPLE PAY / WALLET CARD FLIPPING TO BLUE CHECKMARK "DONE" */}
            {variant === 'apple_pay' && (
              <div
                key={`pay-${activeLineIdx}`}
                className="w-full max-w-[540px] rounded-[30px] p-5 sm:p-7 border border-white/[0.16] shadow-[0_28px_80px_rgba(0,0,0,0.94)] animate-applepay-in relative overflow-hidden"
                style={{
                  background:
                    'linear-gradient(145deg, rgba(28,28,38,0.96) 0%, rgba(11,11,16,0.98) 65%, rgba(16,16,24,0.98) 100%)',
                  boxShadow: `0 28px 80px rgba(0,0,0,0.94), 0 0 42px ${payDone ? '#0A84FF44' : `${primary}38`}, inset 0 1px 0 rgba(255,255,255,0.22)`,
                }}
              >
                {/* Header bar inside Wallet Card */}
                <div className="flex items-center justify-between text-xs text-white/60 pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-black font-bold text-[10px] tracking-tight">
                      <svg viewBox="0 0 14 17" className="w-2.5 h-3 fill-current -mt-0.5" aria-hidden>
                        <path d="M11.6 9.1c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.7-.7-1.4 0-2.6.8-3.3 2-.1.2-1.4 2.5-.3 6 .6 1.7 1.6 3.5 2.9 3.5 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.3 0 2.1-1.6 2.8-3.3.5-1 .8-2 .9-2.1-.1-.1-1.7-.7-1.7-2.4zM9.6 3.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" />
                      </svg>
                      <span>Pay</span>
                    </span>
                    <span className="font-mono-code text-[10px] uppercase tracking-widest text-white/45">
                      AURA PASS · {song.album || song.title}
                    </span>
                  </div>
                  <Wifi className="w-4 h-4 text-white/40 rotate-90" />
                </div>

                {/* Lyric Body + Interactive Flipping Checkmark Ring */}
                <div className="py-5 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-left">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                      return (
                        <span
                          key={`${activeLineIdx}-pay-${idx}`}
                          className={`inline-flex items-center gap-1 font-display text-2xl sm:text-4xl font-bold transition-all duration-150 ${
                            isAct ? 'scale-105' : ''
                          }`}
                          style={{
                            color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.26)',
                            textShadow: isAct ? `0 0 24px ${primary}, 0 0 42px #0A84FF88` : 'none',
                          }}
                        >
                          <span>{wd.text}</span>
                          {icon && isAct && <span className="text-xl">{icon}</span>}
                        </span>
                      );
                    })}
                  </div>

                  {/* Signature Blue Checkmark "Done" Morph */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 transition-all duration-500"
                      style={{
                        borderColor: payDone ? '#0A84FF' : primary,
                        backgroundColor: payDone ? 'rgba(10, 132, 255, 0.16)' : 'rgba(255,255,255,0.04)',
                        boxShadow: payDone ? '0 0 32px rgba(10,132,255,0.55)' : `0 0 18px ${primary}33`,
                        transform: payDone
                          ? 'perspective(600px) scale(1.06) rotateY(0deg)'
                          : 'perspective(600px) scale(0.95) rotateY(180deg)',
                      }}
                    >
                      {payDone ? (
                        <svg
                          viewBox="0 0 28 28"
                          className="w-7 h-7 fill-none stroke-[#0A84FF] stroke-[3]"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 14.5 L11.5 20 L22 9" className="animate-checkmark-draw" />
                        </svg>
                      ) : (
                        <Check className="w-5 h-5 text-white/25" />
                      )}
                    </div>
                    <span
                      className="text-[11px] font-semibold tracking-wide transition-colors duration-300"
                      style={{ color: payDone ? '#0A84FF' : 'rgba(255,255,255,0.35)' }}
                    >
                      {payDone ? 'Done' : 'Confirming'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. FROSTED IRIDESCENT GRADIENT GLASS CARD */}
            {variant === 'frosted_card' && (
              <div
                key={`frost-${activeLineIdx}`}
                className="w-full max-w-[580px] rounded-[32px] p-7 sm:p-9 border border-white/20 backdrop-blur-2xl animate-imessage-pop relative overflow-hidden text-center"
                style={{
                  background: `linear-gradient(135deg, ${primary}3b 0%, rgba(16,16,24,0.88) 48%, ${secondary}33 100%)`,
                  boxShadow: `0 28px 80px rgba(0,0,0,0.92), 0 0 54px ${primary}3d, inset 0 1px 0 rgba(255,255,255,0.28)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 leading-tight">
                  {currentLine.words.map((wd, idx) => {
                    const isAct = idx === activeWordIdx;
                    const isSung = idx < activeWordIdx;
                    const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                    return (
                      <span
                        key={`${activeLineIdx}-fr-${idx}`}
                        className={`inline-flex items-center gap-1.5 font-display text-3xl sm:text-5xl font-bold transition-all duration-150 -mx-1.5 px-1.5 rounded-xl ${
                          isAct ? 'animate-aura-word-bloom bg-white/10' : ''
                        }`}
                        style={{
                          color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.3)',
                          textShadow: isAct ? `0 0 28px ${primary}, 0 0 58px ${secondary}88` : 'none',
                        }}
                      >
                        <span>{wd.text}</span>
                        {icon && isAct && <span className="text-2xl sm:text-3xl">{icon}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. macOS SEQUOIA FLOATING NOTIFICATION BANNER */}
            {variant === 'macos_pill' && (
              <div
                key={`mac-${activeLineIdx}`}
                className="w-full max-w-[560px] rounded-[26px] p-4 sm:p-5 border border-white/[0.16] backdrop-blur-2xl animate-imessage-pop flex items-start gap-4 text-left"
                style={{
                  background: 'linear-gradient(160deg, rgba(30,30,42,0.94) 0%, rgba(13,13,18,0.96) 100%)',
                  boxShadow: `0 24px 72px rgba(0,0,0,0.94), 0 0 36px ${primary}33, inset 0 1px 0 rgba(255,255,255,0.22)`,
                }}
              >
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 border border-white/15 shadow-lg">
                  {song.artworkUrl ? (
                    <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
                  ) : (
                    <Disc3 className="w-6 h-6 m-3 text-white/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-white/75 tracking-wide">
                      AURA · {song.artist}
                    </span>
                    <span className="text-white/35">now</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      const icon = visualIcons ? getWordVisualIcon(wd.text) : null;
                      return (
                        <span
                          key={`${activeLineIdx}-mc-${idx}`}
                          className={`inline-flex items-center gap-1 font-grotesk text-xl sm:text-3xl font-bold transition-all duration-150 ${
                            isAct ? 'scale-105' : ''
                          }`}
                          style={{
                            color: isAct ? '#ffffff' : isSung ? accent : 'rgba(255,255,255,0.3)',
                            textShadow: isAct ? `0 0 22px ${primary}` : 'none',
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
            )}

            {/* Next line subtle preview underneath non-iMessage cards */}
            {variant !== 'imessage' && nextLine && (
              <div className="text-xs sm:text-sm text-white/30 font-grotesk truncate max-w-[90%] transition-opacity duration-300">
                {nextLine.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
