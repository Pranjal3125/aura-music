import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanTrackTitle,
  detectChorusStartTime,
  extractArtistList,
  fetchInfiniteRadioSongs,
  fetchSyncedLyricsDetailed,
  launchRadioStation,
  makeSongKey,
  parseLrc,
  scoreLrcCandidate,
  scoreTrackRelevance,
  searchRealSongs,
} from '../src/services/musicApi.ts';
import { computeLyricCursor, getWordVisualIcon } from '../src/services/lyricSync.ts';
import { loadUserSettings, PREFS_COOKIE_NAME, sanitizeSettings, saveUserSettings } from '../src/services/settingsStorage.ts';
import { directSongAutonomously } from '../src/engine/vibeBrain.ts';
import { LightAudioEngine } from '../src/engine/lightAudioEngine.ts';
import type { LyricLine, SongItem } from '../src/types.ts';

test('cleanTrackTitle strips parentheticals, vocals-only tags, and movie tags', () => {
  assert.equal(cleanTrackTitle('Apna Bana Le - Arijit Singh Vocals Only'), 'Apna Bana Le');
  assert.equal(cleanTrackTitle('Tum Hi Ho (From "Aashiqui 2")'), 'Tum Hi Ho');
  assert.equal(cleanTrackTitle('No Lie (feat. Dua Lipa)'), 'No Lie');
  assert.equal(cleanTrackTitle('Kesariya - From "Brahmastra"'), 'Kesariya');
  assert.equal(cleanTrackTitle('Starboy - Remastered 2023'), 'Starboy');
});

test('extractArtistList and makeSongKey normalize multi-artist strings', () => {
  assert.deepEqual(extractArtistList('Pritam, Arijit Singh'), ['Pritam', 'Arijit Singh']);
  assert.deepEqual(extractArtistList('Sean Paul & Dua Lipa'), ['Sean Paul', 'Dua Lipa']);
  assert.deepEqual(extractArtistList('Unknown Artist'), []);
  assert.equal(
    makeSongKey('Tum Hi Ho (From "Aashiqui 2")', 'Mithoon, Arijit Singh'),
    'tumhiho::mithoon'
  );
});

test('scoreLrcCandidate prefers exact Tum Hi Ho by Arijit Singh over Tum Hi Ho Bandhu even on 30s preview', () => {
  const song: SongItem = {
    id: 'itunes-1',
    title: 'Tum Hi Ho',
    artist: 'Mithoon, Arijit Singh',
    album: 'Aashiqui 2',
    duration: 30,
    fullDuration: 262,
    artworkUrl: '',
    audioUrl: 'https://example.com/preview.m4a',
    source: 'itunes',
    isFullTrack: false,
  };

  const wrongBandhu = {
    trackName: 'Tum Hi Ho Bandhu',
    artistName: 'Neeraj Shridhar & Kavita Seth',
    albumName: 'Cocktail',
    duration: 284,
    syncedLyrics: '[00:36.00] Tum hi ho bandhu\n'.repeat(25),
  };

  const rightTumHiHo = {
    trackName: 'Tum Hi Ho',
    artistName: 'Arijit Singh',
    albumName: 'Aashiqui 2',
    duration: 262,
    syncedLyrics: '[00:18.00] Hum tere bin ab reh nahi sakte\n'.repeat(16),
  };

  const scoreWrong = scoreLrcCandidate(wrongBandhu, song, 'Tum Hi Ho', ['Mithoon', 'Arijit Singh']);
  const scoreRight = scoreLrcCandidate(rightTumHiHo, song, 'Tum Hi Ho', ['Mithoon', 'Arijit Singh']);

  assert.ok(scoreRight > scoreWrong + 200, `Expected ${scoreRight} >> ${scoreWrong}`);
});

test('parseLrc filters empty notes, bilingual duplicates, multi-timestamps, inline word tags, and creates word timings', () => {
  const raw = [
    '[00:10.00] ♪',
    '[00:12.50] अंधेरे में अपना रास्ता',
    '[00:12.55] Feeling <00:12.80> my way through the darkness',
    '[00:17.00][00:45.00] Guided by a beating heart',
  ].join('\n');

  const lines = parseLrc(raw, 200);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, 'Feeling my way through the darkness');
  assert.equal(lines[0].words.length, 6);
  assert.ok(lines[0].words[0].start < lines[0].words[5].end);
  assert.equal(lines[1].text, 'Guided by a beating heart');
  assert.equal(lines[1].start, 17);
  assert.equal(lines[2].text, 'Guided by a beating heart');
  assert.equal(lines[2].start, 45);
});

test('detectChorusStartTime locates repeated hook or ~30% midpoint', () => {
  const lines: LyricLine[] = [
    { start: 8, end: 12, text: 'Verse one starts softly here', words: [] },
    { start: 14, end: 18, text: 'Second verse keeps moving along', words: [] },
    { start: 44, end: 48, text: 'It is no lie we are shining bright', words: [] },
    { start: 50, end: 54, text: 'Every single night under neon lights', words: [] },
    { start: 112, end: 116, text: 'It is no lie we are shining bright', words: [] },
  ];
  assert.equal(detectChorusStartTime(lines, 210), 44);

  const nonRepeating: LyricLine[] = [
    { start: 10, end: 14, text: 'Line one', words: [] },
    { start: 30, end: 34, text: 'Line two', words: [] },
    { start: 60, end: 64, text: 'Line three', words: [] },
    { start: 100, end: 104, text: 'Line four', words: [] },
  ];
  // Short hook ("No lie" - 6 chars) must still be caught!
  const shortHook: LyricLine[] = [
    { start: 6, end: 10, text: 'Verse intro line', words: [] },
    { start: 32, end: 36, text: 'No lie', words: [] },
    { start: 40, end: 44, text: 'Other line here', words: [] },
    { start: 85, end: 89, text: 'No lie', words: [] },
  ];
  assert.equal(detectChorusStartTime(shortHook, 190), 32);
});

test('computeLyricCursor handles intro, smooth breath-gap holding, interludes, and outro', () => {
  const lines: LyricLine[] = [
    {
      start: 15,
      end: 18,
      text: 'Hello darkness',
      words: [
        { text: 'Hello', start: 15, end: 16.5 },
        { text: 'darkness', start: 16.5, end: 18 },
      ],
    },
    {
      start: 20, // 2s short breath gap -> should NOT flash interlude!
      end: 23,
      text: 'My old friend',
      words: [
        { text: 'My', start: 20, end: 21 },
        { text: 'old', start: 21, end: 22 },
        { text: 'friend', start: 22, end: 23 },
      ],
    },
    {
      start: 35, // 12s solo gap -> should enter interlude!
      end: 38,
      text: 'Final chorus line',
      words: [{ text: 'Final', start: 35, end: 38 }],
    },
  ];

  // Intro at t = 5
  const intro = computeLyricCursor(lines, 5, 0);
  assert.equal(intro.phase, 'intro');
  assert.equal(intro.activeLineIdx, -1);
  assert.equal(intro.upcomingLineIdx, 0);
  assert.ok(intro.secondsUntilNext > 9);

  // Active word 1 at t = 16.8 (+0.14s = 16.94)
  const active = computeLyricCursor(lines, 16.8, 0);
  assert.equal(active.phase, 'active');
  assert.equal(active.activeLineIdx, 0);
  assert.equal(active.activeWordIdx, 1);

  // Short gap at t = 19.0 -> holds line 0 smoothly!
  const held = computeLyricCursor(lines, 19.0, 0);
  assert.equal(held.phase, 'active');
  assert.equal(held.activeLineIdx, 0);

  // Long solo gap at t = 28.0 -> enters interlude with upcomingLineIdx = 2
  const interlude = computeLyricCursor(lines, 28.0, 0);
  assert.equal(interlude.phase, 'interlude');
  assert.equal(interlude.activeLineIdx, -1);
  assert.equal(interlude.upcomingLineIdx, 2);

  // Outro after end at t = 42.0
  const outro = computeLyricCursor(lines, 42.0, 0);
  assert.equal(outro.phase, 'outro');
  assert.equal(outro.upcomingLineIdx, -1);
});

test('getWordVisualIcon maps keywords cleanly and ignores punctuation', () => {
  assert.equal(getWordVisualIcon('Love,'), '♥');
  assert.equal(getWordVisualIcon('tonight!'), '☾');
  assert.equal(getWordVisualIcon('lie.'), '🎭');
  assert.equal(getWordVisualIcon('and'), null);
});

test('settingsStorage persists volume=0.30 and partial updates across cookies and localStorage', () => {
  let cookieJar = '';
  const store = new Map<string, string>();

  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;

  (globalThis as Record<string, unknown>).document = {
    get cookie() {
      return cookieJar;
    },
    set cookie(val: string) {
      const pair = val.split(';')[0];
      cookieJar = pair;
    },
  };

  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };

  try {
    saveUserSettings({ volume: 0.3, lyricStyle: 'apple_ui', infiniteRadio: true });
    assert.ok(cookieJar.includes(PREFS_COOKIE_NAME));

    saveUserSettings({ eqPreset: 'bass_boost' });
    const reloaded = loadUserSettings();
    assert.equal(reloaded.volume, 0.3);
    assert.equal(reloaded.lyricStyle, 'apple_ui');
    assert.equal(reloaded.eqPreset, 'bass_boost');
    assert.equal(reloaded.infiniteRadio, true);

    // Fallback recovery from localStorage when cookie is cleared
    cookieJar = '';
    const recovered = loadUserSettings();
    assert.equal(recovered.volume, 0.3);
    assert.ok(cookieJar.includes(PREFS_COOKIE_NAME));

    // Sanitizer clamping & invalid value rejection
    const clean = sanitizeSettings({ volume: 5, lyricStyle: 'bogus', eqBands: { bass: 99, mid: 0, treble: -99 } });
    assert.equal(clean.volume, 1);
    assert.equal(clean.lyricStyle, undefined);
    assert.deepEqual(clean.eqBands, { bass: 12, mid: 0, treble: -12 });
  } finally {
    (globalThis as Record<string, unknown>).document = prevDoc;
    (globalThis as Record<string, unknown>).window = prevWin;
  }
});

test('directSongAutonomously steers No Lie & prompt keywords to Apple UI / Fisheye', () => {
  const noLie: SongItem = {
    id: 'test-1',
    title: 'No Lie (feat. Dua Lipa)',
    artist: 'Sean Paul, Dua Lipa',
    album: 'Mad Love',
    duration: 221,
    artworkUrl: '',
    audioUrl: '',
    source: 'itunes',
    isFullTrack: false,
  };
  const bp = directSongAutonomously({ song: noLie, lyrics: [], artworkPalette: null });
  assert.equal(bp.lyricStyle, 'apple_ui');

  const fisheyeBp = directSongAutonomously({
    song: noLie,
    lyrics: [],
    artworkPalette: null,
    userPrompt: 'purple fisheye lens',
  });
  assert.equal(fisheyeBp.lyricStyle, 'fisheye');
});

test('musicApi recovers cleanly from Saavn CORS failure across search, lyrics, and infinite radio', async () => {
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    // Simulate CORS block on direct saavn.sumit.co & saavn.dev, but working corsproxy fallback!
    if (url.startsWith('https://saavn.sumit.co') || url.startsWith('https://saavn.dev') || url.startsWith('https://jiosaavn-api')) {
      throw new TypeError('Failed to fetch (CORS)');
    }
    if (url.startsWith('https://corsproxy.io')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: 'sv1',
                name: 'Tum Hi Ho',
                duration: 262,
                playCount: 9500000,
                album: { name: 'Aashiqui 2' },
                artists: { primary: [{ name: 'Arijit Singh' }] },
                image: [{ quality: '500x500', url: 'https://img.example/500.jpg' }],
                downloadUrl: [{ quality: '320kbps', url: 'https://cdn.example/tumhiho.mp4' }],
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    if (url.startsWith('https://itunes.apple.com')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              trackId: 99,
              trackName: 'Tum Hi Ho',
              artistName: 'Arijit Singh',
              trackTimeMillis: 262000,
              artworkUrl100: 'https://art.example/100x100bb.jpg',
              previewUrl: 'https://audio.example/preview.m4a',
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.startsWith('https://api.audius.co')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'aud1',
              title: 'Midnight Telemetry',
              duration: 198,
              is_streamable: true,
              user: { name: 'Neon Synth' },
              artwork: { '480x480': 'https://art.example/aud.jpg' },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.startsWith('https://lrclib.net/api/get')) {
      return new Response(
        JSON.stringify({
          trackName: 'Tum Hi Ho',
          artistName: 'Arijit Singh',
          duration: 262,
          syncedLyrics: '[00:15.00] Hum tere bin ab reh nahi sakte\n[00:21.00] Tere bina kya wajood mera',
        }),
        { status: 200 }
      );
    }
    if (url.startsWith('https://lrclib.net/api/search')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    const songs = await searchRealSongs('Tum Hi Ho');
    assert.ok(songs.length >= 1);
    assert.equal(songs[0].source, 'saavn');
    assert.equal(songs[0].isFullTrack, true);

    const lrc = await fetchSyncedLyricsDetailed(songs[0]);
    assert.equal(lrc.matchSource, 'lrclib_synced');
    assert.equal(lrc.lines.length, 2);
    assert.equal(lrc.lines[0].text, 'Hum tere bin ab reh nahi sakte');

    const radio = await fetchInfiniteRadioSongs(songs[0], new Set(['saavn-sv1', 'tumhiho::arijitsingh']));
    assert.ok(Array.isArray(radio));
    assert.ok(radio.length >= 1, 'Infinite radio must replenish from iTunes/Audius even when Saavn track is excluded');

    const station = await launchRadioStation('Electronic Synthwave');
    assert.ok(station.length >= 1);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('scoreLrcCandidate rejects karaoke/instrumental even when song title says Vocals Only', () => {
  const vocalsOnly: SongItem = {
    id: 'it-vocals',
    title: 'Apna Bana Le - Arijit Singh Vocals Only',
    artist: 'Sachin-Jigar, Arijit Singh',
    album: 'Bhediya',
    duration: 30,
    fullDuration: 261,
    artworkUrl: '',
    audioUrl: '',
    source: 'itunes',
    isFullTrack: false,
  };
  const karaokeCandidate = {
    trackName: 'Apna Bana Le (Karaoke Version)',
    artistName: 'Arijit Singh',
    duration: 261,
    syncedLyrics: '[00:15.00] Tu mera koi na hoke bhi kuch laage\n'.repeat(10),
  };
  const realCandidate = {
    trackName: 'Apna Bana Le',
    artistName: 'Sachin-Jigar, Arijit Singh',
    duration: 261,
    syncedLyrics: '[00:15.00] Tu mera koi na hoke bhi kuch laage\n'.repeat(10),
  };
  const scKaraoke = scoreLrcCandidate(karaokeCandidate, vocalsOnly, 'Apna Bana Le', ['Sachin-Jigar', 'Arijit Singh']);
  const scReal = scoreLrcCandidate(realCandidate, vocalsOnly, 'Apna Bana Le', ['Sachin-Jigar', 'Arijit Singh']);
  assert.ok(scReal > scKaraoke + 150, `Expected real (${scReal}) >> karaoke (${scKaraoke})`);
});

test('LightAudioEngine applies initial volume and falls back cleanly when CORS audio play fails', async () => {
  const createdAudios: Array<{
    crossOrigin: string | null;
    src: string;
    volume: number;
    currentTime: number;
    paused: boolean;
    ended: boolean;
    duration: number;
    removeAttribute: (name: string) => void;
    addEventListener: (ev: string, fn: () => void) => void;
    play: () => Promise<void>;
    pause: () => void;
  }> = [];

  class MockAudio {
    crossOrigin: string | null = null;
    preload = '';
    src = '';
    volume = 1;
    currentTime = 0;
    paused = true;
    ended = false;
    duration = 180;
    private listeners = new Map<string, Array<() => void>>();

    constructor() {
      createdAudios.push(this);
    }
    addEventListener(ev: string, fn: () => void) {
      const list = this.listeners.get(ev) || [];
      list.push(fn);
      this.listeners.set(ev, list);
    }
    removeAttribute(name: string) {
      if (name === 'src') this.src = '';
    }
    async play() {
      if (this.crossOrigin === 'anonymous') {
        throw new Error('CORS blocked audio stream');
      }
      this.paused = false;
      this.listeners.get('play')?.forEach((fn) => fn());
    }
    pause() {
      this.paused = true;
    }
  }

  const prevAudio = (globalThis as Record<string, unknown>).Audio;
  const prevWin = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).Audio = MockAudio;
  (globalThis as Record<string, unknown>).window = {};

  try {
    const engine = new LightAudioEngine({ volume: 0.3 });
    assert.equal(createdAudios.length, 2);
    assert.equal(createdAudios[0].volume, 0.3);
    assert.equal(createdAudios[1].volume, 0.3);

    await engine.loadAndPlay('https://cdn.example/no-cors.mp4');
    assert.equal(engine.isPlaying(), true);
    assert.equal(createdAudios[1].src, 'https://cdn.example/no-cors.mp4');

    engine.setVolume(0.45);
    assert.equal(createdAudios[1].volume, 0.45);
    engine.dispose();
  } finally {
    (globalThis as Record<string, unknown>).Audio = prevAudio;
    (globalThis as Record<string, unknown>).window = prevWin;
  }
});
