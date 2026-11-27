import React, { useState } from 'react';
import {
  Check,
  KeyRound,
  Lock,
  MonitorPlay,
  Server,
  Sparkles,
  Timer,
  Unlock,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { EQ_PRESETS, VIBE_PRESETS } from '../data/presets';
import type {
  AmbientParticleId,
  EdgeStyleId,
  EqPresetId,
  LyricStyleId,
  VibeBlueprint,
} from '../types';
import type { EqBands } from '../services/settingsStorage';

export const LYRIC_STYLES: Array<{ id: LyricStyleId; label: string }> = [
  { id: 'apple_ui', label: 'Apple UI' },
  { id: 'sculpture', label: 'Sculpture' },
  { id: 'constellation', label: 'Constellation' },
  { id: 'fisheye', label: 'Fisheye' },
  { id: 'branches', label: 'Branches' },
  { id: 'web', label: 'Web' },
  { id: 'tunnel', label: 'Hyperwarp' },
  { id: 'mirror', label: 'Prism' },
  { id: 'glitch', label: 'Cyber' },
  { id: 'kinetic', label: 'Kinetic' },
  { id: 'liquid', label: 'Liquid' },
  { id: 'editorial', label: 'Serif' },
  { id: 'codestyle', label: 'Code' },
];

export const EDGE_STYLES: Array<{ id: EdgeStyleId; label: string }> = [
  { id: 'lumn_vivid', label: 'Lumn' },
  { id: 'laser_orbit', label: 'Orbit' },
  { id: 'violet_prism', label: 'Prism' },
  { id: 'breathing_aura', label: 'Soft' },
  { id: 'off', label: 'Off' },
];

export const PARTICLE_STYLES: Array<{ id: AmbientParticleId; label: string }> = [
  { id: 'cosmos', label: 'Stars' },
  { id: 'rain', label: 'Rain' },
  { id: 'embers', label: 'Embers' },
  { id: 'none', label: 'Clean' },
];

interface StudioPopoverProps {
  open: boolean;
  onClose: () => void;
  blueprint: VibeBlueprint;
  activePresetId: string;
  onApplyPreset: (presetId: string) => void;
  onUpdateVisual: (
    patch: Partial<Pick<VibeBlueprint, 'lyricStyle' | 'edgeStyle' | 'particles' | 'showSpectrum'>>
  ) => void;
  visualIcons: boolean;
  onToggleVisualIcons: () => void;
  lockPreset: boolean;
  onToggleLockPreset: () => void;
  hasActiveSong: boolean;
  promptInput: string;
  onPromptInputChange: (val: string) => void;
  onPromptSteer: (e: React.FormEvent) => void;
  isDirecting: boolean;
  eqPreset: EqPresetId | 'custom';
  eqBands: EqBands;
  onSelectEqPreset: (id: EqPresetId) => void;
  onChangeEqBand: (band: keyof EqBands, val: number) => void;
  volume: number;
  muted: boolean;
  onChangeVolume: (v: number) => void;
  onToggleMute: () => void;
  focusRemaining: number | null;
  onToggleFocus: () => void;
  onStartLiveTab: () => void;
  keyDraft: string;
  onKeyDraftChange: (v: string) => void;
  onSaveKey: () => void;
  keySaved: boolean;
  saavnUrlDraft?: string;
  onSaavnUrlDraftChange?: (v: string) => void;
  onSaveSaavnUrl?: () => void;
  saavnUrlSaved?: boolean;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const StudioPopover: React.FC<StudioPopoverProps> = React.memo(({
  open,
  onClose,
  blueprint,
  activePresetId,
  onApplyPreset,
  onUpdateVisual,
  visualIcons,
  onToggleVisualIcons,
  lockPreset,
  onToggleLockPreset,
  hasActiveSong,
  promptInput,
  onPromptInputChange,
  onPromptSteer,
  isDirecting,
  eqPreset,
  eqBands,
  onSelectEqPreset,
  onChangeEqBand,
  volume,
  muted,
  onChangeVolume,
  onToggleMute,
  focusRemaining,
  onToggleFocus,
  onStartLiveTab,
  keyDraft,
  onKeyDraftChange,
  onSaveKey,
  keySaved,
  saavnUrlDraft,
  onSaavnUrlDraftChange,
  onSaveSaavnUrl,
  saavnUrlSaved,
}) => {
  const [studioTab, setStudioTab] = useState<'presets' | 'visuals' | 'audio'>('presets');

  if (!open) return null;
  const primary = blueprint.palette.primary;

  return (
    <div
      className={`studio-drawer fixed top-20 ${
        hasActiveSong ? 'bottom-36' : 'bottom-6'
      } right-5 z-50 w-[min(92vw,404px)] oled-surface rounded-3xl flex flex-col overflow-hidden animate-panel-in`}
    >
      {/* Studio Header + Segmented Tabs */}
      <div className="p-4 pb-3 border-b border-white/[0.07] space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center gap-1.5">
              <span>{blueprint.source === 'gemini_4' ? 'GEMINI 4 DIRECTED' : 'AURA STUDIO'}</span>
              {lockPreset && <span className="text-amber-300">· LOCKED</span>}
            </div>
            <div className="text-sm font-grotesk font-semibold text-white truncate">{blueprint.moodName}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleLockPreset}
              title={lockPreset ? 'Palette Locked across songs (click to auto-adapt)' : 'Auto-adapting colors per song (click to lock palette)'}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                lockPreset
                  ? 'bg-white/[0.14] border-white/30 text-white'
                  : 'bg-white/[0.05] border-white/[0.08] text-white/55 hover:text-white'
              }`}
            >
              {lockPreset ? <Lock className="w-3.5 h-3.5" style={{ color: primary }} /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Studio"
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/60 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {(
            [
              { id: 'presets', label: 'Presets & AI' },
              { id: 'visuals', label: 'Visuals' },
              { id: 'audio', label: 'Audio & EQ' },
            ] as const
          ).map((t) => {
            const act = studioTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setStudioTab(t.id)}
                className={`py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                  act ? 'text-black font-semibold shadow' : 'text-white/60 hover:text-white'
                }`}
                style={act ? { backgroundColor: primary } : undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {studioTab === 'presets' && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                  {VIBE_PRESETS.length} Signature Presets
                </span>
                <span className="text-[10px] text-white/35">1-Click Mood</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {VIBE_PRESETS.map((p) => {
                  const active = activePresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onApplyPreset(p.id)}
                      className={`aura-card-sheen aura-card-press p-2 rounded-2xl text-left border transition-all cursor-pointer flex items-center gap-2.5 ${
                        active
                          ? 'bg-white/[0.12] border-white/35'
                          : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06]'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full shrink-0 border border-white/25"
                        style={{
                          background: `linear-gradient(135deg, ${p.palette.primary}, ${p.palette.secondary})`,
                          boxShadow: active ? `0 0 12px ${p.palette.primary}` : 'none',
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white truncate">{p.name}</div>
                        <div className="text-[9px] font-mono-code text-white/40 truncate">{p.tag}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {hasActiveSong && (
              <form onSubmit={onPromptSteer} className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                  Steer AI Vibe Prompt
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/[0.1] px-2.5 py-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-white/45 shrink-0" />
                    <input
                      type="text"
                      value={promptInput}
                      onChange={(e) => onPromptInputChange(e.target.value)}
                      placeholder='e.g. "apple ui violet" or "fisheye"'
                      className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/35 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!promptInput.trim() || isDirecting}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black disabled:opacity-40 cursor-pointer shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    Morph
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {studioTab === 'visuals' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                Visual World ({LYRIC_STYLES.length})
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {LYRIC_STYLES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateVisual({ lyricStyle: opt.id })}
                    className={`py-1.5 px-2 rounded-xl text-[11px] transition-colors cursor-pointer ${
                      blueprint.lyricStyle === opt.id
                        ? 'text-black font-semibold'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                    }`}
                    style={blueprint.lyricStyle === opt.id ? { backgroundColor: primary } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                Lumn Edge Lighting
              </div>
              <div className="grid grid-cols-5 gap-1">
                {EDGE_STYLES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateVisual({ edgeStyle: opt.id })}
                    className={`py-1.5 rounded-xl text-[10px] transition-colors cursor-pointer ${
                      blueprint.edgeStyle === opt.id
                        ? 'text-black font-semibold'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                    }`}
                    style={blueprint.edgeStyle === opt.id ? { backgroundColor: primary } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/[0.07]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                  Atmosphere &amp; Enhancements
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleVisualIcons}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code cursor-pointer transition-colors flex items-center gap-1 ${
                      visualIcons ? 'text-black font-semibold' : 'bg-white/[0.07] text-white/60'
                    }`}
                    style={visualIcons ? { backgroundColor: primary } : undefined}
                    title="Show contextual icons next to evocative lyric words"
                  >
                    <Sparkles className="w-2.5 h-2.5" /> Icons {visualIcons ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateVisual({ showSpectrum: !blueprint.showSpectrum })}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code cursor-pointer transition-colors ${
                      blueprint.showSpectrum ? 'text-black font-semibold' : 'bg-white/[0.07] text-white/60'
                    }`}
                    style={blueprint.showSpectrum ? { backgroundColor: primary } : undefined}
                  >
                    Spectrum {blueprint.showSpectrum ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {PARTICLE_STYLES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateVisual({ particles: opt.id })}
                    className={`py-1.5 rounded-xl text-[11px] transition-colors cursor-pointer ${
                      blueprint.particles === opt.id
                        ? 'text-black font-semibold'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                    }`}
                    style={blueprint.particles === opt.id ? { backgroundColor: primary } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {studioTab === 'audio' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45">
                Studio Audio EQ Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(EQ_PRESETS) as EqPresetId[]).map((id) => {
                  const active = eqPreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectEqPreset(id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] transition-colors cursor-pointer ${
                        active ? 'text-black font-semibold' : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/75'
                      }`}
                      style={active ? { backgroundColor: primary } : undefined}
                    >
                      {EQ_PRESETS[id].label}
                    </button>
                  );
                })}
              </div>

              {/* Real-time 3-Band EQ Sliders */}
              <div className="space-y-2 pt-2">
                {(
                  [
                    { key: 'bass', label: 'Sub Bass (95Hz)' },
                    { key: 'mid', label: 'Vocal Presence (1.8k)' },
                    { key: 'treble', label: 'Treble Air (8kHz)' },
                  ] as const
                ).map((band) => (
                  <div key={band.key} className="flex items-center gap-3 text-[11px]">
                    <span className="w-32 text-white/60">{band.label}</span>
                    <input
                      type="range"
                      min={-8}
                      max={10}
                      step={0.5}
                      value={eqBands[band.key]}
                      onChange={(e) => onChangeEqBand(band.key, parseFloat(e.target.value))}
                      className="aura-slider flex-1"
                    />
                    <span className="w-10 text-right font-mono-code text-white/70">
                      {eqBands[band.key] > 0 ? `+${eqBands[band.key]}` : eqBands[band.key]}dB
                    </span>
                  </div>
                ))}
              </div>

              {/* Persistent Master Volume Control */}
              <div className="flex items-center gap-3 text-[11px] pt-2 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="flex items-center gap-1.5 w-32 text-white/70 hover:text-white cursor-pointer text-left"
                  title="Mute / Unmute"
                >
                  {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>Master Volume</span>
                </button>
                <input
                  type="range"
                  aria-label="Master Volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                  className="aura-slider flex-1"
                />
                <span className="w-10 text-right font-mono-code text-white/80 tabular-nums">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={onToggleFocus}
                className="py-2 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Timer className="w-3.5 h-3.5" style={{ color: primary }} />
                <span>{focusRemaining !== null ? `Focus ${fmtTime(focusRemaining)}` : '25m Focus'}</span>
              </button>
              <button
                type="button"
                onClick={onStartLiveTab}
                className="py-2 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MonitorPlay className="w-3.5 h-3.5 text-emerald-400" />
                <span>YT / Spotify Tab</span>
              </button>
            </div>

            {onSaavnUrlDraftChange && onSaveSaavnUrl && (
              <div className="pt-2 border-t border-white/[0.07] space-y-2">
                <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center justify-between">
                  <span>Full-Track API (Optional)</span>
                  <span className="text-white/30">320kbps · 0:00 Sync</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-black/50 border border-white/[0.1] px-2.5 py-1.5">
                    <Server className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <input
                      type="url"
                      value={saavnUrlDraft || ''}
                      onChange={(e) => onSaavnUrlDraftChange(e.target.value)}
                      placeholder="https://your-saavn-api.vercel.app/api"
                      className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/30 outline-none font-mono-code"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onSaveSaavnUrl}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black cursor-pointer shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    {saavnUrlSaved ? <Check className="w-3.5 h-3.5" /> : 'Save'}
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.07] space-y-2">
              <div className="text-[10px] font-mono-code uppercase tracking-widest text-white/45 flex items-center justify-between">
                <span>Gemini 4 Vision AI (Optional)</span>
                <span className="text-white/30">gemini-4-hydrogen</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-black/50 border border-white/[0.1] px-2.5 py-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => onKeyDraftChange(e.target.value)}
                    placeholder="AIzaSy... (optional key)"
                    className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-white/30 outline-none font-mono-code"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSaveKey}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-black cursor-pointer shrink-0"
                  style={{ backgroundColor: primary }}
                >
                  {keySaved ? <Check className="w-3.5 h-3.5" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
