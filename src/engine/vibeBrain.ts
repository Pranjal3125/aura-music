import { VIBE_PRESETS } from '../data/presets';
import type {
  AmbientParticleId,
  EdgeStyleId,
  LyricLine,
  LyricStyleId,
  SongItem,
  VibeBlueprint,
  VibePalette,
  VibePreset,
} from '../types';

export function presetToBlueprint(preset: VibePreset): VibeBlueprint {
  return {
    moodName: preset.name,
    archetype: preset.tag,
    directorNote: preset.description,
    source: 'preset',
    palette: { ...preset.palette },
    lyricStyle: preset.lyricStyle,
    edgeStyle: preset.edgeStyle,
    particles: preset.particles,
    showSpectrum: preset.showSpectrum,
  };
}

const ARCHETYPE_MATCHERS: Array<{ presetId: string; keywords: RegExp }> = [
  {
    presetId: 'verci-lumn',
    keywords: /\b(no lie|sean paul|dua lipa|levitating|apple|imessage|iphone|ios|verci|lumn|violet|lavender|blinding|pop|club|dance|vibe|aura|midnight drive)\b/i,
  },
  {
    presetId: 'starboy-noir',
    keywords: /\b(starboy|weeknd|daft|after hours|neon|lights|star|stars|dark|drive|cyber|synth|shadow|save your tears)\b/i,
  },
  {
    presetId: 'neon-fisheye',
    keywords: /\b(fisheye|lens|wide|warp|prism|billie|lorde|electro|indie pop|dream)\b/i,
  },
  {
    presetId: 'desi-midnight',
    keywords: /\b(kesariya|kun faya|raataan|apna bana|chaleya|heeriye|shayad|ranjha|golden|sufi|sun|dawn|love|ishq|pyaar|dil|tera|humdum|pritam)\b/i,
  },
  {
    presetId: 'monsoon-lofi',
    keywords: /\b(tum hi ho|agar tum saath|channa mereya|joji|glimpse|sad|rain|tears|lonely|broken|aashiqui|arijit|atif|lana|hothon|choo lo|memories|slow|husn|anuv)\b/i,
  },
  {
    presetId: 'cyber-samurai',
    keywords: /\b(fein|travis|seedhe|maut|nanchaku|krsna|karan aujla|softly|ap dhillon|diljit|brown munde|phonk|trap|rap|hip hop|bass|party|overdrive|fire|badshah|honey|samurai|tokyo)\b/i,
  },
  {
    presetId: '2am-terminal',
    keywords: /\b(code|terminal|hacker|matrix|focus|coding|lofi|chill|study|emerald|green|electronic|techno|house)\b/i,
  },
];

export function directSongAutonomously(params: {
  song: SongItem;
  lyrics: LyricLine[];
  artworkPalette: VibePalette | null;
  userPrompt?: string;
}): VibeBlueprint {
  const { song, lyrics, artworkPalette, userPrompt } = params;
  const lyricsText = lyrics.slice(0, 14).map((l) => l.text).join(' ');
  const songCorpus = `${song.title} ${song.artist} ${song.album} ${lyricsText}`;

  let bestPreset = VIBE_PRESETS[0];
  let bestScore = -1;

  for (const m of ARCHETYPE_MATCHERS) {
    let score = 0;
    if (userPrompt) {
      const pm = userPrompt.match(new RegExp(m.keywords.source, 'gi'));
      if (pm) score += pm.length * 50;
    }
    const sm = songCorpus.match(new RegExp(m.keywords.source, 'gi'));
    if (sm) score += sm.length * (userPrompt ? 4 : 15);
    if (score > bestScore) {
      bestScore = score;
      bestPreset = VIBE_PRESETS.find((p) => p.id === m.presetId) || VIBE_PRESETS[0];
    }
  }

  let palette: VibePalette = artworkPalette ? { ...artworkPalette } : { ...bestPreset.palette };
  let lyricStyle: LyricStyleId = bestPreset.lyricStyle;
  let edgeStyle: EdgeStyleId = bestPreset.edgeStyle;
  let particles: AmbientParticleId = bestPreset.particles;
  let showSpectrum = bestPreset.showSpectrum;

  if (userPrompt) {
    const low = userPrompt.toLowerCase();
    if (/\b(red|crimson|starboy|blood)\b/.test(low)) palette = { primary: '#ff1e42', secondary: '#ff7b00', accent: '#fff2db' };
    else if (/\b(blue|ocean|ice|arctic|indigo|imessage)\b/.test(low)) palette = { primary: '#0a84ff', secondary: '#818cf8', accent: '#f0f9ff' };
    else if (/\b(green|emerald|matrix|hacker)\b/.test(low)) palette = { primary: '#10b981', secondary: '#22d3ee', accent: '#ecfdf5' };
    else if (/\b(purple|violet|pink|haze|lavender|verci|lumn)\b/.test(low)) palette = { primary: '#a855f7', secondary: '#0a84ff', accent: '#f5f3ff' };
    else if (/\b(gold|amber|warm|sunset|saffron)\b/.test(low)) palette = { primary: '#f59e0b', secondary: '#ef4444', accent: '#fffbeb' };
    else if (/\b(white|silver|mono|leica|black)\b/.test(low)) palette = { primary: '#f8fafc', secondary: '#94a3b8', accent: '#ffffff' };

    if (/\b(apple|imessage|ios|macos|pay|bubble|card|verci|reel)\b/.test(low)) { lyricStyle = 'apple_ui'; }
    else if (/\b(sculpture|knot|ribbon|bloom)\b/.test(low)) { lyricStyle = 'sculpture'; }
    else if (/\b(fisheye|lens|bulge)\b/.test(low)) { lyricStyle = 'fisheye'; }
    else if (/\b(constellation|star|stars)\b/.test(low)) { lyricStyle = 'constellation'; particles = 'cosmos'; }
    else if (/\b(branch|branches|neural|lightning|tree)\b/.test(low)) { lyricStyle = 'branches'; }
    else if (/\b(web|spider|haze)\b/.test(low)) { lyricStyle = 'web'; }
    else if (/\b(tunnel|warp|hyper|space|orbit|3d|vortex|galaxy)\b/.test(low)) { lyricStyle = 'tunnel'; particles = 'cosmos'; }
    else if (/\b(mirror|prism|chrome|stage|concert|stadium|laser)\b/.test(low)) { lyricStyle = 'mirror'; showSpectrum = true; }
    else if (/\b(glitch|cyber|katana|samurai|phonk|matrix|synth)\b/.test(low)) { lyricStyle = 'glitch'; showSpectrum = true; }
    else if (/\b(kinetic|slam|trap|rage|rap)\b/.test(low)) { lyricStyle = 'kinetic'; showSpectrum = true; }
    else if (/\b(liquid|glass|blur)\b/.test(low)) { lyricStyle = 'liquid'; }
    else if (/\b(editorial|serif|poetic|rain|monsoon|lofi)\b/.test(low)) { lyricStyle = 'editorial'; }
    else if (/\b(code|terminal|hacker)\b/.test(low)) { lyricStyle = 'codestyle'; }
    if (/\b(rain|monsoon|sad)\b/.test(low)) particles = 'rain';
    if (/\b(spectrum|bars|visualizer|eq)\b/.test(low)) showSpectrum = true;
  }

  return {
    moodName: userPrompt ? `AI · ${bestPreset.name}` : bestPreset.name,
    archetype: bestPreset.tag,
    directorNote: userPrompt
      ? `Steered by "${userPrompt}" · ${lyricStyle.replace('_', ' ')} · ${edgeStyle.replace('_', ' ')}`
      : `Matched "${song.title}" vibe + cover aura · ${lyricStyle.replace('_', ' ')}`,
    source: userPrompt ? 'prompt_ai' : 'auto_ai',
    palette,
    lyricStyle,
    edgeStyle,
    particles,
    showSpectrum,
  };
}

const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    moodName: { type: 'string' },
    archetype: { type: 'string' },
    directorNote: { type: 'string' },
    palette: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
      },
      required: ['primary', 'secondary', 'accent'],
    },
    lyricStyle: {
      type: 'string',
      enum: [
        'apple_ui', 'sculpture',
        'constellation',
        'fisheye',
        'branches',
        'web',
        'tunnel',
        'mirror',
        'glitch',
        'kinetic',
        'liquid',
        'editorial',
        'codestyle',
      ],
    },
    edgeStyle: {
      type: 'string',
      enum: ['lumn_vivid', 'laser_orbit', 'violet_prism', 'breathing_aura'],
    },
    particles: { type: 'string', enum: ['cosmos', 'rain', 'embers', 'none'] },
    showSpectrum: { type: 'boolean' },
  },
  required: ['moodName', 'archetype', 'directorNote', 'palette', 'lyricStyle', 'edgeStyle', 'particles', 'showSpectrum'],
};

const CACHE_KEY = 'aura_oled_gemini_cache_v5';

export async function directSongWithGemini(params: {
  apiKey: string;
  song: SongItem;
  lyrics: LyricLine[];
  userPrompt?: string;
}): Promise<VibeBlueprint> {
  const { apiKey, song, lyrics, userPrompt } = params;
  const cacheId = `${song.id}|${userPrompt || ''}`;

  if (!userPrompt) {
    try {
      const map = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, VibeBlueprint>;
      if (map[cacheId]) return map[cacheId];
    } catch {
      // ignore
    }
  }

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  const lyricsSample = lyrics.slice(0, 12).map((l) => l.text).join('\n');

  const prompt = `You are AURA, an ultra-luxury dark-room music aesthetic director (Verci + Lumn on pitch-black OLED).
Pick the exact vibrant neon palette, lyric visual world (apple_ui | sculpture | constellation | fisheye | branches | web | tunnel | mirror | glitch | kinetic | liquid | editorial | codestyle), edge lighting style, atmosphere, and whether bottom spectrum bars fit this track:

Song: "${song.title}" by "${song.artist}" (Album: "${song.album}")
${userPrompt ? `User creative prompt: "${userPrompt}"` : ''}
${lyricsSample ? `Lyrics:\n${lyricsSample}` : ''}`;

  const inputBlocks: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];

  if (song.artworkUrl) {
    try {
      const b64 = await imageUrlToBase64(song.artworkUrl);
      if (b64) inputBlocks.push({ type: 'image', mime_type: 'image/jpeg', data: b64 });
    } catch {
      // text-only fallback
    }
  }

  const interaction = await client.interactions.create({
    model: 'gemini-4-hydrogen',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: inputBlocks as any,
    store: false,
    generation_config: { thinking_level: 'low' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: GEMINI_SCHEMA,
    } as any,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let textOut: string = (interaction as any).output_text || '';
  if (!textOut && Array.isArray((interaction as { steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }).steps)) {
    const steps = (interaction as { steps: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }).steps;
    const step = [...steps].reverse().find((s) => s.type === 'model_output');
    textOut = step?.content?.find((c) => c.type === 'text' && c.text)?.text || '';
  }

  const parsed = JSON.parse(
    textOut.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  ) as Partial<Omit<VibeBlueprint, 'source'>>;

  const fallback = VIBE_PRESETS[0];
  const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const validLyricStyles = new Set<LyricStyleId>([
    'apple_ui', 'sculpture', 'constellation', 'fisheye', 'branches', 'web', 'tunnel', 'mirror', 'glitch', 'kinetic', 'liquid', 'editorial', 'codestyle',
  ]);
  const validEdgeStyles = new Set<EdgeStyleId>([
    'lumn_vivid', 'laser_orbit', 'violet_prism', 'breathing_aura', 'off',
  ]);
  const validParticles = new Set<AmbientParticleId>(['cosmos', 'rain', 'embers', 'none']);

  const result: VibeBlueprint = {
    moodName: typeof parsed.moodName === 'string' && parsed.moodName.trim() ? parsed.moodName.trim() : fallback.name,
    archetype: typeof parsed.archetype === 'string' && parsed.archetype.trim() ? parsed.archetype.trim() : fallback.tag,
    directorNote: typeof parsed.directorNote === 'string' && parsed.directorNote.trim() ? parsed.directorNote.trim() : fallback.description,
    palette: {
      primary: isHex(parsed.palette?.primary) ? parsed.palette!.primary : fallback.palette.primary,
      secondary: isHex(parsed.palette?.secondary) ? parsed.palette!.secondary : fallback.palette.secondary,
      accent: isHex(parsed.palette?.accent) ? parsed.palette!.accent : fallback.palette.accent,
    },
    lyricStyle: parsed.lyricStyle && validLyricStyles.has(parsed.lyricStyle) ? parsed.lyricStyle : fallback.lyricStyle,
    edgeStyle: parsed.edgeStyle && validEdgeStyles.has(parsed.edgeStyle) ? parsed.edgeStyle : fallback.edgeStyle,
    particles: parsed.particles && validParticles.has(parsed.particles) ? parsed.particles : fallback.particles,
    showSpectrum: typeof parsed.showSpectrum === 'boolean' ? parsed.showSpectrum : fallback.showSpectrum,
    source: 'gemini_4',
  };

  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, VibeBlueprint>;
    map[cacheId] = result;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }

  return result;
}

async function imageUrlToBase64(url: string): Promise<string | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 160, 160);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  return dataUrl.split(',')[1] || null;
}
