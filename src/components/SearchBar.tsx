import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, Play, Upload, Music2, Plus } from 'lucide-react';
import { SongItem } from '../types';
import { searchRealSongs } from '../services/musicApi';

interface SearchBarProps {
  compact?: boolean;
  accentColor: string;
  onSelectSong: (song: SongItem, queue: SongItem[]) => void;
  onAddToQueue?: (song: SongItem) => void;
  onUploadLocalFile: (file: File) => void;
  onDropdownToggle?: (open: boolean) => void;
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  compact = false,
  accentColor,
  onSelectSong,
  onAddToQueue,
  onUploadLocalFile,
  onDropdownToggle,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onDropdownToggle?.(open);
  }, [open, onDropdownToggle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setOpen(false);
          inputRef.current?.blur();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const found = await searchRealSongs(trimmed);
      if (!cancelled) {
        setResults(found);
        setLoading(false);
        setOpen(true);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div ref={containerRef} className={`relative ${compact ? 'w-[min(66vw,430px)]' : 'w-[min(92vw,580px)]'}`}>
      <div
        className={`oled-pill rounded-full flex items-center gap-2.5 transition-all ${
          compact ? 'px-4 py-2' : 'px-5 py-3.5'
        }`}
        style={
          open
            ? {
                borderColor: `${accentColor}88`,
                boxShadow: `0 12px 40px rgba(0,0,0,0.85), 0 0 24px ${accentColor}2a`,
              }
            : undefined
        }
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: accentColor }} />
        ) : (
          <Search className="w-4 h-4 text-white/50 shrink-0" />
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={compact ? 'Search song... (Press /)' : 'Search song, artist, or vibe (e.g. Kesariya, Starboy)...'}
          className={`flex-1 min-w-0 bg-transparent text-white placeholder:text-white/40 outline-none ${
            compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            className="p-1 text-white/45 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <label
          title="Play local MP3 / WAV file"
          className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/65 hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onUploadLocalFile(f);
                setOpen(false);
              }
            }}
          />
        </label>
      </div>

      {open && (results.length > 0 || (!loading && query.trim().length >= 2)) && (
        <div className="absolute left-0 right-0 mt-2.5 oled-surface rounded-2xl overflow-hidden max-h-[60vh] overflow-y-auto z-50 animate-panel-in">
          {results.length === 0 ? (
            <div className="p-5 text-center text-xs text-white/50">
              No songs matched &ldquo;{query}&rdquo;. Try another song or artist name.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {results.map((song) => (
                <div
                  key={song.id}
                  className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-white/[0.07] transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSong(song, results);
                      setOpen(false);
                      inputRef.current?.blur();
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                      {song.artworkUrl ? (
                        <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-white/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{song.title}</div>
                      <div className="text-xs text-white/50 truncate">{song.artist}</div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {onAddToQueue && (
                      <button
                        type="button"
                        onClick={() => onAddToQueue(song)}
                        title="Add to Queue"
                        className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.15] text-white/55 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code font-semibold ${
                        song.isFullTrack
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/[0.07] text-white/55'
                      }`}
                    >
                      {song.isFullTrack ? 'FULL' : '30s'}
                    </span>
                    <span className="text-[11px] font-mono-code text-white/40 w-9 text-right">
                      {formatDur(song.duration)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
