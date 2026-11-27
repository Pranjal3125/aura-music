/**
 * Studio-Grade Zero-Lag 120fps Audio DSP & Beat-Sync Engine.
 * Supports:
 * - Real 320kbps full streams, Audius streams, Apple previews, local MP3/WAV/FLAC
 * - Automatic non-CORS Audio fallback if an audio CDN blocks `crossOrigin="anonymous"`
 * - Live Browser Tab Audio (Spotify Web / YouTube Music) & Room Mic capture!
 * - Real 3-Band Biquad Studio EQ (Bass 95Hz, Vocal Presence 1.8kHz, Treble Air 7.8kHz)
 * - 1024-pt FFT multi-band analyzer (Sub-Bass, Bass, Vocal Presence, Treble) + Spectral Flux Beat Detector
 * - Playback-clock-locked BPM + Vocal-Impulse Groove Engine when CDN blocks CORS PCM readback
 */
export interface AudioSampleOutput {
  bass: number;
  subBass: number;
  beat: number;
  mid: number;
  vocal: number;
  treble: number;
  energy: number;
  beatPhase: number;
  isLiveFft: boolean;
  spectrum: Float32Array;
}

export class LightAudioEngine {
  private primaryAudio: HTMLAudioElement;
  private fallbackAudio: HTMLAudioElement;
  private usingFallback = false;
  private loadSeq = 0;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private streamNode: MediaStreamAudioSourceNode | null = null;
  private activeStream: MediaStream | null = null;

  // 3-Band Studio EQ Biquad Filter Chain
  private bassFilter: BiquadFilterNode | null = null;
  private midFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;

  private eqState = { bass: 0, mid: 0, treble: 0 };
  private volumeState = 0.85;
  private freqData = new Uint8Array(512);
  private prevFreqData = new Uint8Array(512);
  private spectrumOut = new Float32Array(32);
  private logBinMap = new Uint16Array(33);
  private logBinsReady = false;
  private corsConnected = false;
  // Apple iTunes CDN omits Access-Control-Allow-Origin; skip doomed crossOrigin attempt to avoid CORS error & load latency
  private corsBlockedOrigins = new Set<string>(['https://audio-ssl.itunes.apple.com']);
  private liveMode: 'none' | 'tab' | 'mic' = 'none';
  private liveStartMs = 0;

  // Smooth multi-band envelopes & adaptive spectral flux beat detector
  private smoothSubBass = 0.06;
  private smoothBass = 0.08;
  private smoothMid = 0.08;
  private smoothVocal = 0.06;
  private smoothTreble = 0.05;
  private smoothEnergy = 0.07;
  private beatPulse = 0;
  private bassAvg = 0.14;
  private fluxAvg = 0.05;
  private lastBeatMs = 0;
  private estimatedBpm = 104;
  private beatPhase = 0;
  private lastSampleMs = 0;

  // Track-aware rhythm & vocal impulse state (used when CDN blocks CORS PCM readback)
  private trackBpm = 104;
  private vocalImpulse = 0;
  private lineAccentImpulse = 0;

  public onEnded?: () => void;
  public onPlayStateChange?: (playing: boolean) => void;
  public onDurationChange?: (duration: number) => void;

  constructor(initial?: { volume?: number; eq?: { bass: number; mid: number; treble: number } }) {
    const initialVol =
      typeof initial?.volume === 'number' && Number.isFinite(initial.volume)
        ? Math.min(1, Math.max(0, initial.volume))
        : 0.85;
    this.volumeState = initialVol;

    this.primaryAudio = new Audio();
    this.primaryAudio.crossOrigin = 'anonymous';
    this.primaryAudio.preload = 'auto';
    this.primaryAudio.volume = initialVol;

    this.fallbackAudio = new Audio();
    this.fallbackAudio.preload = 'auto';
    this.fallbackAudio.volume = initialVol;

    if (initial?.eq) {
      this.setEq(initial.eq.bass, initial.eq.mid, initial.eq.treble);
    }

    const bindEvents = (el: HTMLAudioElement, isFallbackEl: boolean) => {
      el.addEventListener('play', () => {
        if (this.usingFallback === isFallbackEl) this.onPlayStateChange?.(true);
      });
      el.addEventListener('pause', () => {
        if (this.usingFallback === isFallbackEl) this.onPlayStateChange?.(false);
      });
      el.addEventListener('ended', () => {
        if (this.usingFallback === isFallbackEl) {
          this.onPlayStateChange?.(false);
          this.onEnded?.();
        }
      });
      el.addEventListener('loadedmetadata', () => {
        if (this.usingFallback === isFallbackEl && isFinite(el.duration) && el.duration > 0) {
          this.onDurationChange?.(el.duration);
        }
      });
    };

    bindEvents(this.primaryAudio, false);
    bindEvents(this.fallbackAudio, true);
  }

  private get activeEl(): HTMLAudioElement {
    return this.usingFallback ? this.fallbackAudio : this.primaryAudio;
  }

  private buildLogBinMap(sampleRate: number, binCount: number): void {
    const nyquist = Math.max(8000, sampleRate * 0.5);
    const minFreq = 42;
    const maxFreq = Math.min(14500, nyquist * 0.88);
    const ratio = maxFreq / minFreq;
    for (let i = 0; i <= 32; i++) {
      const f = minFreq * Math.pow(ratio, i / 32);
      const bin = Math.min(binCount - 1, Math.max(1, Math.round((f / nyquist) * (binCount - 1))));
      this.logBinMap[i] = bin;
    }
    this.logBinsReady = true;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.68;
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.prevFreqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.buildLogBinMap(this.ctx.sampleRate || 44100, this.analyser.frequencyBinCount);

        this.bassFilter = this.ctx.createBiquadFilter();
        this.bassFilter.type = 'lowshelf';
        this.bassFilter.frequency.value = 95;
        this.bassFilter.gain.value = this.eqState.bass;

        this.midFilter = this.ctx.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = 1800;
        this.midFilter.Q.value = 1.0;
        this.midFilter.gain.value = this.eqState.mid;

        this.trebleFilter = this.ctx.createBiquadFilter();
        this.trebleFilter.type = 'highshelf';
        this.trebleFilter.frequency.value = 7800;
        this.trebleFilter.gain.value = this.eqState.treble;

        this.sourceNode = this.ctx.createMediaElementSource(this.primaryAudio);
        this.sourceNode.connect(this.bassFilter);
        this.bassFilter.connect(this.midFilter);
        this.midFilter.connect(this.trebleFilter);
        this.trebleFilter.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        this.corsConnected = true;
      } catch {
        this.corsConnected = false;
      }
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setEq(bassDb: number, midDb: number, trebleDb: number): void {
    this.eqState = { bass: bassDb, mid: midDb, treble: trebleDb };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.bassFilter?.gain.setTargetAtTime(bassDb, now, 0.04);
    this.midFilter?.gain.setTargetAtTime(midDb, now, 0.04);
    this.trebleFilter?.gain.setTargetAtTime(trebleDb, now, 0.04);
  }

  public setTrackBpm(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) {
      const clamped = Math.min(185, Math.max(62, bpm));
      this.trackBpm = clamped;
      this.estimatedBpm = clamped;
    }
  }

  /**
   * Called by the lyric sync clock whenever a lyric line or word fires so
   * animations stay locked to vocal hits even on CORS-restricted streams.
   */
  public notifyVocalImpulse(strength = 0.75, isLineStart = false): void {
    const clamped = Math.min(1, Math.max(0.15, strength));
    this.vocalImpulse = Math.max(this.vocalImpulse, clamped);
    if (isLineStart) {
      this.lineAccentImpulse = Math.max(this.lineAccentImpulse, Math.min(1, clamped * 0.92));
    }
  }

  public stopLiveCapture(): void {
    if (this.streamNode) {
      try {
        this.streamNode.disconnect();
      } catch {
        // ignore
      }
      this.streamNode = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
    if (this.liveMode !== 'none' && this.analyser && this.ctx) {
      try {
        this.analyser.disconnect();
      } catch {
        // ignore
      }
      this.analyser.connect(this.ctx.destination);
    }
    this.liveMode = 'none';
    this.liveStartMs = 0;
  }

  private getOrigin(url: string): string | null {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  public async loadAndPlay(url: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.stopLiveCapture();
    this.primaryAudio.pause();
    this.fallbackAudio.pause();
    this.prevFreqData.fill(0);
    this.vocalImpulse = 0;
    this.lineAccentImpulse = 0;

    const origin = this.getOrigin(url);
    if (origin && this.corsBlockedOrigins.has(origin)) {
      this.primaryAudio.removeAttribute('src');
      this.usingFallback = true;
      this.fallbackAudio.volume = this.volumeState;
      this.fallbackAudio.src = url;
      this.fallbackAudio.currentTime = 0;
      try {
        await this.fallbackAudio.play();
      } catch (fbErr) {
        if (seq !== this.loadSeq) return;
        if (fbErr instanceof DOMException && fbErr.name === 'AbortError') return;
        throw fbErr;
      }
      return;
    }

    this.usingFallback = false;
    this.ensureContext();
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
    }

    this.primaryAudio.volume = this.volumeState;
    this.primaryAudio.src = url;
    this.primaryAudio.currentTime = 0;

    try {
      await this.primaryAudio.play();
    } catch (err) {
      if (seq !== this.loadSeq) return;
      const errName = err instanceof DOMException ? err.name : '';
      // Autoplay gesture block -> surface cleanly without switching to fallback
      if (errName === 'NotAllowedError') {
        throw err;
      }
      if (errName === 'AbortError') {
        return;
      }
      // CORS / Media decode error on crossOrigin="anonymous" -> fall back seamlessly to direct non-CORS <audio>
      this.primaryAudio.pause();
      this.primaryAudio.removeAttribute('src');
      this.usingFallback = true;
      this.fallbackAudio.volume = this.volumeState;
      this.fallbackAudio.src = url;
      this.fallbackAudio.currentTime = 0;
      try {
        await this.fallbackAudio.play();
        if (origin) this.corsBlockedOrigins.add(origin);
      } catch (fbErr) {
        if (seq !== this.loadSeq) return;
        if (fbErr instanceof DOMException && fbErr.name === 'AbortError') return;
        throw fbErr;
      }
    }
  }

  public async startTabCapture(): Promise<void> {
    this.primaryAudio.pause();
    this.fallbackAudio.pause();
    this.stopLiveCapture();
    const ctx = this.ensureContext();
    if (!ctx || !this.analyser) throw new Error('AudioContext unavailable');

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints,
    });

    const audioTracks = stream.getAudioTracks();
    stream.getVideoTracks().forEach((t) => t.stop());
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Enable "Share tab audio" when choosing a tab.');
    }

    const audioOnly = new MediaStream(audioTracks);
    this.activeStream = audioOnly;
    this.liveMode = 'tab';
    this.liveStartMs = performance.now();

    try {
      this.analyser.disconnect();
    } catch {
      // ignore
    }
    this.streamNode = ctx.createMediaStreamSource(audioOnly);
    this.streamNode.connect(this.analyser);
    this.onPlayStateChange?.(true);

    audioTracks[0].onended = () => {
      this.stopLiveCapture();
      this.onPlayStateChange?.(false);
    };
  }

  public async startMicCapture(): Promise<void> {
    this.primaryAudio.pause();
    this.fallbackAudio.pause();
    this.stopLiveCapture();
    const ctx = this.ensureContext();
    if (!ctx || !this.analyser) throw new Error('AudioContext unavailable');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.activeStream = stream;
    this.liveMode = 'mic';
    this.liveStartMs = performance.now();

    try {
      this.analyser.disconnect();
    } catch {
      // ignore
    }
    this.streamNode = ctx.createMediaStreamSource(stream);
    this.streamNode.connect(this.analyser);
    this.onPlayStateChange?.(true);
  }

  public play(): void {
    if (this.liveMode !== 'none') return;
    if (!this.usingFallback) this.ensureContext();
    void this.activeEl.play().catch(() => {
      // Ignore transient play rejection (e.g. autoplay lock before user gesture)
    });
  }

  public pause(): void {
    if (this.liveMode !== 'none') {
      this.stopLiveCapture();
      this.onPlayStateChange?.(false);
      return;
    }
    this.activeEl.pause();
  }

  public togglePlay(): void {
    if (this.liveMode !== 'none') {
      this.stopLiveCapture();
      this.onPlayStateChange?.(false);
      return;
    }
    if (this.activeEl.paused) this.play();
    else this.pause();
  }

  public isPlaying(): boolean {
    if (this.liveMode !== 'none') return true;
    return !this.activeEl.paused && !this.activeEl.ended;
  }

  public seek(sec: number): void {
    if (this.liveMode !== 'none') return;
    if (isFinite(sec)) {
      const dur = this.getDuration();
      this.activeEl.currentTime = Math.max(0, dur > 0 ? Math.min(dur, sec) : sec);
    }
  }

  public setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.volumeState = clamped;
    this.primaryAudio.volume = clamped;
    this.fallbackAudio.volume = clamped;
  }

  public getCurrentTime(): number {
    if (this.liveMode !== 'none' && this.liveStartMs > 0) {
      return Math.max(0, (performance.now() - this.liveStartMs) / 1000);
    }
    return this.activeEl.currentTime || 0;
  }

  public resetLiveClock(): void {
    if (this.liveMode !== 'none') {
      this.liveStartMs = performance.now();
    }
  }

  public getDuration(): number {
    return isFinite(this.activeEl.duration) ? this.activeEl.duration : 0;
  }

  public isLiveFftActive(): boolean {
    return Boolean(this.analyser && ((!this.usingFallback && this.corsConnected) || this.liveMode !== 'none'));
  }

  public samplePulse(dtSec?: number): AudioSampleOutput {
    const now = performance.now();
    const dt =
      typeof dtSec === 'number' && Number.isFinite(dtSec)
        ? Math.min(0.05, Math.max(0.001, dtSec))
        : this.lastSampleMs > 0
          ? Math.min(0.05, Math.max(0.001, (now - this.lastSampleMs) * 0.001))
          : 0.016;
    this.lastSampleMs = now;

    // Frame-rate independent impulse decays
    this.vocalImpulse *= Math.exp(-5.4 * dt);
    this.lineAccentImpulse *= Math.exp(-6.2 * dt);

    const playing = this.isPlaying();

    if (!playing) {
      const idle = 0.06 + 0.025 * Math.sin(now * 0.0014);
      const decay = 1 - Math.exp(-5.5 * dt);
      const fastDecay = Math.exp(-8.5 * dt);
      this.smoothSubBass += (idle * 0.7 - this.smoothSubBass) * decay;
      this.smoothBass += (idle - this.smoothBass) * decay;
      this.smoothMid += (idle - this.smoothMid) * decay;
      this.smoothVocal += (idle * 0.5 - this.smoothVocal) * decay;
      this.smoothTreble += (idle * 0.4 - this.smoothTreble) * decay;
      this.smoothEnergy += (idle - this.smoothEnergy) * decay;
      this.beatPulse *= fastDecay;
      for (let i = 0; i < 32; i++) {
        this.spectrumOut[i] *= fastDecay;
      }
      return {
        bass: this.smoothBass,
        subBass: this.smoothSubBass,
        beat: this.beatPulse,
        mid: this.smoothMid,
        vocal: this.smoothVocal,
        treble: this.smoothTreble,
        energy: this.smoothEnergy,
        beatPhase: this.beatPhase,
        isLiveFft: false,
        spectrum: this.spectrumOut,
      };
    }

    const atk = 1 - Math.exp(-24 * dt);
    const rel = 1 - Math.exp(-6.5 * dt);
    const specSmooth = 1 - Math.exp(-22 * dt);

    if (this.analyser && ((!this.usingFallback && this.corsConnected) || this.liveMode !== 'none')) {
      this.analyser.getByteFrequencyData(this.freqData);
      const binCount = this.freqData.length;
      const sampleRate = this.ctx?.sampleRate || 44100;
      const hzPerBin = sampleRate / (binCount * 2);

      if (!this.logBinsReady) {
        this.buildLogBinMap(sampleRate, binCount);
      }

      const binFor = (hz: number) => Math.min(binCount - 1, Math.max(1, Math.round(hz / hzPerBin)));
      const subEnd = Math.max(3, binFor(140));
      const bassEnd = Math.max(subEnd + 2, binFor(270));
      const vocStart = Math.max(bassEnd, binFor(320));
      const vocEnd = Math.max(vocStart + 6, binFor(3200));
      const trebStart = Math.max(vocEnd, binFor(4000));
      const trebEnd = Math.max(trebStart + 8, binFor(12500));

      let subSum = 0;
      let fluxSum = 0;
      for (let i = 1; i <= subEnd; i++) {
        const cur = this.freqData[i];
        subSum += cur;
        const diff = cur - this.prevFreqData[i];
        if (diff > 0) fluxSum += diff * 1.45;
      }
      const rawSubBass = subSum / (subEnd * 255);

      let bassSum = 0;
      for (let i = 1; i <= bassEnd; i++) {
        const cur = this.freqData[i];
        bassSum += cur;
        if (i > subEnd) {
          const diff = cur - this.prevFreqData[i];
          if (diff > 0) fluxSum += diff * 0.85;
        }
      }
      const rawBass = bassSum / (bassEnd * 255);

      let vocSum = 0;
      for (let i = vocStart; i <= vocEnd; i++) {
        vocSum += this.freqData[i];
      }
      const rawVocal = vocSum / ((vocEnd - vocStart + 1) * 255);

      let trebSum = 0;
      for (let i = trebStart; i <= trebEnd; i++) {
        trebSum += this.freqData[i];
      }
      const rawTreble = trebSum / ((trebEnd - trebStart + 1) * 255);

      // Copy frame into prevFreqData for next frame's spectral flux delta
      this.prevFreqData.set(this.freqData);

      // Logarithmic 32-band spectrum for smooth, full-range visuals
      for (let i = 0; i < 32; i++) {
        const lo = this.logBinMap[i];
        const hi = Math.max(lo, this.logBinMap[i + 1] - 1);
        let maxVal = 0;
        for (let b = lo; b <= hi; b++) {
          if (this.freqData[b] > maxVal) maxVal = this.freqData[b];
        }
        const norm = maxVal / 255;
        this.spectrumOut[i] += (norm - this.spectrumOut[i]) * specSmooth;
      }

      const rawEnergy = rawSubBass * 0.34 + rawBass * 0.26 + rawVocal * 0.28 + rawTreble * 0.12;

      if (rawBass + rawVocal + rawTreble > 0.008) {
        const normFlux = fluxSum / (bassEnd * 255);
        this.smoothSubBass += (rawSubBass - this.smoothSubBass) * (rawSubBass > this.smoothSubBass ? atk : rel);
        this.smoothBass += (rawBass - this.smoothBass) * (rawBass > this.smoothBass ? atk : rel);
        this.smoothVocal += (rawVocal - this.smoothVocal) * (rawVocal > this.smoothVocal ? atk : rel);
        this.smoothMid += ((rawVocal * 0.78 + rawBass * 0.22) - this.smoothMid) * (rawVocal > this.smoothMid ? atk : rel);
        this.smoothTreble += (rawTreble - this.smoothTreble) * (rawTreble > this.smoothTreble ? atk : rel);
        this.smoothEnergy += (rawEnergy - this.smoothEnergy) * (rawEnergy > this.smoothEnergy ? atk : rel);

        const avgRate = 1 - Math.exp(-2.6 * dt);
        this.bassAvg += (rawSubBass - this.bassAvg) * avgRate;
        this.fluxAvg += (normFlux - this.fluxAvg) * avgRate;

        const isFluxSpike = normFlux > Math.max(0.055, this.fluxAvg * 1.48) && rawSubBass > 0.16;
        const isBassSpike = rawSubBass > Math.max(0.24, this.bassAvg * 1.24);
        if ((isFluxSpike || isBassSpike) && now - this.lastBeatMs > 215) {
          const ibi = now - this.lastBeatMs;
          if (ibi >= 310 && ibi <= 1050) {
            const instBpm = 60000 / ibi;
            this.estimatedBpm = this.estimatedBpm * 0.84 + instBpm * 0.16;
          }
          this.lastBeatMs = now;
          this.beatPhase = 0;
          const strength = Math.max(rawSubBass - this.bassAvg, normFlux * 2.2);
          this.beatPulse = Math.min(1, 0.74 + strength * 1.6);
        } else {
          this.beatPulse *= Math.exp(-8.8 * dt);
          this.beatPhase = (this.beatPhase + dt * (this.estimatedBpm / 60)) % 1;
        }

        return {
          bass: Math.min(1, this.smoothBass * 1.24),
          subBass: Math.min(1, this.smoothSubBass * 1.28),
          beat: Math.min(1, Math.max(this.beatPulse, this.lineAccentImpulse * 0.4)),
          mid: Math.min(1, this.smoothMid * 1.28),
          vocal: Math.min(1, this.smoothVocal * 1.32 + this.vocalImpulse * 0.14),
          treble: Math.min(1, this.smoothTreble * 1.35),
          energy: Math.min(1, this.smoothEnergy * 1.25),
          beatPhase: this.beatPhase,
          isLiveFft: true,
          spectrum: this.spectrumOut,
        };
      }
    }

    // Playback-clock-locked BPM Groove + Vocal Impulse Engine (used on CORS-blocked previews)
    const curSec = this.getCurrentTime();
    const beatsPerSec = this.trackBpm / 60;
    const totalBeats = curSec * beatsPerSec;
    const beatFrac = totalBeats - Math.floor(totalBeats);
    const barBeat = Math.floor(totalBeats) % 4;
    this.beatPhase = beatFrac;

    // Punchy 4/4 kick envelope on beats 0 & 2, crisp snare/clap on beats 1 & 3, subtle offbeat groove
    const kickEnv = Math.exp(-beatFrac * (barBeat % 2 === 0 ? 7.2 : 9.8));
    const subDrive = barBeat === 0 ? 1.0 : barBeat === 2 ? 0.88 : 0.42;
    const snareEnv = barBeat % 2 === 1 ? Math.exp(-beatFrac * 8.5) * 0.75 : Math.exp(-Math.abs(beatFrac - 0.5) * 14) * 0.35;
    const hihatFrac = (totalBeats * 2) % 1;
    const hihatEnv = Math.exp(-hihatFrac * 12) * 0.55;

    const targetSub = Math.min(1, 0.14 + kickEnv * subDrive * 0.62 + this.lineAccentImpulse * 0.16);
    const targetBass = Math.min(1, 0.18 + kickEnv * 0.48 + 0.1 * Math.sin(totalBeats * Math.PI * 0.5) + this.lineAccentImpulse * 0.14);
    const targetVocal = Math.min(1, 0.14 + this.vocalImpulse * 0.68 + snareEnv * 0.22);
    const targetMid = Math.min(1, 0.18 + snareEnv * 0.42 + this.vocalImpulse * 0.44);
    const targetTreble = Math.min(1, 0.1 + hihatEnv * 0.52 + this.vocalImpulse * 0.24);
    const targetBeat = Math.min(1, Math.max(kickEnv * (barBeat % 2 === 0 ? 0.86 : 0.48), this.lineAccentImpulse * 0.72));
    const targetEnergy = Math.min(1, targetSub * 0.32 + targetBass * 0.25 + targetVocal * 0.28 + targetTreble * 0.15);

    this.smoothSubBass += (targetSub - this.smoothSubBass) * (targetSub > this.smoothSubBass ? atk : rel);
    this.smoothBass += (targetBass - this.smoothBass) * (targetBass > this.smoothBass ? atk : rel);
    this.smoothVocal += (targetVocal - this.smoothVocal) * (targetVocal > this.smoothVocal ? atk : rel);
    this.smoothMid += (targetMid - this.smoothMid) * (targetMid > this.smoothMid ? atk : rel);
    this.smoothTreble += (targetTreble - this.smoothTreble) * (targetTreble > this.smoothTreble ? atk : rel);
    this.smoothEnergy += (targetEnergy - this.smoothEnergy) * (targetEnergy > this.smoothEnergy ? atk : rel);
    this.beatPulse += (targetBeat - this.beatPulse) * (targetBeat > this.beatPulse ? atk : rel);

    for (let i = 0; i < 32; i++) {
      const bandNorm = i / 31;
      const harmonic = 0.72 + 0.28 * Math.sin(totalBeats * (1.8 + (i % 5) * 0.45) + i * 0.62);
      const val =
        bandNorm < 0.26
          ? targetSub * (1 - bandNorm * 1.1) * harmonic
          : bandNorm < 0.68
            ? (targetVocal * 0.65 + targetMid * 0.35) * harmonic
            : targetTreble * (1.15 - bandNorm * 0.5) * harmonic;
      const clampedVal = Math.min(1, Math.max(0.04, val));
      this.spectrumOut[i] += (clampedVal - this.spectrumOut[i]) * specSmooth;
    }

    return {
      bass: this.smoothBass,
      subBass: this.smoothSubBass,
      beat: this.beatPulse,
      mid: this.smoothMid,
      vocal: this.smoothVocal,
      treble: this.smoothTreble,
      energy: this.smoothEnergy,
      beatPhase: this.beatPhase,
      isLiveFft: false,
      spectrum: this.spectrumOut,
    };
  }

  public dispose(): void {
    this.stopLiveCapture();
    this.primaryAudio.pause();
    this.primaryAudio.src = '';
    this.fallbackAudio.pause();
    this.fallbackAudio.src = '';
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
