export type LyricStyleId =
  | 'apple_ui'
  | 'constellation'
  | 'fisheye'
  | 'branches'
  | 'web'
  | 'tunnel'
  | 'mirror'
  | 'glitch'
  | 'kinetic'
  | 'liquid'
  | 'editorial'
  | 'codestyle';

export type EdgeStyleId = 'lumn_vivid' | 'laser_orbit' | 'violet_prism' | 'breathing_aura' | 'off';

export type AmbientParticleId = 'cosmos' | 'rain' | 'embers' | 'none';

export type EqPresetId = 'flat' | 'bass_boost' | 'late_night' | 'vocal_clarity' | 'concert';

export type LyricMatchSource = 'lrclib_synced' | 'lrclib_plain' | 'lyrics_ovh_plain' | 'none';

export interface LyricWord {
  text: string;
  start: number;
  end: number;
}

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  words: LyricWord[];
}

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fullDuration?: number;
  artworkUrl: string;
  audioUrl: string;
  source: 'saavn' | 'audius' | 'itunes' | 'local' | 'live_tab' | 'live_mic';
  isFullTrack: boolean;
  year?: string;
  playCount?: number;
}

export interface VibePalette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface VibePreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  palette: VibePalette;
  lyricStyle: LyricStyleId;
  edgeStyle: EdgeStyleId;
  particles: AmbientParticleId;
  showSpectrum: boolean;
}

export interface VibeBlueprint {
  moodName: string;
  archetype: string;
  directorNote: string;
  source: 'auto_ai' | 'gemini_4' | 'prompt_ai' | 'preset';
  palette: VibePalette;
  lyricStyle: LyricStyleId;
  edgeStyle: EdgeStyleId;
  particles: AmbientParticleId;
  showSpectrum: boolean;
}

export interface CompanionSyncMessage {
  type: 'STATE_SYNC';
  song: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    artworkUrl: string;
    duration: number;
    isFullTrack?: boolean;
    source?: SongItem['source'];
  };
  blueprint: VibeBlueprint;
  currentTime: number;
  isPlaying: boolean;
  currentLineText: string;
  nextLineText?: string;
  bass: number;
  beat: number;
  timestamp?: number;
}

export interface CompanionCommandMessage {
  type: 'CMD';
  action: 'toggle_play' | 'prev' | 'next';
}
