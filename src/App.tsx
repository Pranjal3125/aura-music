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
  EyeOff,
  ListMusic,
  Sliders,
  Timer,
  Video,
  MonitorPlay,
  Mic,
  Minus,
  Plus,
  Infinity as InfinityIcon,
  Repeat1,
  Radio,
} from 'lucide-react';
import {
  AmbientParticleId,
  CompanionSyncMessage,
  EdgeStyleId,
  EqPresetId,
  LyricLine,
  LyricStyleId,
  SongItem,
  VibeBlueprint,
} from './types';
import { EQ_PRESETS, VIBE_PRESETS } from './data/presets';
import {
  extractPaletteFromArtwork,
  fetchInfiniteRadioSongs,
  fetchSyncedLyricsForSong,
  launchRadioStation,
  loadFeaturedSongs,
  makeSongKey,
  parseLocalFileName,
} from './services/musicApi';
import { loadUserSettings, saveUserSettings } from './services/settingsStorage';
import { LightAudioEngine } from './engine/lightAudioEngine';
import { directSongAutonomously, directSongWithGemini, presetToBlueprint } from './engine/vibeBrain';
import { SearchBar } from './components/SearchBar';
import { LyricsStage } from './components/LyricsStage';
import { AmbientParticles } from './components/AmbientParticles';
import { CompanionScreen } from './components/CompanionScreen';
import { LyricsTimelineDrawer } from './components/LyricsTimelineDrawer';
import { SpectrumHorizon } from './components/SpectrumHorizon';
import { ClickPulseOverlay } from './components/ClickPulseOverlay';

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
  if (isNaN(n)) return [255, 30, 66];
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

const DEFAULT_BLUEPRINT: VibeBlueprint = presetToBlueprint(VIBE_PRESETS[0]);

const LYRIC_STYLES: Array<{ id: LyricStyleId; label: string }> = [
  { id: 'constellation', label: 'Constellation' },
  { id: 'branches', label: 'Branches' },
  { id: 'web', label: 'Web' },
  { id: 'tunnel', label: 'Hyperwarp' },
  { id: 'mirror', label: 'Prism' },
  { id: 'glitch', label: 'Cyber' },
  { id: 'kinetic', label: 'Kinetic' },
  { id: 'liquid', label: 'Liquid' },
  { id: 'editorial', label: 'Serif' },
  { id: 'codestyle', label: 'Code' },
];

const EDGE_STYLES: Array<{ id: EdgeStyleId; label: string }> = [
  { id: 'lumn_vivid', label: 'Lumn Vivid' },
  { id: 'laser_orbit', label: 'Orbit' },
  { id: 'breathing_aura', label: 'Soft' },
  { id: 'off', label: 'Off' },
];

const PARTICLE_STYLES: Array<{ id: AmbientParticleId; label: string }> = [
  { id: 'cosmos', label: 'Stars' },
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

const AuraStage: React.FC = () => {
  const [initialPrefs] = useState(() => loadUserSettings());
  const [featured, setFeatured] = useState<SongItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const [queue, setQueue] = useState<SongItem[]>([]);
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [infiniteRadio, setInfiniteRadio] = useState<boolean>(() => initialPrefs.infiniteRadio ?? true);
  const [repeatOne, setRepeatOne] = useState<boolean>(() => initialPrefs.repeatOne ?? false);
  const [radioLoading, setRadioLoading] = useState(false);
  const playedKeysRef = useRef<Set<string>>(new Set());
  const radioFetchingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(() => initialPrefs.volume ?? 0.85);
  const [muted, setMuted] = useState<boolean>(() => initialPrefs.muted ?? false);
  const [eqPreset, setEqPreset] = useState<EqPresetId | 'custom'>(() => initialPrefs.eqPreset ?? 'flat');
  const [eqBands, setEqBands] = useState(() => initialPrefs.eqBands ?? { bass: 0, mid: 0, treble: 0 });
  const [studioTab, setStudioTab] = useState<'presets' | 'visuals' | 'audio'>('presets');

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [lyricOffset, setLyricOffset] = useState(0);

  const [blueprint, setBlueprint] = useState<VibeBlueprint>(() => buildInitialBlueprint(initialPrefs));
  const [activePresetId, setActivePresetId] = useState<string>(() => initialPrefs.presetId ?? 'starboy-noir');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keyDraft, setKeyDraft] = useState(() => localStorage.getItem('aura_gemini_key') || '');
  const [keySaved, setKeySaved] = useState(false);
  const [isDirecting, setIsDirecting] = useState(false);
  const [vibePanelOpen, setVibePanelOpen] = useState(false);
  const [lyricsDrawerOpen, setLyricsDrawerOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Ambient Focus 25m Timer
  const [focusRemaining, setFocusRemaining] = useState<number | null>(null);

  // 1-Click 10s Reel Clip Recorder
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

  const rafStateRef = useRef({
    lyrics,
    activeLineIdx,
    activeWordIdx,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
    queue,
    featured,
    infiniteRadio,
    repeatOne,
  });
  rafStateRef.current = {
    lyrics,
    activeLineIdx,
    activeWordIdx,
    lyricOffset,
    activeSong,
    blueprint,
    isPlaying,
    queue,
    featured,
    infiniteRadio,
    repeatOne,
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
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

  // Focus 25m Timer interval
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
    audioRef.current?.setVolume(next ? 0 : volume);
    saveUserSettings({ muted: next });
  }, [muted, volume]);

  const updateVisualSetting = useCallback(
    (patch: Partial<Pick<VibeBlueprint, 'lyricStyle' | 'edgeStyle' | 'particles' | 'showSpectrum'>>) => {
      setBlueprint((b) => ({ ...b, ...patch }));
      saveUserSettings(patch);
    },
    []
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = VIBE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
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
      if (radioFetchingRef.current) return [];
      radioFetchingRef.current = true;
      setRadioLoading(true);
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
            // Keep history window sleek (max ~45 recent/upcoming tracks in memory)
            return [...prev.slice(-30), ...uniqueNew];
          });
        }
        return fresh;
      } finally {
        radioFetchingRef.current = false;
        setRadioLoading(false);
      }
    },
    []
  );

  const playSong = useCallback(
    async (song: SongItem, newQueue?: SongItem[]) => {
      playedKeysRef.current.add(song.id);
      playedKeysRef.current.add(makeSongKey(song.title, song.artist));
      if (playedKeysRef.current.size > 160) {
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
      setActiveLineIdx(-1);
      setActiveWordIdx(-1);
      setLyricsLoading(true);
      setLyricOffset(0);
      setActivePresetId('');

      const engine = audioRef.current;
      if (engine) {
        try {
          await engine.loadAndPlay(song.audioUrl);
        } catch {
          showToast('Click Play to start audio.');
        }
      }

      // If Infinite Radio is ON and <= 2 songs remain ahead in Queue, auto-fetch fresh tracks!
      if (rafStateRef.current.infiniteRadio) {
        const curIdx = activeQueue.findIndex((s) => s.id === song.id);
        const remaining = curIdx < 0 ? 0 : activeQueue.length - 1 - curIdx;
        if (remaining <= 2) {
          void replenishRadio(song, activeQueue);
        }
      }

      const [artworkPalette, fetchedLyrics] = await Promise.all([
        extractPaletteFromArtwork(song.artworkUrl),
        fetchSyncedLyricsForSong(song),
      ]);

      setLyrics(fetchedLyrics);
      setLyricsLoading(false);

      const saved = loadSavedOffset(song.id);
      if (saved !== null) {
        setLyricOffset(saved);
      } else if (!song.isFullTrack && fetchedLyrics.length > 0) {
        setLyricOffset(0);
        setLyricsDrawerOpen(true);
        showToast('30s Preview — hover the sung line & click Sync to lock!');
      }

      const savedPrefs = loadUserSettings();
      const applySavedVisualPrefs = (bp: VibeBlueprint): VibeBlueprint => ({
        ...bp,
        lyricStyle: savedPrefs.lyricStyle ?? bp.lyricStyle,
        edgeStyle: savedPrefs.edgeStyle ?? bp.edgeStyle,
        particles: savedPrefs.particles ?? bp.particles,
        showSpectrum: savedPrefs.showSpectrum ?? bp.showSpectrum,
      });

      const autoBp = directSongAutonomously({
        song,
        lyrics: fetchedLyrics,
        artworkPalette,
      });
      setBlueprint(applySavedVisualPrefs(autoBp));

      const key = geminiKey.trim();
      if (key) {
        setIsDirecting(true);
        try {
          const gemBp = await directSongWithGemini({
            apiKey: key,
            song,
            lyrics: fetchedLyrics,
          });
          setBlueprint(applySavedVisualPrefs(gemBp));
        } catch {
          // keep seamless auto AI
        } finally {
          setIsDirecting(false);
        }
      }
    },
    [queue, geminiKey, showToast, replenishRadio]
  );

  const playAdjacent = useCallback(
    async (dir: 1 | -1) => {
      const list = queue.length > 0 ? queue : featured;
      if (list.length === 0 || !activeSong) return;
      const idx = list.findIndex((s) => s.id === activeSong.id);

      if (dir === 1 && idx === list.length - 1 && infiniteRadio) {
        const fresh = await replenishRadio(activeSong, list);
        if (fresh.length > 0) {
          void playSong(fresh[0]);
          return;
        }
      }

      const nextIdx = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
      void playSong(list[nextIdx], list);
    },
    [queue, featured, activeSong, infiniteRadio, replenishRadio, playSong]
  );

  const playAdjacentRef = useRef(playAdjacent);
  playAdjacentRef.current = playAdjacent;

  const handleLaunchStation = useCallback(
    async (stationTitle: string, query: string) => {
      showToast(`Tuning ${stationTitle} Radio...`);
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

  const playSongRef = useRef(playSong);
  playSongRef.current = playSong;

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
        setActiveSong(liveItem);
        setLyrics([]);
        setIsPlaying(true);
        setBlueprint((b) => ({ ...b, showSpectrum: true }));
        showToast(kind === 'tab' ? 'Live Tab Audio connected!' : 'Room Mic active!');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Capture cancelled.');
      }
    },
    [showToast]
  );

  // Unified 120fps rAF loop
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
      if (st.infiniteRadio || (st.queue.length > 1)) {
        void playAdjacentRef.current(1);
      }
    };

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;

    const bootBp = buildInitialBlueprint(bootPrefs);
    const curP: [number, number, number] = hexToRgb(bootBp.palette.primary);
    const curS: [number, number, number] = hexToRgb(bootBp.palette.secondary);
    let smoothGlowAlpha = 0.45;
    let smoothPulseAlpha = 0.2;

    let prevNow = performance.now();
    let lastCompanionMs = 0;
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
        // +0.14s visual anticipation keeps star & filament landing cleanly on vocal syllable!
        const lyricTime = curSec + s.lyricOffset + 0.14;
        let lineIdx = -1;
        for (let i = s.lyrics.length - 1; i >= 0; i--) {
          if (lyricTime >= s.lyrics[i].start) {
            if (lyricTime <= s.lyrics[i].end + 0.45) {
              lineIdx = i;
            }
            break;
          }
        }

        let wordIdx = -1;
        if (lineIdx >= 0) {
          const words = s.lyrics[lineIdx].words;
          for (let j = words.length - 1; j >= 0; j--) {
            if (lyricTime >= words[j].start) {
              wordIdx = j;
              break;
            }
          }
          if (wordIdx === -1 && words.length > 0) wordIdx = 0;
        }

        if (lineIdx !== s.activeLineIdx) setActiveLineIdx(lineIdx);
        if (wordIdx !== s.activeWordIdx) setActiveWordIdx(wordIdx);
      }

      if (s.activeSong && now - lastCompanionMs > 60) {
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
          bass: ap.bass,
          beat: ap.beat,
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

  // Record 10s Reel Clip directly from live Canvas + Edge Glow!
  const handleRecordClip = useCallback(() => {
    if (recordingSec !== null) return;
    const canvasEl = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvasEl) {
      showToast('Switch to Constellation, Branches, or Web mode to record a 10s clip.');
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
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      const curCanvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (curCanvas) ctx.drawImage(curCanvas, 0, 0, w, h);

      // Composite matching Lumn neon edge rim onto recording
      const p = rafStateRef.current.blueprint.palette.primary;
      const gAlpha = Math.min(0.9, 0.35 + audioPulseRef.current.bass * 0.55);
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
  }, [activeSong, toggleFullscreen, openCompanion, pureCinema]);

  const primary = blueprint.palette.primary;
  const usesCanvasStars =
    activeSong &&
    lyrics.length > 0 &&
    activeLineIdx >= 0 &&
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

      {/* 25-Min Focus Mode Ultra-Minimal Top Bezel Progress Line */}
      {focusRemaining !== null && (
        <div className="fixed top-0 left-0 right-0 h-[2px] z-40 bg-white/10">
          <div
            className="h-full transition-all duration-1000"
            style={{ width: `${focusPct}%`, backgroundColor: primary, boxShadow: `0 0 12px ${primary}` }}
          />
        </div>
      )}

      {!usesCanvasStars && (
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
          {(blueprint.edgeStyle === 'lumn_vivid' || blueprint.edgeStyle === 'laser_orbit') && (
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
          className="fixed inset-5 z-50 rounded-3xl border-2 border-dashed bg-black/88 flex flex-col items-center justify-center"
          style={{ borderColor: primary }}
        >
          <Upload className="w-10 h-10 mb-3" style={{ color: primary }} />
          <p className="font-display text-xl font-bold">Drop Your Audio File</p>
          <p className="text-xs text-white/55 mt-1">Auto-syncs lyrics &amp; AI edge lighting</p>
        </div>
      )}

      {toast && !pureCinema && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 oled-pill px-4 py-1.5 rounded-full text-xs text-white/90 flex items-center gap-2 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />
          <span>{toast}</span>
        </div>
      )}

      {/* ====================================================================
          HOME SCREEN — LUXURY EDITORIAL SHOWCASE + LIVE VIBE SWATCHES
          ==================================================================== */}
      {!activeSong && (
        <div className="relative z-20 w-full h-full flex flex-col items-center justify-center px-5 py-8 overflow-y-auto">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="oled-pill px-3 py-1 rounded-full text-[10px] font-mono-code tracking-[0.2em] uppercase text-white/60 mb-3 flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: primary, boxShadow: `0 0 8px ${primary}` }}
              />
              OLED Stage · Synced Lyrics · Lumn Glow
            </div>

            <div className="relative flex items-center justify-center">
              <div
                aria-hidden
                className="absolute w-44 h-16 rounded-full blur-3xl opacity-35 pointer-events-none"
                style={{ background: `linear-gradient(90deg, ${primary}, ${blueprint.palette.secondary})` }}
              />
              <h1 className="relative font-display text-4xl sm:text-5xl font-extrabold tracking-[0.26em] bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
                AURA
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-white/50 max-w-md mt-2 leading-relaxed">
              Search any song — gliding constellation lyrics, neural branches &amp; music-synced OLED edge lighting.
            </p>
          </div>

          <SearchBar
            accentColor={primary}
            onSelectSong={(song, list) => void playSong(song, list)}
            onAddToQueue={(song) => {
              setQueue((q) => [...q, song]);
              showToast(`Queued "${song.title}"`);
            }}
            onUploadLocalFile={handleLocalFile}
            onDropdownToggle={setSearchOpen}
          />

          {/* Live Room Vibe Swatch Strip (Preview OLED Edge Glow on Home Screen!) */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            {VIBE_PRESETS.slice(0, 6).map((p) => {
              const active = activePresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  title={`${p.name} — ${p.description}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-all cursor-pointer border ${
                    active
                      ? 'bg-white/[0.12] border-white/30 text-white font-medium'
                      : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] text-white/55 hover:text-white'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${p.palette.primary}, ${p.palette.secondary})`,
                      boxShadow: active ? `0 0 8px ${p.palette.primary}` : 'none',
                    }}
                  />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Curated Play Instantly Grid */}
          <div className="w-[min(92vw,820px)] mt-7">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-mono-code uppercase tracking-widest text-white/45">
                Play Instantly · Full 320K + Synced
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleStartLiveAudio('tab')}
                  className="text-[11px] text-white/50 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <MonitorPlay className="w-3 h-3" /> YT/Spotify Tab
                </button>
                <span className="text-white/20">·</span>
                <button
                  type="button"
                  onClick={() => void handleStartLiveAudio('mic')}
                  className="text-[11px] text-white/50 hover:text-sky-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Mic className="w-3 h-3" /> Mic
                </button>
                <span className="text-white/20">·</span>
                <button
                  type="button"
                  onClick={openCompanion}
                  className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <MonitorSmartphone className="w-3 h-3" /> Companion
                </button>
              </div>
            </div>

            {featuredLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[70px] rounded-2xl bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {featured.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => void playSong(song, [song])}
                    className="group oled-surface aura-card-sheen flex items-center gap-3 p-2.5 rounded-2xl hover:border-white/25 hover:-translate-y-0.5 transition-all duration-300 ease-apple text-left cursor-pointer"
                  >
                    <div
                      className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10 transition-transform duration-300 group-hover:scale-105"
                      style={{ boxShadow: `0 6px 18px rgba(0,0,0,0.6)` }}
                    >
                      {song.artworkUrl ? (
                        <img
                          src={song.artworkUrl}
                          alt={song.title}
                          loading="eager"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music2 className="w-4 h-4 m-auto text-white/30" />
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate">{song.title}</div>
                      <div className="text-[11px] text-white/45 truncate mt-0.5">{song.artist}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 1-Click Endless Radio Stations */}
            <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
              <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/35 flex items-center gap-1 mr-1">
                <Radio className="w-3 h-3" style={{ color: primary }} /> Endless Radio:
              </span>
              {[
                { label: 'Trending Hindi ∞', q: 'Trending Hindi' },
                { label: 'Romantic Soul ∞', q: 'Bollywood Romantic' },
                { label: 'Indie Chill ∞', q: 'Indie India' },
                { label: 'Punjabi Hits ∞', q: 'Punjabi Hits' },
              ].map((st) => (
                <button
                  key={st.label}
                  type="button"
                  onClick={() => void handleLaunchStation(st.label, st.q)}
                  className="oled-pill px-3 py-1 rounded-full text-[11px] text-white/70 hover:text-white hover:border-white/25 transition-all cursor-pointer"
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          PLAYING STAGE — 120FPS VISUAL WORLDS + PRESETS + STUDIO EQ
          ==================================================================== */}
      {activeSong && (
        <>
          {/* Top Bar */}
          <div
            className={`fixed top-5 inset-x-5 z-30 flex items-center justify-between gap-3 transition-all duration-700 ease-apple ${
              chromeVisible && !pureCinema
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-4 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setActiveSong(null);
                setVibePanelOpen(false);
                setLyricsDrawerOpen(false);
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

          {/* Tabbed Zero-Scroll Pro Studio Popover */}
          {vibePanelOpen && !pureCinema && (
            <div className="fixed top-20 bottom-36 right-5 z-50 w-[min(92vw,396px)] oled-surface rounded-3xl flex flex-col overflow-hidden animate-panel-in">
              {/* Studio Header + Segmented Tabs */}
              <div className="p-4 pb-3 border-b border-white/[0.07] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                      {blueprint.source === 'gemini_4' ? 'GEMINI 4 DIRECTED' : 'AURA STUDIO'}
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

                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {(
                    [
                      { id: 'presets', label: 'Presets & AI' },
                      { id: 'visuals', label: 'Visuals' },
                      { id: 'audio', label: 'Audio & EQ' },
                    ] as const
                  ).map((t) => {
                    const act = studioTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStudioTab(t.id)}
                        className={`py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          act ? 'text-black font-semibold shadow' : 'text-white/60 hover:text-white'
                        }`}
                        style={act ? { backgroundColor: primary } : undefined}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {studioTab === 'presets' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                          {VIBE_PRESETS.length} Signature Presets
                        </span>
                        <span className="text-[10px] text-white/35">1-Click Mood</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {VIBE_PRESETS.map((p) => {
                          const active = activePresetId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyPreset(p.id)}
                              className={`aura-card-sheen aura-card-press p-2 rounded-2xl text-left border transition-all cursor-pointer flex items-center gap-2.5 ${
                                active
                                  ? 'bg-white/[0.12] border-white/35'
                                  : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06]'
                              }`}
                            >
                              <span
                                className="w-5 h-5 rounded-full shrink-0 border border-white/25"
                                style={{
                                  background: `linear-gradient(135deg, ${p.palette.primary}, ${p.palette.secondary})`,
                                  boxShadow: active ? `0 0 12px ${p.palette.primary}` : 'none',
                                }}
                              />
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-white truncate">{p.name}</div>
                                <div className="text-[9px] font-mono-code text-white/40 truncate">{p.tag}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <form onSubmit={handlePromptSteer} className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                      <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                        Steer AI Vibe Prompt
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.1] px-2.5 py-1.5">
                          <Wand2 className="w-3.5 h-3.5 text-white/45 shrink-0" />
                          <input
                            type="text"
                            value={promptInput}
                            onChange={(e) => setPromptInput(e.target.value)}
                            placeholder='e.g. "hyperwarp" or "cyber samurai"'
                            className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/35 outline-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!promptInput.trim() || isDirecting}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black disabled:opacity-40 cursor-pointer shrink-0"
                          style={{ backgroundColor: primary }}
                        >
                          Morph
                        </button>
                      </div>
                    </form>
                  </>
                )}

                {studioTab === 'visuals' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                        Visual World ({LYRIC_STYLES.length})
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {LYRIC_STYLES.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateVisualSetting({ lyricStyle: opt.id })}
                            className={`py-1.5 px-2 rounded-xl text-xs transition-colors cursor-pointer ${
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

                    <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                      <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                        Edge Lighting
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {EDGE_STYLES.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateVisualSetting({ edgeStyle: opt.id })}
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

                    <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                          Atmosphere &amp; Spectrum
                        </span>
                        <button
                          type="button"
                          onClick={() => updateVisualSetting({ showSpectrum: !blueprint.showSpectrum })}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono-code cursor-pointer transition-colors ${
                            blueprint.showSpectrum ? 'text-black font-semibold' : 'bg-white/[0.07] text-white/60'
                          }`}
                          style={blueprint.showSpectrum ? { backgroundColor: primary } : undefined}
                        >
                          Spectrum {blueprint.showSpectrum ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PARTICLE_STYLES.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateVisualSetting({ particles: opt.id })}
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
                  </div>
                )}

                {studioTab === 'audio' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                        Studio Audio EQ Presets
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(EQ_PRESETS) as EqPresetId[]).map((id) => {
                          const active = eqPreset === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setEqPreset(id);
                                const eq = EQ_PRESETS[id];
                                const nextBands = { bass: eq.bass, mid: eq.mid, treble: eq.treble };
                                setEqBands(nextBands);
                                audioRef.current?.setEq(eq.bass, eq.mid, eq.treble);
                                saveUserSettings({ eqPreset: id, eqBands: nextBands });
                                showToast(`Audio EQ: ${eq.label}`);
                              }}
                              className={`px-2.5 py-1 rounded-xl text-[11px] transition-colors cursor-pointer ${
                                active ? 'text-black font-semibold' : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                              }`}
                              style={active ? { backgroundColor: primary } : undefined}
                            >
                              {EQ_PRESETS[id].label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Real-time 3-Band EQ Sliders */}
                      <div className="space-y-2 pt-2">
                        {(
                          [
                            { key: 'bass', label: 'Sub Bass (95Hz)' },
                            { key: 'mid', label: 'Vocal Presence (1.8k)' },
                            { key: 'treble', label: 'Treble Air (8kHz)' },
                          ] as const
                        ).map((band) => (
                          <div key={band.key} className="flex items-center gap-3 text-[11px]">
                            <span className="w-32 text-white/60">{band.label}</span>
                            <input
                              type="range"
                              min={-8}
                              max={10}
                              step={0.5}
                              value={eqBands[band.key]}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const next = { ...eqBands, [band.key]: val };
                                setEqBands(next);
                                setEqPreset('custom');
                                audioRef.current?.setEq(next.bass, next.mid, next.treble);
                                saveUserSettings({ eqPreset: 'custom', eqBands: next });
                              }}
                              className="aura-slider flex-1"
                            />
                            <span className="w-10 text-right font-mono-code text-white/70">
                              {eqBands[band.key] > 0 ? `+${eqBands[band.key]}` : eqBands[band.key]}dB
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Persistent Master Volume Control */}
                      <div className="flex items-center gap-3 text-[11px] pt-2 border-t border-white/[0.07]">
                        <button
                          type="button"
                          onClick={toggleMute}
                          className="flex items-center gap-1.5 w-32 text-white/70 hover:text-white cursor-pointer text-left"
                          title="Mute / Unmute"
                        >
                          {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          <span>Master Volume</span>
                        </button>
                        <input
                          type="range"
                          aria-label="Master Volume"
                          min={0}
                          max={1}
                          step={0.01}
                          value={muted ? 0 : volume}
                          onChange={(e) => updateVolume(parseFloat(e.target.value))}
                          className="aura-slider flex-1"
                        />
                        <span className="w-10 text-right font-mono-code text-white/80 tabular-nums">
                          {Math.round((muted ? 0 : volume) * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.07]">
                      <button
                        type="button"
                        onClick={() => setFocusRemaining((r) => (r === null ? 25 * 60 : null))}
                        className="py-2 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Timer className="w-3.5 h-3.5" style={{ color: primary }} />
                        <span>{focusRemaining !== null ? `Focus ${fmtTime(focusRemaining)}` : '25m Focus'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStartLiveAudio('tab')}
                        className="py-2 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MonitorPlay className="w-3.5 h-3.5 text-emerald-400" />
                        <span>YT / Spotify Tab</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-white/[0.07] space-y-2">
                      <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center justify-between">
                        <span>Gemini 4 Vision AI (Optional)</span>
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
              </div>
            </div>
          )}

          {/* Left Interactive Lyrics Timeline + Tap-to-Sync + Queue Drawer */}
          <LyricsTimelineDrawer
            open={lyricsDrawerOpen && !pureCinema}
            onClose={() => setLyricsDrawerOpen(false)}
            song={activeSong}
            lyrics={lyrics}
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
            onPlayFromQueue={(s) => void playSong(s, queue)}
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

          {/* Centerpiece: 7 Visual Worlds */}
          <LyricsStage
            song={activeSong}
            lyrics={lyrics}
            lyricsLoading={lyricsLoading}
            activeLineIdx={activeLineIdx}
            activeWordIdx={activeWordIdx}
            blueprint={blueprint}
            isPlaying={isPlaying}
            audioPulseRef={audioPulseRef}
          />

          {/* Universal 120fps Mirrored Horizon Spectrum across ALL 7 Visual Worlds */}
          <SpectrumHorizon
            visible={blueprint.showSpectrum}
            palette={blueprint.palette}
            audioPulseRef={audioPulseRef}
          />

          {/* Bottom Floating Dock + 10 Visual World Pills */}
          <div
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(95vw,920px)] transition-all duration-700 ease-apple ${
              chromeVisible && !pureCinema
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5 pointer-events-none'
            }`}
          >
            {/* 10 Visual World Pills */}
            <div className="flex items-center justify-center gap-1.5 mb-2 flex-wrap">
              {LYRIC_STYLES.map((opt) => {
                const active = blueprint.lyricStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateVisualSetting({ lyricStyle: opt.id })}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-grotesk transition-all duration-300 ease-apple cursor-pointer ${
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
    </div>
  );
};

export default App;
