import { LyricLine, LyricWord, SongItem, VibePalette } from '../types';

function decodeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

const JUNK_PATTERN =
  /\b(karaoke|instrumental version|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|tribute to|originally performed|melody karaoke|mashup|x\s+aahatein)\b/i;

interface SaavnSongRaw {
  id: string;
  name: string;
  duration?: number | string;
  year?: string;
  playCount?: number | null;
  album?: { name?: string };
  artists?: { primary?: Array<{ name?: string }> };
  image?: Array<{ quality: string; url: string }>;
  downloadUrl?: Array<{ quality: string; url: string }>;
}

interface ItunesSongRaw {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  previewUrl?: string;
  releaseDate?: string;
}

/**
 * Searches REAL songs across JioSaavn (320kbps FULL tracks) & Apple iTunes (Global catalog + HD covers).
 */
export async function searchRealSongs(query: string): Promise<SongItem[]> {
  const q = query.trim();
  if (!q) return [];

  const [saavnResults, itunesResults] = await Promise.all([
    fetchSaavnSongs(q),
    fetchItunesSongs(q),
  ]);

  const merged: SongItem[] = [];
  const seen = new Set<string>();

  const makeKey = (title: string, artist: string) =>
    `${title.toLowerCase().replace(/\(.*?\)|\[.*?\]|[^a-z0-9]/g, '')}::${artist
      .toLowerCase()
      .split(/[,&]/)[0]
      .replace(/[^a-z0-9]/g, '')}`;

  for (const s of saavnResults) {
    const key = makeKey(s.title, s.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  for (const s of itunesResults) {
    const key = makeKey(s.title, s.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  return merged.slice(0, 14);
}

async function fetchSaavnSongs(query: string): Promise<SongItem[]> {
  try {
    const res = await fetch(
      `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=12`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { success?: boolean; data?: { results?: SaavnSongRaw[] } };
    const rows = json?.data?.results || [];

    const cleaned: SongItem[] = [];
    for (const r of rows) {
      const title = decodeHtml(r.name || '');
      const artist = decodeHtml(
        (r.artists?.primary || [])
          .map((a) => a.name || '')
          .filter(Boolean)
          .join(', ') || 'Unknown Artist'
      );
      const album = decodeHtml(r.album?.name || '');

      if (!title || JUNK_PATTERN.test(`${title} ${artist} ${album}`)) continue;

      const plays = typeof r.playCount === 'number' ? r.playCount : 0;
      const dur = Number(r.duration) || 210;
      if (plays < 25000 || dur < 90) continue;

      const downloads = r.downloadUrl || [];
      const bestAudio =
        downloads.find((d) => d.quality === '320kbps')?.url ||
        downloads.find((d) => d.quality === '160kbps')?.url ||
        downloads[downloads.length - 1]?.url;
      if (!bestAudio) continue;

      const images = r.image || [];
      const bestImg =
        images.find((i) => i.quality === '500x500')?.url ||
        images[images.length - 1]?.url ||
        '';

      cleaned.push({
        id: `saavn-${r.id}`,
        title,
        artist,
        album,
        duration: dur,
        artworkUrl: bestImg,
        audioUrl: bestAudio,
        source: 'saavn',
        isFullTrack: true,
        year: r.year,
        playCount: plays,
      });
    }

    cleaned.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
    return cleaned.slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchItunesSongs(query: string): Promise<SongItem[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesSongRaw[] };
    const rows = json?.results || [];

    const out: SongItem[] = [];
    for (const r of rows) {
      if (!r.previewUrl || !r.trackName) continue;
      if (JUNK_PATTERN.test(`${r.trackName} ${r.artistName}`)) continue;
      const hdArt = (r.artworkUrl100 || '').replace(/100x100bb/i, '500x500bb');
      out.push({
        id: `itunes-${r.trackId}`,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || '',
        duration: 30,
        artworkUrl: hdArt,
        audioUrl: r.previewUrl,
        source: 'itunes',
        isFullTrack: false,
        year: r.releaseDate ? r.releaseDate.slice(0, 4) : undefined,
      });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

const FEATURED_QUERIES = [
  { query: 'Kesariya Arijit Singh', preferFull: true },
  { query: 'The Weeknd Starboy', preferFull: false },
  { query: 'Tum Hi Ho Arijit Singh', preferFull: true },
  { query: 'Raataan Lambiyan', preferFull: true },
  { query: 'Husn Anuv Jain', preferFull: true },
  { query: 'Apna Bana Le Arijit', preferFull: true },
  { query: 'Kun Faya Kun', preferFull: true },
  { query: 'The Weeknd Blinding Lights', preferFull: false },
];

export async function loadFeaturedSongs(): Promise<SongItem[]> {
  const results = await Promise.all(
    FEATURED_QUERIES.map(async (item) => {
      try {
        if (item.preferFull) {
          const saavn = await fetchSaavnSongs(item.query);
          if (saavn.length > 0) return saavn[0];
        }
        const itunes = await fetchItunesSongs(item.query);
        return itunes[0] || null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((x): x is SongItem => x !== null);
}

/**
 * Builds natural vocal-cadence word timings inside a line.
 */
export function buildTimedLine(start: number, end: number, text: string): LyricLine {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = rawWords.length;
  // Cap active singing sweep realistically so a short 4-word line doesn't drag over long pauses!
  const naturalCap = Math.max(2.2, wordCount * 0.68);
  const sweepEnd = Math.min(end, start + naturalCap);
  const totalDur = Math.max(0.45, sweepEnd - start);

  const weights = rawWords.map((w) => Math.max(1.1, w.replace(/[^a-zA-Z0-9]/g, '').length * 0.6 + 0.9));
  const sum = weights.reduce((a, b) => a + b, 0);

  let cursor = start;
  const words: LyricWord[] = rawWords.map((w, i) => {
    const seg = (weights[i] / sum) * totalDur;
    const obj: LyricWord = { text: w, start: cursor, end: cursor + seg };
    cursor += seg;
    return obj;
  });

  return { start, end, text, words };
}

/**
 * IMPORTANT LRC ACCURACY FIX:
 * Preserves blank LRC timestamp rows (`[00:13.40] `) as explicit END markers for the preceding lyric line,
 * instead of discarding them first and over-stretching the line across instrumental gaps!
 */
function parseLrc(lrc: string, fallbackDuration = 220): LyricLine[] {
  const events: Array<{ time: number; text: string }> = [];
  const rx = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/;

  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(rx);
    if (!m) continue;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const frac = parseInt((m[3] || '0').padEnd(3, '0'), 10) / 1000;
    const text = m[4].replace(/^♪+$|^\.\.\.$/, '').trim();
    events.push({ time: mins * 60 + secs + frac, text });
  }

  events.sort((a, b) => a.time - b.time);

  const lines: LyricLine[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.text) continue; // blank line acts strictly as end-boundary for previous event!

    const nextAnyTime = i < events.length - 1 ? events[i + 1].time : Math.min(fallbackDuration, ev.time + 5);
    const end = Math.max(ev.time + 0.75, Math.min(nextAnyTime - 0.04, ev.time + 7.5));
    lines.push(buildTimedLine(ev.time, end, ev.text));
  }

  return lines;
}

interface LrcLibItem {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

/**
 * Fetches & ranks LRCLIB synced lyrics by:
 * 1) Exact duration match (critical for tight sync!),
 * 2) Latin/Romanized script readability (renders best across Constellation & Kinetic worlds),
 * 3) Phrase timestamp granularity!
 */
export async function fetchSyncedLyricsForSong(song: SongItem): Promise<LyricLine[]> {
  const cleanTitle = song.title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const primaryArtist = song.artist.split(/[,&]/)[0].trim();
  const queries = [`${primaryArtist} ${cleanTitle}`, cleanTitle];

  const candidates: LrcLibItem[] = [];

  for (const q of queries) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const items = (await res.json()) as LrcLibItem[];
      if (Array.isArray(items)) candidates.push(...items);
      if (candidates.some((c) => c.syncedLyrics && Math.abs((c.duration || 0) - song.duration) <= 3)) {
        break;
      }
    } catch {
      // ignore network error
    }
  }

  const synced = candidates.filter((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 25);
  if (synced.length > 0) {
    const scored = synced.map((item) => {
      let score = 0;
      const durDiff = song.isFullTrack && song.duration > 40 ? Math.abs((item.duration || 0) - song.duration) : 15;
      if (song.isFullTrack && song.duration > 40) {
        if (durDiff <= 2) score += 140;
        else if (durDiff <= 6) score += 95;
        else if (durDiff <= 15) score += 45;
        else score -= durDiff;
      }

      const lrc = item.syncedLyrics || '';
      const hasLatinWords = /[a-zA-Z]{4,}/.test(lrc.replace(/\[[^\]]+\]/g, ''));
      if (hasLatinWords) score += 40;

      const lineCount = lrc.split('\n').filter((l) => l.trim().length > 10).length;
      if (lineCount >= 28 && lineCount <= 140) score += 25;

      const tNorm = (item.trackName || '').toLowerCase();
      if (tNorm.includes(cleanTitle.toLowerCase())) score += 25;

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].item;
    return parseLrc(best.syncedLyrics!, song.duration || best.duration || 220);
  }

  const plain = candidates.find((r) => r.plainLyrics && r.plainLyrics.trim().length > 25);
  if (plain?.plainLyrics) {
    const rawLines = plain.plainLyrics
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const total = song.isFullTrack ? song.duration || 210 : 30;
    const step = Math.max(2.4, (total - 4) / Math.max(1, Math.min(rawLines.length, 36)));
    return rawLines.map((text, i) => buildTimedLine(2 + i * step, 2 + (i + 1) * step - 0.12, text));
  }

  return [];
}

/**
 * Finds the most repeated chorus/hook timestamp in LRC so 30s Apple previews start much closer!
 */
export function detectChorusStartTime(lyrics: LyricLine[]): number {
  if (lyrics.length < 6) return 0;
  const counts = new Map<string, { count: number; firstStart: number }>();

  for (const line of lyrics) {
    const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (norm.length < 8) continue;
    const existing = counts.get(norm);
    if (existing) existing.count++;
    else counts.set(norm, { count: 1, firstStart: line.start });
  }

  let bestCount = 1;
  let bestStart = lyrics[Math.floor(lyrics.length * 0.28)].start;

  counts.forEach((v) => {
    if (v.count > bestCount && v.firstStart > 25) {
      bestCount = v.count;
      bestStart = v.firstStart;
    }
  });

  return Math.round(bestStart);
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function extractPaletteFromArtwork(imageUrl: string): Promise<VibePalette | null> {
  if (!imageUrl) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;

    let bestScore = -1;
    let pR = 255, pG = 30, pB = 66;
    let secScore = -1;
    let sR = 255, sG = 140, sB = 0;

    for (let i = 0; i < data.length; i += 8) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (max + min) / 510;
      if (max < 65) continue;
      const score = sat * (1.15 - Math.abs(lum - 0.52));

      if (score > bestScore) {
        bestScore = score;
        pR = r; pG = g; pB = b;
      } else if (score > secScore && Math.abs(r - pR) + Math.abs(g - pG) + Math.abs(b - pB) > 110) {
        secScore = score;
        sR = r; sG = g; sB = b;
      }
    }

    const boost = (r: number, g: number, b: number): [number, number, number] => {
      const avg = (r + g + b) / 3;
      return [
        Math.min(255, Math.max(0, avg + (r - avg) * 1.28)),
        Math.min(255, Math.max(0, avg + (g - avg) * 1.28)),
        Math.min(255, Math.max(0, avg + (b - avg) * 1.28)),
      ];
    };

    const [bPR, bPG, bPB] = boost(pR, pG, pB);
    const [bSR, bSG, bSB] = boost(sR, sG, sB);

    return {
      primary: rgbToHex(bPR, bPG, bPB),
      secondary: rgbToHex(bSR, bSG, bSB),
      accent: rgbToHex(Math.min(255, bPR + 115), Math.min(255, bPG + 115), Math.min(255, bPB + 115)),
    };
  } catch {
    return null;
  }
}

export function parseLocalFileName(filename: string): { artist: string; title: string } {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: 'Local File', title: base || 'Untitled' };
}
