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
  /\b(karaoke|instrumental version|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|tribute to|originally performed|melody karaoke)\b/i;

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
 * Searches REAL songs across BOTH JioSaavn (320kbps FULL tracks for Hindi/Indian/Global catalog)
 * and Apple iTunes (universal global catalog HD covers + official studio previews).
 * Automatically strips karaoke/8D junk and ranks full official tracks first!
 */
export async function searchRealSongs(query: string): Promise<SongItem[]> {
  const q = query.trim();
  if (!q) return [];

  const [saavnResults, itunesResults] = await Promise.all([
    fetchSaavnSongs(q),
    fetchItunesSongs(q),
  ]);

  // Deduplicate cleanly by normalized title + first artist token
  const merged: SongItem[] = [];
  const seen = new Set<string>();

  const makeKey = (title: string, artist: string) =>
    `${title.toLowerCase().replace(/\(.*?\)|\[.*?\]|[^a-z0-9]/g, '')}::${artist
      .toLowerCase()
      .split(/[,&]/)[0]
      .replace(/[^a-z0-9]/g, '')}`;

  // Prioritize verified full JioSaavn hits with strong play counts first
  for (const s of saavnResults) {
    const key = makeKey(s.title, s.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  // Fill in all official global tracks from Apple iTunes (The Weeknd, Travis Scott, DHH, Indie, etc.)
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
      // Skip obscure cover/clone uploads with tiny play counts so official tracks win
      if (plays < 15000) continue;

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
        duration: Number(r.duration) || 210,
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
      const hdArt = (r.artworkUrl100 || '').replace(/100x100bb/i, '600x600bb');
      out.push({
        id: `itunes-${r.trackId}`,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || '',
        duration: 30, // Apple preview clip length
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

/**
 * Curated live real hits loaded on first open so the home screen immediately has
 * real playable iconic Hindi + English songs ready in 1 click!
 */
const FEATURED_QUERIES = [
  { query: 'Kesariya Arijit Singh', preferFull: true },
  { query: 'The Weeknd Starboy', preferFull: false },
  { query: 'Tum Hi Ho Arijit Singh', preferFull: true },
  { query: 'Kun Faya Kun', preferFull: true },
  { query: 'The Weeknd Blinding Lights', preferFull: false },
  { query: 'Apna Bana Le Arijit', preferFull: true },
  { query: 'Agar Tum Saath Ho', preferFull: true },
  { query: 'Joji Glimpse of Us', preferFull: false },
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
 * Parses LRC timestamps (`[mm:ss.xx] line`) into LyricLines with syllable-weighted word timings.
 */
export function buildTimedLine(start: number, end: number, text: string): LyricLine {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const totalDur = Math.max(0.45, end - start);
  const weights = rawWords.map((w) => Math.max(1.1, w.replace(/[^a-zA-Z0-9]/g, '').length * 0.65 + 0.9));
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

function parseLrc(lrc: string, fallbackDuration = 220): LyricLine[] {
  const rows: Array<{ time: number; text: string }> = [];
  const rx = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/;

  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(rx);
    if (!m) continue;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const frac = parseInt((m[3] || '0').padEnd(3, '0'), 10) / 1000;
    const text = m[4].trim();
    if (!text || text === '♪' || text === '...') continue;
    rows.push({ time: mins * 60 + secs + frac, text });
  }

  rows.sort((a, b) => a.time - b.time);

  return rows.map((row, idx) => {
    const nextStart = idx < rows.length - 1 ? rows[idx + 1].time : Math.min(fallbackDuration, row.time + 5);
    const end = Math.max(row.time + 0.85, Math.min(nextStart - 0.06, row.time + 7.2));
    return buildTimedLine(row.time, end, row.text);
  });
}

interface LrcLibItem {
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

/**
 * Fetches free real-time synced lyrics from LRCLIB for any song!
 */
export async function fetchSyncedLyricsForSong(song: SongItem): Promise<LyricLine[]> {
  const cleanTitle = song.title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const primaryArtist = song.artist.split(/[,&]/)[0].trim();
  const queries = [
    `${primaryArtist} ${cleanTitle}`,
    cleanTitle,
  ];

  for (const q of queries) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const items = (await res.json()) as LrcLibItem[];
      if (!Array.isArray(items) || items.length === 0) continue;

      const synced = items.filter((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 25);
      if (synced.length > 0) {
        if (song.isFullTrack && song.duration > 40) {
          synced.sort((a, b) => Math.abs((a.duration || 0) - song.duration) - Math.abs((b.duration || 0) - song.duration));
        }
        return parseLrc(synced[0].syncedLyrics!, song.duration || synced[0].duration || 220);
      }

      const plain = items.find((r) => r.plainLyrics && r.plainLyrics.trim().length > 25);
      if (plain?.plainLyrics) {
        const lines = plain.plainLyrics
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const total = song.isFullTrack ? song.duration || 210 : 30;
        const step = Math.max(2.4, (total - 4) / Math.max(1, Math.min(lines.length, 36)));
        return lines.map((text, i) => buildTimedLine(2 + i * step, 2 + (i + 1) * step - 0.12, text));
      }
    } catch {
      // ignore network error and try next query
    }
  }
  return [];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts vibrant neon primary/secondary colors from real album artwork (32x32 offscreen canvas, <2ms).
 */
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

    // Boost slight neon vibrancy so edge glow looks stunning on pure OLED black
    const boost = (r: number, g: number, b: number): [number, number, number] => {
      const avg = (r + g + b) / 3;
      return [
        Math.min(255, Math.max(0, avg + (r - avg) * 1.25)),
        Math.min(255, Math.max(0, avg + (g - avg) * 1.25)),
        Math.min(255, Math.max(0, avg + (b - avg) * 1.25)),
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
