import React, { useEffect, useRef } from 'react';
import { LyricLine, LyricStyleId, VibePalette } from '../types';

export interface AudioPulseState {
  bass: number;
  beat: number;
  mid: number;
  spectrum: Float32Array;
}

interface CosmosLyricsCanvasProps {
  mode: Extract<LyricStyleId, 'constellation' | 'branches' | 'web'>;
  lyrics: LyricLine[];
  activeLineIdx: number;
  activeWordIdx: number;
  palette: VibePalette;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
  particleMode: 'cosmos' | 'rain' | 'embers' | 'none';
}

interface WorldWordNode {
  lineIdx: number;
  wordIdx: number;
  globalIdx: number;
  text: string;
  wx: number;
  wy: number;
  seed: number;
  labelAbove: boolean;
  glow: number;
  scale: number;
  scaleVel: number;
  edgeProg: number;
  visAlpha: number;
}

interface BgStar {
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
  tint: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  warm: boolean;
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (isNaN(n)) return [255, 30, 66];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(rgb: [number, number, number], a: number): string {
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function easeOutCubic(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - k, 3);
}

function createGlowSprite(rgb: [number, number, number], coreRgb: [number, number, number]): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, rgba(coreRgb, 1));
  g.addColorStop(0.14, rgba(coreRgb, 0.78));
  g.addColorStop(0.32, rgba(rgb, 0.54));
  g.addColorStop(0.62, rgba(rgb, 0.16));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function buildConstellationWorld(lyrics: LyricLine[]): WorldWordNode[] {
  const nodes: WorldWordNode[] = [];
  let cx = 0;
  let cy = 0;
  let globalIdx = 0;

  lyrics.forEach((line, lineIdx) => {
    const lineAngleBase = (seeded(lineIdx * 13 + 7) - 0.5) * 0.52;
    if (lineIdx > 0) {
      const jumpAngle = (seeded(lineIdx * 29 + 3) - 0.5) * 1.05;
      cx += Math.cos(jumpAngle) * 215;
      cy += Math.sin(jumpAngle) * 130;
    }

    line.words.forEach((wd, wordIdx) => {
      const seed = lineIdx * 97 + wordIdx * 31 + 11;
      if (wordIdx > 0) {
        const stepLen = 124 + Math.min(72, wd.text.length * 9) + seeded(seed) * 52;
        const bend = (seeded(seed + 5) - 0.5) * 1.18;
        const ang = lineAngleBase + bend;
        cx += Math.cos(ang) * stepLen;
        cy += Math.sin(ang) * stepLen * 0.78;
      }

      nodes.push({
        lineIdx,
        wordIdx,
        globalIdx: globalIdx++,
        text: wd.text,
        wx: cx,
        wy: cy,
        seed,
        labelAbove: seeded(seed + 19) > 0.45,
        glow: 0,
        scale: 0,
        scaleVel: 0,
        edgeProg: 0,
        visAlpha: 0,
      });
    });
  });

  return nodes;
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerR: number,
  fill: string,
  rot = 0
): void {
  if (outerR <= 0.4) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.fillStyle = fill;
  ctx.beginPath();
  const innerR = outerR * 0.17;
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / 4;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const CosmosLyricsCanvas: React.FC<CosmosLyricsCanvasProps> = ({
  mode,
  lyrics,
  activeLineIdx,
  activeWordIdx,
  palette,
  audioPulseRef,
  particleMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stateRef = useRef({
    mode,
    lyrics,
    activeLineIdx,
    activeWordIdx,
    palette,
    particleMode,
  });
  stateRef.current = { mode, lyrics, activeLineIdx, activeWordIdx, palette, particleMode };

  const worldRef = useRef<WorldWordNode[]>([]);
  const spritesRef = useRef<{ primary: HTMLCanvasElement; accent: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    worldRef.current = buildConstellationWorld(lyrics);
  }, [lyrics]);

  useEffect(() => {
    const pRgb = hexToRgb(palette.primary);
    const aRgb = hexToRgb(palette.accent);
    spritesRef.current = {
      primary: createGlowSprite(pRgb, aRgb),
      accent: createGlowSprite(aRgb, [255, 255, 255]),
    };
  }, [palette.primary, palette.accent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const bgStars: BgStar[] = Array.from({ length: 135 }, (_, i) => ({
      x: seeded(i * 11 + 1) * 2400 - 1200,
      y: seeded(i * 17 + 3) * 1600 - 800,
      z: 0.22 + seeded(i * 23 + 5) * 0.78,
      r: 0.65 + seeded(i * 31 + 7) * 1.4,
      phase: seeded(i * 41 + 9) * Math.PI * 2,
      tint: i % 4 === 0,
    }));

    const sparks: Spark[] = [];

    let camX = 0;
    let camY = 0;
    let camVx = 0;
    let camVy = 0;
    let camInitialized = false;

    const curP: [number, number, number] = hexToRgb(stateRef.current.palette.primary);
    const curS: [number, number, number] = hexToRgb(stateRef.current.palette.secondary);
    const curA: [number, number, number] = hexToRgb(stateRef.current.palette.accent);

    let lastActiveGlobal = -1;
    let webRipple = 0;
    let webCenterScale = 1;
    let prevNow = performance.now();
    let rafId = 0;

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;
      const t = now * 0.001;

      const st = stateRef.current;
      const world = worldRef.current;
      const sprites = spritesRef.current;
      const pulse = audioPulseRef.current;

      const targetP = hexToRgb(st.palette.primary);
      const targetS = hexToRgb(st.palette.secondary);
      const targetA = hexToRgb(st.palette.accent);
      const colLerp = 1 - Math.exp(-3.4 * dt);
      for (let c = 0; c < 3; c++) {
        curP[c] += (targetP[c] - curP[c]) * colLerp;
        curS[c] += (targetS[c] - curS[c]) * colLerp;
        curA[c] += (targetA[c] - curA[c]) * colLerp;
      }

      ctx.clearRect(0, 0, w, h);

      let activeGlobal = -1;
      if (st.activeLineIdx >= 0 && world.length > 0) {
        const targetW = Math.max(0, st.activeWordIdx);
        for (let i = 0; i < world.length; i++) {
          if (world[i].lineIdx === st.activeLineIdx && world[i].wordIdx === targetW) {
            activeGlobal = i;
            break;
          }
        }
        if (activeGlobal === -1) {
          activeGlobal = world.findIndex((n) => n.lineIdx === st.activeLineIdx);
        }
      }

      if (activeGlobal >= 0 && world[activeGlobal]) {
        const target = world[activeGlobal];
        const nextNode = world[activeGlobal + 1];
        const lookX = nextNode && nextNode.lineIdx === target.lineIdx ? target.wx * 0.74 + nextNode.wx * 0.26 : target.wx;
        const lookY = nextNode && nextNode.lineIdx === target.lineIdx ? target.wy * 0.74 + nextNode.wy * 0.26 : target.wy;

        if (!camInitialized || Math.hypot(lookX - camX, lookY - camY) > 1600) {
          camX = lookX;
          camY = lookY;
          camVx = 0;
          camVy = 0;
          camInitialized = true;
        } else {
          // Snappy critically-damped spring: settles cleanly right on beat (~160ms) without dragging behind vocals
          const stiffness = 28;
          const damping = 10.6;
          const ax = (lookX - camX) * stiffness - camVx * damping;
          const ay = (lookY - camY) * stiffness - camVy * damping;
          camVx += ax * dt;
          camVy += ay * dt;
          camX += camVx * dt;
          camY += camVy * dt;
        }
      } else {
        camInitialized = false;
      }

      if (activeGlobal !== lastActiveGlobal && activeGlobal >= 0) {
        lastActiveGlobal = activeGlobal;
        webRipple = 1;
        webCenterScale = 0.86;

        const node = world[activeGlobal];
        if (node) {
          const sx = w * 0.5 + (node.wx - camX);
          const sy = h * 0.48 + (node.wy - camY);
          const count = 12;
          for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.45;
            const spd = 28 + Math.random() * 75;
            sparks.push({
              x: st.mode === 'web' ? w * 0.5 : sx,
              y: st.mode === 'web' ? h * 0.48 : sy,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 0,
              maxLife: 0.55 + Math.random() * 0.45,
              size: 1.2 + Math.random() * 1.9,
              warm: i % 2 === 0,
            });
          }
          if (sparks.length > 84) sparks.splice(0, sparks.length - 84);
        }
      }

      webRipple *= Math.exp(-3.2 * dt);
      webCenterScale += (1 - webCenterScale) * (1 - Math.exp(-9.5 * dt));

      // LAYER 1: Parallax Starfield / Rain / Embers
      if (st.particleMode !== 'none') {
        for (let i = 0; i < bgStars.length; i++) {
          const s = bgStars[i];
          if (st.particleMode === 'rain') {
            const rx = ((s.x - camX * 0.14 - t * 34) % w + w) % w;
            const ry = ((s.y + t * (240 + s.z * 165)) % h + h) % h;
            ctx.strokeStyle = rgba(s.tint ? curP : curA, 0.12 + s.z * 0.12);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx - 1.8, ry + 13 * s.z);
            ctx.stroke();
          } else {
            const driftY = st.particleMode === 'embers' ? -t * (24 + s.z * 28) : Math.sin(t * 0.32 + s.phase) * 5;
            const px = ((s.x - camX * s.z * 0.25 + w * 6) % w + w) % w;
            const py = ((s.y - camY * s.z * 0.25 + driftY + h * 6) % h + h) % h;
            const twinkle = 0.24 + 0.76 * (0.5 + 0.5 * Math.sin(t * (1.3 + s.z * 2.0) + s.phase));
            const alpha = twinkle * (0.16 + s.z * 0.48 + pulse.beat * 0.14);
            ctx.fillStyle = rgba(s.tint ? curP : curA, alpha);
            ctx.beginPath();
            ctx.arc(px, py, s.r * (0.92 + pulse.bass * 0.28), 0, Math.PI * 2);
            ctx.fill();

            if (s.z > 0.88 && twinkle > 0.78 && i % 3 === 0) {
              drawFourPointStar(ctx, px, py, 4.8 + pulse.beat * 2, rgba(s.tint ? curP : curA, alpha * 0.78));
            }
          }
        }
      }

      // LAYER 2: Constellation / Branches / Web
      if (activeGlobal >= 0 && world.length > 0 && sprites) {
        const cxScreen = w * 0.5;
        const cyScreen = h * 0.48;

        // Subtle atmospheric nebula behind the active focal star (adds 3D depth with zero lag)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const nebR = Math.min(w, h) * 0.34 + pulse.bass * 48;
        ctx.globalAlpha = 0.08 + pulse.bass * 0.05;
        ctx.drawImage(sprites.primary, cxScreen - nebR, cyScreen - nebR, nebR * 2, nebR * 2);
        ctx.restore();

        if (st.mode === 'constellation' || st.mode === 'branches') {
          const windowStart = Math.max(0, activeGlobal - 15);
          const windowEnd = Math.min(world.length - 1, activeGlobal + 9);

          const glowUp = 1 - Math.exp(-9.0 * dt);
          const glowDown = 1 - Math.exp(-4.2 * dt);
          const alphaEase = 1 - Math.exp(-5.0 * dt);

          for (let i = windowStart; i <= windowEnd; i++) {
            const n = world[i];
            const isAct = i === activeGlobal;
            const isPast = i < activeGlobal;
            const isSameLine = n.lineIdx === st.activeLineIdx;
            const dist = Math.abs(i - activeGlobal);
            const prox = Math.max(0, 1 - dist / 13);

            const targetGlow = isAct ? 1 : isPast ? prox * 0.28 : 0;
            n.glow += (targetGlow - n.glow) * (isAct ? glowUp : glowDown);

            const targetScale = isAct ? 1 : 0;
            const scaleAcc = (targetScale - n.scale) * 140 - n.scaleVel * 19;
            n.scaleVel += scaleAcc * dt;
            n.scale = Math.max(0, n.scale + n.scaleVel * dt);

            const targetEdge = i <= activeGlobal ? 1 : 0;
            if (targetEdge > n.edgeProg) n.edgeProg = Math.min(1, n.edgeProg + dt * 5.8);
            else if (i > activeGlobal + 1) n.edgeProg *= Math.exp(-5 * dt);

            const targetVis = isAct ? 1 : isSameLine ? (isPast ? 0.74 : 0.3) : prox * (isPast ? 0.4 : 0.14);
            n.visAlpha += (targetVis - n.visAlpha) * alphaEase;
          }

          for (let i = windowStart; i < windowEnd; i++) {
            const a = world[i];
            const b = world[i + 1];
            const ax = cxScreen + (a.wx - camX);
            const ay = cyScreen + (a.wy - camY);
            const bx = cxScreen + (b.wx - camX);
            const by = cyScreen + (b.wy - camY);

            const isSameLine = a.lineIdx === b.lineIdx;
            const dist = Math.abs(i - activeGlobal);
            const fade = Math.max(0.04, 1 - dist / 13);

            const drawFrac = easeOutCubic(b.edgeProg);
            const ex = ax + (bx - ax) * drawFrac;
            const ey = ay + (by - ay) * drawFrac;
            const segGlow = Math.max(a.glow * 0.5, b.glow);

            ctx.save();
            if (!isSameLine) ctx.setLineDash([3, 7]);

            if (st.mode === 'branches') {
              const midX = (ax + bx) * 0.5;
              const midY = (ay + by) * 0.5;
              const bend = (seeded(a.seed + 7) - 0.5) * 62;
              const ctrlX = midX - (by - ay) * 0.22 + bend * 0.3;
              const ctrlY = midY + (bx - ax) * 0.22 + bend * 0.3;

              ctx.strokeStyle = rgba(curA, fade * 0.11);
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.quadraticCurveTo(ctrlX, ctrlY, bx, by);
              ctx.stroke();

              if (drawFrac > 0.01) {
                const qx = (1 - drawFrac) * (1 - drawFrac) * ax + 2 * (1 - drawFrac) * drawFrac * ctrlX + drawFrac * drawFrac * bx;
                const qy = (1 - drawFrac) * (1 - drawFrac) * ay + 2 * (1 - drawFrac) * drawFrac * ctrlY + drawFrac * drawFrac * by;
                const c1x = ax + (ctrlX - ax) * drawFrac;
                const c1y = ay + (ctrlY - ay) * drawFrac;

                ctx.strokeStyle = rgba(curP, Math.min(0.95, fade * 0.38 + segGlow * 0.62));
                ctx.lineWidth = 1.2 + segGlow * (1.5 + pulse.beat * 0.9);
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.quadraticCurveTo(c1x, c1y, qx, qy);
                ctx.stroke();

                if (drawFrac < 0.98) {
                  ctx.globalCompositeOperation = 'lighter';
                  const cr = 24 + pulse.beat * 10;
                  ctx.drawImage(sprites.primary, qx - cr, qy - cr, cr * 2, cr * 2);
                }
              }
            } else {
              ctx.strokeStyle = rgba(curA, fade * 0.12);
              ctx.lineWidth = 0.75;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();

              if (drawFrac > 0.01) {
                const grad = ctx.createLinearGradient(ax, ay, ex, ey);
                grad.addColorStop(0, rgba(curA, Math.min(0.85, fade * 0.38 + segGlow * 0.42)));
                grad.addColorStop(1, rgba(curP, Math.min(0.95, fade * 0.42 + segGlow * 0.58)));
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.05 + segGlow * (1.2 + pulse.beat * 0.8);
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                if (drawFrac < 0.98) {
                  ctx.globalCompositeOperation = 'lighter';
                  const cr = 26 + pulse.beat * 10;
                  ctx.drawImage(sprites.primary, ex - cr, ey - cr, cr * 2, cr * 2);
                }
              }

              if (i < activeGlobal && i + 2 <= windowEnd && world[i + 2].lineIdx === a.lineIdx && i % 2 === 0) {
                const cNode = world[i + 2];
                ctx.strokeStyle = rgba(curA, fade * 0.08);
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(cxScreen + (cNode.wx - camX), cyScreen + (cNode.wy - camY));
                ctx.stroke();
              }
            }
            ctx.restore();
          }

          const basePx = Math.min(22, Math.max(16, w * 0.0165));
          const activeBoost = 0.88;

          for (let i = windowStart; i <= windowEnd; i++) {
            const node = world[i];
            const sx = cxScreen + (node.wx - camX);
            const sy = cyScreen + (node.wy - camY);
            if (sx < -160 || sx > w + 160 || sy < -120 || sy > h + 120) continue;

            const g = node.glow;
            const sc = node.scale;

            if (g > 0.03) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const bloomR = 24 + g * (58 + pulse.bass * 36 + pulse.beat * 26);
              ctx.globalAlpha = Math.min(0.95, g * 0.92);
              ctx.drawImage(sprites.primary, sx - bloomR, sy - bloomR, bloomR * 2, bloomR * 2);
              if (g > 0.35) {
                const coreR = 14 + g * (16 + pulse.beat * 10);
                ctx.globalAlpha = g * 0.9;
                ctx.drawImage(sprites.accent, sx - coreR, sy - coreR, coreR * 2, coreR * 2);
              }
              ctx.restore();
            }

            const starSize = 2.2 + g * (10.5 + pulse.beat * 3.5);
            if (g > 0.25 || i % 2 === 0) {
              drawFourPointStar(
                ctx,
                sx,
                sy,
                starSize,
                rgba(curA, Math.min(1, 0.28 + node.visAlpha * 0.72)),
                g > 0.25 ? t * 0.45 : 0
              );
            } else {
              ctx.fillStyle = rgba(curA, 0.22 + node.visAlpha * 0.6);
              ctx.beginPath();
              ctx.arc(sx, sy, 2 + g * 2.5, 0, Math.PI * 2);
              ctx.fill();
            }

            const yOff = node.labelAbove ? -26 - sc * 6 : 29 + sc * 6;
            const smoothScale = 1 + sc * (activeBoost + pulse.beat * 0.05);

            ctx.save();
            ctx.translate(sx, sy + yOff);
            ctx.scale(smoothScale, smoothScale);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${g > 0.45 ? 700 : 500} ${basePx.toFixed(1)}px "Space Grotesk", sans-serif`;

            if (g > 0.15) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const tw = ctx.measureText(node.text).width;
              ctx.globalAlpha = g * 0.52;
              ctx.drawImage(sprites.primary, -tw * 0.75, -basePx * 1.15, tw * 1.5, basePx * 2.3);
              ctx.restore();
            }

            const rCol = 255 + (curA[0] - 255) * g;
            const gCol = 255 + (curA[1] - 255) * g;
            const bCol = 255 + (curA[2] - 255) * g;
            ctx.fillStyle = `rgba(${Math.round(rCol)},${Math.round(gCol)},${Math.round(bCol)},${Math.max(0.06, node.visAlpha).toFixed(3)})`;
            ctx.fillText(node.text, 0, 0);
            ctx.restore();
          }
        } else {
          // MODE 3: SILKY LUMINOUS WEB
          const line = st.lyrics[st.activeLineIdx];
          if (line && line.words.length > 0) {
            const words = line.words;
            const rings = 5;
            const spokes = Math.max(8, words.length);
            const maxR = Math.min(w, h) * 0.42;

            ctx.save();
            for (let s = 0; s < spokes; s++) {
              const ang = (s / spokes) * Math.PI * 2 - Math.PI * 0.5 + Math.sin(t * 0.22) * 0.04;
              const isActSpoke = s === st.activeWordIdx % spokes;
              ctx.strokeStyle = isActSpoke ? rgba(curP, 0.74) : rgba(curA, 0.09 + pulse.bass * 0.07);
              ctx.lineWidth = isActSpoke ? 1.5 : 0.75;
              ctx.beginPath();
              ctx.moveTo(cxScreen, cyScreen);
              ctx.lineTo(cxScreen + Math.cos(ang) * maxR, cyScreen + Math.sin(ang) * maxR);
              ctx.stroke();
            }

            for (let rIdx = 1; rIdx <= rings; rIdx++) {
              const baseR = (rIdx / rings) * maxR;
              const ripplePush = Math.sin((1 - webRipple) * Math.PI - rIdx * 0.7) * webRipple * 9;
              const rr = baseR + ripplePush + pulse.bass * 10;
              ctx.strokeStyle = rIdx === 3 ? rgba(curP, 0.28 + pulse.beat * 0.25) : rgba(curA, 0.11);
              ctx.lineWidth = rIdx === 3 ? 1.2 : 0.75;
              ctx.beginPath();
              for (let s = 0; s <= spokes; s++) {
                const ang = ((s % spokes) / spokes) * Math.PI * 2 - Math.PI * 0.5 + Math.sin(t * 0.22) * 0.04;
                const px = cxScreen + Math.cos(ang) * rr;
                const py = cyScreen + Math.sin(ang) * rr;
                if (s === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.stroke();
            }

            const wordRingR = maxR * 0.66;
            words.forEach((wd, i) => {
              const ang = (i / words.length) * Math.PI * 2 - Math.PI * 0.5 + Math.sin(t * 0.22) * 0.04;
              const wx = cxScreen + Math.cos(ang) * wordRingR;
              const wy = cyScreen + Math.sin(ang) * wordRingR;
              const isAct = i === st.activeWordIdx;
              const isPastW = i < st.activeWordIdx;

              if (isAct) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const gr = 64 + pulse.beat * 32;
                ctx.drawImage(sprites.primary, wx - gr, wy - gr, gr * 2, gr * 2);
                ctx.restore();
                drawFourPointStar(ctx, wx, wy, 9.5, rgba(curA, 1), t * 0.6);
              } else {
                ctx.fillStyle = isPastW ? rgba(curP, 0.72) : 'rgba(255,255,255,0.28)';
                ctx.beginPath();
                ctx.arc(wx, wy, isPastW ? 3.2 : 2, 0, Math.PI * 2);
                ctx.fill();
              }

              const labelR = wordRingR + (isAct ? 32 : 25);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `${isAct ? 700 : 500} ${isAct ? 28 : 17}px "Space Grotesk", sans-serif`;
              ctx.fillStyle = isAct ? rgba(curA, 1) : isPastW ? rgba(curA, 0.72) : 'rgba(255,255,255,0.26)';
              ctx.fillText(wd.text, cxScreen + Math.cos(ang) * labelR, cyScreen + Math.sin(ang) * labelR);
            });

            const curWord = words[Math.max(0, st.activeWordIdx)]?.text || '';
            if (curWord) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const cr = 92 + pulse.bass * 40;
              ctx.globalAlpha = 0.62;
              ctx.drawImage(sprites.primary, cxScreen - cr, cyScreen - cr, cr * 2, cr * 2);
              ctx.restore();

              ctx.save();
              ctx.translate(cxScreen, cyScreen);
              ctx.scale(webCenterScale, webCenterScale);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `800 ${Math.min(52, Math.max(32, w * 0.04))}px "Syne", sans-serif`;
              ctx.fillStyle = rgba(curA, 1);
              ctx.fillText(curWord, 0, 0);
              ctx.restore();
            }
            ctx.restore();
          }
        }
      }

      // LAYER 3: Radiant Ignition Sparks
      if (sparks.length > 0 && sprites) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const drag = Math.exp(-2.8 * dt);
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
          const a = Math.pow(1 - sp.life / sp.maxLife, 1.4) * 0.85;
          ctx.globalAlpha = a;
          const sr = sp.size * 5;
          ctx.drawImage(sp.warm ? sprites.primary : sprites.accent, sp.x - sr, sp.y - sr, sr * 2, sr * 2);
        }
        ctx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [audioPulseRef]);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-[5]" />;
};
