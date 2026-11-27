import { memo, useEffect, useRef, type RefObject } from 'react';
import type { AudioPulseState, SculptureForm, VibePalette } from '../types';

export const FORMS = ['Knot', 'Ribbon', 'Bloom'] as const;
export type { SculptureForm } from '../types';
export const SIGNAL_PALETTE: VibePalette = { primary: '#ccff64', secondary: '#639844', accent: '#f4ffcd' };

const TAU = Math.PI * 2;
const RING_COUNT = 184;
const SIDES = 28;

// Build cross-sections in the local normal plane of each curve. Only their projection
// and their audio-driven radius change while a frame is on screen.
function centerline(t: number, form: SculptureForm) {
  if (form === 'Knot') {
    const r = 0.87 + 0.35 * Math.cos(3 * t);
    return [r * Math.cos(2 * t), r * Math.sin(2 * t) * 0.86, 0.53 * Math.sin(3 * t)];
  }
  const radius = form === 'Bloom' ? 0.87 + 0.22 * Math.cos(5 * t) : 0.96;
  return [radius * Math.cos(t), radius * Math.sin(t) * 0.82, (form === 'Bloom' ? 0.24 : 0.47) * Math.sin(2 * t)];
}

function buildRings(form: SculptureForm) {
  return Array.from({ length: RING_COUNT }, (_, index) => {
    const t = index / RING_COUNT * TAU;
    const [x, y, z] = centerline(t, form);
    const ahead = centerline(t + 0.001, form);
    const dx = ahead[0] - x, dy = ahead[1] - y, dz = ahead[2] - z;
    const flat = Math.hypot(dx, dy), len = Math.hypot(flat, dz);
    const nx = -dy / flat, ny = dx / flat;
    const bx = -dz / len * ny, by = dz / len * nx, bz = flat / len;
    const twist = form === 'Knot' ? t * 2 : t * 1.5;
    const width = form === 'Ribbon' ? 0.45 : 0.28 + 0.05 * Math.sin(3 * t);
    const height = form === 'Ribbon' ? 0.09 : 0.21;
    const offsets = new Float32Array(SIDES * 3);
    for (let j = 0; j < SIDES; j++) {
      const angle = j / SIDES * TAU;
      const a = width * Math.cos(angle), b = height * Math.sin(angle);
      const u = a * Math.cos(twist) - b * Math.sin(twist);
      const v = a * Math.sin(twist) + b * Math.cos(twist);
      offsets[j * 3] = nx * u + bx * v;
      offsets[j * 3 + 1] = ny * u + by * v;
      offsets[j * 3 + 2] = bz * v;
    }
    return { x, y, z, t, offsets, depth: 0, band: Math.floor((0.5 + 0.49 * Math.sin(t)) * 31) };
  });
}

interface SculptureProps {
  form: SculptureForm;
  palette?: VibePalette;
  pulseRef?: RefObject<AudioPulseState>;
  playing?: boolean;
}

export function ShapePicker({ form, onChange }: { form: SculptureForm; onChange: (form: SculptureForm) => void }) {
  return (
    <div className="form-switch" role="group" aria-label="Sculpture shape">
      {FORMS.map(shape => (
        <button type="button" key={shape} aria-pressed={shape === form} onClick={() => onChange(shape)}>{shape}</button>
      ))}
    </div>
  );
}

export const SignalSculpture = memo(function SignalSculpture({ form, palette = SIGNAL_PALETTE, pulseRef, playing = true }: SculptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedRef = useRef(0);
  const { primary, secondary, accent } = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rings = buildRings(form);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, scale = 0;
    let ink: CanvasGradient;
    let raf = 0, previous = 0, elapsed = elapsedRef.current, visible = true;
    let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0;

    function draw() {
      if (!ctx || !width || !height) return;
      const p = pulseRef?.current;
      const bass = p?.bass ?? 0;
      const beat = p?.beat ?? 0;
      const yaw = -0.32 + Math.sin(elapsed * 0.22) * 0.52 + pointerX * 0.28;
      const tilt = 0.68 + Math.sin(elapsed * 0.16) * 0.18 + pointerY * 0.22;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
      const zoom = scale * (1 + bass * 0.07 + beat * 0.035);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-0.28);
      for (const r of rings) r.depth = (r.z * cy - r.x * sy) * ct + r.y * st;
      rings.sort((a, b) => a.depth - b.depth);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(0.78, Math.min(1.65, scale * 0.009));
      for (const r of rings) {
        const swell = 1 + (p?.spectrum[r.band] ?? 0) * 0.54 + 0.055 * Math.sin(r.t * 3 - elapsed);
        ctx.beginPath();
        for (let j = 0; j < r.offsets.length; j += 3) {
          const x = r.x + swell * r.offsets[j], y = r.y + swell * r.offsets[j + 1], z = r.z + swell * r.offsets[j + 2];
          const side = x * cy + z * sy, depth = z * cy - x * sy;
          const perspective = zoom / (1 - (depth * ct + y * st) * 0.075);
          const px = side * perspective, py = (y * ct - depth * st) * perspective;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#0c110d';
        ctx.globalAlpha = 0.82;
        ctx.fill();
        const light = 0.62 + 0.24 * r.depth + 0.13 * Math.cos(r.t * 3 - elapsed * 0.7);
        ctx.globalAlpha = Math.min(1, Math.max(0.25, light + (p?.treble ?? 0) * 0.18));
        ctx.stroke();
      }
      ctx.restore();
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (now - previous < 1000 / 45 - 1) return;
      elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      pointerX += (targetX - pointerX) * 0.13;
      pointerY += (targetY - pointerY) * 0.13;
      draw();
    }
    function schedule() {
      cancelAnimationFrame(raf);
      if (document.hidden || !visible) return;
      draw();
      previous = performance.now();
      if (playing && !motion.matches) raf = requestAnimationFrame(frame);
    }
    function resize() {
      if (!canvas || !ctx) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = Math.min(width / 3.1, height / 2.95);
      ink = ctx.createLinearGradient(-scale, -scale * 0.5, scale * 0.86, scale * 0.65);
      ink.addColorStop(0, secondary);
      ink.addColorStop(0.34, primary);
      ink.addColorStop(0.54, accent);
      ink.addColorStop(0.78, primary);
      ink.addColorStop(1, secondary);
      draw();
    }
    function steer(e: PointerEvent) {
      if (!canvas || e.pointerType === 'touch' || motion.matches) return;
      const bounds = canvas.getBoundingClientRect();
      targetX = (e.clientX - bounds.left) / bounds.width * 2 - 1;
      targetY = (e.clientY - bounds.top) / bounds.height * 2 - 1;
    }
    function recenter() { targetX = targetY = 0; }
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
    resizeObserver.observe(canvas);
    intersection.observe(canvas);
    resize();
    schedule();
    canvas.addEventListener('pointermove', steer);
    canvas.addEventListener('pointerleave', recenter);
    motion.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      elapsedRef.current = elapsed;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener('pointermove', steer);
      canvas.removeEventListener('pointerleave', recenter);
      motion.removeEventListener('change', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [form, primary, secondary, accent, pulseRef, playing]);

  return <canvas ref={canvasRef} data-aura-sculpture={form} className="signal-canvas" aria-hidden="true" />;
});
