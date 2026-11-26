import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LyricsStage } from '../src/components/LyricsStage.tsx';
import { StudioPopover } from '../src/components/StudioPopover.tsx';
import { LyricsTimelineDrawer } from '../src/components/LyricsTimelineDrawer.tsx';
import { CompanionScreen } from '../src/components/CompanionScreen.tsx';
import { VIBE_PRESETS } from '../src/data/presets.ts';
import { presetToBlueprint } from '../src/engine/vibeBrain.ts';
import type { LyricLine, LyricStyleId, SongItem } from '../src/types.ts';

const sampleSong: SongItem = {
  id: 'song-nolie',
  title: 'No Lie (feat. Dua Lipa)',
  artist: 'Sean Paul, Dua Lipa',
  album: 'Mad Love',
  duration: 221,
  fullDuration: 221,
  artworkUrl: '',
  audioUrl: 'https://example.com/nolie.mp3',
  source: 'saavn',
  isFullTrack: true,
};

const sampleLyrics: LyricLine[] = [
  {
    start: 10,
    end: 14,
    text: 'Feeling my way through the night',
    words: [
      { text: 'Feeling', start: 10, end: 10.6 },
      { text: 'my', start: 10.6, end: 11.1 },
      { text: 'way', start: 11.1, end: 11.7 },
      { text: 'through', start: 11.7, end: 12.4 },
      { text: 'the', start: 12.4, end: 12.9 },
      { text: 'night', start: 12.9, end: 14 },
    ],
  },
  {
    start: 15,
    end: 19,
    text: 'It is no lie',
    words: [
      { text: 'It', start: 15, end: 15.8 },
      { text: 'is', start: 15.8, end: 16.5 },
      { text: 'no', start: 16.5, end: 17.4 },
      { text: 'lie', start: 17.4, end: 19 },
    ],
  },
  {
    start: 20,
    end: 24,
    text: 'Touch the sky tonight',
    words: [
      { text: 'Touch', start: 20, end: 21 },
      { text: 'the', start: 21, end: 21.7 },
      { text: 'sky', start: 21.7, end: 22.8 },
      { text: 'tonight', start: 22.8, end: 24 },
    ],
  },
  {
    start: 25,
    end: 29,
    text: 'Love under violet lights',
    words: [
      { text: 'Love', start: 25, end: 26 },
      { text: 'under', start: 26, end: 27 },
      { text: 'violet', start: 27, end: 28 },
      { text: 'lights', start: 28, end: 29 },
    ],
  },
  {
    start: 30,
    end: 34,
    text: 'Shine bright like a star',
    words: [
      { text: 'Shine', start: 30, end: 31 },
      { text: 'bright', start: 31, end: 31.8 },
      { text: 'like', start: 31.8, end: 32.4 },
      { text: 'a', start: 32.4, end: 32.9 },
      { text: 'star', start: 32.9, end: 34 },
    ],
  },
  {
    start: 35,
    end: 39,
    text: 'Never let me go',
    words: [
      { text: 'Never', start: 35, end: 36 },
      { text: 'let', start: 36, end: 37 },
      { text: 'me', start: 37, end: 38 },
      { text: 'go', start: 38, end: 39 },
    ],
  },
  {
    start: 40,
    end: 44,
    text: 'Running through the dark',
    words: [
      { text: 'Running', start: 40, end: 41 },
      { text: 'through', start: 41, end: 42 },
      { text: 'the', start: 42, end: 43 },
      { text: 'dark', start: 43, end: 44 },
    ],
  },
];

const pulseRef = {
  current: {
    bass: 0.4,
    beat: 0.6,
    mid: 0.35,
    spectrum: new Float32Array(32),
  },
};

test('LyricsStage renders Apple UI intro preview and all 4 Apple UI card archetypes', () => {
  const baseBp = presetToBlueprint(VIBE_PRESETS[0]); // Verci x Lumn (apple_ui)

  const introHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={-1}
      activeWordIdx={-1}
      upcomingLineIdx={0}
      secondsUntilNext={8}
      phase="intro"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
      onJumpToTime={() => {}}
      onOpenLyricsSearch={() => {}}
    />
  );
  assert.ok(introHtml.includes('Next Lyric Up'), 'Intro should display upcoming lyric preview');
  assert.ok(introHtml.includes('Feeling my way through the night'), 'Intro should show line 0 text');
  assert.ok(introHtml.includes('Jump to Vocals'), 'Intro should include skip-intro button for full tracks');

  // iMessage (line 0)
  const imsgHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={0}
      activeWordIdx={5}
      upcomingLineIdx={1}
      secondsUntilNext={1}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(imsgHtml.includes('iMessage'));
  assert.ok(imsgHtml.includes('Delivered') || imsgHtml.includes('Read'));
  assert.ok(imsgHtml.includes('☾'), 'Visual icon for "night" should render');

  // Apple Pay (line 2)
  const payHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={2}
      activeWordIdx={3}
      upcomingLineIdx={3}
      secondsUntilNext={1}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(payHtml.includes('Apple Pay'));
  assert.ok(payHtml.includes('Done'));

  // Frosted Card (line 4)
  const frostHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={4}
      activeWordIdx={4}
      upcomingLineIdx={5}
      secondsUntilNext={1}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(frostHtml.includes('Frosted Card'));

  // macOS Pill (line 6)
  const macHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={6}
      activeWordIdx={0}
      upcomingLineIdx={-1}
      secondsUntilNext={0}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(macHtml.includes('macOS Pill'));
});

test('LyricsStage renders all 12 lyric visual worlds and manual search fallback when unmatched', () => {
  const styles: LyricStyleId[] = [
    'apple_ui',
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
  ];

  for (const lyricStyle of styles) {
    const bp = { ...presetToBlueprint(VIBE_PRESETS[0]), lyricStyle };
    const html = renderToStaticMarkup(
      <LyricsStage
        song={sampleSong}
        lyrics={sampleLyrics}
        lyricsLoading={false}
        activeLineIdx={1}
        activeWordIdx={3}
        upcomingLineIdx={2}
        secondsUntilNext={1}
        phase="active"
        blueprint={bp}
        isPlaying={true}
        visualIcons={true}
        audioPulseRef={pulseRef}
      />
    );
    assert.ok(html.length > 100, `Expected non-empty render for style ${lyricStyle}`);
  }

  const noLyricsHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={[]}
      lyricsLoading={false}
      activeLineIdx={-1}
      activeWordIdx={-1}
      upcomingLineIdx={-1}
      secondsUntilNext={0}
      phase="none"
      blueprint={presetToBlueprint(VIBE_PRESETS[0])}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
      onOpenLyricsSearch={() => {}}
    />
  );
  assert.ok(noLyricsHtml.includes('Find / Sync Lyrics Manually'));

  // Outro phase MUST NOT show "No synced lyrics matched automatically" and MUST keep canvas mounted!
  const outroCanvasHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={-1}
      activeWordIdx={-1}
      upcomingLineIdx={-1}
      secondsUntilNext={0}
      phase="outro"
      blueprint={{ ...presetToBlueprint(VIBE_PRESETS[0]), lyricStyle: 'constellation' }}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
      onOpenLyricsSearch={() => {}}
    />
  );
  assert.ok(!outroCanvasHtml.includes('No synced lyrics matched automatically'));
  assert.ok(outroCanvasHtml.includes('data-aura-stage-canvas="true"'));

  // Cyber (glitch) MUST keep canvas mounted even while lyrics are loading during track rollover!
  const cyberLoadingHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={[]}
      lyricsLoading={true}
      activeLineIdx={-1}
      activeWordIdx={-1}
      upcomingLineIdx={-1}
      secondsUntilNext={0}
      phase="none"
      blueprint={{ ...presetToBlueprint(VIBE_PRESETS[0]), lyricStyle: 'glitch' }}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(cyberLoadingHtml.includes('data-aura-stage-canvas="true"'), 'Cyber canvas must stay mounted during rollover');
  assert.ok(cyberLoadingHtml.includes('Syncing lyrics...'));

  const outroAppleHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={-1}
      activeWordIdx={-1}
      upcomingLineIdx={-1}
      secondsUntilNext={0}
      phase="outro"
      blueprint={presetToBlueprint(VIBE_PRESETS[0])}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(outroAppleHtml.includes('Outro'));
  assert.ok(!outroAppleHtml.includes('No synced lyrics matched automatically'));
});

test('StudioPopover, LyricsTimelineDrawer, and CompanionScreen render cleanly', () => {
  const bp = presetToBlueprint(VIBE_PRESETS[0]);

  const studioHtml = renderToStaticMarkup(
    <StudioPopover
      open={true}
      onClose={() => {}}
      blueprint={bp}
      activePresetId="verci-lumn"
      onApplyPreset={() => {}}
      onUpdateVisual={() => {}}
      visualIcons={true}
      onToggleVisualIcons={() => {}}
      lockPreset={false}
      onToggleLockPreset={() => {}}
      hasActiveSong={true}
      promptInput=""
      onPromptInputChange={() => {}}
      onPromptSteer={() => {}}
      isDirecting={false}
      eqPreset="flat"
      eqBands={{ bass: 0, mid: 0, treble: 0 }}
      onSelectEqPreset={() => {}}
      onChangeEqBand={() => {}}
      volume={0.3}
      muted={false}
      onChangeVolume={() => {}}
      onToggleMute={() => {}}
      focusRemaining={null}
      onToggleFocus={() => {}}
      onStartLiveTab={() => {}}
      keyDraft=""
      onKeyDraftChange={() => {}}
      onSaveKey={() => {}}
      keySaved={false}
    />
  );
  assert.ok(studioHtml.includes('Verci × Lumn'));
  assert.ok(studioHtml.includes('Presets &amp; AI'));

  const drawerHtml = renderToStaticMarkup(
    <LyricsTimelineDrawer
      open={true}
      onClose={() => {}}
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      lyricMatchSource="lrclib_synced"
      matchedTrackInfo="No Lie · Sean Paul"
      activeLineIdx={1}
      lyricOffset={0}
      currentTime={16}
      accentColor="#a855f7"
      queue={[sampleSong]}
      infiniteRadio={true}
      radioLoading={false}
      onToggleInfiniteRadio={() => {}}
      onSeekToLine={() => {}}
      onSyncLineHere={() => {}}
      onAdjustOffset={() => {}}
      onResetOffset={() => {}}
      onManualSearchLyrics={() => {}}
      onPlayFromQueue={() => {}}
      onRemoveFromQueue={() => {}}
    />
  );
  assert.ok(drawerHtml.includes('SYNCED LRC'));
  assert.ok(drawerHtml.includes('Matched: No Lie · Sean Paul'));

  const companionHtml = renderToStaticMarkup(<CompanionScreen />);
  assert.ok(companionHtml.includes('AURA Companion Display'));
});
