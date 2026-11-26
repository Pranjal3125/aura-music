export type LyricStyleId = 'constellation' | 'branches' | 'web' | 'liquid' | 'codestyle';

export type EdgeStyleId = 'lumn_vivid' | 'laser_orbit' | 'breathing_aura' | 'off';

export type AmbientParticleId = 'cosmos' | 'rain' | 'embers' | 'none';

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
  artworkUrl: string;
  audioUrl: string;
  source: 'saavn' | 'itunes' | 'local';
  isFullTrack: boolean;
  year?: string;
  playCount?: number;
}

export interface VibePalette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface VibeBlueprint {
  moodName: string;
  archetype: string;
  directorNote: string;
  source: 'auto_ai' | 'gemini_4' | 'prompt_ai';
  palette: VibePalette;
  lyricStyle: LyricStyleId;
  edgeStyle: EdgeStyleId;
  particles: AmbientParticleId;
}

export interface CompanionSyncMessage {
  type: 'STATE_SYNC';
  song: {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    duration: number;
  };
  blueprint: VibeBlueprint;
  currentTime: number;
  isPlaying: boolean;
  currentLineText: string;
  bass: number;
  beat: number;
}
