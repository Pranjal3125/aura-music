import type {
  AmbientParticleId,
  EdgeStyleId,
  EqPresetId,
  LyricStyleId,
} from '../types';

export const PREFS_COOKIE_NAME = 'aura_prefs_v1';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export interface EqBands {
  bass: number;
  mid: number;
  treble: number;
}

export interface AuraUserSettings {
  volume?: number;
  muted?: boolean;
  eqPreset?: EqPresetId | 'custom';
  eqBands?: EqBands;
  presetId?: string;
  lyricStyle?: LyricStyleId;
  edgeStyle?: EdgeStyleId;
  particles?: AmbientParticleId;
  showSpectrum?: boolean;
  infiniteRadio?: boolean;
  repeatOne?: boolean;
}

const VALID_LYRIC_STYLES: readonly LyricStyleId[] = [
  'constellation',
  'branches',
  'web',
  'tunnel',
  'mirror',
  'glitch',
  'kinetic',
  'liquid',
  'editorial',
  'codestyle',
];

const VALID_EDGE_STYLES: readonly EdgeStyleId[] = [
  'lumn_vivid',
  'laser_orbit',
  'breathing_aura',
  'off',
];

const VALID_PARTICLES: readonly AmbientParticleId[] = [
  'cosmos',
  'rain',
  'embers',
  'none',
];

const VALID_EQ_PRESETS: readonly (EqPresetId | 'custom')[] = [
  'flat',
  'bass_boost',
  'late_night',
  'vocal_clarity',
  'concert',
  'custom',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSettings(raw: unknown): AuraUserSettings {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: AuraUserSettings = {};

  if (typeof obj.volume === 'number' && Number.isFinite(obj.volume)) {
    out.volume = Math.round(clamp(obj.volume, 0, 1) * 100) / 100;
  }
  if (typeof obj.muted === 'boolean') {
    out.muted = obj.muted;
  }
  if (
    typeof obj.eqPreset === 'string' &&
    (VALID_EQ_PRESETS as readonly string[]).includes(obj.eqPreset)
  ) {
    out.eqPreset = obj.eqPreset as EqPresetId | 'custom';
  }
  if (obj.eqBands && typeof obj.eqBands === 'object') {
    const b = obj.eqBands as Record<string, unknown>;
    if (
      typeof b.bass === 'number' &&
      Number.isFinite(b.bass) &&
      typeof b.mid === 'number' &&
      Number.isFinite(b.mid) &&
      typeof b.treble === 'number' &&
      Number.isFinite(b.treble)
    ) {
      out.eqBands = {
        bass: clamp(b.bass, -12, 12),
        mid: clamp(b.mid, -12, 12),
        treble: clamp(b.treble, -12, 12),
      };
    }
  }
  if (typeof obj.presetId === 'string' && obj.presetId.length > 0 && obj.presetId.length <= 64) {
    out.presetId = obj.presetId;
  }
  if (
    typeof obj.lyricStyle === 'string' &&
    (VALID_LYRIC_STYLES as readonly string[]).includes(obj.lyricStyle)
  ) {
    out.lyricStyle = obj.lyricStyle as LyricStyleId;
  }
  if (
    typeof obj.edgeStyle === 'string' &&
    (VALID_EDGE_STYLES as readonly string[]).includes(obj.edgeStyle)
  ) {
    out.edgeStyle = obj.edgeStyle as EdgeStyleId;
  }
  if (
    typeof obj.particles === 'string' &&
    (VALID_PARTICLES as readonly string[]).includes(obj.particles)
  ) {
    out.particles = obj.particles as AmbientParticleId;
  }
  if (typeof obj.showSpectrum === 'boolean') {
    out.showSpectrum = obj.showSpectrum;
  }
  if (typeof obj.infiniteRadio === 'boolean') {
    out.infiniteRadio = obj.infiniteRadio;
  }
  if (typeof obj.repeatOne === 'boolean') {
    out.repeatOne = obj.repeatOne;
  }

  return out;
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const prefix = `${name}=`;
  const cookies = document.cookie.split(';');
  for (const part of cookies) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

function writeCookieAndStorage(settings: AuraUserSettings): void {
  const clean = sanitizeSettings(settings);
  const serialized = JSON.stringify(clean);

  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${PREFS_COOKIE_NAME}=${encodeURIComponent(
        serialized
      )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    } catch {
      // Ignore cookie write errors in restricted environments
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(PREFS_COOKIE_NAME, serialized);
    } catch {
      // Ignore storage quota / private mode errors
    }
  }
}

export function loadUserSettings(): AuraUserSettings {
  const cookieRaw = readCookieValue(PREFS_COOKIE_NAME);
  if (cookieRaw) {
    try {
      return sanitizeSettings(JSON.parse(decodeURIComponent(cookieRaw)));
    } catch {
      // Fall through to localStorage
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(PREFS_COOKIE_NAME);
      if (stored) {
        const parsed = sanitizeSettings(JSON.parse(stored));
        // Mirror recovered localStorage settings back into cookie
        writeCookieAndStorage(parsed);
        return parsed;
      }
    } catch {
      // Ignore parse/storage errors
    }
  }

  return {};
}

export function saveUserSettings(partial: AuraUserSettings): AuraUserSettings {
  const current = loadUserSettings();
  const next = sanitizeSettings({ ...current, ...partial });
  writeCookieAndStorage(next);
  return next;
}
