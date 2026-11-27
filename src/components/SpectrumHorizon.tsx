import React, { useEffect, useRef } from 'react';
import { AudioPulseState } from './CosmosLyricsCanvas';
import { VibePalette } from '../types';

interface SpectrumHorizonProps {
  visible: boolean;
  palette: VibePalette;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
}

/**
 * Mirrored OLED Glass Capsule Horizon Spectrum with Peak-Hold Sparks.
 */
export const SpectrumHorizon: React.FC<SpectrumHorizonProps> = React.memo(({
  visible,
  palette,
  audioPulseRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ visible, palette });
  stateRef.current = { visible, palette };

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const peaks = new Float32Array(32);

    const resize = () => {
      canvas.width = Math.min(900, window.innerWidth);
      canvas.height = 84;
    };
    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    let prevNow = performance.now();

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      if (document.hidden) {
        prevNow = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;

      const { palette: pal } = stateRef.current;
      const spec = audioPulseRef.current.spectrum;
      const w = canvas.width;
      const h = canvas.height;
      const floorY = h - 18;
      ctx.clearRect(0, 0, w, h);

      const bars = 28;
      const gap = 5;
      const barW = 3.5;
      const step = barW + gap;
      const cx = w * 0.5;
      const peakFall = dt * 0.65;

      for (let i = 0; i < bars; i++) {
        const val = spec[i] || 0;
        if (val > peaks[i]) peaks[i] = val;
        else peaks[i] = Math.max(val, peaks[i] - peakFall);
      }

      // Batched even/odd color passes -> ~6 draw calls total instead of ~112!
      for (let parity = 0; parity < 2; parity++) {
        ctx.fillStyle = parity === 0 ? pal.primary : pal.secondary;

        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        for (let i = parity; i < bars; i += 2) {
          const val = spec[i] || 0;
          const bh = 3 + val * 54;
          const rx = cx + i * step;
          const lx = cx - (i + 1) * step;
          ctx.rect(rx, floorY - bh, barW, bh);
          ctx.rect(lx, floorY - bh, barW, bh);
        }
        ctx.fill();

        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        for (let i = parity; i < bars; i += 2) {
          const val = spec[i] || 0;
          const bh = (3 + val * 54) * 0.28;
          const rx = cx + i * step;
          const lx = cx - (i + 1) * step;
          ctx.rect(rx, floorY + 2, barW, bh);
          ctx.rect(lx, floorY + 2, barW, bh);
        }
        ctx.fill();
      }

      // Batched floating peak-hold sparks
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        if (peaks[i] > 0.08) {
          const peakY = floorY - (5 + peaks[i] * 54);
          const rx = cx + i * step;
          const lx = cx - (i + 1) * step;
          ctx.rect(rx, peakY, barW, 2);
          ctx.rect(lx, peakY, barW, 2);
        }
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [visible, audioPulseRef]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      data-aura-spectrum-canvas="true"
      className="fixed bottom-1 left-1/2 -translate-x-1/2 pointer-events-none z-[12]"
      style={{ width: 'min(94vw, 900px)', height: '84px' }}
    />
  );
});
