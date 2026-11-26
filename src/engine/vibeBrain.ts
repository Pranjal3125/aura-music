import { GoogleGenAI } from '@google/genai';
import {
  AmbientParticleId,
  EdgeStyleId,
  LyricLine,
  LyricStyleId,
  SongItem,
  VibeBlueprint,
  VibePalette,
} from '../types';

interface MoodPreset {
  key: string;
  moodName: string;
  archetype: string;
  keywords: RegExp;
  palette: VibePalette;
  lyricStyle: LyricStyleId;
  edgeStyle: EdgeStyleId;
  particles: AmbientParticleId;
}

const MOOD_PRESETS: MoodPreset[] = [
  {
    key: 'nocturne_starlight',
    moodName: 'Crimson Nocturne',
    archetype: 'LATE NIGHT SYNTH',
    keywords: /\b(starboy|weeknd|daft|blinding|after hours|midnight|night|neon|lights|star|stars|dark|drive|cyber|synth|shadow|save your tears)\b/i,
    palette: { primary: '#ff1e42', secondary: '#ff8a00', accent: '#fff4de' },
    lyricStyle: 'constellation',
    edgeStyle: 'lumn_vivid',
    particles: 'cosmos',
  },
  {
    key: 'golden_soul',
    moodName: 'Golden Reverie',
    archetype: 'WARM ROMANTIC // SOUL',
    keywords: /\b(kesariya|kun faya|raataan|apna bana|chaleya|heeriye|shayad|ranjha|golden|sufi|sun|dawn|love|ishq|pyaar|dil|tera|humdum|pritam)\b/i,
    palette: { primary: '#f59e0b', secondary: '#f43f5e', accent: '#fffbeb' },
    lyricStyle: 'constellation',
    edgeStyle: 'lumn_vivid',
    particles: 'embers',
  },
  {
    key: 'midnight_rain',
    moodName: 'Midnight Rain',
    archetype: 'MELANCHOLIC // ACOUSTIC',
    keywords: /\b(tum hi ho|agar tum saath|channa mereya|joji|glimpse|sad|rain|tears|lonely|broken|aashiqui|arijit|atif|lana|billie|hothon|choo lo|memories|slow)\b/i,
    palette: { primary: '#6366f1', secondary: '#ec4899', accent: '#eef2ff' },
    lyricStyle: 'branches',
    edgeStyle: 'breathing_aura',
    particles: 'rain',
  },
  {
    key: 'voltage_hype',
    moodName: 'High Voltage',
    archetype: 'HIP-HOP // RAGE // CLUB',
    keywords: /\b(fein|travis|seedhe|maut|nanchaku|krsna|karan aujla|softly|ap dhillon|diljit|brown munde|phonk|trap|rap|hip hop|bass|party|overdrive|club|fire|badshah|honey)\b/i,
    palette: { primary: '#d946ef', secondary: '#06b6d4', accent: '#ffffff' },
    lyricStyle: 'web',
    edgeStyle: 'laser_orbit',
    particles: 'embers',
  },
  {
    key: 'coder_flow',
    moodName: '2AM Codeflow',
    archetype: 'FOCUS // TERMINAL',
    keywords: /\b(code|terminal|hacker|matrix|focus|coding|lofi|chill|study|emerald|green|electronic|techno|house)\b/i,
    palette: { primary: '#10b981', secondary: '#06b6d4', accent: '#ecfdf5' },
    lyricStyle: 'codestyle',
    edgeStyle: 'lumn_vivid',
    particles: 'cosmos',
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

  let best = MOOD_PRESETS[0];
  let bestScore = -1;

  for (const preset of MOOD_PRESETS) {
    let score = 0;
    if (userPrompt) {
      const pm = userPrompt.match(new RegExp(preset.keywords.source, 'gi'));
      if (pm) score += pm.length * 50;
    }
    const sm = songCorpus.match(new RegExp(preset.keywords.source, 'gi'));
    if (sm) score += sm.length * (userPrompt ? 4 : 15);
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }

  let palette: VibePalette = artworkPalette ? { ...artworkPalette } : { ...best.palette };
  let lyricStyle: LyricStyleId = best.lyricStyle;
  let edgeStyle: EdgeStyleId = best.edgeStyle;
  let particles: AmbientParticleId = best.particles;

  if (userPrompt) {
    const low = userPrompt.toLowerCase();
    if (/\b(red|crimson|starboy)\b/.test(low)) palette = { primary: '#ff1e42', secondary: '#ff7b00', accent: '#fff2db' };
    else if (/\b(blue|ocean|ice|indigo)\b/.test(low)) palette = { primary: '#3b82f6', secondary: '#06b6d4', accent: '#eff6ff' };
    else if (/\b(green|emerald|matrix|hacker)\b/.test(low)) palette = { primary: '#10b981', secondary: '#22d3ee', accent: '#ecfdf5' };
    else if (/\b(purple|violet|pink)\b/.test(low)) palette = { primary: '#c026d3', secondary: '#6366f1', accent: '#fdf4ff' };
    else if (/\b(gold|amber|warm|sunset)\b/.test(low)) palette = { primary: '#f59e0b', secondary: '#ef4444', accent: '#fffbeb' };

    if (/\b(constellation|star|stars)\b/.test(low)) { lyricStyle = 'constellation'; particles = 'cosmos'; }
    else if (/\b(branch|branches|neural|lightning|tree)\b/.test(low)) { lyricStyle = 'branches'; }
    else if (/\b(web|spider|trap|rage|rap)\b/.test(low)) { lyricStyle = 'web'; }
    else if (/\b(liquid|apple|glass|blur)\b/.test(low)) { lyricStyle = 'liquid'; }
    else if (/\b(code|terminal|hacker|matrix)\b/.test(low)) { lyricStyle = 'codestyle'; }
    if (/\b(rain|monsoon|sad)\b/.test(low)) particles = 'rain';
  }

  return {
    moodName: userPrompt ? `AI · ${best.moodName}` : best.moodName,
    archetype: best.archetype,
    directorNote: userPrompt
      ? `Steered by "${userPrompt}" · ${lyricStyle} world · ${edgeStyle.replace('_', ' ')}`
      : `Matched "${song.title}" vibe + album cover aura · ${lyricStyle} world`,
    source: userPrompt ? 'prompt_ai' : 'auto_ai',
    palette,
    lyricStyle,
    edgeStyle,
    particles,
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
    lyricStyle: { type: 'string', enum: ['constellation', 'branches', 'web', 'liquid', 'codestyle'] },
    edgeStyle: { type: 'string', enum: ['lumn_vivid', 'laser_orbit', 'breathing_aura'] },
    particles: { type: 'string', enum: ['cosmos', 'rain', 'embers', 'none'] },
  },
  required: ['moodName', 'archetype', 'directorNote', 'palette', 'lyricStyle', 'edgeStyle', 'particles'],
};

const CACHE_KEY = 'aura_oled_gemini_cache_v3';

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

  const client = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
  const lyricsSample = lyrics.slice(0, 12).map((l) => l.text).join('\n');

  const prompt = `You are AURA, an ultra-luxury dark-room music aesthetic director (Verci + Lumn on pitch-black OLED).
Pick the exact vibrant neon palette, lyric visual world (constellation | branches | web | liquid | codestyle), edge lighting style, and atmosphere for this song:

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
  ) as Omit<VibeBlueprint, 'source'>;

  const result: VibeBlueprint = { ...parsed, source: 'gemini_4' };

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
