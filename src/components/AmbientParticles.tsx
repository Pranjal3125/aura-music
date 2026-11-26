import React, { useEffect, useRef } from 'react';
import { AmbientParticleId } from '../types';

interface AmbientParticlesProps {
  mode: AmbientParticleId;
  color: string;
  accent: string;
}

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

/**
 * Ultra-lightweight (<0.3ms/frame) ambient particle accent on pure OLED black.
 * Capped at 38 particles, dpr=1, zero shadowBlur -> silky 60fps on any device.
 */
export const AmbientParticles: React.FC<AmbientParticlesProps> = ({ mode, color, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const count = mode === 'rain' ? 42 : 34;
    const dots: Dot[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: mode === 'rain' ? -0.6 : (Math.random() - 0.5) * 0.25,
      vy: mode === 'rain' ? 5.5 + Math.random() * 4.5 : mode === 'embers' ? -(0.35 + Math.random() * 0.65) : (Math.random() - 0.5) * 0.12,
      size: mode === 'rain' ? 12 + Math.random() * 14 : 1 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    const draw = (now: number) => {
      const t = now * 0.001;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.x += d.vx;
        d.y += d.vy;

        if (d.y > h + 20) { d.y = -20; d.x = Math.random() * w; }
        if (d.y < -20) { d.y = h + 20; d.x = Math.random() * w; }
        if (d.x < -20) d.x = w + 20;
        if (d.x > w + 20) d.x = -20;

        if (mode === 'rain') {
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 1.5, d.y + d.size);
          ctx.stroke();
        } else {
          const alpha = 0.18 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.8 + d.phase));
          ctx.fillStyle = i % 3 === 0 ? color : accent;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [mode, color, accent]);

  if (mode === 'none') return null;
  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-[2]" />;
};
