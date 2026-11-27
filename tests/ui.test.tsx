import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LyricsStage } from '../src/components/LyricsStage.tsx';
import { StudioPopover } from '../src/components/StudioPopover.tsx';
import { LyricsTimelineDrawer } from '../src/components/LyricsTimelineDrawer.tsx';
import { CompanionScreen } from '../src/components/CompanionScreen.tsx';
import { LumnEdgeCanvas } from '../src/components/LumnEdgeCanvas.tsx';
import { pickCardVariant } from '../src/components/AppleUiLyricsStage.tsx';
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
    subBass: 0.45,
    beat: 0.6,
    mid: 0.35,
    vocal: 0.5,
    treble: 0.3,
    energy: 0.45,
    beatPhase: 0.25,
    lineProgress: 0.5,
    wordProgress: 0.5,
    isLiveFft: true,
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
  assert.ok(payHtml.includes('Pay Sean Paul'), 'Apple Pay sheet should display Pay {artist} like the Reel');
  assert.ok(payHtml.includes('Done'));
  assert.ok(payHtml.includes('Love under violet lights'), 'Completed Apple Pay sheet should pop paired iMessage reply');

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
  assert.ok(!macHtml.includes('scaleX('), 'macOS Pill progress bar transform must be owned by rAF ref, not React style prop');
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

  const previewSong: SongItem = {
    ...sampleSong,
    isFullTrack: false,
    duration: 30,
    source: 'itunes',
  };
  const previewDrawerHtml = renderToStaticMarkup(
    <LyricsTimelineDrawer
      open={true}
      onClose={() => {}}
      song={previewSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      lyricMatchSource="lrclib_synced"
      matchedTrackInfo="No Lie · Sean Paul"
      activeLineIdx={1}
      lyricOffset={15}
      accentColor="#a855f7"
      queue={[previewSong]}
      infiniteRadio={true}
      radioLoading={false}
      isSyncLocked={true}
      onToggleInfiniteRadio={() => {}}
      onSeekToLine={() => {}}
      onSyncLineHere={() => {}}
      onAdjustOffset={() => {}}
      onSetExactOffset={() => {}}
      onResetOffset={() => {}}
      onReplayTrack={() => {}}
      onManualSearchLyrics={() => {}}
      onPlayFromQueue={() => {}}
      onRemoveFromQueue={() => {}}
    />
  );
  assert.ok(previewDrawerHtml.includes('-5s') && previewDrawerHtml.includes('+5s'));
  assert.ok(previewDrawerHtml.includes('LOCKED'));
  assert.ok(previewDrawerHtml.includes('Replay'));
  assert.ok(previewDrawerHtml.includes('Type words you hear'));

  const companionHtml = renderToStaticMarkup(<CompanionScreen />);
  assert.ok(companionHtml.includes('AURA Companion Display'));
  assert.ok(companionHtml.includes('data-aura-lumn-canvas="true"'));
});

test('Apple UI Reel choreography renders Apple Maps, Apple Cash, and GPU LumnEdgeCanvas cleanly', () => {
  const baseBp = presetToBlueprint(VIBE_PRESETS[0]);

  assert.equal(pickCardVariant(-1), 'imessage');
  assert.equal(pickCardVariant(0), 'imessage');
  assert.equal(pickCardVariant(1), 'apple_maps');
  assert.equal(pickCardVariant(2), 'apple_pay');
  assert.equal(pickCardVariant(3), 'apple_cash');
  assert.equal(pickCardVariant(4), 'frosted_card');
  assert.equal(pickCardVariant(5), 'apple_maps');
  assert.equal(pickCardVariant(6), 'macos_pill');
  assert.equal(pickCardVariant(7), 'apple_cash');

  // Apple Maps x Apple Pay split card (line 1)
  const mapsHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={1}
      activeWordIdx={2}
      upcomingLineIdx={2}
      secondsUntilNext={1}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(mapsHtml.includes('Apple Maps'), 'Line 1 should render Apple Maps card');
  assert.ok(mapsHtml.includes('Maps') && mapsHtml.includes('Pay'), 'Apple Maps card should include Maps & Pay badges');
  assert.ok(mapsHtml.includes('Mad Love'), 'Apple Maps card should show album subtitle');

  // Apple Cash black titanium card (line 3)
  const cashHtml = renderToStaticMarkup(
    <LyricsStage
      song={sampleSong}
      lyrics={sampleLyrics}
      lyricsLoading={false}
      activeLineIdx={3}
      activeWordIdx={1}
      upcomingLineIdx={4}
      secondsUntilNext={1}
      phase="active"
      blueprint={baseBp}
      isPlaying={true}
      visualIcons={true}
      audioPulseRef={pulseRef}
    />
  );
  assert.ok(cashHtml.includes('Apple Cash'), 'Line 3 should render Apple Cash card');
  assert.ok(cashHtml.includes('Cash'), 'Apple Cash card should show Cash mark');

  // LumnEdgeCanvas renders canvas when active and null when off
  const lumnOn = renderToStaticMarkup(
    <LumnEdgeCanvas edgeStyle="lumn_vivid" palette={baseBp.palette} audioPulseRef={pulseRef} />
  );
  assert.ok(lumnOn.includes('data-aura-lumn-canvas="true"'));
  assert.ok(lumnOn.includes('data-aura-lumn-backend="webgl2"'));

  const lumnOff = renderToStaticMarkup(
    <LumnEdgeCanvas edgeStyle="off" palette={baseBp.palette} audioPulseRef={pulseRef} />
  );
  assert.equal(lumnOff, '');
});
