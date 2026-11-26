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
  detectChorusStartTime,
  extractPaletteFromArtwork,
  fetchSyncedLyricsForSong,
  loadFeaturedSongs,
  parseLocalFileName,
} from './services/musicApi';
import { LightAudioEngine } from './engine/lightAudioEngine';
import { directSongAutonomously, directSongWithGemini, presetToBlueprint } from './engine/vibeBrain';
import { SearchBar } from './components/SearchBar';
import { LyricsStage } from './components/LyricsStage';
import { AmbientParticles } from './components/AmbientParticles';
import { CompanionScreen } from './components/CompanionScreen';
import { LyricsTimelineDrawer } from './components/LyricsTimelineDrawer';
import { SpectrumHorizon } from './components/SpectrumHorizon';

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

const DEFAULT_BLUEPRINT: VibeBlueprint = presetToBlueprint(VIBE_PRESETS[0]);

const LYRIC_STYLES: Array<{ id: LyricStyleId; label: string }> = [
  { id: 'constellation', label: 'Constellation' },
  { id: 'branches', label: 'Branches' },
  { id: 'web', label: 'Web' },
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

const AuraStage: React.FC = () => {
  const [featured, setFeatured] = useState<SongItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const [queue, setQueue] = useState<SongItem[]>([]);
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [eqPreset, setEqPreset] = useState<EqPresetId>('flat');

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [lyricOffset, setLyricOffset] = useState(0);

  const [blueprint, setBlueprint] = useState<VibeBlueprint>(DEFAULT_BLUEPRINT);
  const [activePresetId, setActivePresetId] = useState<string>('starboy-noir');
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

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = VIBE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setActivePresetId(preset.id);
      setBlueprint(presetToBlueprint(preset));
      showToast(`Preset: ${preset.name}`);
    },
    [showToast]
  );

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
      setActivePresetId('');

      const engine = audioRef.current;
      if (engine) {
        try {
          await engine.loadAndPlay(song.audioUrl);
        } catch {
          showToast('Click Play to start audio.');
        }
      }

      const [artworkPalette, fetchedLyrics] = await Promise.all([
        extractPaletteFromArtwork(song.artworkUrl),
        fetchSyncedLyricsForSong(song),
      ]);

      setLyrics(fetchedLyrics);
      setLyricsLoading(false);

      // For 30s Apple Previews, align onto the most repeated chorus hook timestamp!
      if (!song.isFullTrack && fetchedLyrics.length > 6) {
        const chorusStart = detectChorusStartTime(fetchedLyrics);
        setLyricOffset(chorusStart);
      }

      const autoBp = directSongAutonomously({
        song,
        lyrics: fetchedLyrics,
        artworkPalette,
      });
      setBlueprint(autoBp);

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
          // keep seamless auto AI
        } finally {
          setIsDirecting(false);
        }
      }
    },
    [featured, queue.length, geminiKey, showToast]
  );

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
    const engine = new LightAudioEngine();
    audioRef.current = engine;
    engine.onPlayStateChange = (playing) => setIsPlaying(playing);
    engine.onDurationChange = (dur) => setDuration(dur);
    engine.onEnded = () => {
      const st = rafStateRef.current;
      const list = st.queue.length > 0 ? st.queue : st.featured;
      if (st.activeSong && st.activeSong.isFullTrack && list.length > 1) {
        const idx = list.findIndex((s) => s.id === st.activeSong!.id);
        const nextIdx = idx < 0 ? 0 : (idx + 1) % list.length;
        void playSongRef.current(list[nextIdx], list);
      }
    };

    const channel = new BroadcastChannel('aura-vibe-sync');
    channelRef.current = channel;

    const curP: [number, number, number] = hexToRgb(DEFAULT_BLUEPRINT.palette.primary);
    const curS: [number, number, number] = hexToRgb(DEFAULT_BLUEPRINT.palette.secondary);
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
        const lyricTime = curSec + s.lyricOffset;
        let lineIdx = -1;
        for (let i = 0; i < s.lyrics.length; i++) {
          if (lyricTime >= s.lyrics[i].start - 0.1 && lyricTime <= s.lyrics[i].end + 0.22) {
            lineIdx = i;
            break;
          }
        }
        if (lineIdx === -1) {
          for (let i = s.lyrics.length - 1; i >= 0; i--) {
            if (lyricTime >= s.lyrics[i].start) {
              if (lyricTime - s.lyrics[i].end < 2.0) lineIdx = i;
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
    (blueprint.lyricStyle === 'constellation' || blueprint.lyricStyle === 'branches' || blueprint.lyricStyle === 'web');

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
      {/* Pure OLED Center Ambient Wash */}
      <div className="aura-oled-backdrop" />

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
          HOME SCREEN — SPOTLIGHT SONG SEARCH + LIVE TAB/MIC + PLAY INSTANTLY
          ==================================================================== */}
      {!activeSong && (
        <div className="relative z-20 w-full h-full flex flex-col items-center justify-center px-5 py-10 overflow-y-auto">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex items-center gap-2.5 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: primary, boxShadow: `0 0 16px ${primary}` }}
              />
              <span className="font-display text-2xl sm:text-3xl font-bold tracking-[0.28em]">AURA</span>
            </div>
            <p className="text-xs sm:text-sm text-white/50 max-w-md">
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

          {/* Quick Source Pills: YT / Spotify Tab Capture, Room Mic, Tagde Presets */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => void handleStartLiveAudio('tab')}
              className="oled-pill px-3.5 py-1.5 rounded-full text-xs text-white/75 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <MonitorPlay className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sync YT / Spotify Tab</span>
            </button>
            <button
              type="button"
              onClick={() => void handleStartLiveAudio('mic')}
              className="oled-pill px-3.5 py-1.5 rounded-full text-xs text-white/75 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-sky-400" />
              <span>Room Mic Mode</span>
            </button>
            <button
              type="button"
              onClick={openCompanion}
              className="oled-pill px-3.5 py-1.5 rounded-full text-xs text-white/75 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <MonitorSmartphone className="w-3.5 h-3.5" style={{ color: primary }} />
              <span>Dual-Screen Companion</span>
            </button>
          </div>

          {/* Curated Play Instantly Grid */}
          <div className="w-[min(92vw,780px)] mt-8">
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
                    className="group flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.035] hover:bg-white/[0.09] border border-white/[0.07] transition-all duration-300 ease-apple text-left cursor-pointer"
                  >
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
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
              className="oled-pill px-3.5 py-2 rounded-full flex items-center gap-2 text-xs hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              style={vibePanelOpen ? { borderColor: primary } : undefined}
            >
              {isDirecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: primary }} />
              ) : (
                <Sliders className="w-3.5 h-3.5" style={{ color: primary }} />
              )}
              <span className="hidden md:inline font-grotesk font-medium text-white/90 max-w-[140px] truncate">
                {blueprint.moodName}
              </span>
            </button>
          </div>

          {/* Right Pro Studio Drawer: 10 Tagde Presets + AI Steer + EQ + Visuals + Focus + Gemini */}
          {vibePanelOpen && !pureCinema && (
            <div className="fixed top-20 bottom-36 right-5 z-50 w-[min(92vw,390px)] oled-surface rounded-3xl p-4 overflow-y-auto space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                    {blueprint.source === 'gemini_4' ? 'GEMINI 4 DIRECTED' : 'AURA STUDIO & PRESETS'}
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

              {/* 10 Signature Tagde Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                    Signature Presets (10)
                  </span>
                  <span className="text-[10px] text-white/35">1-Click Room Transform</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {VIBE_PRESETS.map((p) => {
                    const active = activePresetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className={`p-2 rounded-2xl text-left border transition-all cursor-pointer flex items-center gap-2.5 ${
                          active
                            ? 'bg-white/[0.12] border-white/35'
                            : 'bg-white/[0.035] hover:bg-white/[0.08] border-white/[0.06]'
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

              {/* AI Prompt Steer */}
              <form onSubmit={handlePromptSteer} className="space-y-1.5">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                  Steer AI Vibe
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.1] px-2.5 py-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-white/45 shrink-0" />
                    <input
                      type="text"
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      placeholder='e.g. "cyber samurai" or "monsoon blue"'
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

              {/* Visual Controls: Edge, Particles, Spectrum */}
              <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">
                    Edge Lighting
                  </div>
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

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/40">
                      Atmosphere &amp; Spectrum
                    </span>
                    <button
                      type="button"
                      onClick={() => setBlueprint((b) => ({ ...b, showSpectrum: !b.showSpectrum }))}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code cursor-pointer transition-colors ${
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
              </div>

              {/* Studio 3-Band Web Audio EQ */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.08]">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                  Studio Audio EQ
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
                          audioRef.current?.setEq(eq.bass, eq.mid, eq.treble);
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
              </div>

              {/* Focus Mode 25m Timer + Live Audio Inputs */}
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.08]">
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

              {/* Optional Gemini 4 API Key */}
              <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
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
            onSeekToLine={(sec) => {
              audioRef.current?.seek(sec);
              setLyricOffset(0);
            }}
            onSyncLineHere={(lineStartSec) => {
              const cur = audioRef.current?.getCurrentTime() || 0;
              setLyricOffset(Math.round((lineStartSec - cur) * 10) / 10);
              showToast('Synced lyrics to exact vocal!');
            }}
            onAdjustOffset={(d) => setLyricOffset((v) => Math.round((v + d) * 10) / 10)}
            onResetOffset={() => setLyricOffset(0)}
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

          {/* Bottom Floating Dock + 7 Mode Pills */}
          <div
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-[min(95vw,880px)] transition-all duration-700 ease-apple ${
              chromeVisible && !pureCinema
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-5 pointer-events-none'
            }`}
          >
            {/* 7 Clean Visual World Pills */}
            <div className="flex items-center justify-center gap-1.5 mb-2 flex-wrap">
              {LYRIC_STYLES.map((opt) => {
                const active = blueprint.lyricStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBlueprint((b) => ({ ...b, lyricStyle: opt.id }))}
                    className={`px-3 py-1 rounded-full text-[11px] font-grotesk transition-all duration-300 ease-apple cursor-pointer ${
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
                </div>
              )}

              <div className="flex items-center justify-between gap-2 sm:gap-3">
                {/* Song Thumbnail + Inline Sync Adjuster (zero overlap!) */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                      <span className="hidden sm:inline text-[9px] font-mono-code px-1.5 py-0.5 rounded bg-white/[0.07] text-white/55">
                        {activeSong.isFullTrack ? 'FULL' : '30s'}
                      </span>
                      {lyrics.length > 0 && !activeSong.isFullTrack && (
                        <div className="hidden md:flex items-center gap-0.5 ml-1 bg-white/[0.06] rounded-md px-1 py-0.5 text-[9px] font-mono-code text-white/70">
                          <button
                            type="button"
                            onClick={() => setLyricOffset((v) => Math.round((v - 2) * 10) / 10)}
                            className="hover:text-white cursor-pointer"
                            title="Delay lyrics -2s"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="px-1">{lyricOffset >= 0 ? `+${lyricOffset}s` : `${lyricOffset}s`}</span>
                          <button
                            type="button"
                            onClick={() => setLyricOffset((v) => Math.round((v + 2) * 10) / 10)}
                            className="hover:text-white cursor-pointer"
                            title="Advance lyrics +2s"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-white/50 truncate">{activeSong.artist}</div>
                  </div>
                </div>

                {/* Transport */}
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

                {/* Utility Buttons */}
                <div className="flex items-center justify-end gap-1 flex-1">
                  <div className="hidden lg:flex items-center gap-1.5 mr-1">
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
                      className="aura-slider w-14"
                    />
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
