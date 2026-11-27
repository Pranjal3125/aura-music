import type { LyricLine } from '../types';

export type LyricPhase = 'none' | 'intro' | 'active' | 'interlude' | 'outro';

export interface LyricCursorState {
  activeLineIdx: number;
  activeWordIdx: number;
  upcomingLineIdx: number;
  secondsUntilNext: number;
  lineProgress: number;
  wordProgress: number;
  phase: LyricPhase;
}

const VOCAL_ANTICIPATION_SEC = 0.14;

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/**
 * Computes the exact active line, active word, continuous sub-frame progress,
 * and intro/interlude preview state.
 * Holds lines gracefully across short breath gaps (<= 2.6s) so visuals never flash back
 * to an intro screen mid-verse, while surfacing upcoming lines during intros & long solos.
 */
export function computeLyricCursor(
  lyrics: LyricLine[],
  currentTimeSec: number,
  lyricOffsetSec: number
): LyricCursorState {
  if (lyrics.length === 0) {
    return {
      activeLineIdx: -1,
      activeWordIdx: -1,
      upcomingLineIdx: -1,
      secondsUntilNext: 0,
      lineProgress: 0,
      wordProgress: 0,
      phase: 'none',
    };
  }

  const safeCur = Number.isFinite(currentTimeSec) ? currentTimeSec : 0;
  const safeOff = Number.isFinite(lyricOffsetSec) ? lyricOffsetSec : 0;
  const t = safeCur + safeOff + VOCAL_ANTICIPATION_SEC;

  // Before the first lyric starts -> Intro phase with upcoming line 0 visible
  if (t < lyrics[0].start) {
    return {
      activeLineIdx: -1,
      activeWordIdx: -1,
      upcomingLineIdx: 0,
      secondsUntilNext: Math.max(0, lyrics[0].start - t),
      lineProgress: 0,
      wordProgress: 0,
      phase: 'intro',
    };
  }

  // Binary search for the latest line with start <= t (O(log N) in hot rAF loop)
  let lo = 0;
  let hi = lyrics.length - 1;
  let candidateIdx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lyrics[mid].start <= t) {
      candidateIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidateIdx < 0) {
    return {
      activeLineIdx: -1,
      activeWordIdx: -1,
      upcomingLineIdx: 0,
      secondsUntilNext: Math.max(0, lyrics[0].start - t),
      lineProgress: 0,
      wordProgress: 0,
      phase: 'intro',
    };
  }

  const line = lyrics[candidateIdx];
  const hasNext = candidateIdx < lyrics.length - 1;
  const nextLine = hasNext ? lyrics[candidateIdx + 1] : null;
  const gapAfterLine = nextLine ? nextLine.start - line.end : Infinity;

  // If the pause before the next line is short (<= 2.6s), keep the current line gently held
  // instead of flickering to an interlude state.
  const holdEnd =
    nextLine && gapAfterLine <= 2.6
      ? nextLine.start - 0.01
      : line.end + 1.35;

  if (t <= holdEnd) {
    let wordIdx = -1;
    const words = line.words;
    for (let j = words.length - 1; j >= 0; j--) {
      if (t >= words[j].start) {
        wordIdx = j;
        break;
      }
    }
    if (wordIdx === -1 && words.length > 0) wordIdx = 0;

    const lineSpanEnd =
      words.length > 0 ? Math.max(line.end, words[words.length - 1].end) : line.end;
    const lineDur = Math.max(0.15, lineSpanEnd - line.start);
    const lineProgress = clamp01((t - line.start) / lineDur);

    let wordProgress = lineProgress;
    if (wordIdx >= 0 && words[wordIdx]) {
      const w = words[wordIdx];
      const wDur = Math.max(0.06, w.end - w.start);
      wordProgress = clamp01((t - w.start) / wDur);
    }

    return {
      activeLineIdx: candidateIdx,
      activeWordIdx: wordIdx,
      upcomingLineIdx: hasNext ? candidateIdx + 1 : -1,
      secondsUntilNext: nextLine ? Math.max(0, nextLine.start - t) : 0,
      lineProgress,
      wordProgress,
      phase: 'active',
    };
  }

  if (nextLine) {
    return {
      activeLineIdx: -1,
      activeWordIdx: -1,
      upcomingLineIdx: candidateIdx + 1,
      secondsUntilNext: Math.max(0, nextLine.start - t),
      lineProgress: 0,
      wordProgress: 0,
      phase: 'interlude',
    };
  }

  return {
    activeLineIdx: -1,
    activeWordIdx: -1,
    upcomingLineIdx: -1,
    secondsUntilNext: 0,
    lineProgress: 1,
    wordProgress: 1,
    phase: 'outro',
  };
}

const WORD_ICON_RULES: Array<[RegExp, string]> = [
  [/^(love|loved|loving|luv|pyaar|pyar|ishq|mohabbat|dil)$/, '♥'],
  [/^(heart|hearts|heartbeat)$/, '♥'],
  [/^(broken|heartbreak|shatter)$/, '💔'],
  [/^(night|nights|midnight|tonight|raat|raatein)$/, '☾'],
  [/^(moon|moonlight|chand|chaand)$/, '☾'],
  [/^(star|stars|starboy|taare|taara|sky|heaven|angel)$/, '✦'],
  [/^(fire|flame|burn|burning|lit|aag|hot)$/, '🔥'],
  [/^(rain|raining|monsoon|baarish|barish|storm)$/, '💧'],
  [/^(cry|crying|tears|tear|aansu|rona)$/, '💧'],
  [/^(sun|sunshine|sunny|morning|dawn|subah|roshni)$/, '☀'],
  [/^(eye|eyes|aankh|aankhein|naina|look)$/, '👁'],
  [/^(lie|lies|lying|fake|truth)$/, '🎭'],
  [/^(time|clock|wait|waiting|forever|waqt)$/, '◷'],
  [/^(money|cash|pay|paid|rich|gold|diamond|diamonds)$/, '◈'],
  [/^(call|phone|text|message|ring|chat)$/, '💬'],
  [/^(fly|flying|wings|bird|free|aasman)$/, '🕊'],
  [/^(music|song|beat|dance|sing|vibe|tune)$/, '♪'],
  [/^(king|queen|crown|royal)$/, '♛'],
  [/^(car|drive|driving|ride|speed|fast|highway)$/, '⚡'],
  [/^(dream|dreams|dreaming|sleep|sapna|sapne)$/, '✨'],
  [/^(ocean|wave|waves|sea|water)$/, '≈'],
];

/**
 * Returns a crisp Verci-style contextual glyph/icon for evocative lyric keywords.
 */
export function getWordVisualIcon(word: string): string | null {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean || clean.length < 3) return null;
  for (const [rx, icon] of WORD_ICON_RULES) {
    if (rx.test(clean)) return icon;
  }
  return null;
}
