import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  Volume2,
  VolumeX,
  Wand2,
  KeyRound,
  Check,
  Loader2,
  X,
  Music2,
  Upload,
} from 'lucide-react';
import {
  AmbientParticleId,
  CompanionSyncMessage,
  EdgeStyleId,
  LyricLine,
  LyricStyleId,
  SongItem,
  VibeBlueprint,
} from './types';
import {
  extractPaletteFromArtwork,
  fetchSyncedLyricsForSong,
  loadFeaturedSongs,
  parseLocalFileName,
} from './services/musicApi';
import { LightAudioEngine } from './engine/lightAudioEngine';
import { directSongAutonomously, directSongWithGemini } from './engine/vibeBrain';
import { SearchBar } from './components/SearchBar';
import { LyricsStage } from './components/LyricsStage';
import { AmbientParticles } from './components/AmbientParticles';
import { CompanionScreen } from './components/CompanionScreen';

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const DEFAULT_BLUEPRINT: VibeBlueprint = {
  moodName: 'Crimson Nocturne',
  archetype: 'OLED AMBIENT',
  directorNote: 'Search any song — AI automatically matches lighting, palette & synced lyrics.',
  source: 'auto_ai',
  palette: { primary: '#ff1e42', secondary: '#ff8a00', accent: '#fff3db' },
  lyricStyle: 'constellation',
  edgeStyle: 'laser_orbit',
  particles: 'stars',
};

const LYRIC_STYLES: Array<{ id: LyricStyleId; label: string }> = [
  { id: 'constellation', label: 'Constellation' },
  { id: 'spotlight', label: 'Apple Lyrics' },
  { id: 'editorial', label: 'Serif' },
  { id: 'codestyle', label: 'Codestyle' },
];

const EDGE_STYLES: Array<{ id: EdgeStyleId; label: string }> = [
  { id: 'laser_orbit', label: 'Orbit Glow' },
  { id: 'neon_rim', label: 'Neon Rim' },
  { id: 'breathing_aura', label: 'Soft Aura' },
  { id: 'off', label: 'Off' },
];

const PARTICLE_STYLES: Array<{ id: AmbientParticleId; label: string }> = [
  { id: 'stars', label: 'Stars' },
  { id: 'rain', label: 'Rain' },
  { id: 'embers', label: 'Embers' },
  { id: 'none', label: 'Clean' },
];

export function App() {
  const isCompanion = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'companion',
    []
  );

  if (isCompanion) return <CompanionScreen />;
  return <AuraStage />;
}

const AuraStage: React.FC = () => {
  const [featured, setFeatured] = useState<SongItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const [queue, setQueue] = useState<SongItem[]>([]);
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);

  // Synced lyrics state (only re-renders when active line or active word changes!)
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [lyricOffset, setLyricOffset] = useState(0);

  // AI Vibe Director state
  const [blueprint, setBlueprint] = useState<VibeBlueprint>(DEFAULT_BLUEPRINT);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keyDraft, setKeyDraft] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keySaved, setKeySaved] = useState(false);
  const [isDirecting, setIsDirecting] = useState(false);
  const [vibePanelOpen, setVibePanelOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Clean UI state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Direct DOM refs for ZERO-LAG 60fps updates (no React re-renders!)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seekFillRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<LightAudioEngine | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // Mutable ref mirrors for rAF loop
  const rafStateRef = useRef({
    lyrics,
    activeLineIdx,
    activeWordIdx,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
  });
  rafStateRef.current = {
    lyrics,
    activeLineIdx,
    activeWordIdx,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  // Load curated real trending songs on first mount
  useEffect(() => {
    let alive = true;
    void loadFeaturedSongs().then((songs) => {
      if (!alive) return;
      setFeatured(songs);
      setFeaturedLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Apply CSS custom properties whenever blueprint palette / edgeStyle changes
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--aura-primary', blueprint.palette.primary);
    el.style.setProperty('--aura-secondary', blueprint.palette.secondary);
    el.style.setProperty('--aura-accent', blueprint.palette.accent);
    el.style.setProperty(
      '--aura-edge-opacity',
      blueprint.edgeStyle === 'off' ? '0' : blueprint.edgeStyle === 'breathing_aura' ? '0.68' : '0.95'
    );
  }, [blueprint]);

  // Play any selected song (real JioSaavn 320k / Apple iTunes / local MP3)
  const playSong = useCallback(
    async (song: SongItem, newQueue?: SongItem[]) => {
      if (newQueue && newQueue.length > 0) setQueue(newQueue);
      else if (queue.length === 0 && featured.length > 0) setQueue(featured);

      setActiveSong(song);
      setDuration(song.duration);
      setLyrics([]);
      setActiveLineIdx(-1);
      setActiveWordIdx(-1);
      setLyricsLoading(true);
      setLyricOffset(0);

      // Start playing immediately!
      const engine = audioRef.current;
      if (engine) {
        try {
          await engine.loadAndPlay(song.audioUrl);
        } catch {
          showToast('Click Play to start audio playback.');
        }
      }

      // Parallel: extract real album colors + fetch real synced lyrics from LRCLIB
      const [artworkPalette, fetchedLyrics] = await Promise.all([
        extractPaletteFromArtwork(song.artworkUrl),
        fetchSyncedLyricsForSong(song),
      ]);

      setLyrics(fetchedLyrics);
      setLyricsLoading(false);

      // For 30s Apple Previews, default lyrics offset near the chorus so words match the preview!
      if (!song.isFullTrack && fetchedLyrics.length > 6) {
        const chorusApprox = Math.round(fetchedLyrics[Math.floor(fetchedLyrics.length * 0.3)].start);
        setLyricOffset(chorusApprox);
      }

      // 0ms Autonomous AI Direction (palette + mood + lyric style + edge glow)
      const autoBp = directSongAutonomously({
        song,
        lyrics: fetchedLyrics,
        artworkPalette,
      });
      setBlueprint(autoBp);

      // Optional Gemini 4 Hydrogen refinement when user has saved an API key
      const key = geminiKey.trim();
      if (key) {
        setIsDirecting(true);
        try {
          const gemBp = await directSongWithGemini({
            apiKey: key,
            song,
            lyrics: fetchedLyrics,
          });
          setBlueprint(gemBp);
        } catch {
          // Keep smooth auto AI silently on quota/network error
        } finally {
          setIsDirecting(false);
        }
      }
    },
    [featured, queue.length, geminiKey, showToast]
  );

  // Skip Next / Prev in queue
  const playAdjacent = useCallback(
    (dir: 1 | -1) => {
      const list = queue.length > 0 ? queue : featured;
      if (list.length === 0 || !activeSong) return;
      const idx = list.findIndex((s) => s.id === activeSong.id);
      const nextIdx = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
      void playSong(list[nextIdx], list);
    },
    [queue, featured, activeSong, playSong]
  );

  // Local MP3 / WAV drag-drop or upload
  const handleLocalFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const parsed = parseLocalFileName(file.name);
      const localSong: SongItem = {
        id: `local-${Date.now()}`,
        title: parsed.title,
        artist: parsed.artist,
        album: 'Local Audio',
        duration: 200,
        artworkUrl: '',
        audioUrl: url,
        source: 'local',
        isFullTrack: true,
      };
      void playSong(localSong, [localSong, ...queue]);
      showToast(`Loaded "${parsed.title}"`);
    },
    [playSong, queue, showToast]
  );

  // Initialize lightweight audio engine + zero-lag 60fps CSS-var rAF loop
  useEffect(() => {
    const engine = new LightAudioEngine();
    audioRef.current = engine;
    engine.onPlayStateChange = (playing) => setIsPlaying(playing);
    engine.onDurationChange = (dur) => setDuration(dur);
    engine.onEnded = () => {
      // Auto-advance queue cleanly
      const s = rafStateRef.current.activeSong;
      if (s && s.isFullTrack) {
        setIsPlaying(false);
      }
    };

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;

    let rafId = 0;
    let lastCompanionMs = 0;

    const tick = () => {
      const now = performance.now();
      const s = rafStateRef.current;
      const pulse = engine.samplePulse();
      const curSec = engine.getCurrentTime();
      const durSec = engine.getDuration() || s.activeSong?.duration || 0;

      // 1. Direct GPU CSS variable updates (0 React re-renders!)
      const root = rootRef.current;
      if (root) {
        root.style.setProperty('--aura-bass', pulse.bass.toFixed(3));
        root.style.setProperty('--aura-beat', pulse.beat.toFixed(3));
      }

      // 2. Direct DOM seek bar + clock text updates (0 React re-renders!)
      if (seekFillRef.current && durSec > 0) {
        seekFillRef.current.style.width = `${Math.min(100, (curSec / durSec) * 100).toFixed(2)}%`;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = fmtTime(curSec);
      }

      // 3. Lyric index lookup — ONLY trigger React state update when line or word actually changes!
      if (s.lyrics.length > 0) {
        const lyricTime = curSec + s.lyricOffset;
        let lineIdx = -1;
        for (let i = 0; i < s.lyrics.length; i++) {
          if (lyricTime >= s.lyrics[i].start - 0.12 && lyricTime <= s.lyrics[i].end + 0.25) {
            lineIdx = i;
            break;
          }
        }
        if (lineIdx === -1) {
          for (let i = s.lyrics.length - 1; i >= 0; i--) {
            if (lyricTime >= s.lyrics[i].start) {
              if (lyricTime - s.lyrics[i].end < 2.2) lineIdx = i;
              break;
            }
          }
        }

        let wordIdx = -1;
        if (lineIdx >= 0) {
          const words = s.lyrics[lineIdx].words;
          for (let j = 0; j < words.length; j++) {
            if (lyricTime >= words[j].start - 0.04) wordIdx = j;
          }
          if (wordIdx === -1 && words.length > 0) wordIdx = 0;
        }

        if (lineIdx !== s.activeLineIdx) setActiveLineIdx(lineIdx);
        if (wordIdx !== s.activeWordIdx) setActiveWordIdx(wordIdx);
      }

      // 4. Sync Dual-Monitor Companion Window (~15fps)
      if (s.activeSong && now - lastCompanionMs > 65) {
        lastCompanionMs = now;
        const msg: CompanionSyncMessage = {
          type: 'STATE_SYNC',
          song: {
            id: s.activeSong.id,
            title: s.activeSong.title,
            artist: s.activeSong.artist,
            artworkUrl: s.activeSong.artworkUrl,
            duration: durSec,
          },
          blueprint: s.blueprint,
          currentTime: curSec,
          isPlaying: engine.isPlaying(),
          currentLineText: s.activeLineIdx >= 0 ? s.lyrics[s.activeLineIdx]?.text || '' : '',
          bass: pulse.bass,
          beat: pulse.beat,
        };
        channel.postMessage(msg);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      channel.close();
      engine.dispose();
    };
  }, []);

  // Steer AI Vibe with natural prompt (uses Gemini 4 if key saved, else instant Autonomous AI)
  const handlePromptSteer = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = promptInput.trim();
    if (!text || !activeSong) return;
    setPromptInput('');

    const instant = directSongAutonomously({
      song: activeSong,
      lyrics,
      artworkPalette: null,
      userPrompt: text,
    });
    setBlueprint(instant);

    if (geminiKey.trim()) {
      setIsDirecting(true);
      try {
        const gem = await directSongWithGemini({
          apiKey: geminiKey.trim(),
          song: activeSong,
          lyrics,
          userPrompt: text,
        });
        setBlueprint(gem);
        showToast(`Gemini 4 → "${gem.moodName}"`);
      } catch (err) {
        showToast(err instanceof Error ? err.message.slice(0, 100) : 'Gemini error');
      } finally {
        setIsDirecting(false);
      }
    } else {
      showToast(`Vibe → "${instant.moodName}"`);
    }
  };

  // Auto-hide chrome gently during fullscreen playback
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (activeSong && isPlaying && !vibePanelOpen && !searchOpen) {
      hideTimerRef.current = window.setTimeout(() => {
        setChromeVisible(false);
      }, 6500);
    }
  }, [activeSong, isPlaying, vibePanelOpen, searchOpen]);

  useEffect(() => {
    if (!activeSong || !isPlaying || vibePanelOpen || searchOpen) {
      setChromeVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    } else {
      wakeChrome();
    }
  }, [activeSong, isPlaying, vibePanelOpen, searchOpen, wakeChrome]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }, []);

  const openCompanion = useCallback(() => {
    window.open(
      `${window.location.origin}${window.location.pathname}?mode=companion`,
      'aura_companion',
      'width=760,height=640'
    );
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' && activeSong) {
        e.preventDefault();
        audioRef.current?.togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'c' || e.key === 'C') {
        openCompanion();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSong, toggleFullscreen, openCompanion]);

  const primary = blueprint.palette.primary;

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      onMouseMove={wakeChrome}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = Array.from(e.dataTransfer.files).find(
          (file) => file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)
        );
        if (f) handleLocalFile(f);
      }}
    >
      {/* Pure GPU OLED Radial Mood Backdrop (Zero Lag!) */}
      <div className="aura-oled-backdrop" />

      {/* Subtle Low-Cost Ambient Particles */}
      <AmbientParticles
        mode={blueprint.particles}
        color={blueprint.palette.primary}
        accent={blueprint.palette.accent}
      />

      {/* Lumn-Grade Pure GPU Perimeter Ambient Edge Lighting */}
      {blueprint.edgeStyle !== 'off' && (
        <div className="aura-edge-frame">
          <div className="aura-edge-glow-inner" />
          {blueprint.edgeStyle === 'laser_orbit' && (
            <>
              <div className="aura-edge-orb-h aura-orb-top" />
              <div className="aura-edge-orb-h aura-orb-bottom" />
              <div className="aura-edge-orb-v aura-orb-left" />
              <div className="aura-edge-orb-v aura-orb-right" />
            </>
          )}
        </div>
      )}

      {/* Drag & Drop Audio Overlay */}
      {isDragging && (
        <div
          className="fixed inset-5 z-50 rounded-3xl border-2 border-dashed bg-black/85 flex flex-col items-center justify-center"
          style={{ borderColor: primary }}
        >
          <Upload className="w-10 h-10 mb-3" style={{ color: primary }} />
          <p className="font-display text-xl font-bold">Drop Your Audio File</p>
          <p className="text-xs text-white/55 mt-1">Auto-syncs lyrics &amp; AI edge lighting</p>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 oled-pill px-3.5 py-2 rounded-full text-xs text-white/90 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />
          <span>{toast}</span>
        </div>
      )}

      {/* ====================================================================
          VIEW A: CLEAN SPOTLIGHT HOME & SONG SEARCH (Before Song Selected)
          ==================================================================== */}
      {!activeSong && (
        <div className="relative z-20 w-full h-full flex flex-col items-center justify-center px-5 py-10 overflow-y-auto">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="flex items-center gap-2.5 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: primary, boxShadow: `0 0 14px ${primary}` }}
              />
              <span className="font-display text-2xl sm:text-3xl font-bold tracking-[0.26em]">AURA</span>
            </div>
            <p className="text-xs sm:text-sm text-white/50 max-w-md">
              Search any song — synced lyrics, album-matched edge lighting &amp; AI mood direction on pure OLED black.
            </p>
          </div>

          {/* Hero Song Search Bar */}
          <SearchBar
            accentColor={primary}
            onSelectSong={(song, list) => void playSong(song, list)}
            onUploadLocalFile={handleLocalFile}
            onDropdownToggle={setSearchOpen}
          />

          {/* Instant Playable Real Songs Grid */}
          <div className="w-[min(92vw,760px)] mt-9">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-mono-code uppercase tracking-widest text-white/40">
                Play Instantly
              </span>
              <span className="text-[11px] text-white/35">Or drag &amp; drop any MP3</span>
            </div>

            {featuredLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {featured.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => void playSong(song, featured)}
                    className="group flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.035] hover:bg-white/[0.09] border border-white/[0.07] transition-all text-left cursor-pointer"
                  >
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
                      {song.artworkUrl ? (
                        <img src={song.artworkUrl} alt={song.title} className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="w-4 h-4 m-auto text-white/30" />
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate">{song.title}</div>
                      <div className="text-[11px] text-white/45 truncate">{song.artist}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW B: FULLSCREEN OLED STAGE (When Song Is Playing)
          ==================================================================== */}
      {activeSong && (
        <>
          {/* Top Bar: Brand + Compact Song Search + AI Mood Pill */}
          <div
            className={`fixed top-5 inset-x-5 z-30 flex items-center justify-between gap-3 transition-all duration-300 ${
              chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
            }`}
          >
            {/* Brand button returns to Home Grid */}
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setActiveSong(null);
                setVibePanelOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
              title="Back to Home"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: primary, boxShadow: `0 0 10px ${primary}` }}
              />
              <span className="font-display text-xs font-bold tracking-[0.22em] text-white/90">AURA</span>
            </button>

            {/* Always-Ready Top Song Search */}
            <SearchBar
              compact
              accentColor={primary}
              onSelectSong={(song, list) => void playSong(song, list)}
              onUploadLocalFile={handleLocalFile}
              onDropdownToggle={setSearchOpen}
            />

            {/* Compact AI Vibe Director Button */}
            <button
              type="button"
              onClick={() => setVibePanelOpen((v) => !v)}
              className="oled-pill px-3.5 py-2 rounded-full flex items-center gap-2 text-xs hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              style={vibePanelOpen ? { borderColor: primary } : undefined}
            >
              {isDirecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: primary }} />
              ) : (
                <Sparkles className="w-3.5 h-3.5" style={{ color: primary }} />
              )}
              <span className="hidden md:inline font-grotesk font-medium text-white/90 max-w-[130px] truncate">
                {blueprint.moodName}
              </span>
            </button>
          </div>

          {/* Sleek Popover AI Vibe & Gemini Controls */}
          {vibePanelOpen && (
            <div className="fixed top-20 right-5 z-40 w-[min(92vw,360px)] oled-surface rounded-3xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                    {blueprint.source === 'gemini_4' ? 'GEMINI 4 DIRECTED' : 'AI VIBE DIRECTOR'}
                  </div>
                  <div className="text-sm font-grotesk font-semibold text-white">{blueprint.moodName}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setVibePanelOpen(false)}
                  className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/60 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-white/55 leading-relaxed">{blueprint.directorNote}</p>

              {/* Steer Vibe Prompt */}
              <form onSubmit={handlePromptSteer} className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.1] px-2.5 py-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-white/45 shrink-0" />
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder='e.g. "crimson starboy" or "rainy blue"'
                    className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/35 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!promptInput.trim() || isDirecting}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black disabled:opacity-40 cursor-pointer shrink-0"
                  style={{ backgroundColor: primary }}
                >
                  Apply
                </button>
              </form>

              {/* Lyric Style Switcher */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">Lyrics Style</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {LYRIC_STYLES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBlueprint((b) => ({ ...b, lyricStyle: opt.id }))}
                      className={`py-1.5 px-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        blueprint.lyricStyle === opt.id
                          ? 'text-black font-semibold'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                      }`}
                      style={blueprint.lyricStyle === opt.id ? { backgroundColor: primary } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edge Glow Switcher */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">Edge Lighting</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {EDGE_STYLES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBlueprint((b) => ({ ...b, edgeStyle: opt.id }))}
                      className={`py-1.5 rounded-xl text-[11px] transition-colors cursor-pointer ${
                        blueprint.edgeStyle === opt.id
                          ? 'text-black font-semibold'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                      }`}
                      style={blueprint.edgeStyle === opt.id ? { backgroundColor: primary } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ambient Particles Switcher */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">Atmosphere</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {PARTICLE_STYLES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBlueprint((b) => ({ ...b, particles: opt.id }))}
                      className={`py-1.5 rounded-xl text-[11px] transition-colors cursor-pointer ${
                        blueprint.particles === opt.id
                          ? 'text-black font-semibold'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                      }`}
                      style={blueprint.particles === opt.id ? { backgroundColor: primary } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Gemini 4 API Key */}
              <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center justify-between">
                  <span>Gemini 4 AI (Optional)</span>
                  <span className="text-white/30">gemini-4-hydrogen</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-black/50 border border-white/[0.1] px-2.5 py-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <input
                      type="password"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      placeholder="AIzaSy... (optional key)"
                      className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/30 outline-none font-mono-code"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = keyDraft.trim();
                      setGeminiKey(clean);
                      if (clean) localStorage.setItem('aura_gemini_key', clean);
                      else localStorage.removeItem('aura_gemini_key');
                      setKeySaved(true);
                      setTimeout(() => setKeySaved(false), 1500);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black cursor-pointer shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    {keySaved ? <Check className="w-3.5 h-3.5" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Centerpiece: Razor-Sharp OLED Synced Lyrics Stage */}
          <LyricsStage
            song={activeSong}
            lyrics={lyrics}
            lyricsLoading={lyricsLoading}
            activeLineIdx={activeLineIdx}
            activeWordIdx={activeWordIdx}
            blueprint={blueprint}
            isPlaying={isPlaying}
            lyricOffset={lyricOffset}
            onAdjustOffset={(delta) => setLyricOffset((v) => v + delta)}
          />

          {/* Minimalist Floating Bottom Player Bar */}
          <div
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,820px)] transition-all duration-300 ${
              chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <div className="oled-surface rounded-2xl px-4 py-3 flex flex-col gap-2">
              {/* Ultra-thin Seek Bar (Updated directly via DOM ref — 0 React re-renders!) */}
              <div className="flex items-center gap-3 text-[10px] font-mono-code text-white/45">
                <span ref={timeLabelRef} className="w-8 text-right">
                  0:00
                </span>
                <div
                  className="flex-1 h-1.5 rounded-full bg-white/10 cursor-pointer overflow-hidden"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const dur = audioRef.current?.getDuration() || duration;
                    if (dur > 0) audioRef.current?.seek(pct * dur);
                  }}
                >
                  <div
                    ref={seekFillRef}
                    className="h-full rounded-full"
                    style={{
                      width: '0%',
                      background: `linear-gradient(90deg, ${primary}, ${blueprint.palette.accent})`,
                    }}
                  />
                </div>
                <span className="w-8">{fmtTime(duration)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                {/* Song Thumbnail & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/10"
                    style={{ boxShadow: `0 0 16px ${primary}44` }}
                  >
                    {activeSong.artworkUrl ? (
                      <img src={activeSong.artworkUrl} alt={activeSong.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-4 h-4 text-white/30" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{activeSong.title}</span>
                      <span className="hidden sm:inline text-[9px] font-mono-code px-1.5 py-0.5 rounded bg-white/[0.07] text-white/55">
                        {activeSong.isFullTrack ? 'FULL' : '30s'}
                      </span>
                    </div>
                    <div className="text-xs text-white/50 truncate">{activeSong.artist}</div>
                  </div>
                </div>

                {/* Transport Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => playAdjacent(-1)}
                    className="p-2 rounded-xl text-white/65 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                    title="Previous"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => audioRef.current?.togglePlay()}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: primary, boxShadow: `0 0 18px ${primary}88` }}
                    title="Play / Pause (Space)"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => playAdjacent(1)}
                    className="p-2 rounded-xl text-white/65 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                    title="Next"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Controls: Volume + Companion + Fullscreen */}
                <div className="flex items-center justify-end gap-1.5 flex-1">
                  <div className="hidden sm:flex items-center gap-1.5 mr-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !muted;
                        setMuted(next);
                        audioRef.current?.setVolume(next ? 0 : volume);
                      }}
                      className="p-1.5 text-white/55 hover:text-white cursor-pointer"
                    >
                      {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        setMuted(v === 0);
                        audioRef.current?.setVolume(v);
                      }}
                      className="aura-slider w-16"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={openCompanion}
                    className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white cursor-pointer"
                    title="Open Dual-Monitor Companion Screen (C)"
                  >
                    <MonitorSmartphone className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white cursor-pointer"
                    title="Fullscreen (F)"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
