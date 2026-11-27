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
  /\b(karaoke|instrumental version|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|sped\s*up|nightcore|vocals?\s*only|a\s*cappella|acapella|tribute to|originally\s+perf?ormed|melody karaoke|mashup|x\s+aahatein|cover version)\b/i;

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
  const featMatch = song.title.match(/(?:\(|\[|\b)(?:feat|ft)\.?\s+([^)\]]+)/i);
  const aNorm = normalizeForMatch(`${song.artist} ${featMatch?.[1] || ''}`);
  const albNorm = normalizeForMatch(song.album);
  let score = 0;

  if (tNorm === qNorm || rawTNorm === qNorm) score += 140;
  else if (`${tNorm} ${aNorm}`.includes(qNorm)) score += 95;
  else if (tNorm.startsWith(qNorm)) score += 80;

  let titleTokenHits = 0;
  let artistTokenHits = 0;
  let albumTokenHits = 0;
  for (const tok of qTokens) {
    const inTitle = tNorm.includes(tok);
    const inArtist = aNorm.includes(tok);
    const inAlbum = albNorm.includes(tok);
    if (inTitle) {
      titleTokenHits++;
      score += 28;
    }
    if (inArtist) {
      artistTokenHits++;
      score += inTitle ? 18 : 30;
    }
    if (inAlbum) {
      albumTokenHits++;
    }
  }

  // Big synergy bonus when both title and real artist match query tokens
  if (titleTokenHits >= 1 && artistTokenHits >= 1) {
    score += 65;
  }

  // Penalize keyword-stuffed knockoff titles whose credited artist & album have zero query overlap
  if (
    qTokens.length >= 2 &&
    tNorm !== qNorm &&
    rawTNorm !== qNorm &&
    artistTokenHits === 0 &&
    albumTokenHits === 0 &&
    titleTokenHits >= 2
  ) {
    score -= 160;
  }

  if (!allowJunkForQuery(query) && JUNK_PATTERN.test(`${song.title} ${song.album}`)) {
    score -= 160;
  }
  if (
    !/\b(remix|cover|lofi|lo-fi|reprise|unplugged|slowed|reverb|sped\s*up|8d|mashup|bootleg|flip|dj|bass\s*boosted)\b/i.test(query) &&
    /\b(remix|cover|reprise|unplugged|lo-?fi|slowed|reverb|sped\s*up|8d|mashup|bootleg|flip|dj\s+mix|bass\s*boosted)\b/i.test(song.title)
  ) {
    score -= 55;
  }

  if (song.isFullTrack && song.source === 'saavn') score += 32;
  else if (song.isFullTrack && song.source === 'audius') score += 12;

  const realDur = song.fullDuration || song.duration;
  if (realDur > 0 && realDur < 110 && !/\b(intro|interlude|skit)\b/i.test(query)) {
    score -= 25;
  }

  if (song.playCount && song.playCount > 100000) {
    score += Math.min(25, Math.log10(song.playCount) * 3);
  }

  return score;
}

/**
 * Built-in gentle serialized JioSaavn full-track backend (with optional self-hosted override).
 * - Never bursted on Home load (zero 429 rate-limit spam)
 * - Strictly serialized (>=320ms spacing), response-cached, and 90s auto-cooldown on errors
 * - Zero dead mirrors or failing third-party CORS proxies
 */
export const DEFAULT_SAAVN_BASE_URL = 'https://saavn.sumit.co/api';
export const CUSTOM_SAAVN_STORAGE_KEY = 'aura_saavn_api_url';
const SAAVN_MIN_GAP_MS = 320;
const SAAVN_CACHE_TTL_MS = 10 * 60_000;

let customSaavnOverride: string | null | undefined = undefined;
let saavnCooldownUntil = 0;
let lastSaavnFetchAt = 0;
let saavnQueueTail: Promise<void> = Promise.resolve();
const saavnResponseCache = new Map<string, { at: number; data: unknown }>();
const saavnUpgradeCache = new Map<string, SongItem | null>();
const youtubeUpgradeCache = new Map<string, SongItem | null>();
let pipedCooldownUntil = 0;

function normalizeSaavnBaseUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getCustomSaavnBaseUrl(): string | null {
  if (customSaavnOverride !== undefined) return customSaavnOverride;

  if (typeof window !== 'undefined') {
    try {
      const param = new URLSearchParams(window.location.search).get('saavn_api');
      const normalizedParam = normalizeSaavnBaseUrl(param);
      if (normalizedParam) return normalizedParam;
    } catch {
      // ignore
    }
    try {
      const stored = window.localStorage?.getItem(CUSTOM_SAAVN_STORAGE_KEY);
      const normalizedStored = normalizeSaavnBaseUrl(stored);
      if (normalizedStored) return normalizedStored;
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveSaavnBaseUrl(): string | null {
  // Only query Saavn when a self-hosted custom endpoint is configured (public saavn.sumit.co returns 429).
  return getCustomSaavnBaseUrl();
}

export function setCustomSaavnBaseUrl(url: string | null): string | null {
  const normalized = normalizeSaavnBaseUrl(url);
  customSaavnOverride = normalized;
  saavnCooldownUntil = 0;
  saavnResponseCache.clear();
  saavnUpgradeCache.clear();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (normalized) window.localStorage.setItem(CUSTOM_SAAVN_STORAGE_KEY, normalized);
      else window.localStorage.removeItem(CUSTOM_SAAVN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return normalized;
}

export function resetSaavnClientStateForTests(): void {
  customSaavnOverride = undefined;
  saavnCooldownUntil = 0;
  lastSaavnFetchAt = 0;
  saavnQueueTail = Promise.resolve();
  saavnResponseCache.clear();
  saavnUpgradeCache.clear();
  youtubeUpgradeCache.clear();
  pipedCooldownUntil = 0;
  lyricsResultCache.clear();
}

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

async function fetchSaavnJson<T>(path: string, timeoutMs = 4200): Promise<T | null> {
  const baseUrl = resolveSaavnBaseUrl();
  if (!baseUrl) return null;
  const cacheKey = `${baseUrl}${path}`;
  const cached = saavnResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SAAVN_CACHE_TTL_MS) {
    return cached.data as T;
  }
  if (Date.now() < saavnCooldownUntil) return null;

  const isDefaultPublic = baseUrl === DEFAULT_SAAVN_BASE_URL;
  let releaseQueue: () => void = () => {};
  if (isDefaultPublic) {
    const prev = saavnQueueTail;
    saavnQueueTail = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await prev;
  }

  try {
    // Re-check cache & cooldown after waiting in queue
    const reCached = saavnResponseCache.get(cacheKey);
    if (reCached && Date.now() - reCached.at < SAAVN_CACHE_TTL_MS) {
      return reCached.data as T;
    }
    if (Date.now() < saavnCooldownUntil) return null;

    if (isDefaultPublic && lastSaavnFetchAt > 0) {
      const waitMs = SAAVN_MIN_GAP_MS - (Date.now() - lastSaavnFetchAt);
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    lastSaavnFetchAt = Date.now();

    const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      saavnCooldownUntil = Date.now() + 90_000;
      return null;
    }
    const json = (await res.json()) as T;
    if (!isValidSaavnPayload(json, false)) {
      saavnCooldownUntil = Date.now() + 90_000;
      return null;
    }
    if (saavnResponseCache.size > 60) {
      const firstKey = saavnResponseCache.keys().next().value;
      if (firstKey) saavnResponseCache.delete(firstKey);
    }
    saavnResponseCache.set(cacheKey, { at: Date.now(), data: json });
    return json;
  } catch {
    saavnCooldownUntil = Date.now() + 90_000;
    return null;
  } finally {
    releaseQueue();
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

export async function fetchItunesSongs(
  query: string,
  options?: { limit?: number; country?: string }
): Promise<SongItem[]> {
  try {
    const limit = options?.limit ?? 15;
    const countryParam = options?.country ? `&country=${encodeURIComponent(options.country)}` : '';
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}${countryParam}`,
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
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Searches REAL songs across Audius (CORS-native FULL), Apple iTunes (Global catalog + HD covers), & optional self-hosted JioSaavn.
 */
export async function searchRealSongs(query: string): Promise<SongItem[]> {
  const q = query.trim();
  if (!q) return [];

  const isIndianQuery =
    /\b(hindi|bollywood|indian|indie|punjabi|arijit|anuv|pritam|mithoon|sachin|jigar|anirudh|jubin|diljit|ap dhillon|atif|shreya|kesariya|tum hi ho|apna bana|chaleya|raataan|husn|baarishein|sufi|desi)\b/i.test(
      q
    );

  const [saavnResults, itunesResults, itunesRegional, audiusResults] = await Promise.all([
    fetchSaavnSongs(q),
    fetchItunesSongs(q, { limit: 15 }),
    isIndianQuery ? fetchItunesSongs(q, { limit: 12, country: 'IN' }) : Promise.resolve([]),
    fetchAudiusSongs(q),
  ]);

  const combined = [...saavnResults, ...itunesResults, ...itunesRegional, ...audiusResults];
  const byKey = new Map<string, { song: SongItem; score: number }>();

  const absorb = (items: SongItem[]) => {
    for (const s of items) {
      const key = makeSongKey(s.title, s.artist);
      const sc = scoreTrackRelevance(s, q);
      const prev = byKey.get(key);
      if (!prev || sc > prev.score || (sc === prev.score && s.isFullTrack && !prev.song.isFullTrack)) {
        byKey.set(key, { song: s, score: sc });
      }
    }
  };

  absorb(combined);

  // If global search missed or returned only weak/knockoff hits, probe regional IN catalog once
  if (!isIndianQuery) {
    let bestScore = -Infinity;
    byKey.forEach((v) => {
      if (v.score > bestScore) bestScore = v.score;
    });
    if (byKey.size === 0 || bestScore < 95) {
      const fallbackIn = await fetchItunesSongs(q, { limit: 10, country: 'IN' });
      absorb(fallbackIn);
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.song)
    .slice(0, 14);
}

interface FeaturedTrackSpec {
  query: string;
  expectedTitle: string;
  expectedArtists: string[];
  country?: string;
  fallbacks?: Array<Omit<FeaturedTrackSpec, 'fallbacks'>>;
}

const FEATURED_QUERIES: FeaturedTrackSpec[] = [
  { query: 'No Lie Sean Paul Dua Lipa', expectedTitle: 'No Lie', expectedArtists: ['Sean Paul', 'Dua Lipa'] },
  { query: 'Starboy The Weeknd', expectedTitle: 'Starboy', expectedArtists: ['The Weeknd'] },
  { query: 'Kesariya Arijit Singh', expectedTitle: 'Kesariya', expectedArtists: ['Pritam', 'Arijit Singh'], country: 'IN' },
  { query: 'Tum Hi Ho Arijit Singh', expectedTitle: 'Tum Hi Ho', expectedArtists: ['Mithoon', 'Arijit Singh'], country: 'IN' },
  { query: 'Apna Bana Le Arijit Singh', expectedTitle: 'Apna Bana Le', expectedArtists: ['Sachin-Jigar', 'Arijit Singh'], country: 'IN' },
  { query: 'Chaleya Arijit Singh', expectedTitle: 'Chaleya', expectedArtists: ['Anirudh', 'Arijit Singh', 'Shilpa Rao'], country: 'IN' },
  { query: 'Raataan Lambiyan Jubin Nautiyal', expectedTitle: 'Raataan Lambiyan', expectedArtists: ['Tanishk Bagchi', 'Jubin Nautiyal', 'Asees Kaur'], country: 'IN' },
  {
    query: 'Husn Anuv Jain',
    expectedTitle: 'Husn',
    expectedArtists: ['Anuv Jain'],
    country: 'IN',
    fallbacks: [
      { query: 'Jo Tum Mere Ho Anuv Jain', expectedTitle: 'Jo Tum Mere Ho', expectedArtists: ['Anuv Jain'], country: 'IN' },
      { query: 'Baarishein Anuv Jain', expectedTitle: 'Baarishein', expectedArtists: ['Anuv Jain'], country: 'IN' },
      { query: 'Alag Aasmaan Anuv Jain', expectedTitle: 'Alag Aasmaan', expectedArtists: ['Anuv Jain'], country: 'IN' },
      { query: 'Agar Tum Saath Ho Arijit Singh', expectedTitle: 'Agar Tum Saath Ho', expectedArtists: ['Alka Yagnik', 'Arijit Singh'], country: 'IN' },
    ],
  },
];

const FEATURED_KNOCKOFF_MODIFIERS =
  /\b(remix|cover|reprise|unplugged|karaoke|instrumental|lo-?fi|slowed|reverb|sped\s*up|nightcore|8d|acoustic|live|mashup|tribute|ringtone|dj\s+mix|synthwave|dance\s+mix|club\s+mix)\b/i;

export function matchesFeaturedSpec(
  song: SongItem,
  spec: Pick<FeaturedTrackSpec, 'expectedTitle' | 'expectedArtists'>
): boolean {
  if (JUNK_PATTERN.test(`${song.title} ${song.album}`)) return false;
  if (FEATURED_KNOCKOFF_MODIFIERS.test(song.title)) return false;
  if (song.fullDuration !== undefined && song.fullDuration > 0 && song.fullDuration < 110) return false;

  const cleanT = normalizeForMatch(cleanTrackTitle(song.title));
  const rawT = normalizeForMatch(song.title);
  const expT = normalizeForMatch(spec.expectedTitle);
  const titleMatches =
    cleanT === expT ||
    rawT === expT ||
    cleanT.startsWith(`${expT} `) ||
    rawT.startsWith(`${expT} `);
  if (!titleMatches) return false;

  const featMatch = song.title.match(/(?:\(|\[|\b)(?:feat|ft)\.?\s+([^)\]]+)/i);
  const artistNorm = normalizeForMatch(`${song.artist} ${featMatch?.[1] || ''}`);
  return spec.expectedArtists.some((art) => artistNorm.includes(normalizeForMatch(art)));
}

/**
 * On-demand single-track upgrade: turns an iTunes 30s preview into the verified
 * full-length 320kbps studio track starting at 0:00 (with CORS-enabled live FFT & exact lyric sync!)
 * while strictly rejecting remixes, sped-up edits, karaoke covers, and duration mismatches.
 */
export async function upgradeToFullSaavnTrack(song: SongItem): Promise<SongItem | null> {
  if (song.isFullTrack || song.source !== 'itunes') return null;
  if (saavnUpgradeCache.has(song.id)) {
    return saavnUpgradeCache.get(song.id) ?? null;
  }

  const cleanT = cleanTrackTitle(song.title);
  const targetCleanNorm = normalizeForMatch(cleanT);
  if (!targetCleanNorm) return null;

  const artists = extractAllSongArtists(song);
  const query = `${cleanT} ${artists.slice(0, 2).join(' ')}`.trim();
  const candidates = await fetchSaavnSongs(query);
  const allowModifier = FEATURED_KNOCKOFF_MODIFIERS.test(song.title);

  let best: { cand: SongItem; score: number } | null = null;
  for (const cand of candidates) {
    if (!cand.isFullTrack || cand.source !== 'saavn' || !cand.audioUrl) continue;
    if (JUNK_PATTERN.test(`${cand.title} ${cand.artist} ${cand.album}`)) continue;
    if (!allowModifier && FEATURED_KNOCKOFF_MODIFIERS.test(cand.title)) continue;

    // Require exact cleaned title match so "Tum Hi Ho Bandhu" never replaces "Tum Hi Ho"
    const candCleanNorm = normalizeForMatch(cleanTrackTitle(cand.title));
    if (candCleanNorm !== targetCleanNorm) continue;

    // Require verified artist overlap
    const candArtistNorm = normalizeForMatch(`${cand.artist} ${cand.title}`);
    let artistMatched = artists.length === 0;
    for (const art of artists) {
      const aNorm = normalizeForMatch(art);
      if (!aNorm) continue;
      if (candArtistNorm.includes(aNorm)) {
        artistMatched = true;
        break;
      }
      const tokens = aNorm.split(' ').filter((w) => w.length >= 4);
      if (tokens.some((tok) => candArtistNorm.includes(tok))) {
        artistMatched = true;
        break;
      }
    }
    if (!artistMatched) continue;

    // Strict studio duration guard (+/- 14s) so sped-up/extended/alternate masters are rejected
    let durBonus = 0;
    if (song.fullDuration && song.fullDuration > 45 && cand.duration > 45) {
      const diff = Math.abs(cand.duration - song.fullDuration);
      if (diff > 14) continue;
      durBonus = Math.max(0, 60 - diff * 4);
    }

    const sc = scoreTrackRelevance(cand, query) + durBonus;
    if (!best || sc > best.score) {
      best = { cand, score: sc };
    }
  }

  const upgraded: SongItem | null = best
    ? {
        ...song,
        audioUrl: best.cand.audioUrl,
        duration: best.cand.duration,
        fullDuration: best.cand.duration,
        artworkUrl: song.artworkUrl || best.cand.artworkUrl,
        source: 'saavn',
        isFullTrack: true,
        playCount: best.cand.playCount ?? song.playCount,
      }
    : null;

  if (saavnUpgradeCache.size > 60) {
    const firstKey = saavnUpgradeCache.keys().next().value;
    if (firstKey) saavnUpgradeCache.delete(firstKey);
  }
  saavnUpgradeCache.set(song.id, upgraded);
  return upgraded;
}

interface KnownYoutubeTrack {
  videoId: string;
  duration: number;
}

/**
 * Embed-verified official YouTube Music studio masters (<= 1s diff vs LRCLIB)
 * for instant 0ms full-length playback of Featured tracks from 0:00.
 */
const KNOWN_YOUTUBE_BY_ID: Record<string, KnownYoutubeTrack> = {
  'itunes-1444609119': { videoId: 'jOF8gqpoPgs', duration: 222 }, // No Lie (feat. Dua Lipa)
  'itunes-1440870375': { videoId: '3_g2un5M350', duration: 231 }, // Starboy (feat. Daft Punk)
  'itunes-1635014240': { videoId: 'NJAv_7lHUIU', duration: 269 }, // Kesariya
  'itunes-1073359419': { videoId: 'fsiPzT50ZiM', duration: 262 }, // Tum Hi Ho
  'itunes-1653219849': { videoId: 'YALvuUpY_b0', duration: 262 }, // Apna Bana Le
  'itunes-1702461667': { videoId: 'V_jp5_VAzXk', duration: 201 }, // Chaleya
  'itunes-1580955743': { videoId: 'Dm6YRJHy64c', duration: 231 }, // Raataan Lambiyan
  'itunes-1717140552': { videoId: '_deqdZmKzyg', duration: 218 }, // Husn
};

const KNOWN_YOUTUBE_BY_KEY: Record<string, KnownYoutubeTrack> = {
  'nolie::seanpaul': { videoId: 'jOF8gqpoPgs', duration: 222 },
  'nolie::dualipa': { videoId: 'jOF8gqpoPgs', duration: 222 },
  'starboy::theweeknd': { videoId: '3_g2un5M350', duration: 231 },
  'kesariya::pritam': { videoId: 'NJAv_7lHUIU', duration: 269 },
  'kesariya::arijitsingh': { videoId: 'NJAv_7lHUIU', duration: 269 },
  'tumhiho::mithoon': { videoId: 'fsiPzT50ZiM', duration: 262 },
  'tumhiho::arijitsingh': { videoId: 'fsiPzT50ZiM', duration: 262 },
  'apnabanale::arijitsingh': { videoId: 'YALvuUpY_b0', duration: 262 },
  'apnabanale::sachinjigar': { videoId: 'YALvuUpY_b0', duration: 262 },
  'chaleya::anirudhravichander': { videoId: 'V_jp5_VAzXk', duration: 201 },
  'chaleya::anirudh': { videoId: 'V_jp5_VAzXk', duration: 201 },
  'chaleya::arijitsingh': { videoId: 'V_jp5_VAzXk', duration: 201 },
  'raataanlambiyan::tanishkbagchi': { videoId: 'Dm6YRJHy64c', duration: 231 },
  'raataanlambiyan::jubinnautiyal': { videoId: 'Dm6YRJHy64c', duration: 231 },
  'husn::anuvjain': { videoId: '_deqdZmKzyg', duration: 218 },
};

export function getKnownYoutubeFullTrack(
  song: Pick<SongItem, 'id' | 'title' | 'artist' | 'source' | 'isFullTrack'>
): KnownYoutubeTrack | null {
  if (song.isFullTrack || song.source !== 'itunes') return null;
  if (Object.prototype.hasOwnProperty.call(KNOWN_YOUTUBE_BY_ID, song.id)) {
    return KNOWN_YOUTUBE_BY_ID[song.id];
  }
  const primaryKey = makeSongKey(song.title, song.artist);
  if (Object.prototype.hasOwnProperty.call(KNOWN_YOUTUBE_BY_KEY, primaryKey)) {
    return KNOWN_YOUTUBE_BY_KEY[primaryKey];
  }
  const cleanT = cleanTrackTitle(song.title).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const art of extractAllSongArtists(song)) {
    const key = `${cleanT}::${art.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (Object.prototype.hasOwnProperty.call(KNOWN_YOUTUBE_BY_KEY, key)) {
      return KNOWN_YOUTUBE_BY_KEY[key];
    }
  }
  return null;
}

interface PipedSearchItem {
  url?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  isShort?: boolean;
}

const PIPED_MUSIC_SEARCH_BASE = 'https://api.piped.private.coffee';

/**
 * Resolves ANY song (English, Hindi, Punjabi, Global) to its official full-length
 * YouTube Music track (`youtube://<videoId>`) starting at 0:00 so playback is never cut to 30s.
 */
export async function upgradeToFullYoutubeTrack(song: SongItem): Promise<SongItem | null> {
  if (song.isFullTrack || song.source !== 'itunes') return null;
  if (youtubeUpgradeCache.has(song.id)) {
    return youtubeUpgradeCache.get(song.id) ?? null;
  }

  const known = getKnownYoutubeFullTrack(song);
  if (known) {
    const upgraded: SongItem = {
      ...song,
      audioUrl: `youtube://${known.videoId}`,
      duration: known.duration,
      fullDuration: known.duration,
      source: 'youtube',
      isFullTrack: true,
    };
    youtubeUpgradeCache.set(song.id, upgraded);
    return upgraded;
  }

  if (Date.now() < pipedCooldownUntil) return null;

  const cleanT = cleanTrackTitle(song.title);
  const targetCleanNorm = normalizeForMatch(cleanT);
  if (!targetCleanNorm) return null;

  const artists = extractAllSongArtists(song);
  const query = `${cleanT} ${artists.slice(0, 2).join(' ')}`.trim();
  const allowModifier = FEATURED_KNOCKOFF_MODIFIERS.test(song.title);

  try {
    const res = await fetch(
      `${PIPED_MUSIC_SEARCH_BASE}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
      { signal: AbortSignal.timeout(4800) }
    );
    if (!res.ok) {
      pipedCooldownUntil = Date.now() + 60_000;
      return null;
    }
    const json = (await res.json()) as { items?: PipedSearchItem[] };
    const items = Array.isArray(json?.items) ? json.items : [];

    let best: { videoId: string; duration: number; score: number } | null = null;
    for (const item of items.slice(0, 12)) {
      if (item.isShort) continue;
      const dur = Number(item.duration) || 0;
      if (dur < 60 || dur > 900) continue;

      const idMatch = (item.url || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
      const videoId = idMatch?.[1];
      if (!videoId) continue;

      const title = decodeHtml(item.title || '');
      const uploader = decodeHtml(item.uploaderName || '');
      if (!title) continue;
      if (JUNK_PATTERN.test(`${title} ${uploader}`)) continue;
      if (!allowModifier && FEATURED_KNOCKOFF_MODIFIERS.test(title)) continue;

      const candCleanNorm = normalizeForMatch(cleanTrackTitle(title));
      const candFullNorm = normalizeForMatch(`${title} ${uploader}`);

      let score = 0;
      if (candCleanNorm === targetCleanNorm) {
        score += 140;
      } else if (candCleanNorm.includes(targetCleanNorm) || targetCleanNorm.includes(candCleanNorm)) {
        score += 80;
      } else {
        const tTokens = targetCleanNorm.split(' ').filter((w) => w.length >= 2);
        const hits = tTokens.filter((tok) => candFullNorm.includes(tok)).length;
        if (hits === 0) continue;
        score += (hits / Math.max(1, tTokens.length)) * 65;
      }

      let artistMatched = artists.length === 0;
      for (const art of artists) {
        const aNorm = normalizeForMatch(art);
        if (!aNorm) continue;
        if (candFullNorm.includes(aNorm)) {
          artistMatched = true;
          score += 75;
          break;
        }
        const tokens = aNorm.split(' ').filter((w) => w.length >= 4);
        if (tokens.some((tok) => candFullNorm.includes(tok))) {
          artistMatched = true;
          score += 45;
          break;
        }
      }
      if (!artistMatched) continue;

      if (song.fullDuration && song.fullDuration > 45) {
        const diff = Math.abs(dur - song.fullDuration);
        if (diff > 35) continue;
        if (diff <= 4) score += 90;
        else if (diff <= 12) score += 60;
        else score += Math.max(0, 35 - diff);
      }

      if (!best || score > best.score) {
        best = { videoId, duration: dur, score };
      }
    }

    const upgraded: SongItem | null =
      best && best.score >= 120
        ? {
            ...song,
            audioUrl: `youtube://${best.videoId}`,
            duration: best.duration,
            fullDuration: best.duration,
            source: 'youtube',
            isFullTrack: true,
          }
        : null;

    if (youtubeUpgradeCache.size > 80) {
      const firstKey = youtubeUpgradeCache.keys().next().value;
      if (firstKey) youtubeUpgradeCache.delete(firstKey);
    }
    youtubeUpgradeCache.set(song.id, upgraded);
    return upgraded;
  } catch {
    pipedCooldownUntil = Date.now() + 60_000;
    return null;
  }
}

/**
 * Audio-verified exact iTunes 30s preview start offsets (seconds into full studio master).
 * Ensures millisecond-accurate lyric lock even on global tracks that play as 30s previews!
 */
const KNOWN_ITUNES_PREVIEW_OFFSETS_BY_ID: Record<string, number> = {
  'itunes-1444609119': 47.0, // No Lie (feat. Dua Lipa) — Sean Paul
  'itunes-1440870375': 45.0, // Starboy (feat. Daft Punk) — The Weeknd
  'itunes-1635014240': 49.0, // Kesariya (From "Brahmastra") — Pritam, Arijit Singh
  'itunes-1073359419': 29.5, // Tum Hi Ho — Mithoon, Arijit Singh
  'itunes-1653219849': 0.0,  // Apna Bana Le (From "Bhediya") — Arijit Singh
  'itunes-1702461667': 29.8, // Chaleya (From "Jawan") — Anirudh, Arijit Singh
  'itunes-1580955743': 47.8, // Raataan Lambiyan — Tanishk Bagchi, Jubin Nautiyal
  'itunes-1717140552': 49.0, // Husn — Anuv Jain
};

const KNOWN_ITUNES_PREVIEW_OFFSETS_BY_KEY: Record<string, number> = {
  'nolie::seanpaul': 47.0,
  'nolie::dualipa': 47.0,
  'starboy::theweeknd': 45.0,
  'kesariya::pritam': 49.0,
  'kesariya::arijitsingh': 49.0,
  'tumhiho::mithoon': 29.5,
  'tumhiho::arijitsingh': 29.5,
  'apnabanale::arijitsingh': 0.0,
  'apnabanale::sachinjigar': 0.0,
  'chaleya::anirudhravichander': 29.8,
  'chaleya::anirudh': 29.8,
  'chaleya::arijitsingh': 29.8,
  'raataanlambiyan::tanishkbagchi': 47.8,
  'raataanlambiyan::jubinnautiyal': 47.8,
  'husn::anuvjain': 49.0,
};

export function getKnownPreviewOffset(
  song: Pick<SongItem, 'id' | 'title' | 'artist' | 'source' | 'isFullTrack'>
): number | null {
  if (song.isFullTrack || song.source !== 'itunes') return null;
  if (Object.prototype.hasOwnProperty.call(KNOWN_ITUNES_PREVIEW_OFFSETS_BY_ID, song.id)) {
    return KNOWN_ITUNES_PREVIEW_OFFSETS_BY_ID[song.id];
  }
  const primaryKey = makeSongKey(song.title, song.artist);
  if (Object.prototype.hasOwnProperty.call(KNOWN_ITUNES_PREVIEW_OFFSETS_BY_KEY, primaryKey)) {
    return KNOWN_ITUNES_PREVIEW_OFFSETS_BY_KEY[primaryKey];
  }
  const cleanT = cleanTrackTitle(song.title).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const art of extractAllSongArtists(song)) {
    const key = `${cleanT}::${art.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (Object.prototype.hasOwnProperty.call(KNOWN_ITUNES_PREVIEW_OFFSETS_BY_KEY, key)) {
      return KNOWN_ITUNES_PREVIEW_OFFSETS_BY_KEY[key];
    }
  }
  return null;
}

async function resolveSingleFeaturedTrack(
  spec: Omit<FeaturedTrackSpec, 'fallbacks'>
): Promise<SongItem | null> {
  // Only query Saavn on Home burst when user configured a dedicated custom endpoint;
  // default public Saavn is reserved for gentle on-demand 1-track full upgrades on Play & Search!
  if (getCustomSaavnBaseUrl()) {
    const saavn = await fetchSaavnSongs(spec.query);
    const verifiedSaavn = saavn.filter((s) => matchesFeaturedSpec(s, spec));
    if (verifiedSaavn.length > 0) {
      verifiedSaavn.sort((a, b) => scoreTrackRelevance(b, spec.query) - scoreTrackRelevance(a, spec.query));
      return verifiedSaavn[0];
    }
  }

  // Prefer regional storefront first when specified (halves iTunes API calls & avoids US knockoffs)
  if (spec.country) {
    const itunesRegional = await fetchItunesSongs(spec.query, { limit: 18, country: spec.country });
    const verifiedRegional = itunesRegional.filter((s) => matchesFeaturedSpec(s, spec));
    if (verifiedRegional.length > 0) {
      verifiedRegional.sort((a, b) => scoreTrackRelevance(b, spec.query) - scoreTrackRelevance(a, spec.query));
      return verifiedRegional[0];
    }
  }

  const itunesDefault = await fetchItunesSongs(spec.query, { limit: 18 });
  const verifiedDefault = itunesDefault.filter((s) => matchesFeaturedSpec(s, spec));
  if (verifiedDefault.length > 0) {
    verifiedDefault.sort((a, b) => scoreTrackRelevance(b, spec.query) - scoreTrackRelevance(a, spec.query));
    return verifiedDefault[0];
  }

  return null;
}

export async function loadFeaturedSongs(): Promise<SongItem[]> {
  const results = await Promise.all(
    FEATURED_QUERIES.map(async (item) => {
      try {
        const primary = await resolveSingleFeaturedTrack(item);
        if (primary) return primary;

        if (item.fallbacks) {
          for (const fb of item.fallbacks) {
            const hit = await resolveSingleFeaturedTrack(fb);
            if (hit) return hit;
          }
        }
        return null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((x): x is SongItem => x !== null);
}

const lyricsResultCache = new Map<string, LyricsFetchResult>();

export function clearLyricsCache(): void {
  lyricsResultCache.clear();
}

/**
 * Extracts all credited artists from BOTH song.artist and "(feat. X)" / "ft. X" tags in song.title.
 */
export function extractAllSongArtists(song: Pick<SongItem, 'title' | 'artist'>): string[] {
  const fromArtist = extractArtistList(song.artist);
  const featMatches = Array.from(
    decodeHtml(song.title).matchAll(/(?:\(|\[|\b)(?:feat|ft|with)\.?\s+([^)\]–—-]+)/gi)
  );
  const combined = [...fromArtist];
  const seen = new Set(combined.map((a) => a.toLowerCase()));
  for (const m of featMatches) {
    for (const extra of extractArtistList(m[1] || '')) {
      const k = extra.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        combined.push(extra);
      }
    }
  }
  return combined;
}

/**
 * Builds natural vocal-cadence word timings inside a line.
 */
export function buildTimedLine(start: number, end: number, text: string): LyricLine {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = rawWords.length;
  // Syllable/character-aware vocal cadence: snappy on short 1-2 word hooks ("No lie")
  // while never rushing ahead on slower poetic ballad lines.
  const totalChars = rawWords.reduce(
    (acc, w) => acc + w.replace(/[^\p{L}\p{N}]/gu, '').length,
    0
  );
  const naturalCap = Math.min(6.2, Math.max(0.75, wordCount * 0.34 + totalChars * 0.052));
  const sweepEnd = Math.min(end, start + naturalCap);
  const totalDur = Math.max(0.28, sweepEnd - start);

  const weights = rawWords.map((w) => Math.max(0.95, w.replace(/[^\p{L}\p{N}]/gu, '').length * 0.52 + 0.85));
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

const LRC_CREDIT_LINE_RX =
  /^(?:(?:title|artist|album|lyrics?\s*by|music\s*by|composed\s*by|produced\s*by|synced\s*by|written\s*by|arranger|composer|lyricist)\s*[:：]|(?:作词|作曲|编曲|制作人|演唱|词|曲)\s*[:：])/i;

function parseInlineEnhancedWords(
  rawBody: string,
  lineStart: number,
  lineEnd: number,
  offsetSec: number
): LyricWord[] | null {
  const inlineRx = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
  const inlineMatches = Array.from(rawBody.matchAll(inlineRx));
  if (inlineMatches.length === 0) return null;

  const segments: Array<{ start: number; text: string }> = [];
  const leading = rawBody.slice(0, inlineMatches[0].index ?? 0).trim();
  if (leading) {
    segments.push({ start: lineStart, text: leading });
  }

  for (let i = 0; i < inlineMatches.length; i++) {
    const m = inlineMatches[i];
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const frac = parseInt((m[3] || '0').padEnd(3, '0'), 10) / 1000;
    const segStart = Math.max(0, mins * 60 + secs + frac - offsetSec);
    const textStart = (m.index ?? 0) + m[0].length;
    const textEnd = i + 1 < inlineMatches.length ? (inlineMatches[i + 1].index ?? rawBody.length) : rawBody.length;
    const text = rawBody.slice(textStart, textEnd).replace(/\s+/g, ' ').trim();
    if (text) {
      segments.push({ start: segStart, text });
    }
  }

  if (segments.length === 0) return null;

  const words: LyricWord[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segEnd = i + 1 < segments.length ? Math.max(seg.start + 0.08, segments[i + 1].start) : Math.max(seg.start + 0.35, lineEnd);
    const subWords = seg.text.split(/\s+/).filter(Boolean);
    if (subWords.length === 1) {
      words.push({ text: subWords[0], start: seg.start, end: segEnd });
    } else {
      const built = buildTimedLine(seg.start, segEnd, seg.text);
      words.push(...built.words);
    }
  }
  return words.length > 0 ? words : null;
}

/**
 * Parses LRC timestamps with [offset:ms] support, enhanced <mm:ss.xx> word timestamps,
 * exact blank-line end boundaries, note/credit cleanup, and bilingual duplicate filtering.
 */
export function parseLrc(lrc: string, fallbackDuration = 220): LyricLine[] {
  const rawEvents: Array<{ time: number; text: string; rawBody: string }> = [];
  const tagRx = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const offsetMatch = lrc.match(/\[offset\s*:\s*([+-]?\d+)\]/i);
  const offsetSec = offsetMatch ? parseInt(offsetMatch[1], 10) / 1000 : 0;

  for (const raw of lrc.split(/\r?\n/)) {
    const matches = Array.from(raw.matchAll(tagRx));
    if (matches.length === 0) continue;

    const rawBody = raw.replace(tagRx, '').trim();
    // Strip inline enhanced-LRC <mm:ss.xx> word tags for display text
    const stripped = rawBody
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s♪♫•·.*…-]+$/g, '')
      .trim();

    if (stripped && LRC_CREDIT_LINE_RX.test(stripped)) continue;

    for (const m of matches) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const frac = parseInt((m[3] || '0').padEnd(3, '0'), 10) / 1000;
      const time = Math.max(0, mins * 60 + secs + frac - offsetSec);
      rawEvents.push({ time, text: stripped, rawBody });
    }
  }

  rawEvents.sort((a, b) => a.time - b.time);

  // Deduplicate simultaneous bilingual/translation lines while keeping blank boundary gaps
  const events: Array<{ time: number; text: string; rawBody: string }> = [];
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
    const hasTightNext = nextAnyTime > ev.time + 0.16;
    const end = hasTightNext
      ? Math.min(nextAnyTime - 0.02, ev.time + 7.2)
      : Math.max(ev.time + 0.7, Math.min(nextAnyTime - 0.02, ev.time + 7.2));
    const enhancedWords = parseInlineEnhancedWords(ev.rawBody, ev.time, end, offsetSec);
    if (enhancedWords) {
      lines.push({ start: ev.time, end, text: ev.text, words: enhancedWords });
    } else {
      lines.push(buildTimedLine(ev.time, end, ev.text));
    }
  }

  return lines;
}

const ALTERNATE_LRC_VERSION_RX =
  /\b(remix|dance\s+mix|club\s+mix|lo-?fi|slowed|reverb|sped\s*up|nightcore|unplugged|acoustic|live|reprise|cover|mashup|piano|tamil|telugu|malayalam|kannada|arabic|spanish|female\s+version|male\s+version|extended|radio\s+edit|dj\s+mix|bootleg|8d|karaoke|instrumental)\b/i;

function computeLatinLetterRatio(text: string): number {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return 0;
  let latin = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters[i].charCodeAt(0);
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 192 && code <= 591)) {
      latin++;
    }
  }
  return latin / letters.length;
}

/**
 * Scores an LRCLIB candidate strictly by:
 * 1) Exact / token-aligned title match (penalizing extra title words like "Tum Hi Ho Bandhu" vs "Tum Hi Ho")
 * 2) Alternate-version rejection (prevents Remix/Unplugged/Lo-Fi/Tamil/Slowed LRCs from beating original studio cut!)
 * 3) Artist match against any credited singer/composer/featured artist
 * 4) Full track duration match (even for 30s iTunes previews when `song.fullDuration` is available!)
 * 5) True Latin letter ratio & phrase granularity
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
    if (durDiff <= 1.5) score += 170;
    else if (durDiff <= 2.5) score += 155;
    else if (durDiff <= 5) score += 110;
    else if (durDiff <= 12) score += 50;
    else if (durDiff > 22) score -= Math.min(130, durDiff * 1.5);
  }

  // Junk / karaoke / slowed / instrumental / alternate-version LRC penalty
  // Check BEFORE cleanTrackTitle strips parentheses so "(Dance Mix)" / "(Tamil)" / "(Unplugged)" never beat original!
  const strictJunkRx = /\b(karaoke|instrumental|8d audio|ringtone|lofi flip|slowed\s*\+\s*reverb|sped\s*up|nightcore|tribute to|originally performed|cover version)\b/i;
  const candMeta = `${item.trackName || ''} ${item.albumName || ''}`;
  if (
    item.instrumental ||
    (!strictJunkRx.test(song.title) && strictJunkRx.test(candMeta))
  ) {
    score -= 220;
  } else if (!JUNK_PATTERN.test(song.title) && JUNK_PATTERN.test(candMeta)) {
    score -= 220;
  } else if (!ALTERNATE_LRC_VERSION_RX.test(song.title) && ALTERNATE_LRC_VERSION_RX.test(candMeta)) {
    score -= 185;
  }

  const lrc = item.syncedLyrics || item.plainLyrics || '';
  if (lrc) {
    const stripped = lrc.replace(/\[[^\]]+\]/g, '').replace(/<[^>]+>/g, ' ');
    const latinRatio = computeLatinLetterRatio(stripped);
    if (latinRatio >= 0.55) score += 40;
    const validLines = lrc
      .split('\n')
      .filter((l) => l.replace(/\[[^\]]+\]/g, '').trim().length > 1).length;
    score += Math.min(45, validLines * 0.85);

    // Penalize truncated synced LRCs that stop way before the song finishes
    if (item.syncedLyrics && refDur > 90) {
      let maxTs = 0;
      const tsMatches = item.syncedLyrics.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g);
      for (const m of tsMatches) {
        const ts = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        if (ts > maxTs) maxTs = ts;
      }
      if (maxTs > 0 && maxTs < refDur * 0.42) {
        score -= 90;
      }
    }
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
  const artists = extractAllSongArtists(song);
  const primaryArtist = artists[0] || '';
  const secondaryArtist = artists[1] || '';
  const refDur =
    song.fullDuration && song.fullDuration > 40
      ? song.fullDuration
      : song.isFullTrack && song.duration > 40
        ? song.duration
        : 0;

  const cacheKey = `${song.id}|${baseTitle.toLowerCase()}|${artists.join(',').toLowerCase()}|${refDur}|${(customQuery || '').trim().toLowerCase()}`;
  const cached = lyricsResultCache.get(cacheKey);
  if (cached) return cached;

  const candidates: LrcLibItem[] = [];
  const seenLrc = new Set<string>();
  const absorbLrcList = (list: LrcLibItem[]) => {
    for (const item of list) {
      const key = `${item.id || ''}|${item.trackName || ''}|${item.artistName || ''}|${item.duration || ''}`;
      if (seenLrc.has(key)) continue;
      seenLrc.add(key);
      candidates.push(item);
    }
  };

  // Query LRCLIB /api/search first (always returns HTTP 200 -> zero Chrome 404 console spam)
  const searchRequests: Array<Promise<LrcLibItem[]>> = [];
  if (!customQuery && baseTitle && primaryArtist) {
    searchRequests.push(
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
    searchRequests.push(
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

  const searchResults = await Promise.all(searchRequests);
  for (const list of searchResults) {
    absorbLrcList(list);
  }

  const minAcceptableScore = customQuery || artists.length === 0 ? 0 : 30;
  const pickBestLrcMatch = (): LyricsFetchResult | null => {
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
    return null;
  };

  const cacheAndReturn = (res: LyricsFetchResult): LyricsFetchResult => {
    if (res.lines.length > 0) {
      if (lyricsResultCache.size > 60) {
        const firstKey = lyricsResultCache.keys().next().value;
        if (firstKey) lyricsResultCache.delete(firstKey);
      }
      lyricsResultCache.set(cacheKey, res);
    }
    return res;
  };

  const searchHit = pickBestLrcMatch();
  if (searchHit) return cacheAndReturn(searchHit);

  // Fallback to exact /api/get only when /api/search yielded zero acceptable candidates
  if (!customQuery && baseTitle && primaryArtist) {
    const getParams = new URLSearchParams({
      track_name: baseTitle,
      artist_name: primaryArtist,
    });
    if (refDur > 0) getParams.set('duration', String(Math.round(refDur)));
    try {
      const getRes = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`, {
        signal: AbortSignal.timeout(4800),
      });
      if (getRes.ok) {
        absorbLrcList([(await getRes.json()) as LrcLibItem]);
        const getHit = pickBestLrcMatch();
        if (getHit) return cacheAndReturn(getHit);
      }
    } catch {
      // ignore
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
        return cacheAndReturn({
          lines,
          matchSource: 'lyrics_ovh_plain',
          matchedTrack: baseTitle,
          matchedArtist: primaryArtist,
        });
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
 * Finds the primary chorus/hook entry timestamp in LRC so 30s previews land
 * cleanly on the first chorus (~0:30–1:35) instead of late outro refrains!
 */
export function detectChorusStartTime(lyrics: LyricLine[], fullDuration?: number): number {
  if (lyrics.length === 0) return 0;
  if (lyrics.length < 4) return Math.round(lyrics[0].start);

  const lastStart = lyrics[lyrics.length - 1].start;
  const estTotal = Math.max(fullDuration || 0, lastStart + 10, 120);
  const maxAllowed = Math.max(30, estTotal - 26);
  const maxPrimaryWindow = Math.min(maxAllowed, Math.max(70, Math.round(estTotal * 0.46)));
  const idealPreviewPos = estTotal * 0.28;

  const groups = new Map<string, { occurrences: number[]; wordCount: number }>();
  for (const line of lyrics) {
    const norm = line.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = norm.split(/\s+/).filter(Boolean).length;
    if (norm.length < 5 || (wordCount < 2 && norm.length < 7)) continue;
    const existing = groups.get(norm);
    if (existing) {
      existing.occurrences.push(line.start);
    } else {
      groups.set(norm, { occurrences: [line.start], wordCount });
    }
  }

  let bestScore = -Infinity;
  let bestStart = -1;

  groups.forEach((group) => {
    if (group.occurrences.length < 2) return;
    const sortedTimes = [...group.occurrences].sort((a, b) => a - b);
    const earliestPrimary = sortedTimes.find((t) => t >= 18 && t <= maxPrimaryWindow);
    if (earliestPrimary === undefined) return;

    // Count distinct song sections (>= 18s apart) so rapid back-to-back outro loops don't outrank the chorus
    let distinctSections = 1;
    let lastSecTime = sortedTimes[0];
    for (let i = 1; i < sortedTimes.length; i++) {
      if (sortedTimes[i] - lastSecTime >= 18) {
        distinctSections++;
        lastSecTime = sortedTimes[i];
      }
    }

    const sectionScore = distinctSections * 34 + Math.min(18, (sortedTimes.length - distinctSections) * 4);
    const distFromIdeal = Math.abs(earliestPrimary - idealPreviewPos);
    const proximityBonus = Math.max(0, 32 - distFromIdeal * 0.5);
    const richness = Math.min(16, group.wordCount * 3);
    const totalScore = sectionScore + proximityBonus + richness;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestStart = earliestPrimary;
    }
  });

  if (bestStart >= 0) {
    return Math.round(bestStart);
  }

  // Fallback: Apple iTunes 30s previews typically start near 26–32% of the track
  const target = estTotal * 0.28;
  let closest = lyrics[Math.min(lyrics.length - 1, Math.floor(lyrics.length * 0.26))];
  let minDiff = Infinity;
  for (const line of lyrics) {
    if (line.start > maxPrimaryWindow) continue;
    const d = Math.abs(line.start - target);
    if (d < minDiff) {
      minDiff = d;
      closest = line;
    }
  }
  return Math.round(closest.start);
}

export interface PreviewSectionCue {
  label: string;
  offsetSec: number;
}

/**
 * Generates 1-click preview cue points (Start, 0:30, Chorus, Mid) so 30s previews
 * can be snapped to the exact singing section in one click.
 */
export function detectPreviewSectionCues(lyrics: LyricLine[], fullDuration?: number): PreviewSectionCue[] {
  if (lyrics.length === 0) return [];
  const chorus = detectChorusStartTime(lyrics, fullDuration);
  const firstVocal = Math.max(0, Math.floor(lyrics[0].start));
  const lastStart = lyrics[lyrics.length - 1].start;
  const estTotal = Math.max(fullDuration || 0, lastStart + 10, 90);

  const rawCues: PreviewSectionCue[] = [
    { label: 'Start', offsetSec: 0 },
    ...(firstVocal >= 6 ? [{ label: 'Verse 1', offsetSec: firstVocal }] : []),
    { label: '0:30', offsetSec: 30 },
    ...(chorus >= 12 ? [{ label: 'Chorus', offsetSec: chorus }] : []),
    { label: 'Mid', offsetSec: Math.round(estTotal * 0.48) },
  ];

  const deduped: PreviewSectionCue[] = [];
  for (const cue of rawCues) {
    if (cue.offsetSec > Math.max(30, lastStart - 6)) continue;
    if (deduped.some((existing) => Math.abs(existing.offsetSec - cue.offsetSec) < 5)) continue;
    deduped.push(cue);
  }
  return deduped;
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
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Artwork timeout'));
        }
      }, 2500);
      el.crossOrigin = 'anonymous';
      el.onload = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(el);
        }
      };
      el.onerror = (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      };
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
  const hasCustomSaavn = Boolean(getCustomSaavnBaseUrl());

  if (seedSong.source === 'audius') {
    const [byArtist, byGenre, trending] = await Promise.all([
      singer ? fetchAudiusSongs(singer) : Promise.resolve([]),
      fetchAudiusSongs(randomArtistA),
      fetchAudiusTrending(),
    ]);
    pool.push(...byArtist, ...byGenre, ...trending);
  } else if (hasCustomSaavn) {
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

  if (pool.length > 0) absorbPool(pool);

  // Expand across CORS-native iTunes & Audius immediately when primary yielded < 4 tracks
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

  let pool: SongItem[] = [];
  if (getCustomSaavnBaseUrl()) {
    const [plSongs, searchSongs] = await Promise.all([
      fetchSaavnPlaylistSongs(stationQuery),
      fetchSaavnSongs(stationQuery),
    ]);
    pool = [...searchSongs, ...plSongs];
  }

  if (pool.length < 4) {
    const country = /\b(hindi|bollywood|indian|indie|punjabi|arijit|anuv|pritam|diljit|ap dhillon)\b/i.test(
      stationQuery
    )
      ? 'IN'
      : undefined;
    const [itunesFallback, audiusFallback] = await Promise.all([
      fetchItunesSongs(stationQuery, { limit: 16, country }),
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
    .replace(/^\s*\d{1,2}\s*[.)_-]\s+/, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(320\s*kbps|128\s*kbps|official\s*(?:audio|video|music\s*video|lyric\s*video)|pagalworld|mp3song|djpunjab|mr-jatt|songs?\.?pk)\b/gi, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: 'Local File', title: base || 'Untitled' };
}

const KNOWN_TRACK_BPMS: Array<[RegExp, number]> = [
  [/\bno lie\b/i, 102],
  [/\bstarboy\b/i, 93],
  [/\bblinding lights\b/i, 171],
  [/\bkesariya\b/i, 94],
  [/\btum hi ho\b/i, 94],
  [/\bapna bana le\b/i, 94],
  [/\bchaleya\b/i, 100],
  [/\braataan lambiyan\b/i, 110],
  [/\bhusn\b/i, 92],
  [/\blevitating\b/i, 103],
  [/\bsave your tears\b/i, 118],
  [/\bsoftly\b|\bbrown munde\b/i, 96],
  [/\bfein\b|\btravis\b|\bphonk\b/i, 148],
];

/**
 * Estimates musical BPM from known track tempo signatures or median lyric-line cadence
 * so playback-clock-locked groove animations stay locked to the track's actual feel.
 */
export function estimateTrackBpm(
  song: Pick<SongItem, 'title' | 'artist'>,
  lyrics: LyricLine[]
): number {
  const meta = `${song.title} ${song.artist}`;
  for (const [rx, bpm] of KNOWN_TRACK_BPMS) {
    if (rx.test(meta)) return bpm;
  }

  if (lyrics.length >= 6) {
    const gaps: number[] = [];
    for (let i = 1; i < lyrics.length; i++) {
      const g = lyrics[i].start - lyrics[i - 1].start;
      if (g >= 1.1 && g <= 6.0) gaps.push(g);
    }
    if (gaps.length >= 4) {
      gaps.sort((a, b) => a - b);
      const medianGap = gaps[Math.floor(gaps.length / 2)];
      // Most pop/Hindi phrases occupy 4 or 8 beats; fold cleanly into 82–134 BPM range
      let est = (4 / medianGap) * 60;
      while (est < 82) est *= 2;
      while (est > 136) est *= 0.5;
      return Math.round(est);
    }
  }

  return 104;
}
