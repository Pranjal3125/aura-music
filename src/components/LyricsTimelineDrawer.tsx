import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Crosshair,
  RotateCcw,
  ListMusic,
  AlignLeft,
  Play,
  Minus,
  Plus,
  Infinity as InfinityIcon,
  Loader2,
  Search,
  Trash2,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import type { LyricLine, LyricMatchSource, SongItem } from '../types';
import { detectPreviewSectionCues } from '../services/musicApi';

interface LyricsTimelineDrawerProps {
  open: boolean;
  onClose: () => void;
  song: SongItem;
  lyrics: LyricLine[];
  lyricsLoading: boolean;
  lyricMatchSource: LyricMatchSource;
  matchedTrackInfo?: string;
  activeLineIdx: number;
  lyricOffset: number;
  currentTime?: number;
  accentColor: string;
  queue: SongItem[];
  infiniteRadio: boolean;
  radioLoading: boolean;
  isSyncLocked?: boolean;
  onToggleInfiniteRadio: () => void;
  onSeekToLine: (timeSec: number) => void;
  onSyncLineHere: (lineStartSec: number) => void;
  onAdjustOffset: (delta: number) => void;
  onSetExactOffset?: (offsetSec: number) => void;
  onResetOffset: () => void;
  onReplayTrack?: () => void;
  onManualSearchLyrics: (query: string) => void;
  onPlayFromQueue: (song: SongItem) => void;
  onRemoveFromQueue: (songId: string) => void;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const LyricsTimelineDrawer: React.FC<LyricsTimelineDrawerProps> = React.memo(({
  open,
  onClose,
  song,
  lyrics,
  lyricsLoading,
  lyricMatchSource,
  matchedTrackInfo,
  activeLineIdx,
  lyricOffset,
  accentColor,
  queue,
  infiniteRadio,
  radioLoading,
  isSyncLocked = false,
  onToggleInfiniteRadio,
  onSeekToLine,
  onSyncLineHere,
  onAdjustOffset,
  onSetExactOffset,
  onResetOffset,
  onReplayTrack,
  onManualSearchLyrics,
  onPlayFromQueue,
  onRemoveFromQueue,
}) => {
  const [tab, setTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [customQuery, setCustomQuery] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const hoveringListRef = useRef(false);
  const manualScrollUntilRef = useRef(0);

  useEffect(() => {
    setCustomQuery('');
    setLineFilter('');
  }, [song.id]);

  // Auto-follow active lyric ONLY when user is NOT hovering, scrolling, or filtering lines!
  useEffect(() => {
    if (!open || tab !== 'lyrics' || !activeRowRef.current) return;
    if (hoveringListRef.current || lineFilter.trim().length > 0) return;
    if (Date.now() < manualScrollUntilRef.current) return;
    activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, tab, activeLineIdx, lineFilter]);

  const sectionCues = useMemo(
    () => (!song.isFullTrack && lyrics.length > 0 ? detectPreviewSectionCues(lyrics, song.fullDuration) : []),
    [song.isFullTrack, song.fullDuration, lyrics]
  );

  const visibleLyrics = useMemo(() => {
    const q = lineFilter.trim().toLowerCase();
    if (!q) return lyrics.map((line, idx) => ({ line, idx }));
    return lyrics
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.text.toLowerCase().includes(q));
  }, [lyrics, lineFilter]);

  if (!open) return null;

  const isLive = song.source === 'live_tab' || song.source === 'live_mic';
  const matchBadge =
    lyricMatchSource === 'lrclib_synced'
      ? 'SYNCED LRC'
      : lyricMatchSource === 'lrclib_plain' || lyricMatchSource === 'lyrics_ovh_plain'
        ? 'PLAIN TIMED'
        : 'NO MATCH';

  return (
    <div className="timeline-drawer fixed top-20 bottom-36 left-5 z-50 w-[min(92vw,396px)] oled-surface rounded-3xl flex flex-col overflow-hidden animate-panel-in">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('lyrics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'lyrics' ? 'text-black font-semibold' : 'text-white/65 hover:text-white'
            }`}
            style={tab === 'lyrics' ? { backgroundColor: accentColor } : undefined}
          >
            <AlignLeft className="w-3.5 h-3.5" /> Lyrics &amp; Sync
          </button>
          <button
            type="button"
            onClick={() => setTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'queue' ? 'text-black font-semibold' : 'text-white/65 hover:text-white'
            }`}
            style={tab === 'queue' ? { backgroundColor: accentColor } : undefined}
          >
            <ListMusic className="w-3.5 h-3.5" /> Queue ({queue.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/60 cursor-pointer"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sync Calibration & Custom Query Strip OR Infinite Radio Status Strip */}
      {tab === 'lyrics' ? (
        <div className="border-b border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
          <div className="px-4 py-2.5 space-y-2 text-[11px] font-mono-code">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-white/55">
                  Offset:{' '}
                  <strong className="text-white">
                    {lyricOffset >= 0 ? `+${lyricOffset.toFixed(1)}s` : `${lyricOffset.toFixed(1)}s`}
                  </strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[9px] text-white/70 truncate">
                  {matchBadge}
                </span>
                {!song.isFullTrack && isSyncLocked && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[9px] text-emerald-400">
                    LOCKED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onReplayTrack && !isLive && (
                  <button
                    type="button"
                    onClick={onReplayTrack}
                    className="px-1.5 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-[10px] text-white/80 cursor-pointer"
                    title="Replay track from 0:00 with current sync"
                  >
                    ↺ Replay
                  </button>
                )}
                <button
                  type="button"
                  onClick={onResetOffset}
                  className="p-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-white/65 hover:text-white cursor-pointer"
                  title="Reset offset to 0s"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Coarse & Fine Nudge Controls */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => onAdjustOffset(-5)}
                className="flex-1 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[10px] text-white/80 cursor-pointer"
                title="Delay lyrics 5s (Shift+[)"
              >
                -5s
              </button>
              <button
                type="button"
                onClick={() => onAdjustOffset(-0.5)}
                className="flex-1 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-[10px] text-white/85 cursor-pointer flex items-center justify-center gap-0.5"
                title="Delay lyrics 0.5s ([)"
              >
                <Minus className="w-2.5 h-2.5" /> 0.5s
              </button>
              <button
                type="button"
                onClick={() => onAdjustOffset(0.5)}
                className="flex-1 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-[10px] text-white/85 cursor-pointer flex items-center justify-center gap-0.5"
                title="Advance lyrics 0.5s (])"
              >
                <Plus className="w-2.5 h-2.5" /> 0.5s
              </button>
              <button
                type="button"
                onClick={() => onAdjustOffset(5)}
                className="flex-1 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[10px] text-white/80 cursor-pointer"
                title="Advance lyrics 5s (Shift+])"
              >
                +5s
              </button>
            </div>

            {/* 1-Click Section Cue Jumps for 30s Previews */}
            {sectionCues.length > 0 && onSetExactOffset && (
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[9px] text-white/40 uppercase tracking-wider mr-0.5">Jump:</span>
                {sectionCues.map((cue) => {
                  const isNear = Math.abs(lyricOffset - cue.offsetSec) < 2;
                  return (
                    <button
                      key={cue.label}
                      type="button"
                      onClick={() => onSetExactOffset(cue.offsetSec)}
                      className={`px-2 py-0.5 rounded-md text-[10px] cursor-pointer transition-colors ${
                        isNear ? 'text-black font-semibold' : 'bg-white/[0.06] hover:bg-white/[0.14] text-white/75'
                      }`}
                      style={isNear ? { backgroundColor: accentColor } : undefined}
                      title={`Jump preview sync to ${fmt(cue.offsetSec)}`}
                    >
                      {cue.label} ({fmt(cue.offsetSec)})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customQuery.trim()) onManualSearchLyrics(customQuery.trim());
            }}
            className="px-4 py-2 flex items-center gap-1.5"
          >
            <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] px-2.5 py-1">
              <Search className="w-3 h-3 text-white/40 shrink-0" />
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder={isLive ? 'Load song lyrics (e.g. Kesariya Arijit)' : 'Re-match lyrics (e.g. Tum Hi Ho Arijit)'}
                className="flex-1 min-w-0 bg-transparent text-[11px] text-white placeholder:text-white/35 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!customQuery.trim() || lyricsLoading}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-black disabled:opacity-35 cursor-pointer shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              Match
            </button>
          </form>

          {lyrics.length > 0 && (
            <div className="px-4 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2.5 py-1">
                <Filter className="w-3 h-3 text-white/40 shrink-0" />
                <input
                  type="text"
                  value={lineFilter}
                  onChange={(e) => setLineFilter(e.target.value)}
                  placeholder="Type words you hear -> tap line to lock sync..."
                  className="flex-1 min-w-0 bg-transparent text-[11px] text-white placeholder:text-white/35 outline-none"
                />
                {lineFilter && (
                  <button
                    type="button"
                    onClick={() => setLineFilter('')}
                    className="text-white/45 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {!song.isFullTrack && (
                <p className="text-[10px] text-white/45 leading-snug">
                  30s iTunes previews start mid-song. Tap any line the moment you hear it to lock exact sync (auto-saved), or drop a local MP3 for automatic 0:00 full sync.
                </p>
              )}
            </div>
          )}

          {matchedTrackInfo && (
            <div className="px-4 py-1.5 text-[10px] text-white/40 flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
              <span className="truncate">Matched: {matchedTrackInfo}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.07] flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 text-white/70">
            {radioLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accentColor }} />
            ) : (
              <InfinityIcon className="w-3.5 h-3.5" style={{ color: infiniteRadio ? accentColor : 'gray' }} />
            )}
            <span>{infiniteRadio ? 'Autoplay Radio ON (Non-stop)' : 'Loop Queue Only'}</span>
          </div>
          <button
            type="button"
            onClick={onToggleInfiniteRadio}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono-code font-semibold cursor-pointer transition-colors ${
              infiniteRadio ? 'text-black' : 'bg-white/[0.08] text-white/70'
            }`}
            style={infiniteRadio ? { backgroundColor: accentColor } : undefined}
          >
            {infiniteRadio ? '∞ ON' : 'OFF'}
          </button>
        </div>
      )}

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-1"
        onMouseEnter={() => {
          hoveringListRef.current = true;
        }}
        onMouseLeave={() => {
          hoveringListRef.current = false;
        }}
        onWheel={() => {
          manualScrollUntilRef.current = Date.now() + 5000;
        }}
        onTouchStart={() => {
          manualScrollUntilRef.current = Date.now() + 5000;
        }}
      >
        {tab === 'lyrics' ? (
          lyricsLoading ? (
            <div className="p-8 flex flex-col items-center justify-center gap-2 text-xs text-white/50">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              <span>Matching exact synced lyrics...</span>
            </div>
          ) : lyrics.length === 0 ? (
            <div className="p-8 text-center text-xs text-white/45 space-y-2">
              <p>
                {isLive
                  ? 'Search the song playing in your tab above, then tap any line as you hear it to lock live sync!'
                  : `No timestamped lyrics matched "${song.title}".`}
              </p>
              <p className="text-[11px] text-white/30">
                Try searching the clean song + singer above (e.g. &ldquo;Apna Bana Le Arijit Singh&rdquo;).
              </p>
            </div>
          ) : visibleLyrics.length === 0 ? (
            <div className="p-6 text-center text-xs text-white/45">
              No lines match &ldquo;{lineFilter}&rdquo;.
            </div>
          ) : (
            visibleLyrics.map(({ line, idx }) => {
              const active = idx === activeLineIdx;
              const tapLocksSync = !song.isFullTrack || isLive;
              return (
                <div
                  key={`${idx}-${line.start}`}
                  ref={active ? activeRowRef : null}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-colors ${
                    active ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (tapLocksSync) {
                        onSyncLineHere(line.start);
                        setLineFilter('');
                      } else {
                        onSeekToLine(line.start);
                      }
                    }}
                    className="flex-1 min-w-0 flex items-baseline gap-2.5 text-left cursor-pointer"
                    title={tapLocksSync ? 'Tap when singer sings this line to lock exact sync' : 'Jump song to this lyric'}
                  >
                    <span className="text-[10px] font-mono-code text-white/35 shrink-0">{fmt(line.start)}</span>
                    <span
                      className={`text-xs leading-snug ${
                        active ? 'font-semibold text-white' : 'text-white/65'
                      }`}
                      style={active ? { color: accentColor } : undefined}
                    >
                      {line.text}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSyncLineHere(line.start);
                      setLineFilter('');
                    }}
                    className="opacity-75 group-hover:opacity-100 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.18] text-[10px] font-mono-code text-white/85 flex items-center gap-1 shrink-0 transition-opacity cursor-pointer"
                    title="Click right when singer sings this line to lock perfect sync!"
                  >
                    <Crosshair className="w-3 h-3" style={{ color: accentColor }} /> Sync
                  </button>
                </div>
              );
            })
          )
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/45">
            Queue is empty. Search and click + to add songs.
          </div>
        ) : (
          queue.map((qSong) => {
            const isCurrent = qSong.id === song.id;
            return (
              <div
                key={qSong.id}
                className={`group w-full flex items-center gap-2 p-2 rounded-xl transition-colors ${
                  isCurrent ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPlayFromQueue(qSong)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 shrink-0 relative">
                    {qSong.artworkUrl && (
                      <img src={qSong.artworkUrl} alt={qSong.title} className="w-full h-full object-cover" />
                    )}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 fill-current" style={{ color: accentColor }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{qSong.title}</div>
                    <div className="text-[11px] text-white/45 truncate">{qSong.artist}</div>
                  </div>
                </button>
                <span className="text-[10px] font-mono-code text-white/40 shrink-0">
                  {qSong.isFullTrack ? 'FULL' : '30s'}
                </span>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onRemoveFromQueue(qSong.id)}
                    className="p-1.5 rounded-lg text-white/35 hover:text-rose-400 hover:bg-white/[0.08] opacity-65 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
