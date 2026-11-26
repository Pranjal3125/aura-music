import { LyricLine, LyricMatchSource, LyricWord, SongItem, VibePalette } from '../types';

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

export const JUNK_PATTERN =
  /\b(karaoke|instrumental version|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|sped\s*up|nightcore|vocals?\s*only|a\s*cappella|acapella|tribute to|originally performed|melody karaoke|mashup|x\s+aahatein|cover version)\b/i;

interface SaavnSongRaw {
  id: string;
  name?: string;
  title?: string;
  duration?: number | string;
  year?: string;
  playCount?: number | string | null;
  album?: { name?: string } | string;
  artists?: { primary?: Array<{ name?: string }> };
  primaryArtists?: string;
  image?: Array<{ quality: string; url?: string; link?: string }>;
  downloadUrl?: Array<{ quality: string; url?: string; link?: string }>;
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

interface AudiusTrackRaw {
  id: string;
  title: string;
  duration?: number;
  is_streamable?: boolean;
  play_count?: number;
  artwork?: {
    '150x150'?: string;
    '480x480'?: string;
    '1000x1000'?: string;
  };
  user?: {
    name?: string;
    handle?: string;
  };
  release_date?: string;
}

export interface LrcLibItem {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string;
  plainLyrics?: string;
}

export interface LyricsFetchResult {
  lines: LyricLine[];
  matchSource: LyricMatchSource;
  matchedTrack?: string;
  matchedArtist?: string;
}

export function cleanTrackTitle(title: string): string {
  let out = decodeHtml(title)
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(
      /(?:\s*[-–—|]\s*(?:from\s+["']?.*|vocals?\s*only|a\s*cappella|acapella|remaster(?:ed)?(?:\s*\d{4})?|radio\s*edit|single\s*version|album\s*version|official\s*(?:audio|video|lyric\s*video|music\s*video)|original\s*motion\s*picture.*|live(?:\s*at.*)?|acoustic|unplugged|instrumental|karaoke|slowed.*|reverb.*|lofi.*|sped\s*up.*|8d\s*audio.*|feat\.?.*|ft\.?.*))+$/i,
      ''
    )
    .replace(/\s+(?:feat\.?|ft\.?)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Handle "Title - Artist Vocals Only" or "Title - Arijit Singh" trailing tag if anything slipped through
  out = out.replace(/\s*[-–—]\s*[^-–—]*\b(vocals?\s*only|acapella|karaoke|instrumental|unplugged|reprise)\b.*$/i, '').trim();
  return out || decodeHtml(title).trim();
}

export function extractArtistList(artistStr: string): string[] {
  const parts = decodeHtml(artistStr)
    .split(/[,&/×]|(?:\s+(?:feat\.?|ft\.?|with|x)\s+)/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && !/^(unknown artist|various artists|local file|live)$/i.test(a));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeSongKey(title: string, artist: string): string {
  const cleanT = cleanTrackTitle(title).toLowerCase().replace(/[^a-z0-9]/g, '');
  const firstArtist = (extractArtistList(artist)[0] || artist)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `${cleanT}::${firstArtist}`;
}

function allowJunkForQuery(query: string): boolean {
  return JUNK_PATTERN.test(query);
}

export function scoreTrackRelevance(song: SongItem, query: string): number {
  const qNorm = normalizeForMatch(query);
  const qTokens = qNorm.split(' ').filter((w) => w.length >= 2);
  const tNorm = normalizeForMatch(cleanTrackTitle(song.title));
  const rawTNorm = normalizeForMatch(song.title);
  const aNorm = normalizeForMatch(song.artist);
  let score = 0;

  if (tNorm === qNorm || rawTNorm === qNorm) score += 140;
  else if (`${tNorm} ${aNorm}`.includes(qNorm)) score += 90;
  else if (tNorm.startsWith(qNorm)) score += 80;

  for (const tok of qTokens) {
    if (tNorm.includes(tok)) score += 28;
    else if (aNorm.includes(tok)) score += 22;
  }

  if (!allowJunkForQuery(query) && JUNK_PATTERN.test(`${song.title} ${song.album}`)) {
    score -= 160;
  }
  if (!/\b(remix|cover|lofi|reprise|unplugged)\b/i.test(query) && /\b(remix|cover|reprise|unplugged)\b/i.test(song.title)) {
    score -= 35;
  }

  if (song.isFullTrack && song.source === 'saavn') score += 32;
  else if (song.isFullTrack && song.source === 'audius') score += 12;

  if (song.playCount && song.playCount > 100000) {
    score += Math.min(25, Math.log10(song.playCount) * 3);
  }

  return score;
}

/**
 * Resilient multi-mirror + CORS-fallback JSON fetcher for JioSaavn APIs.
 * Caches the winning route in-session so subsequent queries stay fast.
 */
type SaavnStrategy = (path: string) => string;

const SAAVN_DIRECT_STRATEGIES: SaavnStrategy[] = [
  (path) => `https://saavn.sumit.co/api${path}`,
  (path) => `https://saavn.dev/api${path}`,
  (path) => `https://jiosaavn-api-privatecvc2.vercel.app${path}`,
  (path) => `https://jiosaavn-api-2-harsh-patel.vercel.app/api${path}`,
];

const SAAVN_PROXY_STRATEGIES: SaavnStrategy[] = [
  (path) => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://saavn.sumit.co/api${path}`)}`,
  (path) => `https://api.cors.lol/?url=${encodeURIComponent(`https://saavn.sumit.co/api${path}`)}`,
  (path) => `https://proxy.cors.dev/https://saavn.sumit.co/api${path}`,
  (path) => `https://corsproxy.io/?url=${encodeURIComponent(`https://saavn.sumit.co/api${path}`)}`,
  (path) => `https://corsproxy.io/?url=${encodeURIComponent(`https://saavn.dev/api${path}`)}`,
  (path) => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://jiosaavn-api-2-harsh-patel.vercel.app/api${path}`)}`,
];

const ALL_SAAVN_STRATEGIES: SaavnStrategy[] = [
  ...SAAVN_DIRECT_STRATEGIES,
  ...SAAVN_PROXY_STRATEGIES,
];

let workingSaavnStrategyIdx: number | null = null;
let saavnCooldownUntil = 0;
let saavnProbePromise: Promise<number | null> | null = null;

function isValidSaavnPayload(json: unknown, requireNonEmpty = false): boolean {
  if (!json || typeof json !== 'object') return false;
  const rec = json as Record<string, unknown>;
  if (rec.success === false) return false;
  const data = rec.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;
  const list = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.songs)
      ? data.songs
      : null;
  if (!list) return false;
  return requireNonEmpty ? list.length > 0 : true;
}

async function tryStrategy<T>(
  idx: number,
  path: string,
  timeoutMs: number,
  requireNonEmpty = false
): Promise<{ idx: number; data: T }> {
  const url = ALL_SAAVN_STRATEGIES[idx](path);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as T;
  if (!isValidSaavnPayload(json, requireNonEmpty)) throw new Error('Invalid Saavn payload');
  return { idx, data: json };
}

async function resolveWorkingSaavnStrategy(): Promise<number | null> {
  if (workingSaavnStrategyIdx !== null) return workingSaavnStrategyIdx;
  if (Date.now() < saavnCooldownUntil) return null;
  if (saavnProbePromise) return saavnProbePromise;

  saavnProbePromise = (async () => {
    const probePath = '/search/songs?query=Kesariya&limit=2';
    try {
      const directHit = await Promise.any(
        SAAVN_DIRECT_STRATEGIES.map((_, i) =>
          tryStrategy<Record<string, unknown>>(i, probePath, 2600, true)
        )
      );
      workingSaavnStrategyIdx = directHit.idx;
      return directHit.idx;
    } catch {
      // Direct mirrors blocked (CORS/down); race CORS-proxied routes
    }

    try {
      const offset = SAAVN_DIRECT_STRATEGIES.length;
      const proxyHit = await Promise.any(
        SAAVN_PROXY_STRATEGIES.map((_, i) =>
          tryStrategy<Record<string, unknown>>(offset + i, probePath, 3400, true)
        )
      );
      workingSaavnStrategyIdx = proxyHit.idx;
      return proxyHit.idx;
    } catch {
      saavnCooldownUntil = Date.now() + 60_000;
      return null;
    } finally {
      saavnProbePromise = null;
    }
  })();

  return saavnProbePromise;
}

async function fetchSaavnJson<T>(path: string): Promise<T | null> {
  const strategyIdx = await resolveWorkingSaavnStrategy();
  if (strategyIdx === null) return null;

  try {
    const hit = await tryStrategy<T>(strategyIdx, path, 4200, false);
    return hit.data;
  } catch {
    workingSaavnStrategyIdx = null;
    try {
      const fallbackHit = await Promise.any(
        ALL_SAAVN_STRATEGIES.map((_, i) =>
          i === strategyIdx
            ? Promise.reject(new Error('skip'))
            : tryStrategy<T>(i, path, 3400, false)
        )
      );
      workingSaavnStrategyIdx = fallbackHit.idx;
      return fallbackHit.data;
    } catch {
      saavnCooldownUntil = Date.now() + 60_000;
      return null;
    }
  }
}

function parseSaavnRows(rows: SaavnSongRaw[], allowJunk = false): SongItem[] {
  const cleaned: SongItem[] = [];
  for (const r of rows) {
    const title = decodeHtml(r.name || r.title || '');
    const artist = decodeHtml(
      (r.artists?.primary || [])
        .map((a) => a.name || '')
        .filter(Boolean)
        .join(', ') ||
        r.primaryArtists ||
        'Unknown Artist'
    );
    const album = decodeHtml(typeof r.album === 'string' ? r.album : r.album?.name || '');

    if (!title) continue;
    if (!allowJunk && JUNK_PATTERN.test(`${title} ${artist} ${album}`)) continue;

    const playsRaw = String(r.playCount ?? '').replace(/,/g, '').trim();
    const plays = playsRaw ? Number(playsRaw) : 0;
    const dur = Number(r.duration) || 210;
    if ((Number.isFinite(plays) && plays > 0 && plays < 10000) || dur < 75) continue;

    const downloads = r.downloadUrl || [];
    const bestAudio =
      downloads.find((d) => d.quality === '320kbps')?.url ||
      downloads.find((d) => d.quality === '320kbps')?.link ||
      downloads.find((d) => d.quality === '160kbps')?.url ||
      downloads.find((d) => d.quality === '160kbps')?.link ||
      downloads[downloads.length - 1]?.url ||
      downloads[downloads.length - 1]?.link;
    if (!bestAudio) continue;

    const images = r.image || [];
    const bestImg =
      images.find((i) => i.quality === '500x500')?.url ||
      images.find((i) => i.quality === '500x500')?.link ||
      images[images.length - 1]?.url ||
      images[images.length - 1]?.link ||
      '';

    cleaned.push({
      id: `saavn-${r.id}`,
      title,
      artist,
      album,
      duration: dur,
      fullDuration: dur,
      artworkUrl: bestImg,
      audioUrl: bestAudio,
      source: 'saavn',
      isFullTrack: true,
      year: r.year,
      playCount: Number.isFinite(plays) && plays > 0 ? plays : undefined,
    });
  }
  return cleaned;
}

export async function fetchSaavnSongs(query: string): Promise<SongItem[]> {
  try {
    const json = await fetchSaavnJson<{
      success?: boolean;
      status?: string;
      data?: { results?: SaavnSongRaw[] };
    }>(`/search/songs?query=${encodeURIComponent(query)}&limit=12`);
    const rows = json?.data?.results || [];
    const cleaned = parseSaavnRows(rows, allowJunkForQuery(query));
    cleaned.sort((a, b) => scoreTrackRelevance(b, query) - scoreTrackRelevance(a, query));
    return cleaned.slice(0, 8);
  } catch {
    return [];
  }
}

export async function fetchAudiusSongs(query: string): Promise<SongItem[]> {
  try {
    const res = await fetch(
      `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=AURA&limit=8`,
      { signal: AbortSignal.timeout(4800) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AudiusTrackRaw[] };
    const rows = json?.data || [];
    const out: SongItem[] = [];
    const allowJunk = allowJunkForQuery(query);

    for (const r of rows) {
      if (!r.id || !r.title || r.is_streamable === false) continue;
      const dur = Number(r.duration) || 0;
      if (dur < 60) continue;
      const artist = r.user?.name || r.user?.handle || 'Audius Artist';
      if (!allowJunk && JUNK_PATTERN.test(`${r.title} ${artist}`)) continue;

      const art = r.artwork?.['480x480'] || r.artwork?.['1000x1000'] || r.artwork?.['150x150'] || '';
      out.push({
        id: `audius-${r.id}`,
        title: r.title.trim(),
        artist: artist.trim(),
        album: 'Audius Stream',
        duration: dur,
        fullDuration: dur,
        artworkUrl: art,
        audioUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(r.id)}/stream?app_name=AURA`,
        source: 'audius',
        isFullTrack: true,
        year: r.release_date ? r.release_date.slice(0, 4) : undefined,
        playCount: r.play_count,
      });
    }
    return out.slice(0, 6);
  } catch {
    return [];
  }
}

async function fetchAudiusTrending(): Promise<SongItem[]> {
  try {
    const res = await fetch('https://api.audius.co/v1/tracks/trending?app_name=AURA&limit=16', {
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AudiusTrackRaw[] };
    const rows = json?.data || [];
    const out: SongItem[] = [];
    for (const r of rows) {
      if (!r.id || !r.title || r.is_streamable === false) continue;
      const dur = Number(r.duration) || 0;
      if (dur < 60) continue;
      const artist = r.user?.name || r.user?.handle || 'Audius Artist';
      const art = r.artwork?.['480x480'] || r.artwork?.['1000x1000'] || r.artwork?.['150x150'] || '';
      out.push({
        id: `audius-${r.id}`,
        title: r.title.trim(),
        artist: artist.trim(),
        album: 'Audius Trending',
        duration: dur,
        fullDuration: dur,
        artworkUrl: art,
        audioUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(r.id)}/stream?app_name=AURA`,
        source: 'audius',
        isFullTrack: true,
        playCount: r.play_count,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchItunesSongs(query: string): Promise<SongItem[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesSongRaw[] };
    const rows = json?.results || [];
    const allowJunk = allowJunkForQuery(query);

    const out: SongItem[] = [];
    for (const r of rows) {
      if (!r.previewUrl || !r.trackName) continue;
      if (!allowJunk && JUNK_PATTERN.test(`${r.trackName} ${r.artistName} ${r.collectionName || ''}`)) continue;
      const hdArt = (r.artworkUrl100 || '').replace(/100x100bb/i, '500x500bb');
      const fullDur =
        typeof r.trackTimeMillis === 'number' && r.trackTimeMillis > 40_000
          ? Math.round(r.trackTimeMillis / 1000)
          : undefined;
      out.push({
        id: `itunes-${r.trackId}`,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || '',
        duration: 30,
        fullDuration: fullDur,
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
 * Searches REAL songs across JioSaavn (320kbps FULL), Audius (CORS-native FULL), & Apple iTunes (Global catalog + HD covers).
 */
export async function searchRealSongs(query: string): Promise<SongItem[]> {
  const q = query.trim();
  if (!q) return [];

  const [saavnResults, itunesResults, audiusResults] = await Promise.all([
    fetchSaavnSongs(q),
    fetchItunesSongs(q),
    fetchAudiusSongs(q),
  ]);

  const combined = [...saavnResults, ...itunesResults, ...audiusResults];
  const byKey = new Map<string, { song: SongItem; score: number }>();

  for (const s of combined) {
    const key = makeSongKey(s.title, s.artist);
    const sc = scoreTrackRelevance(s, q);
    const prev = byKey.get(key);
    if (!prev || sc > prev.score || (sc === prev.score && s.isFullTrack && !prev.song.isFullTrack)) {
      byKey.set(key, { song: s, score: sc });
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.song)
    .slice(0, 14);
}

const FEATURED_QUERIES = [
  { query: 'No Lie Sean Paul Dua Lipa', preferFull: true },
  { query: 'Starboy The Weeknd', preferFull: true },
  { query: 'Kesariya Arijit Singh', preferFull: true },
  { query: 'Tum Hi Ho Arijit Singh', preferFull: true },
  { query: 'Apna Bana Le Arijit Singh', preferFull: true },
  { query: 'Chaleya Arijit Singh', preferFull: true },
  { query: 'Raataan Lambiyan Jubin Nautiyal', preferFull: true },
  { query: 'Husn Anuv Jain', preferFull: true },
];

export async function loadFeaturedSongs(): Promise<SongItem[]> {
  const results = await Promise.all(
    FEATURED_QUERIES.map(async (item) => {
      try {
        let bestSaavn: SongItem | null = null;
        if (item.preferFull) {
          const saavn = await fetchSaavnSongs(item.query);
          if (saavn.length > 0) {
            bestSaavn = saavn[0];
            if (scoreTrackRelevance(bestSaavn, item.query) >= 120) {
              return bestSaavn;
            }
          }
        }
        const itunes = await fetchItunesSongs(item.query);
        if (itunes.length > 0) {
          itunes.sort((a, b) => scoreTrackRelevance(b, item.query) - scoreTrackRelevance(a, item.query));
          if (bestSaavn && scoreTrackRelevance(bestSaavn, item.query) >= scoreTrackRelevance(itunes[0], item.query)) {
            return bestSaavn;
          }
          return itunes[0];
        }
        if (bestSaavn) return bestSaavn;
        const audius = await fetchAudiusSongs(item.query);
        return audius[0] || null;
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
  const naturalCap = Math.max(1.75, wordCount * 0.56);
  const sweepEnd = Math.min(end, start + naturalCap);
  const totalDur = Math.max(0.4, sweepEnd - start);

  const weights = rawWords.map((w) => Math.max(0.95, w.replace(/[^a-zA-Z0-9]/g, '').length * 0.52 + 0.85));
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
 * Parses LRC timestamps with exact blank-line end boundaries, note cleanup (♪ / ♫),
 * and same-timestamp duplicate/translation filtering.
 */
export function parseLrc(lrc: string, fallbackDuration = 220): LyricLine[] {
  const rawEvents: Array<{ time: number; text: string }> = [];
  const tagRx = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const raw of lrc.split(/\r?\n/)) {
    const matches = Array.from(raw.matchAll(tagRx));
    if (matches.length === 0) continue;

    // Strip all [mm:ss.xx] tags & inline enhanced-LRC <mm:ss.xx> word tags
    const stripped = raw
      .replace(tagRx, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s♪♫•·.*…-]+$/g, '')
      .trim();

    for (const m of matches) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const frac = parseInt((m[3] || '0').padEnd(3, '0'), 10) / 1000;
      const time = mins * 60 + secs + frac;
      rawEvents.push({ time, text: stripped });
    }
  }

  rawEvents.sort((a, b) => a.time - b.time);

  // Deduplicate simultaneous bilingual/translation lines while keeping blank boundary gaps
  const events: Array<{ time: number; text: string }> = [];
  for (const ev of rawEvents) {
    const prev = events[events.length - 1];
    if (ev.text && prev && prev.text && Math.abs(ev.time - prev.time) < 0.3) {
      const prevLatin = /[a-zA-Z]{2,}/.test(prev.text);
      const curLatin = /[a-zA-Z]{2,}/.test(ev.text);
      if (!prevLatin && curLatin) {
        events[events.length - 1] = ev;
      }
      continue;
    }
    events.push(ev);
  }

  const lines: LyricLine[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.text) continue;

    const nextAnyTime = i < events.length - 1 ? events[i + 1].time : Math.min(fallbackDuration, ev.time + 5);
    const end = Math.max(ev.time + 0.7, Math.min(nextAnyTime - 0.03, ev.time + 7.2));
    lines.push(buildTimedLine(ev.time, end, ev.text));
  }

  return lines;
}

/**
 * Scores an LRCLIB candidate strictly by:
 * 1) Exact / token-aligned title match (penalizing extra title words like "Tum Hi Ho Bandhu" vs "Tum Hi Ho")
 * 2) Artist match against any credited singer/composer
 * 3) Full track duration match (even for 30s iTunes previews when `song.fullDuration` is available!)
 * 4) Latin readability & phrase granularity
 */
export function scoreLrcCandidate(
  item: LrcLibItem,
  song: Pick<SongItem, 'title' | 'artist' | 'duration' | 'fullDuration' | 'isFullTrack'>,
  cleanTitle: string,
  artistList: string[]
): number {
  let score = 0;

  const targetTitleNorm = normalizeForMatch(cleanTitle);
  const candRawNorm = normalizeForMatch(item.trackName || '');
  const candCleanNorm = normalizeForMatch(cleanTrackTitle(item.trackName || ''));

  const targetWords = targetTitleNorm.split(' ').filter(Boolean);
  const candWords = candCleanNorm.split(' ').filter(Boolean);

  if (candRawNorm === targetTitleNorm || candCleanNorm === targetTitleNorm) {
    score += 170;
  } else if (targetWords.length > 0 && candWords.length > 0) {
    const targetSet = new Set(targetWords);
    const matched = candWords.filter((w) => targetSet.has(w)).length;
    const missing = targetWords.length - candWords.filter((w, idx, arr) => targetSet.has(w) && arr.indexOf(w) === idx).length;
    const extra = Math.max(0, candWords.length - matched);

    if (missing === 0 && extra === 0) {
      score += 155;
    } else if (missing === 0) {
      // Penalize extra title words strongly so "Tum Hi Ho Bandhu" doesn't beat "Tum Hi Ho"
      score += 40 - extra * 58;
    } else {
      const jaccard = matched / Math.max(1, targetWords.length + extra);
      score += jaccard * 85 - missing * 38 - extra * 25;
    }
  }

  // Artist scoring (CRITICAL to avoid matching completely different songs with similar titles!)
  const candArtistNorm = normalizeForMatch(item.artistName || '');
  if (artistList.length > 0 && candArtistNorm) {
    let bestArtistScore = 0;
    for (const art of artistList) {
      const artNorm = normalizeForMatch(art);
      if (!artNorm) continue;
      if (candArtistNorm === artNorm || candArtistNorm.includes(artNorm) || artNorm.includes(candArtistNorm)) {
        bestArtistScore = Math.max(bestArtistScore, 145);
      } else {
        const tokens = artNorm.split(' ').filter((w) => w.length >= 3);
        const hits = tokens.filter((tok) => candArtistNorm.includes(tok)).length;
        if (hits > 0) {
          bestArtistScore = Math.max(bestArtistScore, Math.min(115, hits * 50));
        }
      }
    }
    if (bestArtistScore > 0) {
      score += bestArtistScore;
    } else {
      score -= 160;
    }
  }

  // Duration matching using fullDuration even on 30s previews!
  const refDur =
    song.fullDuration && song.fullDuration > 40
      ? song.fullDuration
      : song.isFullTrack && song.duration > 40
        ? song.duration
        : 0;
  if (refDur > 0 && typeof item.duration === 'number' && item.duration > 0) {
    const durDiff = Math.abs(item.duration - refDur);
    if (durDiff <= 2) score += 155;
    else if (durDiff <= 5) score += 110;
    else if (durDiff <= 12) score += 50;
    else if (durDiff > 22) score -= Math.min(130, durDiff * 1.5);
  }

  // Junk / karaoke / slowed / instrumental LRC penalty
  // Even if song.title has "Vocals Only", still reject karaoke/instrumental/tribute/cover LRC matches
  const strictJunkRx = /\b(karaoke|instrumental|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|sped\s*up|nightcore|tribute to|originally performed|cover version)\b/i;
  if (
    item.instrumental ||
    (!strictJunkRx.test(song.title) && strictJunkRx.test(`${item.trackName || ''} ${item.albumName || ''}`))
  ) {
    score -= 220;
  } else if (!JUNK_PATTERN.test(song.title) && JUNK_PATTERN.test(`${item.trackName || ''} ${item.albumName || ''}`)) {
    score -= 220;
  }

  const lrc = item.syncedLyrics || item.plainLyrics || '';
  if (lrc) {
    const stripped = lrc.replace(/\[[^\]]+\]/g, '');
    if (/[a-zA-Z]{4,}/.test(stripped)) score += 35;
    const validLines = lrc
      .split('\n')
      .filter((l) => l.replace(/\[[^\]]+\]/g, '').trim().length > 1).length;
    score += Math.min(45, validLines * 0.85);
  }

  return score;
}

async function fetchLyricsOvhFallback(artist: string, title: string): Promise<string | null> {
  if (!artist || !title) return null;
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { lyrics?: string };
    const text = json?.lyrics?.trim();
    return text && text.length > 25 ? text : null;
  } catch {
    return null;
  }
}

function buildPlainTimedLyrics(plainText: string, durationSec: number): LyricLine[] {
  const rawLines = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^paroles de la chanson/i.test(l));
  if (rawLines.length === 0) return [];
  const total = Math.max(30, durationSec || 210);
  const usable = Math.max(20, total - 8);
  const step = Math.max(1.1, usable / rawLines.length);
  return rawLines.map((text, i) => buildTimedLine(2 + i * step, 2 + (i + 1) * step - 0.1, text));
}

export async function fetchSyncedLyricsDetailed(
  song: SongItem,
  customQuery?: string
): Promise<LyricsFetchResult> {
  const baseTitle = customQuery ? cleanTrackTitle(customQuery) : cleanTrackTitle(song.title);
  const artists = extractArtistList(song.artist);
  const primaryArtist = artists[0] || '';
  const secondaryArtist = artists[1] || '';
  const refDur =
    song.fullDuration && song.fullDuration > 40
      ? song.fullDuration
      : song.isFullTrack && song.duration > 40
        ? song.duration
        : 0;

  const candidates: LrcLibItem[] = [];
  const requests: Array<Promise<LrcLibItem[]>> = [];

  if (!customQuery && baseTitle && primaryArtist) {
    const artistCandidates = secondaryArtist && secondaryArtist !== primaryArtist
      ? [primaryArtist, secondaryArtist]
      : [primaryArtist];

    for (const art of artistCandidates) {
      const getParams = new URLSearchParams({
        track_name: baseTitle,
        artist_name: art,
      });
      if (refDur > 0) getParams.set('duration', String(Math.round(refDur)));
      requests.push(
        fetch(`https://lrclib.net/api/get?${getParams.toString()}`, { signal: AbortSignal.timeout(4800) })
          .then(async (res) => (res.ok ? [(await res.json()) as LrcLibItem] : []))
          .catch(() => [])
      );
    }

    requests.push(
      fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(baseTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`,
        { signal: AbortSignal.timeout(4800) }
      )
        .then(async (res) => {
          if (!res.ok) return [];
          const items = (await res.json()) as LrcLibItem[];
          return Array.isArray(items) ? items : [];
        })
        .catch(() => [])
    );
  }

  const searchQueries = Array.from(
    new Set(
      customQuery
        ? [customQuery.trim()]
        : [
            primaryArtist ? `${baseTitle} ${primaryArtist}` : '',
            secondaryArtist ? `${baseTitle} ${secondaryArtist}` : '',
            baseTitle,
          ].filter(Boolean)
    )
  );

  for (const q of searchQueries) {
    requests.push(
      fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(4800),
      })
        .then(async (res) => {
          if (!res.ok) return [];
          const items = (await res.json()) as LrcLibItem[];
          return Array.isArray(items) ? items : [];
        })
        .catch(() => [])
    );
  }

  const results = await Promise.all(requests);
  const seenLrc = new Set<string>();
  for (const list of results) {
    for (const item of list) {
      const key = `${item.id || ''}|${item.trackName || ''}|${item.artistName || ''}|${item.duration || ''}`;
      if (seenLrc.has(key)) continue;
      seenLrc.add(key);
      candidates.push(item);
    }
  }

  const minAcceptableScore = customQuery || artists.length === 0 ? 0 : 30;

  const synced = candidates.filter((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 25);
  if (synced.length > 0) {
    const scored = synced
      .map((item) => ({
        item,
        score: scoreLrcCandidate(item, song, baseTitle, customQuery ? [] : artists),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= minAcceptableScore) {
      const parsed = parseLrc(best.item.syncedLyrics!, refDur || best.item.duration || 220);
      if (parsed.length > 0) {
        return {
          lines: parsed,
          matchSource: 'lrclib_synced',
          matchedTrack: best.item.trackName,
          matchedArtist: best.item.artistName,
        };
      }
    }
  }

  const plainCandidates = candidates.filter((r) => r.plainLyrics && r.plainLyrics.trim().length > 25);
  if (plainCandidates.length > 0) {
    const scoredPlain = plainCandidates
      .map((item) => ({
        item,
        score: scoreLrcCandidate(item, song, baseTitle, customQuery ? [] : artists),
      }))
      .sort((a, b) => b.score - a.score);

    const bestPlain = scoredPlain[0];
    if (bestPlain && bestPlain.score >= minAcceptableScore) {
      const lines = buildPlainTimedLyrics(
        bestPlain.item.plainLyrics!,
        refDur || bestPlain.item.duration || (song.isFullTrack ? song.duration || 210 : 210)
      );
      if (lines.length > 0) {
        return {
          lines,
          matchSource: 'lrclib_plain',
          matchedTrack: bestPlain.item.trackName,
          matchedArtist: bestPlain.item.artistName,
        };
      }
    }
  }

  if (primaryArtist && baseTitle) {
    const ovhPlain =
      (await fetchLyricsOvhFallback(primaryArtist, baseTitle)) ||
      (secondaryArtist ? await fetchLyricsOvhFallback(secondaryArtist, baseTitle) : null);
    if (ovhPlain) {
      const lines = buildPlainTimedLyrics(
        ovhPlain,
        refDur || (song.isFullTrack ? song.duration || 210 : 210)
      );
      if (lines.length > 0) {
        return {
          lines,
          matchSource: 'lyrics_ovh_plain',
          matchedTrack: baseTitle,
          matchedArtist: primaryArtist,
        };
      }
    }
  }

  return { lines: [], matchSource: 'none' };
}

export async function fetchSyncedLyricsForSong(song: SongItem): Promise<LyricLine[]> {
  const res = await fetchSyncedLyricsDetailed(song);
  return res.lines;
}

/**
 * Finds the chorus/hook entry timestamp in LRC so 30s previews immediately display
 * live lyrics synced near the hook instead of sitting silent at 0:00!
 */
export function detectChorusStartTime(lyrics: LyricLine[], fullDuration?: number): number {
  if (lyrics.length === 0) return 0;
  if (lyrics.length < 4) return Math.round(lyrics[0].start);

  const lastStart = lyrics[lyrics.length - 1].start;
  const estTotal = Math.max(fullDuration || 0, lastStart + 10, 120);
  const maxAllowed = Math.max(30, estTotal - 26);

  const counts = new Map<string, { count: number; firstHookStart: number }>();
  for (const line of lyrics) {
    const norm = line.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const wordCount = norm.split(/\s+/).filter(Boolean).length;
    if (norm.length < 5 || (wordCount < 2 && norm.length < 7)) continue;
    const existing = counts.get(norm);
    if (existing) {
      existing.count++;
      if (existing.firstHookStart < 18 && line.start >= 18 && line.start <= maxAllowed) {
        existing.firstHookStart = line.start;
      }
    } else {
      counts.set(norm, { count: 1, firstHookStart: line.start });
    }
  }

  let bestCount = 1;
  let bestStart = -1;

  counts.forEach((v) => {
    if (v.count > bestCount && v.firstHookStart >= 18 && v.firstHookStart <= maxAllowed) {
      bestCount = v.count;
      bestStart = v.firstHookStart;
    }
  });

  if (bestStart >= 0) {
    return Math.round(bestStart);
  }

  // Fallback: Apple iTunes 30s previews typically start near 28–34% of the track
  const target = estTotal * 0.3;
  let closest = lyrics[Math.min(lyrics.length - 1, Math.floor(lyrics.length * 0.28))];
  let minDiff = Infinity;
  for (const line of lyrics) {
    if (line.start > maxAllowed) continue;
    const d = Math.abs(line.start - target);
    if (d < minDiff) {
      minDiff = d;
      closest = line;
    }
  }
  return Math.round(closest.start);
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
    let pR = 168, pG = 85, pB = 247;
    let secScore = -1;
    let sR = 10, sG = 132, sB = 255;

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

const RADIO_PLAYLIST_QUERIES = [
  'Trending Hindi',
  'Hindi Hit Songs',
  'Bollywood Romantic',
  'Indie India',
  'Punjabi Hits',
  'Sufi Bollywood',
  'Arijit Singh Best',
  'Bollywood Chill',
];

const GLOBAL_RADIO_ARTISTS = [
  'The Weeknd',
  'Daft Punk',
  'Tame Impala',
  'Sean Paul',
  'Dua Lipa',
  'Cigarettes After Sex',
  'Post Malone',
  'Billie Eilish',
  'Travis Scott',
  'Arctic Monkeys',
  'Coldplay',
  'Joji',
  'Arijit Singh',
  'Anuv Jain',
  'AP Dhillon',
  'Diljit Dosanjh',
  'Pritam',
  'Shreya Ghoshal',
];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function fetchSaavnPlaylistSongs(query: string): Promise<SongItem[]> {
  try {
    const plJson = await fetchSaavnJson<{ data?: { results?: Array<{ id: string }> } }>(
      `/search/playlists?query=${encodeURIComponent(query)}&limit=4`
    );
    const playlists = plJson?.data?.results || [];
    if (playlists.length === 0) return [];
    const picked = playlists[Math.floor(Math.random() * Math.min(playlists.length, 3))];

    const detailJson = await fetchSaavnJson<{ data?: { songs?: SaavnSongRaw[] } }>(
      `/playlists?id=${encodeURIComponent(picked.id)}&limit=25`
    );
    const rows = detailJson?.data?.songs || [];
    return parseSaavnRows(rows, false);
  } catch {
    return [];
  }
}

/**
 * Infinite Smart Radio Engine: fetches fresh, unplayed tracks across Saavn, Audius, & iTunes
 * so playback NEVER stalls or loops the same songs!
 */
export async function fetchInfiniteRadioSongs(
  seedSong: SongItem,
  excludeKeys: Set<string>,
  stationHint?: string
): Promise<SongItem[]> {
  const artists = extractArtistList(seedSong.artist);
  const singer = artists[1] || artists[0] || '';
  const randomPlaylistQ =
    stationHint ||
    RADIO_PLAYLIST_QUERIES[Math.floor(Math.random() * RADIO_PLAYLIST_QUERIES.length)];
  const shuffledArtists = shuffleArray(GLOBAL_RADIO_ARTISTS);
  const randomArtistA = shuffledArtists[0] || 'The Weeknd';
  const randomArtistB = shuffledArtists[1] || 'Arijit Singh';

  const pool: SongItem[] = [];

  if (seedSong.source === 'audius') {
    const [byArtist, byGenre, trending] = await Promise.all([
      singer ? fetchAudiusSongs(singer) : Promise.resolve([]),
      fetchAudiusSongs(randomArtistA),
      fetchAudiusTrending(),
    ]);
    pool.push(...byArtist, ...byGenre, ...trending);
  } else {
    const [byArtistSaavn, byPlaylistSaavn] = await Promise.all([
      singer && !/unknown|local|live/i.test(singer) ? fetchSaavnSongs(singer) : Promise.resolve([]),
      fetchSaavnPlaylistSongs(randomPlaylistQ),
    ]);
    pool.push(...byArtistSaavn, ...byPlaylistSaavn);
  }

  const fresh: SongItem[] = [];
  const seen = new Set<string>(excludeKeys);

  const absorbPool = (items: SongItem[]) => {
    for (const s of shuffleArray(items)) {
      const key = makeSongKey(s.title, s.artist);
      if (seen.has(key) || seen.has(s.id)) continue;
      seen.add(key);
      fresh.push(s);
      if (fresh.length >= 12) break;
    }
  };

  absorbPool(pool);

  // If primary source yielded < 4 unplayed tracks (either CORS-blocked or already played), expand across iTunes & Audius
  if (fresh.length < 4) {
    const [byArtistItunes, byRandomA, byRandomB, trendingAudius] = await Promise.all([
      singer && !/unknown|local|live/i.test(singer) ? fetchItunesSongs(singer) : Promise.resolve([]),
      fetchItunesSongs(randomArtistA),
      fetchItunesSongs(randomArtistB),
      fetchAudiusTrending(),
    ]);
    absorbPool([...byArtistItunes, ...byRandomA, ...byRandomB, ...trendingAudius.slice(0, 6)]);
  }

  return fresh;
}

export async function launchRadioStation(stationQuery: string): Promise<SongItem[]> {
  if (/electronic|audius|synthwave/i.test(stationQuery)) {
    const [searched, trending] = await Promise.all([
      fetchAudiusSongs(stationQuery),
      fetchAudiusTrending(),
    ]);
    const combined = shuffleArray([...searched, ...trending]);
    const seen = new Set<string>();
    const out: SongItem[] = [];
    for (const s of combined) {
      const k = makeSongKey(s.title, s.artist);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 16) break;
    }
    if (out.length > 0) return out;
  }

  const [plSongs, searchSongs] = await Promise.all([
    fetchSaavnPlaylistSongs(stationQuery),
    fetchSaavnSongs(stationQuery),
  ]);

  let pool = [...searchSongs, ...plSongs];
  if (pool.length < 4) {
    const [itunesFallback, audiusFallback] = await Promise.all([
      fetchItunesSongs(stationQuery),
      fetchAudiusSongs(stationQuery),
    ]);
    pool = [...pool, ...itunesFallback, ...audiusFallback];
  }

  const combined = shuffleArray(pool);
  const seen = new Set<string>();
  const out: SongItem[] = [];
  for (const s of combined) {
    const k = makeSongKey(s.title, s.artist);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 16) break;
  }
  return out;
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
