import React, { useEffect, useRef, useState } from 'react';
import { X, Crosshair, RotateCcw, ListMusic, AlignLeft, Play, Minus, Plus } from 'lucide-react';
import { LyricLine, SongItem } from '../types';

interface LyricsTimelineDrawerProps {
  open: boolean;
  onClose: () => void;
  song: SongItem;
  lyrics: LyricLine[];
  activeLineIdx: number;
  lyricOffset: number;
  currentTime: number;
  accentColor: string;
  queue: SongItem[];
  onSeekToLine: (timeSec: number) => void;
  onSyncLineHere: (lineStartSec: number) => void;
  onAdjustOffset: (delta: number) => void;
  onResetOffset: () => void;
  onPlayFromQueue: (song: SongItem) => void;
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
  activeLineIdx,
  lyricOffset,
  accentColor,
  queue,
  onSeekToLine,
  onSyncLineHere,
  onAdjustOffset,
  onResetOffset,
  onPlayFromQueue,
}) => {
  const [tab, setTab] = useState<'lyrics' | 'queue'>('lyrics');
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && tab === 'lyrics' && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, tab, activeLineIdx]);

  if (!open) return null;

  return (
    <div className="fixed top-20 bottom-36 left-5 z-50 w-[min(92vw,380px)] oled-surface rounded-3xl flex flex-col overflow-hidden">
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
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sync Calibration Strip */}
      {tab === 'lyrics' && (
        <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.07] flex items-center justify-between gap-2 text-[11px] font-mono-code">
          <span className="text-white/55">
            Offset: <strong className="text-white">{lyricOffset >= 0 ? `+${lyricOffset.toFixed(1)}s` : `${lyricOffset.toFixed(1)}s`}</strong>
          </span>
          <div className="flex items-center gap-1">
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
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {tab === 'lyrics' ? (
          lyrics.length === 0 ? (
            <div className="p-8 text-center text-xs text-white/45">
              No timestamped lyrics found for &ldquo;{song.title}&rdquo;.
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
                        active ? 'font-semibold text-white' : 'text-white/60'
                      }`}
                      style={active ? { color: accentColor } : undefined}
                    >
                      {line.text}
                    </span>
                  </button>

                  {/* 1-Click Instant Sync Lock! */}
                  <button
                    type="button"
                    onClick={() => onSyncLineHere(line.start)}
                    className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.18] text-[10px] font-mono-code text-white/80 flex items-center gap-1 shrink-0 transition-opacity cursor-pointer"
                    title="Click right when singer sings this line to lock perfect sync!"
                  >
                    <Crosshair className="w-3 h-3" style={{ color: accentColor }} /> Sync
                  </button>
                </div>
              );
            })
          )
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/45">Queue is empty. Search and click + to add songs.</div>
        ) : (
          queue.map((qSong) => {
            const isCurrent = qSong.id === song.id;
            return (
              <button
                key={qSong.id}
                type="button"
                onClick={() => onPlayFromQueue(qSong)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                  isCurrent ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'
                }`}
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
                <span className="text-[10px] font-mono-code text-white/40">
                  {qSong.isFullTrack ? 'FULL' : '30s'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
