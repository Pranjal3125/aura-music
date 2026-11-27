import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Heart, Navigation, Sparkles } from 'lucide-react';
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

export type AppleCardVariant =
  | 'imessage'
  | 'apple_maps'
  | 'apple_pay'
  | 'apple_cash'
  | 'frosted_card'
  | 'macos_pill';

/**
 * 8-beat choreography matching the exact Verci × Lumn Reel sequence:
 * 0: iMessage -> 1: Apple Maps -> 2: Apple Pay + Reply -> 3: Apple Cash ->
 * 4: Apple Card Titanium + Reply -> 5: Apple Maps -> 6: Live Activity Emerald Pill -> 7: Apple Cash
 */
export function pickCardVariant(lineIdx: number): AppleCardVariant {
  if (lineIdx < 0) return 'imessage';
  switch (lineIdx % 8) {
    case 0:
      return 'imessage';
    case 1:
    case 5:
      return 'apple_maps';
    case 2:
      return 'apple_pay';
    case 3:
    case 7:
      return 'apple_cash';
    case 4:
      return 'frosted_card';
    default:
      return 'macos_pill';
  }
}

function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const AppleGlyph: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-4' }) => (
  <svg viewBox="0 0 14 17" className={`${className} fill-current shrink-0`} aria-hidden="true">
    <path d="M11.6 9.1c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.7-.7-1.4 0-2.6.8-3.3 2-.1.2-1.4 2.5-.3 6 .6 1.7 1.6 3.5 2.9 3.5 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.3 0 2.1-1.6 2.8-3.3.5-1 .8-2 .9-2.1-.1-.1-1.7-.7-1.7-2.4zM9.6 3.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" />
  </svg>
);

const IMessageTail: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
    <path d="M0,20 L10,20 C14.5,20 18,18.5 20,16.5 C16.5,15.5 14.5,12 14,5 L14,0 L0,0 Z" />
  </svg>
);

const AppleMapsBackdrop: React.FC<{ pinColor: string; secondaryColor: string }> = React.memo(
  ({ pinColor, secondaryColor }) => (
    <div className="relative w-full h-[106px] sm:h-[144px] overflow-hidden bg-[#0c1424]">
      {/* Stylized 3D Isometric Dark Apple Maps Vector Terrain (GPU translate3d pan only) */}
      <svg
        viewBox="0 0 480 180"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full animate-maps-pan"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="aura-map-water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#162a4a" />
            <stop offset="55%" stopColor="#0f213d" />
            <stop offset="100%" stopColor="#19335c" />
          </linearGradient>
          <linearGradient id="aura-map-land" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#1c2738" />
            <stop offset="100%" stopColor="#131b29" />
          </linearGradient>
          <linearGradient id="aura-map-park" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#143a34" />
            <stop offset="100%" stopColor="#0e2a28" />
          </linearGradient>
          <linearGradient id="aura-map-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8,12,20,0.45)" />
            <stop offset="28%" stopColor="rgba(8,12,20,0)" />
            <stop offset="76%" stopColor="rgba(10,10,15,0.12)" />
            <stop offset="100%" stopColor="rgba(10,10,15,0.92)" />
          </linearGradient>
        </defs>

        {/* Bay Water */}
        <rect width="480" height="180" fill="url(#aura-map-water)" />

        {/* Urban Landmasses & Waterfront Promenade */}
        <path d="M-20,95 Q95,70 185,96 T375,88 L500,72 L500,195 L-20,195 Z" fill="url(#aura-map-land)" />
        <path d="M270,-10 L500,-10 L500,66 Q385,78 320,54 Q265,36 270,-10 Z" fill="url(#aura-map-park)" />
        <path d="M-10,-10 L175,-10 Q145,42 92,58 Q30,72 -10,64 Z" fill="#182233" />

        {/* Stylized 3D Architectural Towers & Blocks */}
        <g fill="#26344a" stroke="#364a68" strokeWidth="0.7" opacity="0.9">
          <polygon points="184,78 202,71 218,79 200,86" fill="#2f415e" />
          <polygon points="184,78 200,86 200,110 184,102" fill="#202d42" />
          <polygon points="200,86 218,79 218,103 200,110" fill="#192335" />

          <polygon points="222,64 242,56 260,65 240,73" fill="#354a6b" />
          <polygon points="222,64 240,73 240,102 222,93" fill="#233148" />
          <polygon points="240,73 260,65 260,94 240,102" fill="#1b2639" />

          <polygon points="266,74 286,67 302,75 282,82" fill="#2f415e" />
          <polygon points="266,74 282,82 282,107 266,99" fill="#202c40" />
          <polygon points="282,82 302,75 302,100 282,107" fill="#182233" />

          <polygon points="94,108 124,98 148,110 118,120" fill="#293850" />
          <polygon points="338,104 374,94 398,106 362,116" fill="#28374e" />
        </g>

        {/* Illuminated Highway & Avenue Curves */}
        <g fill="none" strokeLinecap="round">
          <path d="M-20,132 Q125,94 240,112 T500,96" stroke="#3b4f70" strokeWidth="5.5" opacity="0.65" />
          <path d="M-20,132 Q125,94 240,112 T500,96" stroke={secondaryColor} strokeWidth="1.2" opacity="0.4" />
          <path d="M88,-10 Q155,75 240,110 T380,190" stroke="#30425e" strokeWidth="3.2" opacity="0.7" />
          <path d="M355,-10 Q310,65 245,108 T122,190" stroke="#2c3d57" strokeWidth="2.6" opacity="0.6" />
          <path d="M-10,74 Q145,56 260,72 T495,58" stroke="#263752" strokeWidth="2" opacity="0.55" />
        </g>

        {/* Bottom vignette blending seamlessly into obsidian Apple Pay footer */}
        <rect width="480" height="180" fill="url(#aura-map-fade)" />
      </svg>

      {/* Center 3D Glowing Apple Maps Location Pin + Pulse Ring */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative flex items-center justify-center -mt-2">
          <span
            className="absolute w-11 h-5 rounded-full border border-white/55 animate-pin-ripple"
            style={{ top: '18px' }}
          />
          <span
            className="absolute w-7 h-3 rounded-full border border-white/75"
            style={{ top: '22px', backgroundColor: `${pinColor}35` }}
          />
          <div className="relative animate-pin-drop flex flex-col items-center">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/50 shadow-lg"
              style={{
                background: `linear-gradient(155deg, #ffffff 0%, ${pinColor} 38%, ${pinColor} 100%)`,
                boxShadow: `0 6px 20px ${pinColor}88`,
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
            </div>
            <div
              className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent -mt-0.5"
              style={{ borderTopColor: pinColor }}
            />
          </div>
        </div>
      </div>

      {/* Authentic Tiny Bottom-Left Apple Maps Watermark */}
      <div className="absolute left-3.5 bottom-2.5 flex items-center gap-0.5 text-[10px] font-apple-sf font-semibold text-white/80 tracking-tight">
        <AppleGlyph className="w-2.5 h-3 -mt-0.5" />
        <span>Maps</span>
      </div>
    </div>
  )
);

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
  const cardFloatRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const { primary, secondary } = blueprint.palette;

  // Ultra-lightweight single compositor loop (strictly 1 card float transform + 1 scaleX bar, quantized!)
  // Tracks active DOM element identity so newly mounted cards/bars always sync on frame 0 without fighting React props.
  useEffect(() => {
    let rafId = 0;
    let lastSc = -1;
    let lastTy = -999;
    let lastProg = -1;
    let lastFloatEl: HTMLDivElement | null = null;
    let lastProgEl: HTMLDivElement | null = null;
    let lastTickMs = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;

      const curFloat = cardFloatRef.current;
      const curProg = progressBarRef.current;
      const nodeSwapped = curFloat !== lastFloatEl || curProg !== lastProgEl;

      // 60Hz ceiling on steady-state DOM writes keeps Blink RecalcStyle near zero while staying silky
      if (!nodeSwapped && now - lastTickMs < 15) return;
      lastTickMs = now;

      if (curFloat !== lastFloatEl) {
        lastFloatEl = curFloat;
        lastSc = -1;
        lastTy = -999;
      }
      if (curProg !== lastProgEl) {
        lastProgEl = curProg;
        lastProg = -1;
      }

      const p = audioPulseRef.current;
      const voc = p.vocal ?? p.mid;
      const beat = p.beat;

      if (curFloat) {
        const sc = Math.round((1 + beat * 0.018 + voc * 0.008) * 160) / 160;
        const ty = Math.round((-beat * 2.4 - voc * 0.8) * 4) / 4;
        if (sc !== lastSc || ty !== lastTy) {
          lastSc = sc;
          lastTy = ty;
          curFloat.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
        }
      }

      if (curProg) {
        const prog = Math.round(Math.min(1, Math.max(0.03, p.lineProgress ?? 0)) * 180) / 180;
        if (prog !== lastProg) {
          lastProg = prog;
          curProg.style.transform = `scaleX(${prog.toFixed(4)})`;
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
  const isLongLine = Boolean(currentLine && (currentLine.text.length > 40 || wordCount >= 9));

  const [singleWordDone, setSingleWordDone] = useState(false);
  useEffect(() => {
    setSingleWordDone(false);
    if (variant === 'apple_pay' && wordCount <= 1 && currentLine && isPlaying) {
      const timer = window.setTimeout(() => setSingleWordDone(true), 280);
      return () => window.clearTimeout(timer);
    }
  }, [variant, activeLineIdx, wordCount, currentLine, isPlaying]);

  const payDone =
    variant === 'apple_pay' &&
    (wordCount <= 1 ? singleWordDone : activeWordIdx >= Math.max(1, Math.floor(wordCount / 2)));

  const activeWordText =
    currentLine && activeWordIdx >= 0 && currentLine.words[activeWordIdx]
      ? currentLine.words[activeWordIdx].text
      : '';
  const contextualIcon = visualIcons && activeWordText ? getWordVisualIcon(activeWordText) : null;

  const primaryArtist = song.artist.split(/[,&]/)[0]?.trim() || song.artist;
  const locationSubtitle = song.album?.trim() || song.artist;
  const mapsPinColor = activeLineIdx % 8 === 1 ? primary : activeLineIdx % 16 < 8 ? '#22d3ee' : '#f97316';

  return (
    <div
      className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 sm:px-8 pt-16 pb-36 sm:pt-14 sm:pb-24 select-none overflow-hidden font-apple-sf"
      style={{ contain: 'layout style' }}
    >
      {/* Main Pure-OLED Floating Verci Stage (ZERO surrounding chrome or clutter!) */}
      <div className="relative z-10 w-full max-w-[540px] flex flex-col items-center justify-center">
        {/* OUTRO: Clean Minimal OLED Hold Card */}
        {!currentLine && !nextLine && lyrics.length > 0 && (
          <div
            ref={cardFloatRef}
            className="w-full max-w-[440px] rounded-[26px] p-6 sm:p-7 border border-white/[0.12] bg-[#0c0c10]/95 animate-imessage-pop text-center space-y-2 will-change-transform"
            style={{
              boxShadow: '0 24px 64px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            <div className="text-[11px] font-medium tracking-wide text-white/40">
              Outro · {song.title}
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-white/85 leading-snug">
              {lyrics[lyrics.length - 1]?.text}
            </div>
          </div>
        )}

        {/* INTRO OR INTERLUDE: Authentic iOS Typing Indicator + Clean Incoming Preview */}
        {!currentLine && nextLine && (
          <div
            ref={cardFloatRef}
            className="w-full max-w-[460px] flex flex-col items-stretch gap-3 animate-imessage-pop will-change-transform"
          >
            <div className="self-start flex items-center gap-3 px-4 py-2 rounded-[20px] rounded-bl-[6px] bg-[#1C1C1E] border border-white/[0.08] shadow-2xl">
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
              className="rounded-[26px] p-6 sm:p-7 border border-white/[0.12] bg-[#0e0e13]/96 text-left space-y-2 relative overflow-hidden"
              style={{
                boxShadow: '0 26px 70px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
            >
              <div className="text-[11px] font-medium text-white/45 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" style={{ color: primary }} />
                <span>Next Lyric Up</span>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold text-white leading-snug">
                {nextLine.text}
              </div>
              {nextLine2 && (
                <div className="text-sm sm:text-base text-white/35">{nextLine2.text}</div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE REEL-IDENTICAL VERCI APPLE UI CARDS */}
        {currentLine && (
          <div ref={cardFloatRef} className="w-full flex flex-col items-center will-change-transform">
            {/* 1. AUTHENTIC iMESSAGE CONVERSATION BUBBLES (Apple Blue #0A84FF + Curved Tail) */}
            {variant === 'imessage' && (
              <div
                key={`imsg-${activeLineIdx}`}
                aria-label="iMessage"
                className="w-full max-w-[490px] flex flex-col items-stretch gap-3 animate-imessage-pop"
              >
                {prevLine && (
                  <div className="self-start max-w-[78%] px-4 py-2.5 rounded-[22px] rounded-bl-[6px] bg-[#1C1C1E] border border-white/[0.06] text-white/50 text-sm sm:text-base font-medium">
                    {prevLine.text}
                  </div>
                )}

                <div className="self-end relative max-w-[92%]">
                  <div
                    className="relative px-5 sm:px-6 py-4 sm:py-4.5 rounded-[24px] rounded-br-[8px]"
                    style={{
                      background: 'linear-gradient(170deg, #2898FF 0%, #0A84FF 52%, #006EE6 100%)',
                      boxShadow: '0 18px 46px rgba(10,132,255,0.36), inset 0 1px 0 rgba(255,255,255,0.28)',
                    }}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-left leading-tight">
                      {currentLine.words.map((wd, idx) => {
                        const isAct = idx === activeWordIdx;
                        const isSung = idx < activeWordIdx;
                        return (
                          <span
                            key={`${activeLineIdx}-msg-${idx}`}
                            className={`inline-block ${
                              isLongLine ? 'text-xl sm:text-[30px]' : 'text-2xl sm:text-[34px]'
                            } font-semibold transition-opacity duration-150 ${
                              isAct ? 'animate-word-snap' : ''
                            }`}
                            style={{
                              color: isAct
                                ? '#ffffff'
                                : isSung
                                  ? 'rgba(255,255,255,0.92)'
                                  : 'rgba(255,255,255,0.46)',
                            }}
                          >
                            {wd.text}
                          </span>
                        );
                      })}
                    </div>

                    <IMessageTail className="absolute -right-[7px] bottom-0 w-5 h-5 fill-[#006EE6]" />
                  </div>

                  {/* Fixed-height status row: Delivered/Read + zero-reflow contextual glyph slot */}
                  <div className="mt-1.5 pr-2 flex items-center justify-end gap-2 text-[11px] font-medium text-[#0A84FF] min-h-[18px]">
                    {contextualIcon && (
                      <span className="text-xs text-white/85" aria-hidden="true">
                        {contextualIcon}
                      </span>
                    )}
                    <span>{wordProgress >= 0.85 ? 'Read' : 'Delivered'}</span>
                  </div>
                </div>

                {nextLine && (
                  <div className="self-start flex items-center gap-2.5 px-4 py-2 rounded-[20px] rounded-bl-[6px] bg-[#1C1C1E]/85 border border-white/[0.06] max-w-[78%]">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-1" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-2" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/55 animate-typing-dot-3" />
                    </div>
                    <span className="text-xs text-white/36 truncate">{nextLine.text}</span>
                  </div>
                )}
              </div>
            )}

            {/* 2. EXACT REEL APPLE MAPS × APPLE PAY SPLIT CARD (zoom_02, zoom_06, zoom_10!) */}
            {variant === 'apple_maps' && (
              <div
                key={`maps-${activeLineIdx}`}
                aria-label="Apple Maps"
                className="w-full max-w-[468px] rounded-[26px] overflow-hidden border border-white/[0.13] bg-[#0b0b0f] animate-imessage-pop"
                style={{
                  boxShadow: '0 28px 72px rgba(0,0,0,0.96), inset 0 1px 0 rgba(255,255,255,0.16)',
                }}
              >
                <AppleMapsBackdrop pinColor={mapsPinColor} secondaryColor={secondary} />

                <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4 bg-[#0b0b0f]">
                  <div className="min-w-0 flex-1 text-left space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-snug">
                      {currentLine.words.map((wd, idx) => {
                        const isAct = idx === activeWordIdx;
                        const isSung = idx < activeWordIdx;
                        return (
                          <span
                            key={`${activeLineIdx}-map-${idx}`}
                            className={`inline-block ${
                              isLongLine ? 'text-xl sm:text-[28px]' : 'text-2xl sm:text-[31px]'
                            } font-semibold transition-opacity duration-150 ${
                              isAct ? 'animate-word-snap' : ''
                            }`}
                            style={{
                              color: isAct
                                ? '#ffffff'
                                : isSung
                                  ? 'rgba(255,255,255,0.88)'
                                  : 'rgba(255,255,255,0.34)',
                            }}
                          >
                            {wd.text}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-white/45 truncate">
                      <Navigation className="w-3 h-3 fill-white/45 text-white/45 shrink-0" />
                      <span className="truncate">{locationSubtitle}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-0.5 text-white font-semibold text-base sm:text-lg tracking-tight">
                    <AppleGlyph className="w-3.5 h-4 -mt-0.5" />
                    <span>Pay</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. EXACT REEL APPLE PAY SHEET + DOUBLE BLUE RING -> CHECKMARK "Done" + POPPING BLUE REPLY (zoom_03..05!) */}
            {variant === 'apple_pay' && (
              <div
                key={`pay-${activeLineIdx}`}
                aria-label="Apple Pay"
                className="relative w-full max-w-[476px] flex flex-col items-stretch animate-applepay-in"
              >
                {/* Collapsed Top Apple Maps/Pay Context Strip (fades gracefully once Done like zoom_05) */}
                <div
                  className="mx-3 mb-2.5 px-4 py-2.5 rounded-[18px] border border-white/[0.1] bg-[#0e0e13]/95 flex items-center justify-between gap-3 transition-all duration-300"
                  style={{
                    opacity: payDone ? 0.14 : 0.92,
                    transform: payDone ? 'translate3d(0, 6px, 0) scale(0.97)' : 'translate3d(0, 0, 0) scale(1)',
                  }}
                >
                  <div className="min-w-0 text-left">
                    <div className="text-xs font-semibold text-white/80 truncate">
                      {prevLine?.text || song.title}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-white/40 truncate mt-0.5">
                      <Navigation className="w-2.5 h-2.5 fill-white/40 text-white/40 shrink-0" />
                      <span className="truncate">{locationSubtitle}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-white/95 font-semibold text-sm tracking-tight shrink-0">
                    <AppleGlyph className="w-3 h-3.5 -mt-0.5" />
                    <span>Pay</span>
                  </span>
                </div>

                {/* Main Obsidian Apple Pay Sheet with Iconic Double Apple-Blue Focus Ring while confirming */}
                <div
                  className="relative rounded-[28px] p-[5px] transition-colors duration-300"
                  style={{
                    border: payDone ? '1.5px solid transparent' : '1.5px solid rgba(10,132,255,0.52)',
                  }}
                >
                  <div
                    className="rounded-[23px] px-4 py-4 sm:px-7 sm:py-6 border border-white/[0.14] bg-[#0d0d12] flex items-center justify-between gap-4 sm:gap-5"
                    style={{
                      boxShadow: '0 26px 72px rgba(0,0,0,0.96), inset 0 1px 0 rgba(255,255,255,0.14)',
                    }}
                  >
                    <div className="flex-1 min-w-0 text-left space-y-1">
                      <div className="text-[12px] text-white/50 font-medium">
                        Pay {primaryArtist}
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-tight">
                        {currentLine.words.map((wd, idx) => {
                          const isAct = idx === activeWordIdx;
                          const isSung = idx < activeWordIdx;
                          return (
                            <span
                              key={`${activeLineIdx}-pay-${idx}`}
                              className={`inline-block ${
                                isLongLine ? 'text-xl sm:text-[32px]' : 'text-2xl sm:text-[38px]'
                              } font-semibold transition-opacity duration-150 ${
                                isAct ? 'animate-word-snap' : ''
                              }`}
                              style={{
                                color: isAct
                                  ? '#ffffff'
                                  : isSung
                                    ? 'rgba(255,255,255,0.9)'
                                    : 'rgba(255,255,255,0.34)',
                              }}
                            >
                              {wd.text}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Iconic Reel Confirm Button: Blue Outline Arrow -> Solid Apple Blue Circle + White Checkmark "Done" */}
                    <div className="shrink-0 flex flex-col items-center gap-1 min-w-[54px]">
                      <div
                        key={payDone ? `done-${activeLineIdx}` : `wait-${activeLineIdx}`}
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-200 ${
                          payDone ? 'animate-pay-done-pop' : ''
                        }`}
                        style={{
                          borderColor: payDone ? '#0A84FF' : 'rgba(10,132,255,0.75)',
                          backgroundColor: payDone ? '#0A84FF' : 'transparent',
                        }}
                      >
                        {payDone ? (
                          <svg
                            viewBox="0 0 28 28"
                            className="w-6 h-6 fill-none stroke-white stroke-[3]"
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
                        className="text-[11px] font-semibold tracking-tight transition-opacity duration-200 min-h-[16px]"
                        style={{ color: '#ffffff', opacity: payDone ? 0.95 : 0 }}
                      >
                        Done
                      </span>
                    </div>
                  </div>
                </div>

                {/* ZERO-REFLOW Reserved Slot for Paired Popping Blue iMessage Reply (never collides with bottom dock!) */}
                <div className="h-[42px] sm:h-[46px] mt-2.5 flex items-start justify-end pr-2 pointer-events-none">
                  {payDone && nextLine && (
                    <div className="animate-reply-pop max-w-[92%]">
                      <div
                        className="relative px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-[20px] rounded-br-[6px] text-white text-xs sm:text-base font-medium max-w-[270px] sm:max-w-[300px]"
                        style={{
                          background: 'linear-gradient(160deg, #2898FF 0%, #0A84FF 60%, #006EE6 100%)',
                          boxShadow: '0 10px 28px rgba(10,132,255,0.42)',
                        }}
                      >
                        <span className="block truncate">{nextLine.text}</span>
                        <IMessageTail className="absolute -right-[5px] bottom-0 w-4 h-4 fill-[#006EE6]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. EXACT REEL APPLE CASH BLACK TITANIUM CARD (zoom_07, zoom_11, frame_09!) */}
            {variant === 'apple_cash' && (
              <div
                key={`cash-${activeLineIdx}`}
                aria-label="Apple Cash"
                className="relative w-full max-w-[432px] flex flex-col items-center animate-cash-in"
              >
                {/* Floating Translucent Cyan "Done" Status Pill above card (matches zoom_11!) */}
                {activeLineIdx % 8 === 7 && (
                  <div
                    className="mb-3 px-10 py-1.5 rounded-full border border-sky-300/20 flex items-center gap-1.5 text-xs font-semibold text-sky-100/90 animate-pill-rise"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(24,78,108,0.68) 0%, rgba(40,115,148,0.82) 50%, rgba(24,78,108,0.68) 100%)',
                    }}
                  >
                    <Check className="w-3.5 h-3.5 text-sky-200 stroke-[2.8]" />
                    <span>Done</span>
                  </div>
                )}

                <div
                  className="w-full min-h-[176px] sm:min-h-[236px] rounded-[24px] p-5 sm:p-7 border border-white/[0.15] relative overflow-hidden flex flex-col justify-between"
                  style={{
                    background:
                      'radial-gradient(circle at 78% 22%, rgba(52,211,153,0.09) 0%, rgba(12,12,16,0.98) 48%, #07070a 100%)',
                    boxShadow: '0 28px 76px rgba(0,0,0,0.96), inset 0 1px 0 rgba(255,255,255,0.18)',
                  }}
                >
                  {/* Subtle Metallic Micro-Dot Texture */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.14]"
                    style={{
                      backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 0.75px, transparent 0.75px)',
                      backgroundSize: '12px 12px',
                    }}
                  />
                  {/* GPU-Composited Titanium Sheen */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-frosted-sheen"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)',
                    }}
                  />

                  {/* Top Row: Apple Cash Logo + Iridescent Green Sphere Mark */}
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-1 text-white/95 font-semibold text-base sm:text-lg tracking-tight">
                      <AppleGlyph className="w-3.5 h-4 -mt-0.5" />
                      <span>Cash</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center border border-emerald-300/30"
                        style={{
                          background:
                            'radial-gradient(circle at 35% 35%, #6ee7b7 0%, #10b981 55%, #065f46 100%)',
                        }}
                        aria-hidden="true"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-white/30" />
                      </span>
                    </div>
                  </div>

                  {/* Centered Bold Crisp SF Pro White Lyric ("do it", "you just") */}
                  <div className="relative my-auto py-4 flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 text-center leading-tight">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      return (
                        <span
                          key={`${activeLineIdx}-cash-${idx}`}
                          className={`inline-block ${
                            isLongLine ? 'text-2xl sm:text-4xl' : 'text-3xl sm:text-5xl'
                          } font-bold transition-opacity duration-150 ${
                            isAct ? 'animate-word-snap' : ''
                          }`}
                          style={{
                            color: isAct
                              ? '#ffffff'
                              : isSung
                                ? 'rgba(255,255,255,0.92)'
                                : 'rgba(255,255,255,0.3)',
                          }}
                        >
                          {wd.text}
                        </span>
                      );
                    })}
                  </div>

                  <div className="relative flex items-center justify-between text-[10px] text-white/35 font-medium">
                    <span className="truncate max-w-[65%]">{song.title}</span>
                    <span>{primaryArtist}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 5. EXACT REEL APPLE CARD PASTEL IRIDESCENT TITANIUM + POPPING BLUE iMESSAGE ECHO (zoom_08, zoom_09!) */}
            {variant === 'frosted_card' && (
              <div
                key={`frost-${activeLineIdx}`}
                aria-label="Frosted Card"
                className="relative w-full max-w-[448px] flex flex-col items-stretch animate-imessage-pop"
              >
                <div
                  className="w-full min-h-[176px] sm:min-h-[246px] rounded-[24px] p-5 sm:p-7 border border-white/40 relative overflow-hidden flex flex-col justify-between text-left"
                  style={{
                    background:
                      'radial-gradient(circle at 18% 72%, #86c5f4 0%, transparent 56%), radial-gradient(circle at 54% 38%, #c3a6f7 0%, transparent 58%), radial-gradient(circle at 86% 74%, #f49ec4 0%, transparent 58%), linear-gradient(135deg, #e5eef8 0%, #dcd4f6 52%, #f4d6e8 100%)',
                    boxShadow: '0 28px 76px rgba(0,0,0,0.94), inset 0 1px 0 rgba(255,255,255,0.75)',
                  }}
                >
                  {/* Soft GPU-Composited Titanium Pearl Sheen */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-frosted-sheen"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.34) 50%, transparent 100%)',
                    }}
                  />

                  {/* Top-Left Embossed Apple Logo */}
                  <div className="relative flex items-center justify-between">
                    <AppleGlyph className="w-5 h-6 text-white/80" />
                  </div>

                  {/* Crisp Dark Graphite SF Pro Lyric Left-Aligned ("fullest extent" in zoom_08!) */}
                  <div className="relative my-auto py-2.5 sm:py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 leading-tight">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      return (
                        <span
                          key={`${activeLineIdx}-fr-${idx}`}
                          className={`inline-block ${
                            isLongLine ? 'text-xl sm:text-[30px]' : 'text-2xl sm:text-[34px]'
                          } font-semibold transition-opacity duration-150 ${
                            isAct ? 'animate-word-snap' : ''
                          }`}
                          style={{
                            color: isAct
                              ? '#111114'
                              : isSung
                                ? 'rgba(24,24,27,0.88)'
                                : 'rgba(24,24,27,0.35)',
                          }}
                        >
                          {wd.text}
                        </span>
                      );
                    })}
                  </div>

                  {/* Subtle Embossed Titanium Card Footer */}
                  <div className="relative flex items-center justify-between text-[11px] font-medium text-zinc-900/45">
                    <span className="truncate max-w-[70%]">{primaryArtist}</span>
                    <div className="w-7 h-5 rounded-md border border-white/55 bg-white/25" aria-hidden="true" />
                  </div>
                </div>

                {/* ZERO-REFLOW Reserved Slot for Paired Vivid Blue iMessage Echo Bubble (never overlaps bottom dock!) */}
                <div className="h-[42px] sm:h-[46px] mt-2.5 flex items-start justify-end pr-1 pointer-events-none">
                  {nextLine && (
                    <div className="animate-reply-pop max-w-[92%]">
                      <div
                        className="relative px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-[20px] rounded-br-[6px] text-white text-xs sm:text-base font-medium max-w-[270px] sm:max-w-[290px]"
                        style={{
                          background: 'linear-gradient(160deg, #2898FF 0%, #0A84FF 60%, #006EE6 100%)',
                          boxShadow: '0 10px 28px rgba(10,132,255,0.44)',
                        }}
                      >
                        <span className="block truncate">{nextLine.text}</span>
                        <IMessageTail className="absolute -right-[5px] bottom-0 w-4 h-4 fill-[#006EE6]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. EXACT REEL STACKED iOS LIVE ACTIVITY / EMERALD HEART & PROGRESS PILL (zoom_01, step_958!) */}
            {variant === 'macos_pill' && (
              <div
                key={`mac-${activeLineIdx}`}
                aria-label="macOS Pill"
                className="w-full max-w-[464px] flex flex-col items-stretch gap-3 animate-pill-rise"
              >
                {/* Top Faded Translucent Violet Status Pill (matches step_958 top bar!) */}
                {prevLine && (
                  <div
                    className="mx-6 px-4 py-1.5 rounded-full border border-white/[0.08] flex items-center justify-center gap-2 text-xs text-white/45 truncate"
                    style={{
                      background: `linear-gradient(90deg, ${primary}22 0%, rgba(28,22,42,0.82) 50%, ${primary}22 100%)`,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: primary }} />
                    <span className="truncate">{prevLine.text}</span>
                  </div>
                )}

                {/* Center Hero Dark Pill with Glowing Emerald Heart + Crisp SF Pro Lyric */}
                <div
                  className="w-full rounded-[24px] px-5 sm:px-6 py-4 sm:py-5 border border-white/[0.11] bg-[#0c0c10]/96 flex items-center gap-4 text-left"
                  style={{
                    boxShadow: '0 24px 64px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.14)',
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-2xl bg-emerald-500/14 border border-emerald-400/25 shrink-0 flex items-center justify-center"
                    style={{ boxShadow: '0 0 24px rgba(52,211,153,0.28)' }}
                  >
                    {contextualIcon ? (
                      <span className="text-xl text-emerald-300">{contextualIcon}</span>
                    ) : (
                      <Heart className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-snug">
                    {currentLine.words.map((wd, idx) => {
                      const isAct = idx === activeWordIdx;
                      const isSung = idx < activeWordIdx;
                      return (
                        <span
                          key={`${activeLineIdx}-mc-${idx}`}
                          className={`inline-block ${
                            isLongLine ? 'text-lg sm:text-[28px]' : 'text-2xl sm:text-[32px]'
                          } font-semibold transition-opacity duration-150 ${
                            isAct ? 'animate-word-snap' : ''
                          }`}
                          style={{
                            color: isAct
                              ? '#ffffff'
                              : isSung
                                ? 'rgba(255,255,255,0.9)'
                                : 'rgba(255,255,255,0.34)',
                          }}
                        >
                          {wd.text}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Glowing Emerald Progress Capsule with Live Timestamp (transform owned exclusively by rAF — zero word-tick jitter!) */}
                <div className="relative h-10 sm:h-11 mx-2 rounded-full overflow-hidden border border-emerald-400/22 bg-[#0a2218]/90 flex items-center justify-center">
                  <div
                    ref={(el) => {
                      progressBarRef.current = el;
                      if (el && !el.style.transform) {
                        const initP = Math.min(1, Math.max(0.03, audioPulseRef.current.lineProgress ?? 0));
                        el.style.transform = `scaleX(${initP.toFixed(4)})`;
                      }
                    }}
                    className="absolute inset-0 origin-left will-change-transform"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(16,185,129,0.52) 0%, rgba(52,211,153,0.62) 100%)',
                    }}
                  />
                  <div className="relative z-10 flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-50/92 tabular-nums px-4 truncate max-w-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0" />
                    <span>{fmtTimestamp(currentLine.start)}</span>
                    {nextLine && (
                      <span className="text-emerald-100/65 font-normal truncate max-w-[230px]">
                        · {nextLine.text}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
