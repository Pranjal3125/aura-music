import React, { useEffect, useRef } from 'react';
import { AudioPulseState } from './CosmosLyricsCanvas';
import { VibePalette } from '../types';

interface SpectrumHorizonProps {
  visible: boolean;
  palette: VibePalette;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
}

export const SpectrumHorizon: React.FC<SpectrumHorizonProps> = ({
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

    const resize = () => {
      canvas.width = Math.min(900, window.innerWidth);
      canvas.height = 72;
    };
    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    const draw = () => {
      const { palette: pal } = stateRef.current;
      const spec = audioPulseRef.current.spectrum;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = 28;
      const gap = 5;
      const barW = 3;
      const cx = w * 0.5;

      for (let i = 0; i < bars; i++) {
        const val = spec[i] || 0;
        const bh = 3 + val * 52;
        ctx.fillStyle = i % 2 === 0 ? pal.primary : pal.secondary;
        ctx.globalAlpha = 0.25 + val * 0.7;
        ctx.fillRect(cx + i * (barW + gap), h - bh, barW, bh);
        ctx.fillRect(cx - (i + 1) * (barW + gap), h - bh, barW, bh);
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
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
      className="fixed bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-[12]"
      style={{ width: 'min(94vw, 900px)', height: '72px' }}
    />
  );
};
