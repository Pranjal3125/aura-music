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
  Loader2,
  Music2,
  Upload,
  EyeOff,
  ListMusic,
  Sliders,
  Video,
  MonitorPlay,
  Mic,
  Minus,
  Plus,
  Infinity as InfinityIcon,
  Repeat1,
  Radio,
  Shuffle,
} from 'lucide-react';
import type {
  AmbientParticleId,
  CompanionCommandMessage,
  CompanionSyncMessage,
  EdgeStyleId,
  EqPresetId,
  LyricLine,
  LyricMatchSource,
  LyricStyleId,
  SongItem,
  VibeBlueprint,
} from './types';
import { EQ_PRESETS, VIBE_PRESETS } from './data/presets';
import {
  cleanTrackTitle,
  detectChorusStartTime,
  extractPaletteFromArtwork,
  fetchInfiniteRadioSongs,
  fetchItunesSongs,
  fetchSyncedLyricsDetailed,
  launchRadioStation,
  loadFeaturedSongs,
  makeSongKey,
  parseLocalFileName,
} from './services/musicApi';
import { loadUserSettings, saveUserSettings, type EqBands } from './services/settingsStorage';
import { computeLyricCursor, type LyricPhase } from './services/lyricSync';
import { LightAudioEngine } from './engine/lightAudioEngine';
import { directSongAutonomously, directSongWithGemini, presetToBlueprint } from './engine/vibeBrain';
import { SearchBar } from './components/SearchBar';
import { LyricsStage } from './components/LyricsStage';
import { AmbientParticles } from './components/AmbientParticles';
import { COMPANION_SNAPSHOT_KEY, CompanionScreen } from './components/CompanionScreen';
import { LyricsTimelineDrawer } from './components/LyricsTimelineDrawer';
import { SpectrumHorizon } from './components/SpectrumHorizon';
import { ClickPulseOverlay } from './components/ClickPulseOverlay';
import { LYRIC_STYLES, StudioPopover } from './components/StudioPopover';

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const f = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(f, 16);
  if (isNaN(n)) return [168, 85, 247];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function loadSavedOffset(songId: string): number | null {
  try {
    const map = JSON.parse(localStorage.getItem('aura_lyric_offsets_v1') || '{}') as Record<string, number>;
    return typeof map[songId] === 'number' ? map[songId] : null;
  } catch {
    return null;
  }
}

function saveOffset(songId: string, offset: number): void {
  try {
    const map = JSON.parse(localStorage.getItem('aura_lyric_offsets_v1') || '{}') as Record<string, number>;
    map[songId] = offset;
    localStorage.setItem('aura_lyric_offsets_v1', JSON.stringify(map));
  } catch {
    // ignore
  }
}

function buildInitialBlueprint(prefs: ReturnType<typeof loadUserSettings>): VibeBlueprint {
  const preset = VIBE_PRESETS.find((p) => p.id === prefs.presetId) ?? VIBE_PRESETS[0];
  const base = presetToBlueprint(preset);
  return {
    ...base,
    lyricStyle: prefs.lyricStyle ?? base.lyricStyle,
    edgeStyle: prefs.edgeStyle ?? base.edgeStyle,
    particles: prefs.particles ?? base.particles,
    showSpectrum: prefs.showSpectrum ?? base.showSpectrum,
  };
}

const QUICK_SEARCH_CHIPS = [
  { label: 'No Lie · Sean Paul', q: 'No Lie Sean Paul Dua Lipa' },
  { label: 'Starboy · The Weeknd', q: 'Starboy The Weeknd' },
  { label: 'Kesariya', q: 'Kesariya Arijit Singh' },
  { label: 'Tum Hi Ho', q: 'Tum Hi Ho Arijit Singh' },
  { label: 'Apna Bana Le', q: 'Apna Bana Le Arijit Singh' },
  { label: 'Blinding Lights', q: 'Blinding Lights The Weeknd' },
];

const RADIO_STATIONS = [
  { label: 'Violet Pop & Dance ∞', q: 'Sean Paul Dua Lipa The Weeknd', accent: '#a855f7' },
  { label: 'Trending Hindi ∞', q: 'Arijit Singh Pritam Hindi', accent: '#ff1e42' },
  { label: 'Bollywood Soul ∞', q: 'Arijit Singh Atif Aslam Bollywood', accent: '#f59e0b' },
  { label: 'Indie Chill ∞', q: 'Anuv Jain Indie India', accent: '#38bdf8' },
  { label: 'Punjabi Hits ∞', q: 'Diljit Dosanjh AP Dhillon Punjabi', accent: '#10b981' },
  { label: 'Electronic / Audius ∞', q: 'Electronic Synthwave', accent: '#0a84ff' },
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
  const [initialPrefs] = useState(() => loadUserSettings());
  const [featured, setFeatured] = useState<SongItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [externalSearchQuery, setExternalSearchQuery] = useState<{ query: string; nonce: number } | undefined>(
    undefined
  );
  const searchChipNonceRef = useRef(0);

  const [queue, setQueue] = useState<SongItem[]>([]);
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [infiniteRadio, setInfiniteRadio] = useState<boolean>(() => initialPrefs.infiniteRadio ?? true);
  const [repeatOne, setRepeatOne] = useState<boolean>(() => initialPrefs.repeatOne ?? false);
  const [shuffle, setShuffle] = useState<boolean>(() => initialPrefs.shuffle ?? false);
  const [radioLoading, setRadioLoading] = useState(false);
  const playedKeysRef = useRef<Set<string>>(new Set());
  const radioFetchPromiseRef = useRef<Promise<SongItem[]> | null>(null);
  const activeSongIdRef = useRef<string | null>(null);
  const sessionVisualPrefsRef = useRef<{
    lyricStyle?: LyricStyleId;
    edgeStyle?: EdgeStyleId;
    particles?: AmbientParticleId;
    showSpectrum?: boolean;
  }>({
    lyricStyle: initialPrefs.lyricStyle,
    edgeStyle: initialPrefs.edgeStyle,
    particles: initialPrefs.particles,
    showSpectrum: initialPrefs.showSpectrum,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(() => initialPrefs.volume ?? 0.85);
  const [muted, setMuted] = useState<boolean>(() => initialPrefs.muted ?? false);
  const [eqPreset, setEqPreset] = useState<EqPresetId | 'custom'>(() => initialPrefs.eqPreset ?? 'flat');
  const [eqBands, setEqBands] = useState<EqBands>(() => initialPrefs.eqBands ?? { bass: 0, mid: 0, treble: 0 });

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricMatchSource, setLyricMatchSource] = useState<LyricMatchSource>('none');
  const [matchedTrackInfo, setMatchedTrackInfo] = useState<string | undefined>(undefined);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [upcomingLineIdx, setUpcomingLineIdx] = useState(-1);
  const [secondsUntilNext, setSecondsUntilNext] = useState(0);
  const [lyricPhase, setLyricPhase] = useState<LyricPhase>('none');
  const [lyricOffset, setLyricOffset] = useState(0);

  const [blueprint, setBlueprint] = useState<VibeBlueprint>(() => buildInitialBlueprint(initialPrefs));
  const [activePresetId, setActivePresetId] = useState<string>(() => initialPrefs.presetId ?? 'verci-lumn');
  const [visualIcons, setVisualIcons] = useState<boolean>(() => initialPrefs.visualIcons ?? true);
  const [lockPreset, setLockPreset] = useState<boolean>(() => initialPrefs.lockPreset ?? false);

  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keyDraft, setKeyDraft] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keySaved, setKeySaved] = useState(false);
  const [isDirecting, setIsDirecting] = useState(false);
  const [vibePanelOpen, setVibePanelOpen] = useState(false);
  const [lyricsDrawerOpen, setLyricsDrawerOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [seekHover, setSeekHover] = useState<{ pct: number; sec: number } | null>(null);

  const [focusRemaining, setFocusRemaining] = useState<number | null>(null);
  const [recordingSec, setRecordingSec] = useState<number | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [pureCinema, setPureCinema] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const seekFillRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<LightAudioEngine | null>(null);
  const audioPulseRef = useRef({
    bass: 0.1,
    beat: 0,
    mid: 0.1,
    spectrum: new Float32Array(32),
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const rafStateRef = useRef({
    lyrics,
    activeLineIdx,
    activeWordIdx,
    upcomingLineIdx,
    lyricPhase,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
    queue,
    featured,
    infiniteRadio,
    repeatOne,
    shuffle,
  });
  rafStateRef.current = {
    lyrics,
    activeLineIdx,
    activeWordIdx,
    upcomingLineIdx,
    lyricPhase,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
    queue,
    featured,
    infiniteRadio,
    repeatOne,
    shuffle,
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3400);
  }, []);

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

  useEffect(() => {
    if (focusRemaining === null) return;
    const id = window.setInterval(() => {
      setFocusRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          showToast('25-minute Focus Session Complete!');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [focusRemaining !== null, showToast]);

  const updateVolume = useCallback((nextVol: number) => {
    const clamped = Math.round(Math.min(1, Math.max(0, nextVol)) * 100) / 100;
    setVolume(clamped);
    setMuted(clamped === 0);
    audioRef.current?.setVolume(clamped);
    saveUserSettings({ volume: clamped, muted: clamped === 0 });
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (!next && volume === 0) {
      setVolume(0.5);
      audioRef.current?.setVolume(0.5);
      saveUserSettings({ muted: false, volume: 0.5 });
      return;
    }
    audioRef.current?.setVolume(next ? 0 : volume);
    saveUserSettings({ muted: next });
  }, [muted, volume]);

  const updateVisualSetting = useCallback(
    (patch: Partial<Pick<VibeBlueprint, 'lyricStyle' | 'edgeStyle' | 'particles' | 'showSpectrum'>>) => {
      sessionVisualPrefsRef.current = { ...sessionVisualPrefsRef.current, ...patch };
      setBlueprint((b) => ({ ...b, ...patch }));
      saveUserSettings(patch);
    },
    []
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = VIBE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      sessionVisualPrefsRef.current = {
        lyricStyle: preset.lyricStyle,
        edgeStyle: preset.edgeStyle,
        particles: preset.particles,
        showSpectrum: preset.showSpectrum,
      };
      setActivePresetId(preset.id);
      setBlueprint(presetToBlueprint(preset));
      saveUserSettings({
        presetId: preset.id,
        lyricStyle: preset.lyricStyle,
        edgeStyle: preset.edgeStyle,
        particles: preset.particles,
        showSpectrum: preset.showSpectrum,
      });
      showToast(`Preset: ${preset.name}`);
    },
    [showToast]
  );

  const replenishRadio = useCallback(
    async (seed: SongItem, baseQueue: SongItem[]): Promise<SongItem[]> => {
      if (radioFetchPromiseRef.current) return radioFetchPromiseRef.current;
      setRadioLoading(true);
      const task = (async () => {
        try {
          const exclude = new Set<string>(playedKeysRef.current);
          baseQueue.forEach((s) => {
            exclude.add(s.id);
            exclude.add(makeSongKey(s.title, s.artist));
          });
          const fresh = await fetchInfiniteRadioSongs(seed, exclude);
          if (fresh.length > 0) {
            setQueue((prev) => {
              const seen = new Set(prev.map((x) => makeSongKey(x.title, x.artist)));
              const uniqueNew = fresh.filter((f) => !seen.has(makeSongKey(f.title, f.artist)));
              return [...prev.slice(-30), ...uniqueNew];
            });
          }
          return fresh;
        } finally {
          radioFetchPromiseRef.current = null;
          setRadioLoading(false);
        }
      })();
      radioFetchPromiseRef.current = task;
      return task;
    },
    []
  );

  const playSong = useCallback(
    async (song: SongItem, newQueue?: SongItem[]) => {
      activeSongIdRef.current = song.id;
      setExternalSearchQuery(undefined);
      setSearchOpen(false);
      playedKeysRef.current.add(song.id);
      playedKeysRef.current.add(makeSongKey(song.title, song.artist));
      if (playedKeysRef.current.size > 180) {
        playedKeysRef.current.clear();
        playedKeysRef.current.add(song.id);
      }

      const activeQueue =
        newQueue && newQueue.length > 0
          ? newQueue
          : queue.length > 0
            ? queue
            : [song];
      if (newQueue && newQueue.length > 0) {
        setQueue(newQueue);
      } else if (queue.length === 0) {
        setQueue([song]);
      }

      setActiveSong(song);
      setDuration(song.duration);
      setLyrics([]);
      setLyricMatchSource('none');
      setMatchedTrackInfo(undefined);
      setActiveLineIdx(-1);
      setActiveWordIdx(-1);
      setUpcomingLineIdx(-1);
      setSecondsUntilNext(0);
      setLyricPhase('none');
      setLyricsLoading(true);
      setLyricOffset(0);

      const prepPromise = Promise.all([
        extractPaletteFromArtwork(song.artworkUrl),
        fetchSyncedLyricsDetailed(song),
      ]);

      const engine = audioRef.current;
      let effectiveSong = song;
      if (engine) {
        try {
          await engine.loadAndPlay(song.audioUrl);
        } catch (err) {
          if (activeSongIdRef.current !== song.id) return;
          const isAutoplay = err instanceof DOMException && err.name === 'NotAllowedError';
          if (isAutoplay) {
            showToast('Click Play to start audio.');
          } else if (song.source === 'saavn' || song.source === 'audius') {
            // Stream CDN failed -> fall back seamlessly to iTunes 30s preview for this song!
            const cleanTitle = cleanTrackTitle(song.title);
            const fallbackHits = await fetchItunesSongs(`${cleanTitle} ${song.artist}`.trim());
            if (activeSongIdRef.current !== song.id) return;
            if (fallbackHits.length > 0) {
              effectiveSong = {
                ...song,
                audioUrl: fallbackHits[0].audioUrl,
                duration: 30,
                fullDuration: fallbackHits[0].fullDuration || song.fullDuration || song.duration,
                isFullTrack: false,
                source: 'itunes',
              };
              setActiveSong(effectiveSong);
              setDuration(30);
              try {
                await engine.loadAndPlay(effectiveSong.audioUrl);
                showToast('Full stream blocked — playing 30s preview');
              } catch {
                showToast(`Audio stream unavailable for "${song.title}".`);
              }
            } else {
              showToast(`Audio stream unavailable for "${song.title}".`);
            }
          } else {
            showToast(`Audio stream unavailable for "${song.title}".`);
          }
        }
      }

      if (rafStateRef.current.infiniteRadio) {
        const curIdx = activeQueue.findIndex((s) => s.id === song.id);
        const remaining = curIdx < 0 ? 0 : activeQueue.length - 1 - curIdx;
        if (remaining <= 2) {
          void replenishRadio(song, activeQueue);
        }
      }

      const [artworkPalette, lrcResult] = await prepPromise;

      // Guard against stale async result if user skipped rapidly
      if (activeSongIdRef.current !== song.id) return;

      const fetchedLyrics = lrcResult.lines;
      setLyrics(fetchedLyrics);
      setLyricMatchSource(lrcResult.matchSource);
      setMatchedTrackInfo(
        lrcResult.matchedTrack
          ? `${lrcResult.matchedTrack}${lrcResult.matchedArtist ? ` · ${lrcResult.matchedArtist}` : ''}`
          : undefined
      );
      setLyricsLoading(false);

      const saved = loadSavedOffset(effectiveSong.id);
      let initialOffset = 0;
      if (saved !== null) {
        initialOffset = saved;
      } else if (!effectiveSong.isFullTrack && fetchedLyrics.length > 0) {
        // Smart Chorus Sync: start 30s previews directly on the vocal hook without overlapping the screen!
        initialOffset = detectChorusStartTime(fetchedLyrics, effectiveSong.fullDuration);
        if (initialOffset > 0) {
          showToast(`30s Preview · Auto-synced at ${fmtTime(initialOffset)} (press L to adjust)`);
        }
      }
      setLyricOffset(initialOffset);
      if (fetchedLyrics.length > 0) {
        const initCursor = computeLyricCursor(
          fetchedLyrics,
          audioRef.current?.getCurrentTime() || 0,
          initialOffset
        );
        setActiveLineIdx(initCursor.activeLineIdx);
        setActiveWordIdx(initCursor.activeWordIdx);
        setUpcomingLineIdx(initCursor.upcomingLineIdx);
        setSecondsUntilNext(initCursor.secondsUntilNext);
        setLyricPhase(initCursor.phase);
      }

      const applyLatestVisualPrefs = (bp: VibeBlueprint): VibeBlueprint => {
        const latestPrefs = loadUserSettings();
        const sessionOverride = sessionVisualPrefsRef.current;
        return {
          ...bp,
          lyricStyle: sessionOverride.lyricStyle ?? latestPrefs.lyricStyle ?? bp.lyricStyle,
          edgeStyle: sessionOverride.edgeStyle ?? latestPrefs.edgeStyle ?? bp.edgeStyle,
          particles: sessionOverride.particles ?? latestPrefs.particles ?? bp.particles,
          showSpectrum: sessionOverride.showSpectrum ?? latestPrefs.showSpectrum ?? bp.showSpectrum,
        };
      };

      if (!loadUserSettings().lockPreset) {
        setActivePresetId('');
        const autoBp = directSongAutonomously({
          song,
          lyrics: fetchedLyrics,
          artworkPalette,
        });
        setBlueprint(applyLatestVisualPrefs(autoBp));

        const key = geminiKey.trim();
        if (key) {
          setIsDirecting(true);
          try {
            const gemBp = await directSongWithGemini({
              apiKey: key,
              song,
              lyrics: fetchedLyrics,
            });
            if (activeSongIdRef.current === song.id && !loadUserSettings().lockPreset) {
              setBlueprint(applyLatestVisualPrefs(gemBp));
            }
          } catch {
            // keep seamless auto AI
          } finally {
            setIsDirecting(false);
          }
        }
      }
    },
    [queue, geminiKey, showToast, replenishRadio]
  );

  const handleManualSearchLyrics = useCallback(
    async (customQuery: string) => {
      if (!activeSong) return;
      setLyricsLoading(true);
      const res = await fetchSyncedLyricsDetailed(activeSong, customQuery);
      if (activeSongIdRef.current !== activeSong.id) return;
      setLyrics(res.lines);
      setLyricMatchSource(res.matchSource);
      setMatchedTrackInfo(
        res.matchedTrack
          ? `${res.matchedTrack}${res.matchedArtist ? ` · ${res.matchedArtist}` : ''}`
          : undefined
      );
      setLyricsLoading(false);
      if (res.lines.length > 0) {
        if (!activeSong.isFullTrack) {
          const chorusSec = detectChorusStartTime(res.lines, activeSong.fullDuration);
          setLyricOffset(chorusSec);
        } else {
          setLyricOffset(0);
        }
        showToast(`Matched lyrics: ${res.matchedTrack || customQuery}`);
      } else {
        showToast('No lyrics found for that search.');
      }
    },
    [activeSong, showToast]
  );

  const playAdjacent = useCallback(
    async (dir: 1 | -1) => {
      const list = queue.length > 0 ? queue : featured;
      if (list.length === 0 || !activeSong) return;
      const idx = list.findIndex((s) => s.id === activeSong.id);

      if (dir === 1 && shuffle && list.length > 2) {
        const candidates = list.filter((s) => s.id !== activeSong.id);
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        if (picked) {
          void playSong(picked, list);
          return;
        }
      }

      if (dir === 1 && idx === list.length - 1 && infiniteRadio) {
        const fresh = await replenishRadio(activeSong, list);
        if (fresh.length > 0) {
          const seenKeys = new Set(list.map((x) => makeSongKey(x.title, x.artist)));
          const uniqueFresh = fresh.filter((f) => !seenKeys.has(makeSongKey(f.title, f.artist)));
          const nextQueue = [...list.slice(-30), ...uniqueFresh];
          void playSong(uniqueFresh[0] || fresh[0], nextQueue.length > 0 ? nextQueue : fresh);
          return;
        }
      }

      const nextIdx = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
      void playSong(list[nextIdx], list);
    },
    [queue, featured, activeSong, shuffle, infiniteRadio, replenishRadio, playSong]
  );

  const playAdjacentRef = useRef(playAdjacent);
  playAdjacentRef.current = playAdjacent;

  const handleLaunchStation = useCallback(
    async (stationTitle: string, query: string) => {
      showToast(`Tuning ${stationTitle}...`);
      const songs = await launchRadioStation(query);
      if (songs.length === 0) {
        showToast('Could not load radio tracks right now.');
        return;
      }
      setInfiniteRadio(true);
      saveUserSettings({ infiniteRadio: true });
      void playSong(songs[0], songs);
    },
    [playSong, showToast]
  );

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

  const handleStartLiveAudio = useCallback(
    async (kind: 'tab' | 'mic') => {
      const engine = audioRef.current;
      if (!engine) return;
      try {
        if (kind === 'tab') await engine.startTabCapture();
        else await engine.startMicCapture();

        const liveItem: SongItem = {
          id: `live-${kind}-${Date.now()}`,
          title: kind === 'tab' ? 'Live Tab Audio' : 'Room Microphone',
          artist: kind === 'tab' ? 'Spotify / YouTube Stream' : 'Ambient Audio Capture',
          album: 'Real-Time DSP',
          duration: 0,
          artworkUrl: '',
          audioUrl: '',
          source: kind === 'tab' ? 'live_tab' : 'live_mic',
          isFullTrack: true,
        };
        activeSongIdRef.current = liveItem.id;
        setExternalSearchQuery(undefined);
        setSearchOpen(false);
        setActiveSong(liveItem);
        setLyrics([]);
        setLyricsLoading(false);
        setIsPlaying(true);
        setBlueprint((b) => ({ ...b, showSpectrum: true }));
        showToast(kind === 'tab' ? 'Live Tab Audio connected!' : 'Room Mic active!');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Capture cancelled.');
      }
    },
    [showToast]
  );

  // Unified 120fps rAF loop + Bidirectional Companion Channel
  useEffect(() => {
    const bootPrefs = loadUserSettings();
    const startupVol = bootPrefs.muted ? 0 : (bootPrefs.volume ?? 0.85);
    const engine = new LightAudioEngine({
      volume: startupVol,
      eq: bootPrefs.eqBands,
    });
    audioRef.current = engine;
    engine.onPlayStateChange = (playing) => setIsPlaying(playing);
    engine.onDurationChange = (dur) => setDuration(dur);
    engine.onEnded = () => {
      const st = rafStateRef.current;
      if (!st.activeSong) return;
      if (st.repeatOne) {
        engine.seek(0);
        engine.play();
        return;
      }
      if (st.infiniteRadio || st.queue.length > 1) {
        void playAdjacentRef.current(1);
      }
    };

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;
    channel.onmessage = (ev: MessageEvent<CompanionCommandMessage>) => {
      if (ev.data?.type !== 'CMD') return;
      if (ev.data.action === 'toggle_play') audioRef.current?.togglePlay();
      else if (ev.data.action === 'prev') void playAdjacentRef.current(-1);
      else if (ev.data.action === 'next') void playAdjacentRef.current(1);
    };

    const bootBp = buildInitialBlueprint(bootPrefs);
    const curP: [number, number, number] = hexToRgb(bootBp.palette.primary);
    const curS: [number, number, number] = hexToRgb(bootBp.palette.secondary);
    let smoothGlowAlpha = 0.45;
    let smoothPulseAlpha = 0.2;

    let prevNow = performance.now();
    let lastCompanionMs = 0;
    let lastSnapshotMs = 0;
    let lastCssColorMs = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;

      const s = rafStateRef.current;
      const rawPulse = engine.samplePulse();

      const atk = 1 - Math.exp(-16 * dt);
      const rel = 1 - Math.exp(-4.2 * dt);
      const ap = audioPulseRef.current;
      ap.bass += (rawPulse.bass - ap.bass) * (rawPulse.bass > ap.bass ? atk : rel);
      ap.beat += (rawPulse.beat - ap.beat) * (rawPulse.beat > ap.beat ? atk : rel);
      ap.mid += (rawPulse.mid - ap.mid) * (rawPulse.mid > ap.mid ? atk : rel);
      ap.spectrum = rawPulse.spectrum;

      const targetGlow = Math.min(1, 0.28 + ap.bass * 0.58 + ap.beat * 0.32);
      const targetPulse = Math.min(0.96, 0.18 + ap.bass * 0.55 + ap.beat * 0.42);
      smoothGlowAlpha += (targetGlow - smoothGlowAlpha) * (1 - Math.exp(-8 * dt));
      smoothPulseAlpha += (targetPulse - smoothPulseAlpha) * (1 - Math.exp(-9 * dt));

      const root = rootRef.current;
      if (root) {
        root.style.setProperty('--aura-glow-alpha', smoothGlowAlpha.toFixed(3));
        root.style.setProperty('--aura-pulse-alpha', smoothPulseAlpha.toFixed(3));
        root.style.setProperty(
          '--aura-edge-opacity',
          s.blueprint.edgeStyle === 'off' ? '0' : s.blueprint.edgeStyle === 'breathing_aura' ? '0.68' : '1'
        );

        if (now - lastCssColorMs > 32) {
          lastCssColorMs = now;
          const tP = hexToRgb(s.blueprint.palette.primary);
          const tS = hexToRgb(s.blueprint.palette.secondary);
          const cStep = 1 - Math.exp(-4.5 * 0.032);
          let changed = false;
          for (let c = 0; c < 3; c++) {
            const dP = tP[c] - curP[c];
            const dS = tS[c] - curS[c];
            if (Math.abs(dP) > 0.4) { curP[c] += dP * cStep; changed = true; }
            if (Math.abs(dS) > 0.4) { curS[c] += dS * cStep; changed = true; }
          }
          if (changed) {
            root.style.setProperty('--aura-primary', rgbToHex(curP));
            root.style.setProperty('--aura-secondary', rgbToHex(curS));
            root.style.setProperty('--aura-accent', s.blueprint.palette.accent);
          }
        }
      }

      const curSec = engine.getCurrentTime();
      const durSec = engine.getDuration() || s.activeSong?.duration || 0;

      if (seekFillRef.current && durSec > 0) {
        seekFillRef.current.style.width = `${Math.min(100, (curSec / durSec) * 100).toFixed(2)}%`;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = fmtTime(curSec);
      }

      if (s.lyrics.length > 0) {
        const cursor = computeLyricCursor(s.lyrics, curSec, s.lyricOffset);
        if (cursor.activeLineIdx !== s.activeLineIdx) setActiveLineIdx(cursor.activeLineIdx);
        if (cursor.activeWordIdx !== s.activeWordIdx) setActiveWordIdx(cursor.activeWordIdx);
        if (cursor.upcomingLineIdx !== s.upcomingLineIdx) setUpcomingLineIdx(cursor.upcomingLineIdx);
        if (cursor.phase !== s.lyricPhase) setLyricPhase(cursor.phase);
        setSecondsUntilNext((prev) =>
          Math.abs(prev - cursor.secondsUntilNext) > 0.35 ? cursor.secondsUntilNext : prev
        );
      }

      if (s.activeSong && now - lastCompanionMs > 60) {
        lastCompanionMs = now;
        const msg: CompanionSyncMessage = {
          type: 'STATE_SYNC',
          song: {
            id: s.activeSong.id,
            title: s.activeSong.title,
            artist: s.activeSong.artist,
            album: s.activeSong.album,
            artworkUrl: s.activeSong.artworkUrl,
            duration: durSec,
            isFullTrack: s.activeSong.isFullTrack,
            source: s.activeSong.source,
          },
          blueprint: s.blueprint,
          currentTime: curSec,
          isPlaying: engine.isPlaying(),
          currentLineText:
            s.activeLineIdx >= 0
              ? s.lyrics[s.activeLineIdx]?.text || ''
              : s.upcomingLineIdx >= 0
                ? s.lyrics[s.upcomingLineIdx]?.text || ''
                : '',
          nextLineText:
            s.activeLineIdx >= 0 && s.activeLineIdx + 1 < s.lyrics.length
              ? s.lyrics[s.activeLineIdx + 1]?.text
              : undefined,
          bass: ap.bass,
          beat: ap.beat,
          timestamp: Date.now(),
        };
        channel.postMessage(msg);
        if (now - lastSnapshotMs > 480) {
          lastSnapshotMs = now;
          try {
            localStorage.setItem(COMPANION_SNAPSHOT_KEY, JSON.stringify(msg));
          } catch {
            // ignore
          }
        }
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

  const handleRecordClip = useCallback(() => {
    if (recordingSec !== null) return;
    if (typeof MediaRecorder === 'undefined') {
      showToast('Video export is not supported in this browser.');
      return;
    }

    const w = Math.min(1280, window.innerWidth);
    const h = Math.min(720, window.innerHeight);
    const comp = document.createElement('canvas');
    comp.width = w;
    comp.height = h;
    const ctx = comp.getContext('2d');
    if (!ctx) return;

    const stream = comp.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_500_000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    let active = true;
    const pump = () => {
      if (!active) return;
      const snap = rafStateRef.current;
      const p = snap.blueprint.palette.primary;
      const secCol = snap.blueprint.palette.secondary;
      const bass = audioPulseRef.current.bass;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Subtle OLED ambient radial wash
      const rad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.58);
      rad.addColorStop(0, `${p}26`);
      rad.addColorStop(0.55, `${secCol}10`);
      rad.addColorStop(1, 'transparent');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);

      const stageCanvas = document.querySelector('canvas[data-aura-stage-canvas="true"]') as HTMLCanvasElement | null;
      if (stageCanvas) {
        ctx.drawImage(stageCanvas, 0, 0, w, h);
      } else if (snap.activeSong) {
        // Composite live DOM visual world (Apple UI, Fisheye, Kinetic, Liquid, Serif, Code) cleanly into video!
        const line = snap.activeLineIdx >= 0 ? snap.lyrics[snap.activeLineIdx] : null;
        const nextL = snap.upcomingLineIdx >= 0 ? snap.lyrics[snap.upcomingLineIdx] : null;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = '600 14px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(`${snap.activeSong.title} · ${snap.activeSong.artist}`, w * 0.5, h * 0.24);

        if (line) {
          const text = line.text;
          const fontPx = Math.min(44, Math.max(24, Math.floor((w * 0.78) / Math.max(8, text.length * 0.52))));
          ctx.font = `700 ${fontPx}px "Space Grotesk", sans-serif`;
          ctx.shadowColor = p;
          ctx.shadowBlur = 24 + bass * 20;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, w * 0.5, h * 0.5, w * 0.84);
        } else if (nextL) {
          ctx.font = '600 28px "Space Grotesk", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(nextL.text, w * 0.5, h * 0.5, w * 0.84);
        }
        ctx.restore();
      }

      const specCanvas = document.querySelector('canvas[data-aura-spectrum-canvas="true"]') as HTMLCanvasElement | null;
      if (specCanvas) {
        const sw = Math.min(w * 0.9, 900);
        ctx.drawImage(specCanvas, (w - sw) * 0.5, h - 88, sw, 84);
      }

      const gAlpha = Math.min(0.9, 0.35 + bass * 0.55);
      ctx.save();
      ctx.strokeStyle = p;
      ctx.globalAlpha = gAlpha;
      ctx.lineWidth = 6;
      ctx.shadowColor = p;
      ctx.shadowBlur = 32;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.restore();

      requestAnimationFrame(pump);
    };
    pump();

    rec.onstop = () => {
      active = false;
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aura-${(activeSong?.title || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setRecordingSec(null);
      showToast('Saved 10s Reel Clip (.webm)!');
    };

    rec.start();
    setRecordingSec(10);
    let left = 10;
    const iv = window.setInterval(() => {
      left--;
      if (left <= 0) {
        window.clearInterval(iv);
        if (rec.state !== 'inactive') rec.stop();
      } else {
        setRecordingSec(left);
      }
    }, 1000);
  }, [recordingSec, activeSong?.title, showToast]);

  const handlePromptSteer = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = promptInput.trim();
    if (!text || !activeSong) return;
    setPromptInput('');
    setActivePresetId('');

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

  const wakeChrome = useCallback(() => {
    if (pureCinema) return;
    setChromeVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (activeSong && isPlaying && !vibePanelOpen && !lyricsDrawerOpen && !searchOpen) {
      hideTimerRef.current = window.setTimeout(() => {
        setChromeVisible(false);
      }, 3600);
    }
  }, [activeSong, isPlaying, vibePanelOpen, lyricsDrawerOpen, searchOpen, pureCinema]);

  useEffect(() => {
    if (pureCinema) {
      setChromeVisible(false);
      return;
    }
    if (!activeSong || !isPlaying || vibePanelOpen || lyricsDrawerOpen || searchOpen) {
      setChromeVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    } else {
      wakeChrome();
    }
  }, [activeSong, isPlaying, vibePanelOpen, lyricsDrawerOpen, searchOpen, pureCinema, wakeChrome]);

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
      } else if (e.key === 'h' || e.key === 'H') {
        setPureCinema((v) => !v);
      } else if (e.key === 'l' || e.key === 'L') {
        setLyricsDrawerOpen((v) => !v);
      } else if (e.key === '[' && activeSong) {
        setLyricOffset((v) => {
          const next = Math.round((v - 0.5) * 10) / 10;
          saveOffset(activeSong.id, next);
          showToast(`Sync: ${next >= 0 ? `+${next}s` : `${next}s`}`);
          return next;
        });
      } else if (e.key === ']' && activeSong) {
        setLyricOffset((v) => {
          const next = Math.round((v + 0.5) * 10) / 10;
          saveOffset(activeSong.id, next);
          showToast(`Sync: ${next >= 0 ? `+${next}s` : `${next}s`}`);
          return next;
        });
      } else if (e.key === 'Escape' && pureCinema) {
        setPureCinema(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSong, toggleFullscreen, openCompanion, pureCinema, showToast]);

  const primary = blueprint.palette.primary;
  const usesCanvasWorld =
    activeSong &&
    activeSong.source !== 'live_tab' &&
    activeSong.source !== 'live_mic' &&
    (blueprint.lyricStyle === 'constellation' ||
      blueprint.lyricStyle === 'branches' ||
      blueprint.lyricStyle === 'web' ||
      blueprint.lyricStyle === 'tunnel' ||
      blueprint.lyricStyle === 'mirror' ||
      blueprint.lyricStyle === 'glitch');

  const focusPct = focusRemaining !== null ? ((1500 - focusRemaining) / 1500) * 100 : 0;

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      onMouseMove={wakeChrome}
      onClick={() => {
        if (pureCinema) setPureCinema(false);
      }}
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
      {/* Pure OLED Center Ambient Wash + Anti-Banding Film Micro-Grain + Global 120fps Click Pulse */}
      <div className="aura-oled-backdrop" />
      <div className="aura-film-grain" />
      <ClickPulseOverlay />

      {focusRemaining !== null && (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-40 bg-white/10">
          <div
            className="h-full transition-all duration-1000"
            style={{ width: `${focusPct}%`, backgroundColor: primary, boxShadow: `0 0 12px ${primary}` }}
          />
        </div>
      )}

      {!usesCanvasWorld && (
        <AmbientParticles
          mode={blueprint.particles === 'cosmos' ? 'stars' : blueprint.particles}
          color={blueprint.palette.primary}
          accent={blueprint.palette.accent}
        />
      )}

      {/* Zero-Repaint 120fps Lumn-Grade OLED Perimeter Edge Lighting */}
      {blueprint.edgeStyle !== 'off' && (
        <div className="aura-edge-frame">
          <div className="aura-edge-rim" />
          <div className="aura-edge-bloom" />
          {(blueprint.edgeStyle === 'laser_orbit' || blueprint.edgeStyle === 'violet_prism') && (
            <div className="aura-edge-laser-ring" />
          )}
          {(blueprint.edgeStyle === 'lumn_vivid' ||
            blueprint.edgeStyle === 'laser_orbit' ||
            blueprint.edgeStyle === 'violet_prism') && (
            <>
              <div className="aura-edge-orb-h aura-orb-top" />
              <div className="aura-edge-orb-h aura-orb-bottom" />
              <div className="aura-edge-orb-v aura-orb-left" />
              <div className="aura-edge-orb-v aura-orb-right" />
            </>
          )}
        </div>
      )}

      {isDragging && (
        <div
          className="fixed inset-5 z-[95] rounded-3xl border-2 border-dashed bg-black/88 flex flex-col items-center justify-center"
          style={{ borderColor: primary }}
        >
          <Upload className="w-10 h-10 mb-3" style={{ color: primary }} />
          <p className="font-display text-xl font-bold">Drop Your Audio File</p>
          <p className="text-xs text-white/55 mt-1">Auto-syncs lyrics &amp; AI edge lighting</p>
        </div>
      )}

      {toast && !pureCinema && (
        <div
          className={`fixed z-[85] oled-pill px-4 py-1.5 rounded-full text-xs text-white/90 flex items-center gap-2 pointer-events-none animate-panel-in ${
            activeSong
              ? vibePanelOpen
                ? 'top-[74px] left-5'
                : 'top-[74px] right-5'
              : vibePanelOpen
                ? 'bottom-5 left-5'
                : 'bottom-5 right-5'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />
          <span>{toast}</span>
        </div>
      )}

      {/* ====================================================================
          HOME SCREEN — REDESIGNED VERCI × LUMN LUXURY OLED SHOWCASE
          ==================================================================== */}
      {!activeSong && (
        <div className="relative w-full h-full overflow-y-auto">
          <div className="min-h-full w-full flex flex-col items-center px-5 py-4 sm:py-5">
            {/* Minimal Floating Header pinned cleanly above StudioPopover */}
            <div className="sticky top-0 z-[60] w-[min(94vw,920px)] flex items-center justify-between gap-2 pb-3 shrink-0">
              <div className="oled-pill px-2.5 sm:px-3.5 py-1.5 rounded-full text-[10px] font-mono-code tracking-[0.12em] sm:tracking-[0.2em] uppercase text-white/75 flex items-center gap-2 shrink-0 whitespace-nowrap">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: primary, boxShadow: `0 0 10px ${primary}` }}
                />
                <span>
                  Verci × Lumn<span className="hidden sm:inline"> · OLED</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-nowrap justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => void handleStartLiveAudio('tab')}
                  className="oled-pill px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] text-white/70 hover:text-emerald-400 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">YT / Spotify Tab</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartLiveAudio('mic')}
                  className="oled-pill px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] text-white/70 hover:text-sky-400 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Mic className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Mic</span>
                </button>
                <button
                  type="button"
                  onClick={openCompanion}
                  className="oled-pill px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] text-white/70 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <MonitorSmartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">2nd Screen</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVibePanelOpen((v) => !v)}
                  className="oled-pill px-3 py-1.5 rounded-full text-[11px] text-white/85 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={vibePanelOpen ? { borderColor: primary } : undefined}
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />
                  <span>Studio</span>
                </button>
              </div>
            </div>

            <div className="my-auto w-full flex flex-col items-center">
              {/* Hero Wordmark & Tagline */}
              <div className="relative z-10 flex flex-col items-center text-center mb-4">
                <div className="relative flex items-center justify-center">
                  <div
                    aria-hidden
                    className="absolute w-56 h-20 rounded-full blur-3xl opacity-40 pointer-events-none"
                    style={{ background: `linear-gradient(90deg, ${primary}, ${blueprint.palette.secondary})` }}
                  />
                  <h1 className="relative font-display text-4xl sm:text-5xl font-extrabold tracking-[0.26em] bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
                    AURA
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-white/55 max-w-lg mt-1.5 leading-relaxed">
                  Animated Apple UI &amp; constellation lyrics, dual-screen dark player, and music-synced Lumn perimeter glow.
                </p>
              </div>

              {/* Elevated SearchBar + Quick Try Chips */}
              <SearchBar
                accentColor={primary}
                externalQuery={externalSearchQuery}
                onSelectSong={(song, list) => void playSong(song, list)}
                onAddToQueue={(song) => {
                  setQueue((q) => [...q, song]);
                  showToast(`Queued "${song.title}"`);
                }}
                onUploadLocalFile={handleLocalFile}
                onDropdownToggle={setSearchOpen}
              />

              <div className="relative z-10 flex items-center justify-center gap-1.5 mt-2.5 flex-wrap max-w-[680px]">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-white/35 mr-1">
                  Try:
                </span>
                {QUICK_SEARCH_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() =>
                      setExternalSearchQuery({ query: chip.q, nonce: ++searchChipNonceRef.current })
                    }
                    className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-[11px] text-white/60 hover:text-white cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Lower Showcase: stays dimmed & beneath StudioPopover even while Search dropdown is open */}
              <div
                className={`relative z-10 w-full flex flex-col items-center transition-opacity duration-300 ${
                  vibePanelOpen ? 'opacity-20 pointer-events-none' : 'opacity-100'
                }`}
              >
                {/* Live Room Aura Preset Strip */}
                <div className="flex items-center justify-center gap-1.5 mt-3.5 flex-wrap max-w-[840px]">
                  {VIBE_PRESETS.slice(0, 7).map((p) => {
                    const active = activePresetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        title={`${p.name} — ${p.description}`}
                        className={`aura-card-sheen flex items-center gap-2 px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer border ${
                          active
                            ? 'bg-white/[0.14] border-white/35 text-white font-semibold'
                            : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.07] text-white/60 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${p.palette.primary}, ${p.palette.secondary})`,
                            boxShadow: active ? `0 0 10px ${p.palette.primary}` : 'none',
                          }}
                        />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Curated Play Instantly Bento Grid */}
                <div className="w-[min(94vw,900px)] mt-4">
                  <div className="flex items-center justify-between mb-2.5 px-1">
                    <span className="text-[11px] font-mono-code uppercase tracking-widest text-white/45">
                      {featured.some((s) => s.isFullTrack)
                        ? 'Play Instantly · Full Tracks & Synced Lyrics'
                        : 'Play Instantly · Hook Previews & Synced Lyrics'}
                    </span>
                    <span className="text-[10px] font-mono-code text-white/35">
                      Vol {Math.round((muted ? 0 : volume) * 100)}% saved
                    </span>
                  </div>

                  {featuredLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-[68px] rounded-2xl bg-white/[0.04] animate-pulse" />
                      ))}
                    </div>
                  ) : featured.length === 0 ? (
                    <div className="oled-surface rounded-2xl p-6 text-center space-y-2.5">
                      <p className="text-xs text-white/55">
                        Could not load featured tracks right now. Check your connection or drop an audio file above.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFeaturedLoading(true);
                          void loadFeaturedSongs().then((songs) => {
                            setFeatured(songs);
                            setFeaturedLoading(false);
                          });
                        }}
                        className="oled-pill px-4 py-1.5 rounded-full text-xs text-white/85 hover:text-white cursor-pointer"
                      >
                        Retry Loading Songs
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                      {featured.map((song) => (
                        <div
                          key={song.id}
                          className="group oled-surface aura-card-sheen flex items-center gap-3 p-2 rounded-2xl hover:border-white/25 hover:-translate-y-0.5 transition-all duration-300 ease-apple"
                        >
                          <button
                            type="button"
                            onClick={() => void playSong(song, featured)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div
                              className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10 transition-transform duration-300 group-hover:scale-105"
                              style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}
                            >
                              {song.artworkUrl ? (
                                <img
                                  src={song.artworkUrl}
                                  alt={song.title}
                                  loading="eager"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Music2 className="w-4 h-4 m-3.5 text-white/30" />
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white truncate">{song.title}</div>
                              <div className="text-[11px] text-white/45 truncate mt-0.5">{song.artist}</div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono-code ${
                                    song.isFullTrack
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-white/[0.06] text-white/45'
                                  }`}
                                >
                                  {song.isFullTrack ? 'FULL' : '30s'}
                                </span>
                                <span className="text-[9px] font-mono-code text-white/30">
                                  {fmtTime(song.fullDuration || song.duration)}
                                </span>
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 1-Click Endless Radio Stations */}
                  <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
                    <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/40 flex items-center gap-1 mr-1">
                      <Radio className="w-3 h-3" style={{ color: primary }} /> Endless Radio:
                    </span>
                    {RADIO_STATIONS.map((st) => (
                      <button
                        key={st.label}
                        type="button"
                        onClick={() => void handleLaunchStation(st.label, st.q)}
                        className="oled-pill aura-card-sheen px-3 py-1 rounded-full text-[11px] text-white/75 hover:text-white hover:border-white/25 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: st.accent, boxShadow: `0 0 8px ${st.accent}` }}
                        />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          PLAYING STAGE — 120FPS VISUAL WORLDS + APPLE UI + STUDIO EQ
          ==================================================================== */}
      {activeSong && (
        <>
          {/* Elevated Top Bar (sits above drawers & toast when searching!) */}
          <div
            className={`fixed top-5 inset-x-5 ${searchOpen ? 'z-[88]' : 'z-[60]'} flex items-center justify-between gap-3 transition-all duration-700 ease-apple ${
              chromeVisible && !pureCinema
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-4 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                activeSongIdRef.current = null;
                audioRef.current?.pause();
                setActiveSong(null);
                setLyricsLoading(false);
                setIsDirecting(false);
                setVibePanelOpen(false);
                setLyricsDrawerOpen(false);
                setSearchOpen(false);
                setExternalSearchQuery(undefined);
              }}
              className="oled-pill flex items-center gap-2 px-3.5 py-2 rounded-full hover:border-white/25 transition-all cursor-pointer shrink-0 group"
              title="Back to Home"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: primary, boxShadow: `0 0 12px ${primary}` }}
              />
              <span className="font-display text-xs font-bold tracking-[0.22em] text-white/90">AURA</span>
            </button>

            <SearchBar
              compact
              accentColor={primary}
              onSelectSong={(song, list) => void playSong(song, list)}
              onAddToQueue={(song) => {
                setQueue((q) => [...q, song]);
                showToast(`Added "${song.title}" to Queue`);
              }}
              onUploadLocalFile={handleLocalFile}
              onDropdownToggle={setSearchOpen}
            />

            <button
              type="button"
              onClick={() => setVibePanelOpen((v) => !v)}
              className="oled-pill px-3.5 py-2 rounded-full flex items-center gap-2 text-xs hover:border-white/25 transition-all cursor-pointer shrink-0"
              style={vibePanelOpen ? { borderColor: primary } : undefined}
            >
              {isDirecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: primary }} />
              ) : (
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                  style={{
                    background: `linear-gradient(135deg, ${primary}, ${blueprint.palette.secondary})`,
                    boxShadow: `0 0 10px ${primary}88`,
                  }}
                />
              )}
              <span className="hidden md:inline font-grotesk font-medium text-white/90 max-w-[140px] truncate">
                {blueprint.moodName}
              </span>
              <Sliders className="w-3 h-3 text-white/45" />
            </button>
          </div>

          {/* Left Interactive Lyrics Timeline + Manual Match + Tap-to-Sync + Queue Drawer */}
          <LyricsTimelineDrawer
            open={lyricsDrawerOpen && !pureCinema}
            onClose={() => setLyricsDrawerOpen(false)}
            song={activeSong}
            lyrics={lyrics}
            lyricsLoading={lyricsLoading}
            lyricMatchSource={lyricMatchSource}
            matchedTrackInfo={matchedTrackInfo}
            activeLineIdx={activeLineIdx}
            lyricOffset={lyricOffset}
            currentTime={audioRef.current?.getCurrentTime() || 0}
            accentColor={primary}
            queue={queue}
            infiniteRadio={infiniteRadio}
            radioLoading={radioLoading}
            onToggleInfiniteRadio={() => {
              const next = !infiniteRadio;
              setInfiniteRadio(next);
              saveUserSettings({ infiniteRadio: next });
              showToast(next ? 'Infinite Radio Autoplay ON' : 'Loop Queue Mode');
            }}
            onSeekToLine={(sec) => {
              audioRef.current?.seek(sec);
              setLyricOffset(0);
              saveOffset(activeSong.id, 0);
            }}
            onSyncLineHere={(lineStartSec) => {
              const cur = audioRef.current?.getCurrentTime() || 0;
              const next = Math.round((lineStartSec - cur) * 10) / 10;
              setLyricOffset(next);
              saveOffset(activeSong.id, next);
              showToast(`Locked sync (${next >= 0 ? `+${next}s` : `${next}s`})!`);
            }}
            onAdjustOffset={(d) =>
              setLyricOffset((v) => {
                const next = Math.round((v + d) * 10) / 10;
                saveOffset(activeSong.id, next);
                return next;
              })
            }
            onResetOffset={() => {
              setLyricOffset(0);
              saveOffset(activeSong.id, 0);
            }}
            onManualSearchLyrics={(q) => void handleManualSearchLyrics(q)}
            onPlayFromQueue={(s) => void playSong(s, queue)}
            onRemoveFromQueue={(id) => {
              setQueue((prev) => prev.filter((item) => item.id !== id));
            }}
          />

          {/* Subtle Cinema Corner Whisper when HUD auto-hides */}
          <div
            className={`fixed bottom-6 left-7 z-20 flex items-center gap-2.5 pointer-events-none transition-opacity duration-700 ease-apple ${
              !chromeVisible && !pureCinema ? 'opacity-65' : 'opacity-0'
            }`}
          >
            {activeSong.artworkUrl && (
              <img
                src={activeSong.artworkUrl}
                alt={activeSong.title}
                className="w-8 h-8 rounded-lg object-cover border border-white/15"
              />
            )}
            <div className="leading-tight">
              <div className="text-xs font-grotesk font-semibold text-white/90">{activeSong.title}</div>
              <div className="text-[10px] text-white/50">{activeSong.artist}</div>
            </div>
          </div>

          {/* Centerpiece: 12 Visual Worlds (Apple UI, Constellation, Fisheye, Branches, Web, etc.) */}
          <LyricsStage
            song={activeSong}
            lyrics={lyrics}
            lyricsLoading={lyricsLoading}
            activeLineIdx={activeLineIdx}
            activeWordIdx={activeWordIdx}
            upcomingLineIdx={upcomingLineIdx}
            secondsUntilNext={secondsUntilNext}
            phase={lyricPhase}
            blueprint={blueprint}
            isPlaying={isPlaying}
            visualIcons={visualIcons}
            audioPulseRef={audioPulseRef}
            onJumpToTime={(sec) => audioRef.current?.seek(sec)}
            onOpenLyricsSearch={() => setLyricsDrawerOpen(true)}
          />

          {/* Universal 120fps Mirrored Horizon Spectrum across ALL Visual Worlds */}
          <SpectrumHorizon
            visible={blueprint.showSpectrum}
            palette={blueprint.palette}
            audioPulseRef={audioPulseRef}
          />

          {/* Bottom Floating Dock + 12 Visual World Pills */}
          <div
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(96vw,960px)] transition-all duration-700 ease-apple ${
              chromeVisible && !pureCinema
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5 pointer-events-none'
            }`}
          >
            {/* 12 Visual World Pills */}
            <div className="flex items-center justify-start sm:justify-center gap-1.5 mb-2 overflow-x-auto no-scrollbar px-2">
              {LYRIC_STYLES.map((opt) => {
                const active = blueprint.lyricStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateVisualSetting({ lyricStyle: opt.id })}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-grotesk transition-all duration-300 ease-apple cursor-pointer ${
                      active ? 'text-black font-semibold' : 'oled-pill text-white/65 hover:text-white'
                    }`}
                    style={active ? { backgroundColor: primary, boxShadow: `0 0 18px ${primary}77` } : undefined}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="oled-surface rounded-2xl px-4 py-3 flex flex-col gap-2">
              {activeSong.source !== 'live_tab' && activeSong.source !== 'live_mic' && (
                <div className="flex items-center gap-3 text-[10px] font-mono-code text-white/45">
                  <span ref={timeLabelRef} className="w-8 text-right tabular-nums">
                    0:00
                  </span>
                  <div
                    data-aura-seekbar="true"
                    className="relative flex-1 h-2 rounded-full bg-white/10 cursor-pointer group flex items-center"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const dur = audioRef.current?.getDuration() || duration;
                      if (dur > 0) setSeekHover({ pct: pct * 100, sec: pct * dur });
                    }}
                    onMouseLeave={() => setSeekHover(null)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const dur = audioRef.current?.getDuration() || duration;
                      if (dur > 0) audioRef.current?.seek(pct * dur);
                    }}
                  >
                    {seekHover && (
                      <div
                        className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/20 text-[10px] text-white pointer-events-none"
                        style={{ left: `${seekHover.pct}%` }}
                      >
                        {fmtTime(seekHover.sec)}
                      </div>
                    )}
                    <div
                      ref={seekFillRef}
                      className="h-1.5 rounded-full transition-[height] group-hover:h-2"
                      style={{
                        width: '0%',
                        background: `linear-gradient(90deg, ${primary}, ${blueprint.palette.accent})`,
                      }}
                    />
                  </div>
                  <span className="w-8 tabular-nums">{fmtTime(duration)}</span>
                  {lyrics.length > 0 && (
                    <div className="hidden sm:flex items-center gap-0.5 bg-white/[0.06] rounded-md px-1.5 py-0.5 text-[9px] text-white/65">
                      <button
                        type="button"
                        onClick={() =>
                          setLyricOffset((v) => {
                            const next = Math.round((v - 0.5) * 10) / 10;
                            saveOffset(activeSong.id, next);
                            return next;
                          })
                        }
                        className="hover:text-white cursor-pointer"
                        title="Delay lyrics -0.5s ([)"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="px-1">{lyricOffset >= 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLyricOffset((v) => {
                            const next = Math.round((v + 0.5) * 10) / 10;
                            saveOffset(activeSong.id, next);
                            return next;
                          })
                        }
                        className="hover:text-white cursor-pointer"
                        title="Advance lyrics +0.5s (])"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 sm:gap-3">
                {/* Song Thumbnail + Crisp Title/Artist */}
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white truncate">{activeSong.title}</span>
                      <span className="hidden sm:inline text-[9px] font-mono-code px-1.5 py-0.5 rounded bg-white/[0.07] text-white/55 shrink-0">
                        {activeSong.isFullTrack ? 'FULL' : '30s'}
                      </span>
                    </div>
                    <div className="text-xs text-white/50 truncate">{activeSong.artist}</div>
                  </div>
                </div>

                {/* Transport */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !shuffle;
                      setShuffle(next);
                      saveUserSettings({ shuffle: next });
                      showToast(next ? 'Shuffle ON' : 'Shuffle OFF');
                    }}
                    className={`hidden md:flex p-2 rounded-xl transition-colors cursor-pointer ${
                      shuffle ? 'text-black' : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
                    }`}
                    style={shuffle ? { backgroundColor: primary } : undefined}
                    title="Shuffle Queue"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !repeatOne;
                      setRepeatOne(next);
                      saveUserSettings({ repeatOne: next });
                      showToast(next ? 'Repeat Current Track ON' : 'Repeat One OFF');
                    }}
                    className={`hidden sm:flex p-2 rounded-xl transition-colors cursor-pointer ${
                      repeatOne ? 'text-black' : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
                    }`}
                    style={repeatOne ? { backgroundColor: primary } : undefined}
                    title="Repeat Current Song"
                  >
                    <Repeat1 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void playAdjacent(-1)}
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
                    onClick={() => void playAdjacent(1)}
                    className="p-2 rounded-xl text-white/65 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                    title="Next"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !infiniteRadio;
                      setInfiniteRadio(next);
                      saveUserSettings({ infiniteRadio: next });
                      showToast(next ? '∞ Non-Stop Radio Autoplay ON' : '∞ Autoplay OFF');
                    }}
                    className={`hidden sm:flex p-2 rounded-xl transition-colors cursor-pointer ${
                      infiniteRadio ? 'text-white bg-white/[0.1]' : 'text-white/40 hover:text-white hover:bg-white/[0.08]'
                    }`}
                    style={infiniteRadio ? { color: primary } : undefined}
                    title="Infinite Radio Autoplay (Never loops same songs)"
                  >
                    <InfinityIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Utility Buttons */}
                <div className="flex items-center justify-end gap-1 flex-1">
                  <div className="hidden sm:flex items-center gap-1.5 mr-1">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-1.5 text-white/55 hover:text-white cursor-pointer"
                      title={muted ? 'Unmute' : 'Mute'}
                    >
                      {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      aria-label="Volume"
                      min={0}
                      max={1}
                      step={0.01}
                      value={muted ? 0 : volume}
                      onChange={(e) => updateVolume(parseFloat(e.target.value))}
                      className="aura-slider w-16"
                    />
                    <span className="text-[10px] font-mono-code text-white/55 tabular-nums w-7 text-right">
                      {Math.round((muted ? 0 : volume) * 100)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLyricsDrawerOpen((v) => !v)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      lyricsDrawerOpen ? 'text-black' : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white'
                    }`}
                    style={lyricsDrawerOpen ? { backgroundColor: primary } : undefined}
                    title="Lyrics Timeline, Tap-to-Sync & Queue (L)"
                  >
                    <ListMusic className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleRecordClip}
                    disabled={recordingSec !== null}
                    className={`p-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-mono-code ${
                      recordingSec !== null
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white'
                    }`}
                    title="Export 10s Reel Clip (.webm)"
                  >
                    <Video className="w-4 h-4" />
                    {recordingSec !== null && <span>{recordingSec}s</span>}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPureCinema(true);
                    }}
                    className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white cursor-pointer"
                    title="Pure Zero-UI Cinema Mode (H)"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={openCompanion}
                    className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white cursor-pointer"
                    title="Dual-Monitor Companion Screen (C)"
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

      {/* Tabbed AURA Studio Popover (accessible on BOTH Home Screen & Playing Stage!) */}
      <StudioPopover
        open={vibePanelOpen && !pureCinema}
        onClose={() => setVibePanelOpen(false)}
        blueprint={blueprint}
        activePresetId={activePresetId}
        onApplyPreset={applyPreset}
        onUpdateVisual={updateVisualSetting}
        visualIcons={visualIcons}
        onToggleVisualIcons={() => {
          const next = !visualIcons;
          setVisualIcons(next);
          saveUserSettings({ visualIcons: next });
          showToast(next ? 'Smart Lyric Icons ON' : 'Smart Lyric Icons OFF');
        }}
        lockPreset={lockPreset}
        onToggleLockPreset={() => {
          const next = !lockPreset;
          setLockPreset(next);
          saveUserSettings({ lockPreset: next });
          showToast(next ? 'Palette Locked across songs' : 'Auto-Adapting palette per song');
        }}
        hasActiveSong={Boolean(activeSong)}
        promptInput={promptInput}
        onPromptInputChange={setPromptInput}
        onPromptSteer={handlePromptSteer}
        isDirecting={isDirecting}
        eqPreset={eqPreset}
        eqBands={eqBands}
        onSelectEqPreset={(id) => {
          setEqPreset(id);
          const eq = EQ_PRESETS[id];
          const nextBands = { bass: eq.bass, mid: eq.mid, treble: eq.treble };
          setEqBands(nextBands);
          audioRef.current?.setEq(eq.bass, eq.mid, eq.treble);
          saveUserSettings({ eqPreset: id, eqBands: nextBands });
          showToast(`Audio EQ: ${eq.label}`);
        }}
        onChangeEqBand={(band, val) => {
          const next = { ...eqBands, [band]: val };
          setEqBands(next);
          setEqPreset('custom');
          audioRef.current?.setEq(next.bass, next.mid, next.treble);
          saveUserSettings({ eqPreset: 'custom', eqBands: next });
        }}
        volume={volume}
        muted={muted}
        onChangeVolume={updateVolume}
        onToggleMute={toggleMute}
        focusRemaining={focusRemaining}
        onToggleFocus={() => setFocusRemaining((r) => (r === null ? 25 * 60 : null))}
        onStartLiveTab={() => void handleStartLiveAudio('tab')}
        keyDraft={keyDraft}
        onKeyDraftChange={setKeyDraft}
        onSaveKey={() => {
          const clean = keyDraft.trim();
          setGeminiKey(clean);
          if (clean) localStorage.setItem('aura_gemini_key', clean);
          else localStorage.removeItem('aura_gemini_key');
          setKeySaved(true);
          setTimeout(() => setKeySaved(false), 1500);
        }}
        keySaved={keySaved}
      />
    </div>
  );
};

export default App;
