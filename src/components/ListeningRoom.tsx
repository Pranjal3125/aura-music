import { useId, type ComponentProps, type CSSProperties } from 'react';
import { ArrowDownLeft, ArrowDownRight, ArrowRight, AudioLines, Check, Headphones, Mic, MonitorPlay, MonitorSmartphone, Play, Radio, Sliders, Upload } from 'lucide-react';
import type { SongItem, VibePalette } from '../types';
import { VIBE_PRESETS } from '../data/presets';
import { SearchBar } from './SearchBar';
import { ShapePicker, SignalSculpture, type SculptureForm } from './SignalSculpture';
import './listening-room.css';

const SUGGESTIONS = [
  ['No Lie · Sean Paul', 'No Lie Sean Paul Dua Lipa'], ['Starboy · The Weeknd', 'Starboy The Weeknd'],
  ['Kesariya', 'Kesariya Arijit Singh'], ['Tum Hi Ho', 'Tum Hi Ho Arijit Singh'],
  ['Apna Bana Le', 'Apna Bana Le Arijit Singh'], ['Blinding Lights', 'Blinding Lights The Weeknd'],
];
const STATIONS = [
  ['Violet Pop & Dance', 'Sean Paul Dua Lipa The Weeknd', '#ad8ae9'], ['Trending Hindi', 'Arijit Singh Pritam Hindi', '#fa886b'],
  ['Bollywood Soul', 'Arijit Singh Atif Aslam Bollywood', '#edc86b'], ['Indie Chill', 'Anuv Jain Indie India', '#76cada'],
  ['Punjabi Hits', 'Diljit Dosanjh AP Dhillon Punjabi', '#8ed2ac'], ['Electronic / Audius', 'Electronic Synthwave', '#899ef3'],
];
const COVER_HUES = [252, 355, 28, 182, 324, 227, 72, 149];
const PREVIEW_PRESETS = VIBE_PRESETS.slice(0, 4);

function formatTrackBadge(song: SongItem): string {
  const sec = song.fullDuration || song.duration;
  if (sec && sec > 45) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return song.isFullTrack ? 'Full' : '30s';
}

interface Props {
  featured: SongItem[];
  loading: boolean;
  activePreset: string;
  studioOpen: boolean;
  savedVolume: number;
  form: SculptureForm;
  palette: VibePalette;
  search: ComponentProps<typeof SearchBar>;
  onForm: (form: SculptureForm) => void;
  onDemo: () => void;
  onPlay: (song: SongItem) => void;
  onRetry: () => void;
  onSuggest: (term: string) => void;
  onPreset: (id: string) => void;
  onStation: (label: string, query: string) => void;
  onStudio: () => void;
  onCompanion: () => void;
  onCapture: (kind: 'tab' | 'mic') => void;
}

export function ListeningRoom({ featured, loading, activePreset, studioOpen, savedVolume, form, palette, search, onForm, onDemo, onPlay, onRetry, onSuggest, onPreset, onStation, onStudio, onCompanion, onCapture }: Props) {
  const fileId = useId();
  return (
    <main className="listening-room overflow-y-auto">
      <div className="room-shell">
        <header className="room-header">
          <div className="room-brand"><span className="brand-mark"><AudioLines size={24} strokeWidth={2.5} /></span>AURA</div>
          <nav className="room-links" aria-label="Browse"><a href="#library">Library</a><a href="#stations">Radio</a></nav>
          <div className="room-tools">
            <button onClick={() => onCapture('tab')} title="Visualize tab audio" aria-label="Visualize tab audio"><MonitorPlay /><span>YT / Spotify Tab</span></button>
            <button onClick={() => onCapture('mic')} title="Use microphone" aria-label="Use microphone"><Mic /><span>Mic</span></button>
            <button onClick={onCompanion} title="Open second screen" aria-label="Open second screen"><MonitorSmartphone /><span>2nd Screen</span></button>
            <button onClick={onStudio} className="room-studio" aria-expanded={studioOpen}><Sliders /><span>Studio</span></button>
          </div>
        </header>

        <section className="room-hero" aria-labelledby="room-heading">
          <div className="hero-copy">
            <div className="room-kicker"><span className="signal-dot" />Interactive music visualizer</div>
            <h1 id="room-heading">Sound in <em>motion.</em></h1>
            <p>Turn your music into light, shape and synchronized lyrics.</p>
            <div className="hero-actions">
              <button className="launch-demo" onClick={onDemo}><Play size={15} fill="currentColor" />Play demo</button>
              <label className="hero-upload" htmlFor={fileId}><Upload size={15} />Upload audio
                <input id={fileId} className="sr-only" type="file" accept="audio/*" aria-label="Upload audio" onChange={e => { const file = e.target.files?.[0]; if (file) search.onUploadLocalFile(file); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          <div className="hero-exhibit">
            <div className="exhibit-orbit" aria-hidden="true" />
            <SignalSculpture form={form} palette={palette} />
            <ShapePicker form={form} onChange={onForm} />
          </div>
        </section>

        <section id="library" aria-label="Song search" className="room-search">
          <SearchBar {...search} accentColor="#ccff64" />
          <div className="search-suggestions"><span>Try</span>{SUGGESTIONS.map(([label, query]) => <button key={query} onClick={() => onSuggest(query)}>{label}</button>)}</div>
        </section>

        <div className={'room-library' + (studioOpen ? ' room-dimmed' : '')}>
          <section className="tracks-panel">
            <div className="section-heading"><h2>Play instantly<span>.</span></h2><Headphones aria-hidden="true" size={17} /></div>
            {loading ? (
              <div className="track-list" aria-label="Loading featured tracks" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div className="track-placeholder" key={i}><i /><span /></div>)}</div>
            ) : featured.length === 0 ? (
              <div className="track-empty"><p>Featured tracks are unavailable. You can still play the demo or upload audio.</p><button onClick={onRetry}>Retry loading songs <ArrowRight size={14} /></button></div>
            ) : (
              <div className="track-list oled-surface">
                {featured.map((song, i) => (
                  <button key={song.id} className="room-track" onClick={() => onPlay(song)}>
                    <span className="track-cover" style={{ '--cover-hue': COVER_HUES[i % COVER_HUES.length] } as CSSProperties}>
                      {song.artworkUrl && <img src={song.artworkUrl} alt="" loading="lazy" onError={e => { e.currentTarget.hidden = true; }} />}
                      <span className="cover-play"><Play size={15} fill="currentColor" /></span>
                    </span>
                    <span className="track-text"><strong>{song.title}</strong><small>{song.artist}</small></span>
                    <span className="track-length">{formatTrackBadge(song)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="presets-panel">
            <div className="section-heading"><h2>Visual presets<span>.</span></h2><button onClick={onStudio} aria-label="Open all presets in Studio">View all <ArrowRight size={13} /></button></div>
            <div className="preset-tiles">
              {PREVIEW_PRESETS.map((preset, i) => (
                <button key={preset.id} className={'preset-tile preset-' + i} aria-pressed={activePreset === preset.id} title={preset.description} onClick={() => onPreset(preset.id)}>
                  <span className="preset-print" aria-hidden="true" />
                  <span className="preset-check">{activePreset === preset.id ? <Check size={12} /> : <ArrowDownLeft size={12} />}</span>
                  <strong>{preset.name}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="room-radio" id="stations">
          <div className="section-heading"><h2>Endless radio<span>.</span></h2><Radio size={18} aria-hidden="true" /></div>
          <div className="station-list">{STATIONS.map(([label, query, color]) => (
            <button key={label} onClick={() => onStation(label, query)}><span style={{ backgroundColor: color }} />{label}<ArrowDownRight size={12} /></button>
          ))}</div>
        </section>
        <footer className="room-footer"><span>AURA</span><span>Vol {savedVolume}% saved</span></footer>
      </div>
    </main>
  );
}
