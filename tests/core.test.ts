import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTimedLine,
  cleanTrackTitle,
  detectChorusStartTime,
  detectPreviewSectionCues,
  estimateTrackBpm,
  extractArtistList,
  fetchInfiniteRadioSongs,
  fetchSyncedLyricsDetailed,
  getKnownPreviewOffset,
  getKnownYoutubeFullTrack,
  launchRadioStation,
  loadFeaturedSongs,
  makeSongKey,
  matchesFeaturedSpec,
  parseLrc,
  resetSaavnClientStateForTests,
  scoreLrcCandidate,
  scoreTrackRelevance,
  searchRealSongs,
  setCustomSaavnBaseUrl,
  upgradeToFullSaavnTrack,
  upgradeToFullYoutubeTrack,
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

  // Kesariya-style track (4:28 = 268s): late outro refrain repeating 4x at 216s must NOT beat primary chorus at 54s!
  const kesariyaStyle: LyricLine[] = [
    { start: 14, end: 19, text: 'Mujhko itna bataye koi', words: [] },
    { start: 22, end: 27, text: 'Kaise tujhse dil na lagaye koi', words: [] },
    { start: 54, end: 60, text: 'Kesariya tera ishq hai piya', words: [] },
    { start: 61, end: 66, text: 'Rang jaaun jo main haath lagaaun', words: [] },
    { start: 132, end: 138, text: 'Kesariya tera ishq hai piya', words: [] },
    { start: 216, end: 221, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 222, end: 227, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 228, end: 233, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 234, end: 239, text: 'Chanda bhi deewana hai tera', words: [] },
  ];
  assert.equal(detectChorusStartTime(kesariyaStyle, 268), 54);
  assert.ok(detectChorusStartTime(nonRepeating, 120) <= 75);

  // Back-to-back outro loop + bridge hook at 135s (outside primary chorus window) must NOT beat 54s
  const bridgeAndOutro: LyricLine[] = [
    { start: 14, end: 19, text: 'Mujhko itna bataye koi', words: [] },
    { start: 54, end: 60, text: 'Kesariya tera ishq hai piya', words: [] },
    { start: 132, end: 138, text: 'Kesariya tera ishq hai piya', words: [] },
    { start: 135, end: 140, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 216, end: 221, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 222, end: 227, text: 'Chanda bhi deewana hai tera', words: [] },
    { start: 228, end: 233, text: 'Chanda bhi deewana hai tera', words: [] },
  ];
  assert.equal(detectChorusStartTime(bridgeAndOutro, 268), 54);

  // Non-ASCII (Devanagari) lyrics must also resolve primary repeated chorus properly
  const devanagariLines: LyricLine[] = [
    { start: 12, end: 16, text: 'मुझको इतना बताये कोई', words: [] },
    { start: 54, end: 60, text: 'केसरिया तेरा इश्क़ है पिया', words: [] },
    { start: 95, end: 100, text: 'रंग जाऊँ जो मैं हाथ लगाऊँ', words: [] },
    { start: 130, end: 136, text: 'केसरिया तेरा इश्क़ है पिया', words: [] },
  ];
  assert.equal(detectChorusStartTime(devanagariLines, 268), 54);
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

test('musicApi makes zero dead-proxy/CORS-spam requests by default, rejects knockoffs, and supports optional custom Saavn endpoint', async () => {
  const origFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  resetSaavnClientStateForTests();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.startsWith('https://custom-saavn.example/api')) {
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
      const parsed = new URL(url);
      const term = (parsed.searchParams.get('term') || '').toLowerCase();
      const country = parsed.searchParams.get('country') || 'US';

      if (term.includes('husn')) {
        // US returns knockoff Marshlemon; IN returns authentic Anuv Jain!
        if (country !== 'IN') {
          return new Response(
            JSON.stringify({
              results: [
                {
                  trackId: 888,
                  trackName: 'Jain Husn Anuv',
                  artistName: 'Marshlemon',
                  collectionName: 'Knockoff Hits',
                  trackTimeMillis: 103000,
                  artworkUrl100: 'https://art.example/fake.jpg',
                  previewUrl: 'https://audio.example/fake.m4a',
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            results: [
              {
                trackId: 889,
                trackName: 'Husn',
                artistName: 'Anuv Jain',
                collectionName: 'Husn - Single',
                trackTimeMillis: 217000,
                artworkUrl100: 'https://art.example/husn-100x100bb.jpg',
                previewUrl: 'https://audio.example/husn.m4a',
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (term.includes('no lie')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                trackId: 101,
                trackName: 'No Lie (feat. Dua Lipa)',
                artistName: 'Sean Paul',
                collectionName: 'Mad Love',
                trackTimeMillis: 221000,
                artworkUrl100: 'https://art.example/nolie-100x100bb.jpg',
                previewUrl: 'https://audio.example/nolie.m4a',
              },
            ],
          }),
          { status: 200 }
        );
      }

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
    // 1. Home featured load must NEVER burst saavn.sumit.co (zero 429 on page load)
    const featured = await loadFeaturedSongs();
    assert.deepEqual(
      requestedUrls.filter((u) => /saavn\.sumit\.co/i.test(u)),
      [],
      'loadFeaturedSongs must NOT burst public saavn.sumit.co by default'
    );
    const husnCard = featured.find((s) => s.title === 'Husn');
    assert.ok(husnCard, 'Featured must resolve authentic Husn via IN regional fallback');
    assert.equal(husnCard.artist, 'Anuv Jain');
    assert.ok(
      !featured.some((s) => /marshlemon|jain husn anuv/i.test(`${s.title} ${s.artist}`)),
      'Featured MUST reject Marshlemon knockoff'
    );

    const songs = await searchRealSongs('Tum Hi Ho');
    assert.ok(songs.length >= 1);
    assert.equal(songs[0].source, 'itunes');

    const knockoffScore = scoreTrackRelevance(
      {
        id: 'fake',
        title: 'Jain Husn Anuv',
        artist: 'Marshlemon',
        album: '',
        duration: 30,
        fullDuration: 103,
        artworkUrl: '',
        audioUrl: '',
        source: 'itunes',
        isFullTrack: false,
      },
      'Husn Anuv Jain'
    );
    const realScore = scoreTrackRelevance(
      {
        id: 'real',
        title: 'Husn',
        artist: 'Anuv Jain',
        album: 'Husn',
        duration: 30,
        fullDuration: 217,
        artworkUrl: '',
        audioUrl: '',
        source: 'itunes',
        isFullTrack: false,
      },
      'Husn Anuv Jain'
    );
    assert.ok(realScore > knockoffScore + 150, `Expected authentic (${realScore}) >> knockoff (${knockoffScore})`);

    // Two-word query "Husn Anuv" must still catch Marshlemon knockoff, while "No Lie Dua Lipa" must NOT penalize "(feat. Dua Lipa)"!
    const twoWordKnockoff = scoreTrackRelevance(
      {
        id: 'fake2',
        title: 'Jain Husn Anuv',
        artist: 'Marshlemon',
        album: '',
        duration: 30,
        fullDuration: 103,
        artworkUrl: '',
        audioUrl: '',
        source: 'itunes',
        isFullTrack: false,
      },
      'Husn Anuv'
    );
    const featReal = scoreTrackRelevance(
      {
        id: 'feat1',
        title: 'No Lie (feat. Dua Lipa)',
        artist: 'Sean Paul',
        album: 'Mad Love',
        duration: 30,
        fullDuration: 221,
        artworkUrl: '',
        audioUrl: '',
        source: 'itunes',
        isFullTrack: false,
      },
      'No Lie Dua Lipa'
    );
    assert.ok(twoWordKnockoff < 0, `Expected negative knockoff score for 2-word search, got ${twoWordKnockoff}`);
    assert.ok(featReal > 180, `Expected feat track high score, got ${featReal}`);

    // Regional IN search surfaces authentic Anuv Jain even when US only returns Marshlemon
    const husnSearch = await searchRealSongs('Husn Anuv Jain');
    assert.equal(husnSearch[0].artist, 'Anuv Jain');

    // Featured matcher rejects Lo-Fi / Slowed / Live / Synthwave / short-duration knockoffs
    assert.equal(
      matchesFeaturedSpec(
        {
          id: 'synthwave',
          title: 'Kesariya (Synthwave)',
          artist: 'Pritam, Arijit Singh',
          album: '',
          duration: 30,
          fullDuration: 240,
          artworkUrl: '',
          audioUrl: '',
          source: 'itunes',
          isFullTrack: false,
        },
        { expectedTitle: 'Kesariya', expectedArtists: ['Pritam', 'Arijit Singh'] }
      ),
      false
    );
    assert.equal(
      matchesFeaturedSpec(
        {
          id: 'lofi',
          title: 'Husn (Lo-Fi)',
          artist: 'Anuv Jain',
          album: '',
          duration: 30,
          fullDuration: 180,
          artworkUrl: '',
          audioUrl: '',
          source: 'itunes',
          isFullTrack: false,
        },
        { expectedTitle: 'Husn', expectedArtists: ['Anuv Jain'] }
      ),
      false
    );
    assert.equal(
      matchesFeaturedSpec(
        {
          id: 'short',
          title: 'Husn',
          artist: 'Anuv Jain',
          album: '',
          duration: 30,
          fullDuration: 103,
          artworkUrl: '',
          audioUrl: '',
          source: 'itunes',
          isFullTrack: false,
        },
        { expectedTitle: 'Husn', expectedArtists: ['Anuv Jain'] }
      ),
      false
    );

    const lrc = await fetchSyncedLyricsDetailed(songs[0]);
    assert.equal(lrc.matchSource, 'lrclib_synced');
    assert.equal(lrc.lines.length, 2);

    const radio = await fetchInfiniteRadioSongs(songs[0], new Set(['itunes-99', 'tumhiho::arijitsingh']));
    assert.ok(radio.length >= 1, 'Infinite radio must replenish from iTunes/Audius');

    const station = await launchRadioStation('Electronic Synthwave');
    assert.ok(station.length >= 1);

    // Assert NO dead Saavn mirrors or failing CORS proxies were ever called
    const deadPattern = /saavn\.dev|jiosaavn-api|corsproxy\.io|allorigins\.win|cors\.lol|proxy\.cors\.dev/i;
    assert.deepEqual(
      requestedUrls.filter((u) => deadPattern.test(u)),
      [],
      'Must NOT call dead Saavn mirrors or failing CORS proxies'
    );

    // 2. Optional custom Saavn endpoint works when explicitly configured
    setCustomSaavnBaseUrl('https://custom-saavn.example/api');
    const saavnSongs = await searchRealSongs('Tum Hi Ho');
    assert.equal(saavnSongs[0].source, 'saavn');
    assert.equal(saavnSongs[0].isFullTrack, true);
  } finally {
    resetSaavnClientStateForTests();
    globalThis.fetch = origFetch;
  }
});

test('getKnownPreviewOffset and upgradeToFullSaavnTrack deliver exact sync and reject sped-up/karaoke junk', async () => {
  // Audio-verified exact iTunes 30s preview offsets
  assert.equal(
    getKnownPreviewOffset({
      id: 'itunes-1444609119',
      title: 'No Lie (feat. Dua Lipa)',
      artist: 'Sean Paul',
      source: 'itunes',
      isFullTrack: false,
    }),
    47.0
  );
  assert.equal(
    getKnownPreviewOffset({
      id: 'itunes-1440870375',
      title: 'Starboy (feat. Daft Punk)',
      artist: 'The Weeknd',
      source: 'itunes',
      isFullTrack: false,
    }),
    45.0
  );
  assert.equal(
    getKnownPreviewOffset({
      id: 'itunes-1653219849',
      title: 'Apna Bana Le (From "Bhediya")',
      artist: 'Arijit Singh',
      source: 'itunes',
      isFullTrack: false,
    }),
    0.0
  );
  assert.equal(
    getKnownPreviewOffset({
      id: 'itunes-999999999',
      title: 'Tum Hi Ho',
      artist: 'Mithoon, Arijit Singh',
      source: 'itunes',
      isFullTrack: false,
    }),
    29.5
  );
  // Full tracks must return null (start at 0:00 naturally)
  assert.equal(
    getKnownPreviewOffset({
      id: 'itunes-1635014240',
      title: 'Kesariya',
      artist: 'Pritam, Arijit Singh',
      source: 'saavn',
      isFullTrack: true,
    }),
    null
  );

  // On-demand full-track upgrade verification
  const origFetch = globalThis.fetch;
  resetSaavnClientStateForTests();
  setCustomSaavnBaseUrl('https://mock-saavn.example/api');

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('Kesariya')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: 'sv-kes',
                name: 'Kesariya (From "Brahmastra")',
                duration: 268,
                playCount: 99000000,
                album: { name: 'Brahmastra' },
                artists: { primary: [{ name: 'Pritam' }, { name: 'Arijit Singh' }] },
                image: [{ quality: '500x500', url: 'https://img.example/kes.jpg' }],
                downloadUrl: [{ quality: '320kbps', url: 'https://aac.saavncdn.com/kesariya_320.mp4' }],
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    if (url.includes('No%20Lie')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: 'sv-sped',
                name: 'No Lie (Sped Up)',
                duration: 176,
                playCount: 500000,
                album: { name: 'Sped Up Hits' },
                artists: { primary: [{ name: 'Sean Paul' }] },
                downloadUrl: [{ quality: '320kbps', url: 'https://aac.saavncdn.com/nolie_sped.mp4' }],
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    if (url.includes('Starboy')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: 'sv-kar',
                name: 'Starboy (Originally Perfomed By The Weeknd) (Melody Karaoke Version)',
                duration: 225,
                playCount: 200000,
                album: { name: 'Karaoke Hits' },
                artists: { primary: [{ name: 'Karaoke Band' }] },
                downloadUrl: [{ quality: '320kbps', url: 'https://aac.saavncdn.com/starboy_kar.mp4' }],
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ success: true, data: { results: [] } }), { status: 200 });
  }) as typeof fetch;

  try {
    const kesariyaPreview: SongItem = {
      id: 'itunes-1635014240',
      title: 'Kesariya (From "Brahmastra")',
      artist: 'Pritam, Arijit Singh',
      album: 'Brahmastra',
      duration: 30,
      fullDuration: 268,
      artworkUrl: 'https://art.example/kes.jpg',
      audioUrl: 'https://audio-ssl.itunes.apple.com/kes.m4a',
      source: 'itunes',
      isFullTrack: false,
    };
    const upgraded = await upgradeToFullSaavnTrack(kesariyaPreview);
    assert.ok(upgraded, 'Must upgrade authentic Kesariya to 320kbps full track');
    assert.equal(upgraded.id, 'itunes-1635014240', 'Must preserve song ID for queue/ref stability');
    assert.equal(upgraded.isFullTrack, true);
    assert.equal(upgraded.source, 'saavn');
    assert.equal(upgraded.duration, 268);
    assert.equal(upgraded.audioUrl, 'https://aac.saavncdn.com/kesariya_320.mp4');

    const noLiePreview: SongItem = {
      id: 'itunes-1444609119',
      title: 'No Lie (feat. Dua Lipa)',
      artist: 'Sean Paul',
      album: 'Mad Love',
      duration: 30,
      fullDuration: 221,
      artworkUrl: '',
      audioUrl: 'https://audio-ssl.itunes.apple.com/nolie.m4a',
      source: 'itunes',
      isFullTrack: false,
    };
    assert.equal(
      await upgradeToFullSaavnTrack(noLiePreview),
      null,
      'Must reject No Lie (Sped Up) with wrong duration'
    );

    const starboyPreview: SongItem = {
      id: 'itunes-1440870375',
      title: 'Starboy (feat. Daft Punk)',
      artist: 'The Weeknd',
      album: 'Starboy',
      duration: 30,
      fullDuration: 230,
      artworkUrl: '',
      audioUrl: 'https://audio-ssl.itunes.apple.com/starboy.m4a',
      source: 'itunes',
      isFullTrack: false,
    };
    assert.equal(
      await upgradeToFullSaavnTrack(starboyPreview),
      null,
      'Must reject Starboy Melody Karaoke (Originally Perfomed typo)'
    );
  } finally {
    resetSaavnClientStateForTests();
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
    playAttempts = 0;
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
      this.playAttempts++;
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

    const primaryAttemptsBefore = (createdAudios[0] as unknown as MockAudio).playAttempts;
    await engine.loadAndPlay('https://cdn.example/no-cors-2.mp4');
    assert.equal(
      (createdAudios[0] as unknown as MockAudio).playAttempts,
      primaryAttemptsBefore,
      'Subsequent track from CORS-blocked origin must skip crossOrigin primaryAudio directly'
    );
    assert.equal(createdAudios[1].src, 'https://cdn.example/no-cors-2.mp4');

    engine.setVolume(0.45);
    assert.equal(createdAudios[1].volume, 0.45);
    engine.dispose();
  } finally {
    (globalThis as Record<string, unknown>).Audio = prevAudio;
    (globalThis as Record<string, unknown>).window = prevWin;
  }
});

test('fetchSyncedLyricsDetailed uses /api/search first without speculative /api/get 404 requests', async () => {
  const origFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.startsWith('https://lrclib.net/api/search')) {
      return new Response(
        JSON.stringify([
          {
            id: 777,
            trackName: 'Kesariya',
            artistName: 'Pritam, Arijit Singh',
            duration: 268,
            syncedLyrics:
              '[00:14.00] Mujhko itna bataye koi\n[00:54.00] Kesariya tera ishq hai piya\n[01:32.00] Kesariya tera ishq hai piya',
          },
        ]),
        { status: 200 }
      );
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;

  try {
    const res = await fetchSyncedLyricsDetailed({
      id: 'it-kesariya',
      title: 'Kesariya (From "Brahmastra")',
      artist: 'Pritam, Arijit Singh',
      album: 'Brahmastra',
      duration: 30,
      fullDuration: 268,
      artworkUrl: '',
      audioUrl: '',
      source: 'itunes',
      isFullTrack: false,
    });
    assert.equal(res.matchSource, 'lrclib_synced');
    assert.equal(res.lines.length, 3);
    assert.equal(
      requestedUrls.some((u) => u.includes('/api/get')),
      false,
      'Must NOT send speculative /api/get when /api/search matched'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('parseLrc handles [offset:ms], credit stripping, rapid non-overlapping lines, and snappy short hooks', () => {
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc('no timestamps at all'), []);

  const raw = [
    '[offset:-500]',
    '[00:01.00] Lyrics by: Test Writer',
    '[00:10.00] No lie',
    '[00:10.45] Shake that',
    '[00:12.00] Feel your eyes they all over me',
  ].join('\n');

  const lines = parseLrc(raw, 220);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, 'No lie');
  // [offset:-500] shifts timestamps +0.5s -> 10.50 and 10.95
  assert.ok(Math.abs(lines[0].start - 10.5) < 0.01);
  assert.ok(Math.abs(lines[1].start - 10.95) < 0.01);
  assert.ok(lines[0].end < lines[1].start, `Rapid lines must not overlap: ${lines[0].end} vs ${lines[1].start}`);

  // Short 2-word hook ("No lie") with wide 4s gap should sweep briskly (~0.94s), not drag to 2s+
  const hook = buildTimedLine(50, 54, 'No lie');
  assert.equal(hook.words.length, 2);
  const hookSpan = hook.words[1].end - hook.words[0].start;
  assert.ok(hookSpan > 0.7 && hookSpan < 1.3, `Expected snappy short-hook cadence, got ${hookSpan}s`);
});

test('scoreLrcCandidate rejects alternate versions and penalizes truncated LRCs', () => {
  const song: SongItem = {
    id: 'it-nolie',
    title: 'No Lie (feat. Dua Lipa)',
    artist: 'Sean Paul',
    album: 'Mad Love',
    duration: 30,
    fullDuration: 221,
    artworkUrl: '',
    audioUrl: '',
    source: 'itunes',
    isFullTrack: false,
  };

  const fullOriginal = {
    trackName: 'No Lie',
    artistName: 'Sean Paul, Dua Lipa',
    duration: 221,
    syncedLyrics: '[00:12.00] Feel your eyes\n[00:50.00] No lie\n[03:20.00] No lie tonight',
  };
  const remixCut = {
    trackName: 'No Lie (Club Mix Remix)',
    artistName: 'Sean Paul, Dua Lipa',
    duration: 221,
    syncedLyrics: '[00:12.00] Feel your eyes\n[00:50.00] No lie\n[03:20.00] No lie tonight',
  };
  const truncatedCut = {
    trackName: 'No Lie',
    artistName: 'Sean Paul, Dua Lipa',
    duration: 221,
    syncedLyrics: '[00:12.00] Feel your eyes\n[00:35.00] No lie',
  };

  const sOrig = scoreLrcCandidate(fullOriginal, song, 'No Lie', ['Sean Paul', 'Dua Lipa']);
  const sRemix = scoreLrcCandidate(remixCut, song, 'No Lie', ['Sean Paul', 'Dua Lipa']);
  const sTrunc = scoreLrcCandidate(truncatedCut, song, 'No Lie', ['Sean Paul', 'Dua Lipa']);
  assert.ok(sOrig > sRemix + 150, `Original (${sOrig}) must beat remix (${sRemix})`);
  assert.ok(sOrig > sTrunc + 60, `Full LRC (${sOrig}) must beat truncated snippet (${sTrunc})`);
});

test('computeLyricCursor returns continuous lineProgress/wordProgress and guards edge inputs', () => {
  const empty = computeLyricCursor([], 10, 0);
  assert.equal(empty.phase, 'none');
  assert.equal(empty.lineProgress, 0);
  assert.equal(empty.wordProgress, 0);

  const lines: LyricLine[] = [
    {
      start: 10,
      end: 14,
      text: 'Zero dur',
      words: [
        { text: 'Zero', start: 10, end: 10 }, // degenerate zero-length word
        { text: 'dur', start: 12, end: 14 },
      ],
    },
  ];
  const nanCursor = computeLyricCursor(lines, Number.NaN, Number.NaN);
  assert.equal(nanCursor.phase, 'intro');
  assert.equal(nanCursor.lineProgress, 0);

  const midCursor = computeLyricCursor(lines, 12.86, 0); // +0.14 => 13.0 -> 75% of line, 50% of word 1
  assert.equal(midCursor.phase, 'active');
  assert.equal(midCursor.activeWordIdx, 1);
  assert.ok(midCursor.lineProgress >= 0.7 && midCursor.lineProgress <= 0.8);
  assert.ok(midCursor.wordProgress >= 0.45 && midCursor.wordProgress <= 0.55);
});

test('detectPreviewSectionCues and estimateTrackBpm produce bounded cues and realistic tempos', () => {
  const sample: LyricLine[] = [
    { start: 12, end: 16, text: 'First verse begins slowly', words: [] },
    { start: 16, end: 20, text: 'Second verse keeps flowing', words: [] },
    { start: 20, end: 24, text: 'Third verse builds tension', words: [] },
    { start: 24, end: 28, text: 'Fourth line leads into hook', words: [] },
    { start: 52, end: 56, text: 'Shining under neon lights', words: [] },
    { start: 112, end: 116, text: 'Shining under neon lights', words: [] },
    { start: 170, end: 175, text: 'Final refrain fades out', words: [] },
  ];
  const cues = detectPreviewSectionCues(sample, 210);
  assert.ok(cues.some((c) => c.label === 'Start' && c.offsetSec === 0));
  assert.ok(cues.some((c) => c.label === 'Chorus' && c.offsetSec === 52));
  assert.deepEqual(detectPreviewSectionCues([], 200), []);

  assert.equal(estimateTrackBpm({ title: 'No Lie (feat. Dua Lipa)', artist: 'Sean Paul' }, []), 102);
  assert.equal(estimateTrackBpm({ title: 'Kesariya', artist: 'Arijit Singh' }, []), 94);
  const inferred = estimateTrackBpm({ title: 'Unknown Indie Track', artist: 'Someone' }, sample);
  assert.ok(inferred >= 82 && inferred <= 136, `Expected inferred BPM in 82..136, got ${inferred}`);
});

test('LightAudioEngine BPM groove & vocal impulse engine reacts to playback clock and settles on pause', async () => {
  class ClockMockAudio {
    crossOrigin: string | null = null;
    preload = '';
    src = '';
    volume = 1;
    currentTime = 0;
    paused = true;
    ended = false;
    duration = 30;
    addEventListener() {}
    removeAttribute(name: string) {
      if (name === 'src') this.src = '';
    }
    async play() {
      this.paused = false;
    }
    pause() {
      this.paused = true;
    }
  }

  const prevAudio = (globalThis as Record<string, unknown>).Audio;
  const prevWin = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).Audio = ClockMockAudio;
  (globalThis as Record<string, unknown>).window = {};

  try {
    const engine = new LightAudioEngine({ volume: 0.5 });
    engine.setTrackBpm(120); // 2 beats/sec -> beat every 0.5s
    await engine.loadAndPlay('https://audio-ssl.itunes.apple.com/preview.m4a');

    // On downbeat (t = 0.0) + vocal impulse -> high beat & vocal energy
    engine.notifyVocalImpulse(1.0, true);
    const hit = engine.samplePulse(0.016);
    assert.equal(hit.isLiveFft, false);
    assert.ok(hit.beat > 0.2, `Expected positive beat on downbeat, got ${hit.beat}`);
    assert.ok(hit.vocal > 0.2, `Expected positive vocal after impulse, got ${hit.vocal}`);
    assert.equal(hit.spectrum.length, 32);
    assert.ok(hit.subBass >= 0 && hit.subBass <= 1);
    assert.ok(hit.treble >= 0 && hit.treble <= 1);

    // Pause -> settles smoothly downward
    engine.pause();
    let settled = hit;
    for (let i = 0; i < 40; i++) {
      settled = engine.samplePulse(0.03);
    }
    assert.ok(settled.beat < 0.05, `Expected beat to decay near 0 on pause, got ${settled.beat}`);
    engine.dispose();
  } finally {
    (globalThis as Record<string, unknown>).Audio = prevAudio;
    (globalThis as Record<string, unknown>).window = prevWin;
  }
});

test('getKnownYoutubeFullTrack, upgradeToFullYoutubeTrack, and LightAudioEngine youtube:// playback deliver full tracks', async () => {
  // 1. Instant verified studio YouTube full-track lookup for Featured songs
  const noLieYt = getKnownYoutubeFullTrack({
    id: 'itunes-1444609119',
    title: 'No Lie (feat. Dua Lipa)',
    artist: 'Sean Paul',
    source: 'itunes',
    isFullTrack: false,
  });
  assert.deepEqual(noLieYt, { videoId: 'jOF8gqpoPgs', duration: 222 });

  const starboyYt = getKnownYoutubeFullTrack({
    id: 'itunes-1440870375',
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    source: 'itunes',
    isFullTrack: false,
  });
  assert.deepEqual(starboyYt, { videoId: '3_g2un5M350', duration: 231 });

  // Already-full tracks return null
  assert.equal(
    getKnownYoutubeFullTrack({
      id: 'itunes-1444609119',
      title: 'No Lie',
      artist: 'Sean Paul',
      source: 'youtube',
      isFullTrack: true,
    }),
    null
  );

  // 2. Live Piped music search upgrades arbitrary searched tracks while rejecting slowed/karaoke/shorts
  const origFetch = globalThis.fetch;
  resetSaavnClientStateForTests();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.piped.private.coffee/search')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              url: '/watch?v=short123456',
              title: 'Blinding Lights',
              uploaderName: 'The Weeknd',
              duration: 28,
              isShort: true,
            },
            {
              url: '/watch?v=slowed12345',
              title: 'Blinding Lights (Slowed + Reverb)',
              uploaderName: 'Lofi Mixes',
              duration: 245,
            },
            {
              url: '/watch?v=fHI8X4OXluQ',
              title: 'Blinding Lights',
              uploaderName: 'The Weeknd - Topic',
              duration: 201,
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    const blindingPreview: SongItem = {
      id: 'itunes-1488408568',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      duration: 30,
      fullDuration: 200,
      artworkUrl: 'https://art.example/blinding.jpg',
      audioUrl: 'https://audio-ssl.itunes.apple.com/blinding.m4a',
      source: 'itunes',
      isFullTrack: false,
    };
    const upgraded = await upgradeToFullYoutubeTrack(blindingPreview);
    assert.ok(upgraded, 'Must upgrade Blinding Lights to full YouTube studio track');
    assert.equal(upgraded.id, 'itunes-1488408568');
    assert.equal(upgraded.source, 'youtube');
    assert.equal(upgraded.isFullTrack, true);
    assert.equal(upgraded.duration, 201);
    assert.equal(upgraded.audioUrl, 'youtube://fHI8X4OXluQ');
  } finally {
    resetSaavnClientStateForTests();
    globalThis.fetch = origFetch;
  }

  // 3. LightAudioEngine drives youtube:// full playback, seek, volume, pause, and ended events
  class StubAudio {
    crossOrigin: string | null = null;
    preload = '';
    src = '';
    volume = 1;
    currentTime = 0;
    paused = true;
    ended = false;
    duration = 0;
    addEventListener() {}
    removeAttribute(name: string) {
      if (name === 'src') this.src = '';
    }
    async play() {
      this.paused = false;
    }
    pause() {
      this.paused = true;
    }
  }

  let ytStateCb: ((ev: { data: number; target: unknown }) => void) | undefined;
  let mockYtTime = 0;
  let mockYtVol = 100;
  let mockYtMuted = false;
  let mockYtDestroyed = false;

  class MockYtPlayer {
    constructor(
      _el: unknown,
      opts: {
        events?: {
          onReady?: (ev: { target: MockYtPlayer }) => void;
          onStateChange?: (ev: { data: number; target: MockYtPlayer }) => void;
        };
      }
    ) {
      ytStateCb = opts.events?.onStateChange;
      queueMicrotask(() => {
        opts.events?.onReady?.({ target: this });
        opts.events?.onStateChange?.({ data: 1, target: this });
      });
    }
    loadVideoById() {
      mockYtTime = 0;
      queueMicrotask(() => ytStateCb?.({ data: 1, target: this }));
    }
    playVideo() {
      ytStateCb?.({ data: 1, target: this });
    }
    pauseVideo() {
      ytStateCb?.({ data: 2, target: this });
    }
    stopVideo() {}
    seekTo(sec: number) {
      mockYtTime = sec;
    }
    setVolume(v: number) {
      mockYtVol = v;
    }
    mute() {
      mockYtMuted = true;
    }
    unMute() {
      mockYtMuted = false;
    }
    getCurrentTime() {
      return mockYtTime;
    }
    getDuration() {
      return 222;
    }
    getPlayerState() {
      return 1;
    }
    destroy() {
      mockYtDestroyed = true;
    }
  }

  const prevAudio = (globalThis as Record<string, unknown>).Audio;
  const prevWin = (globalThis as Record<string, unknown>).window;
  const prevDoc = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).Audio = StubAudio;
  (globalThis as Record<string, unknown>).window = {
    location: { origin: 'https://pranjal3125.github.io' },
    setTimeout,
    clearTimeout,
    YT: { Player: MockYtPlayer },
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      style: {},
      setAttribute() {},
      appendChild() {},
      remove() {},
      firstElementChild: {},
    }),
    body: { appendChild() {} },
  };

  try {
    const engine = new LightAudioEngine({ volume: 0.4 });
    let endedFired = false;
    engine.onEnded = () => {
      endedFired = true;
    };
    await engine.loadAndPlay('youtube://jOF8gqpoPgs');
    assert.equal(engine.isPlaying(), true);
    assert.equal(engine.getDuration(), 222);
    assert.equal(mockYtVol, 40);
    assert.equal(mockYtMuted, false);

    engine.seek(54.5);
    assert.ok(engine.getCurrentTime() >= 54.5);

    engine.setVolume(0);
    assert.equal(mockYtMuted, true);

    engine.pause();
    assert.equal(engine.isPlaying(), false);

    engine.play();
    assert.equal(engine.isPlaying(), true);

    ytStateCb?.({ data: 0, target: {} });
    assert.equal(endedFired, true);
    assert.equal(engine.isPlaying(), false);

    engine.dispose();
    assert.equal(mockYtDestroyed, true);
  } finally {
    (globalThis as Record<string, unknown>).Audio = prevAudio;
    (globalThis as Record<string, unknown>).window = prevWin;
    (globalThis as Record<string, unknown>).document = prevDoc;
  }
});
