import React, { useEffect, useRef } from 'react';

interface ClickRipple {
  x: number;
  y: number;
  maxR: number;
  life: number;
  maxLife: number;
  interactive: boolean;
  primary: string;
  accent: string;
}

interface ClickSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/**
 * Global 120fps OLED Pointer Ripple & Micro-Spark Feedback Overlay.
 * Sleeps at 0% CPU when idle and wakes rAF strictly during active click bursts.
 */
export const ClickPulseOverlay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const ripples: ClickRipple[] = [];
    const sparks: ClickSpark[] = [];
    let rafId = 0;
    let prevNow = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.life += dt;
        if (rp.life >= rp.maxLife) {
          ripples.splice(i, 1);
          continue;
        }
        const t = rp.life / rp.maxLife;
        const ease = 1 - Math.pow(1 - t, 3);
        const fade = Math.pow(1 - t, 1.5);
        const r = 4 + ease * rp.maxR;

        // Soft additive center flash right on contact
        if (t < 0.35) {
          const flashAlpha = (1 - t / 0.35) * (rp.interactive ? 0.35 : 0.18);
          const grad = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, r * 0.72);
          grad.addColorStop(0, rp.accent);
          grad.addColorStop(0.45, rp.primary);
          grad.addColorStop(1, 'transparent');
          ctx.globalAlpha = flashAlpha;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, r * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }

        // Primary outer photon shock ring
        ctx.globalAlpha = fade * (rp.interactive ? 0.82 : 0.45);
        ctx.strokeStyle = rp.primary;
        ctx.lineWidth = Math.max(0.75, (rp.interactive ? 2.4 : 1.5) * (1 - t));
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary tight crisp white echo ring
        if (rp.interactive) {
          ctx.globalAlpha = fade * 0.65;
          ctx.strokeStyle = rp.accent;
          ctx.lineWidth = Math.max(0.5, 1.4 * (1 - t));
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, r * 0.62, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const drag = Math.exp(-5.2 * dt);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life += dt;
        if (sp.life >= sp.maxLife) {
          sparks.splice(i, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= drag;
        sp.vy *= drag;
        const fade = Math.pow(1 - sp.life / sp.maxLife, 1.4);
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * (0.5 + 0.5 * fade), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (ripples.length > 0 || sparks.length > 0) {
        rafId = requestAnimationFrame(drawFrame);
      } else {
        rafId = 0;
        ctx.clearRect(0, 0, w, h);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const target = e.target as HTMLElement | null;
      const interactive = Boolean(
        target?.closest('button, a, input, [role="button"], .cursor-pointer, .aura-interactive')
      );

      const cs = getComputedStyle(canvas.parentElement || document.documentElement);
      const primary = cs.getPropertyValue('--aura-primary').trim() || '#ff1e42';
      const accent = cs.getPropertyValue('--aura-accent').trim() || '#ffffff';

      ripples.push({
        x: e.clientX,
        y: e.clientY,
        maxR: interactive ? 48 : 30,
        life: 0,
        maxLife: interactive ? 0.46 : 0.38,
        interactive,
        primary,
        accent,
      });

      const sparkCount = interactive ? 8 : 4;
      for (let i = 0; i < sparkCount; i++) {
        const ang = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.5;
        const speed = (interactive ? 75 : 42) + Math.random() * (interactive ? 115 : 55);
        sparks.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 0,
          maxLife: 0.34 + Math.random() * 0.2,
          size: interactive ? 2.1 : 1.4,
          color: i % 2 === 0 ? primary : accent,
        });
      }

      if (ripples.length > 24) ripples.splice(0, ripples.length - 24);
      if (sparks.length > 120) sparks.splice(0, sparks.length - 120);

      if (!rafId) {
        prevNow = performance.now();
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-[95]" />;
};
