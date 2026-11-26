import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import type { LyricLine, LyricMatchSource, SongItem } from '../types';

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
  currentTime: number;
  accentColor: string;
  queue: SongItem[];
  infiniteRadio: boolean;
  radioLoading: boolean;
  onToggleInfiniteRadio: () => void;
  onSeekToLine: (timeSec: number) => void;
  onSyncLineHere: (lineStartSec: number) => void;
  onAdjustOffset: (delta: number) => void;
  onResetOffset: () => void;
  onManualSearchLyrics: (query: string) => void;
  onPlayFromQueue: (song: SongItem) => void;
  onRemoveFromQueue: (songId: string) => void;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const LyricsTimelineDrawer: React.FC<LyricsTimelineDrawerProps> = ({
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
  onToggleInfiniteRadio,
  onSeekToLine,
  onSyncLineHere,
  onAdjustOffset,
  onResetOffset,
  onManualSearchLyrics,
  onPlayFromQueue,
  onRemoveFromQueue,
}) => {
  const [tab, setTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [customQuery, setCustomQuery] = useState('');
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCustomQuery('');
  }, [song.id]);

  useEffect(() => {
    if (open && tab === 'lyrics' && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, tab, activeLineIdx]);

  if (!open) return null;

  const matchBadge =
    lyricMatchSource === 'lrclib_synced'
      ? 'SYNCED LRC'
      : lyricMatchSource === 'lrclib_plain' || lyricMatchSource === 'lyrics_ovh_plain'
        ? 'PLAIN TIMED'
        : 'NO MATCH';

  return (
    <div className="fixed top-20 bottom-36 left-5 z-50 w-[min(92vw,390px)] oled-surface rounded-3xl flex flex-col overflow-hidden animate-panel-in">
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
          <div className="px-4 py-2.5 flex items-center justify-between gap-2 text-[11px] font-mono-code">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white/55">
                Offset:{' '}
                <strong className="text-white">
                  {lyricOffset >= 0 ? `+${lyricOffset.toFixed(1)}s` : `${lyricOffset.toFixed(1)}s`}
                </strong>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[9px] text-white/70 truncate">
                {matchBadge}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onAdjustOffset(-0.5)}
                className="px-2 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-white/80 cursor-pointer flex items-center gap-0.5"
                title="Delay lyrics 0.5s"
              >
                <Minus className="w-3 h-3" /> 0.5s
              </button>
              <button
                type="button"
                onClick={() => onAdjustOffset(0.5)}
                className="px-2 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-white/80 cursor-pointer flex items-center gap-0.5"
                title="Advance lyrics 0.5s"
              >
                <Plus className="w-3 h-3" /> 0.5s
              </button>
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
                placeholder="Re-match lyrics (e.g. Tum Hi Ho Arijit)"
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
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {tab === 'lyrics' ? (
          lyricsLoading ? (
            <div className="p-8 flex flex-col items-center justify-center gap-2 text-xs text-white/50">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
              <span>Matching exact synced lyrics...</span>
            </div>
          ) : lyrics.length === 0 ? (
            <div className="p-8 text-center text-xs text-white/45 space-y-2">
              <p>No timestamped lyrics matched &ldquo;{song.title}&rdquo;.</p>
              <p className="text-[11px] text-white/30">
                Try searching the clean song + singer above (e.g. &ldquo;Apna Bana Le Arijit Singh&rdquo;).
              </p>
            </div>
          ) : (
            lyrics.map((line, idx) => {
              const active = idx === activeLineIdx;
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
                    onClick={() => (song.isFullTrack ? onSeekToLine(line.start) : onSyncLineHere(line.start))}
                    className="flex-1 min-w-0 flex items-baseline gap-2.5 text-left cursor-pointer"
                    title={song.isFullTrack ? 'Jump song to this lyric' : 'Lock sync to this lyric'}
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
                    onClick={() => onSyncLineHere(line.start)}
                    className="opacity-70 group-hover:opacity-100 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.18] text-[10px] font-mono-code text-white/85 flex items-center gap-1 shrink-0 transition-opacity cursor-pointer"
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
};
