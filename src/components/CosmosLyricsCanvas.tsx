import React, { useEffect, useRef } from 'react';
import { LyricLine, LyricStyleId, VibePalette } from '../types';

export interface AudioPulseState {
  bass: number;
  beat: number;
  mid: number;
  spectrum: Float32Array;
}

export type CanvasLyricMode = Extract<
  LyricStyleId,
  'constellation' | 'branches' | 'web' | 'tunnel' | 'mirror' | 'glitch'
>;

interface CosmosLyricsCanvasProps {
  mode: CanvasLyricMode;
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

interface WarpStar {
  x: number;
  y: number;
  z: number;
  pz: number;
  speed: number;
  tint: boolean;
}

interface MatrixCol {
  xNorm: number;
  y: number;
  speed: number;
  seed: number;
}

interface Shockwave {
  x: number;
  y: number;
  maxR: number;
  life: number;
  maxLife: number;
  lineWidth: number;
  warm: boolean;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
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

const MATRIX_GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0197FX#<>';

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

    // Reusable offscreen buffer for Prism Mirror liquid floor reflection (0 per-frame allocation)
    const reflCanvas = document.createElement('canvas');
    const reflCtx = reflCanvas.getContext('2d');

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

      reflCanvas.width = Math.max(1, Math.floor(w));
      reflCanvas.height = 140;
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

    const warpStars: WarpStar[] = Array.from({ length: 155 }, (_, i) => {
      const ang = seeded(i * 19 + 5) * Math.PI * 2;
      const rad = 0.08 + seeded(i * 29 + 11) * 1.15;
      const z = 0.12 + seeded(i * 43 + 17) * 1.55;
      return {
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        z,
        pz: z,
        speed: 0.6 + seeded(i * 61 + 3) * 1.1,
        tint: i % 3 === 0,
      };
    });

    const matrixCols: MatrixCol[] = Array.from({ length: 30 }, (_, i) => ({
      xNorm: (i + 0.5) / 30,
      y: seeded(i * 37 + 9) * 1.2,
      speed: 0.14 + seeded(i * 53 + 13) * 0.24,
      seed: i * 17 + 3,
    }));

    const sparks: Spark[] = [];
    const shockwaves: Shockwave[] = [];
    const comets: Comet[] = [];

    let camX = 0;
    let camY = 0;
    let camVx = 0;
    let camVy = 0;
    let camInitialized = false;
    let smoothGlobal = 0;
    let smoothGlobalInit = false;

    const curP: [number, number, number] = hexToRgb(stateRef.current.palette.primary);
    const curS: [number, number, number] = hexToRgb(stateRef.current.palette.secondary);
    const curA: [number, number, number] = hexToRgb(stateRef.current.palette.accent);

    let lastActiveGlobal = -1;
    let webRipple = 0;
    let webCenterScale = 1;
    let glitchSpike = 0;
    let lastCometMs = 0;
    let lastBeatRingMs = 0;
    let prevNow = performance.now();
    let rafId = 0;

    const spawnShockwave = (x: number, y: number, maxR: number, warm: boolean, lw = 2) => {
      shockwaves.push({
        x,
        y,
        maxR,
        life: 0,
        maxLife: 0.72,
        lineWidth: lw,
        warm,
      });
      if (shockwaves.length > 14) shockwaves.splice(0, shockwaves.length - 14);
    };

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
          const stiffness = 28;
          const damping = 10.6;
          const ax = (lookX - camX) * stiffness - camVx * damping;
          const ay = (lookY - camY) * stiffness - camVy * damping;
          camVx += ax * dt;
          camVy += ay * dt;
          camX += camVx * dt;
          camY += camVy * dt;
        }

        if (!smoothGlobalInit || Math.abs(activeGlobal - smoothGlobal) > 4.5) {
          smoothGlobal = activeGlobal;
          smoothGlobalInit = true;
        } else {
          smoothGlobal += (activeGlobal - smoothGlobal) * (1 - Math.exp(-9.5 * dt));
        }
      } else {
        camInitialized = false;
        smoothGlobalInit = false;
      }

      const cxScreen = w * 0.5;
      const cyScreen = h * 0.48;

      if (activeGlobal !== lastActiveGlobal && activeGlobal >= 0) {
        lastActiveGlobal = activeGlobal;
        webRipple = 1;
        webCenterScale = 0.84;
        glitchSpike = 1;

        const node = world[activeGlobal];
        if (node) {
          const sx = st.mode === 'constellation' || st.mode === 'branches' ? cxScreen + (node.wx - camX) : cxScreen;
          const sy = st.mode === 'constellation' || st.mode === 'branches' ? cyScreen + (node.wy - camY) : cyScreen;
          const count = st.mode === 'tunnel' || st.mode === 'glitch' ? 16 : 12;
          for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.45;
            const spd = (st.mode === 'tunnel' ? 60 : 32) + Math.random() * 88;
            sparks.push({
              x: sx,
              y: sy,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 0,
              maxLife: 0.55 + Math.random() * 0.45,
              size: 1.3 + Math.random() * 2.1,
              warm: i % 2 === 0,
            });
          }
          if (sparks.length > 96) sparks.splice(0, sparks.length - 96);

          spawnShockwave(sx, sy, Math.min(w, h) * (st.mode === 'tunnel' ? 0.34 : 0.2), true, 2.2);
        }
      }

      // Secondary heavy bass beat shockwave on high hits
      if (pulse.beat > 0.72 && now - lastBeatRingMs > 300) {
        lastBeatRingMs = now;
        spawnShockwave(cxScreen, cyScreen, Math.min(w, h) * 0.36, false, 1.4);
      }

      // Occasional subtle shooting meteor comet in cosmos modes
      if (
        st.particleMode !== 'none' &&
        (st.mode === 'constellation' || st.mode === 'branches' || st.mode === 'mirror') &&
        now - lastCometMs > 3200
      ) {
        lastCometMs = now;
        const startLeft = seeded(now) > 0.4;
        comets.push({
          x: startLeft ? -80 : w * (0.3 + seeded(now * 0.3) * 0.5),
          y: -40,
          vx: (startLeft ? 1 : -1) * (420 + seeded(now * 0.7) * 280),
          vy: 260 + seeded(now * 1.1) * 180,
          life: 0,
          maxLife: 1.05,
        });
      }

      webRipple *= Math.exp(-3.2 * dt);
      webCenterScale += (1 - webCenterScale) * (1 - Math.exp(-9.5 * dt));
      glitchSpike *= Math.exp(-7.5 * dt);

      // LAYER 1: Ambient Starfield / Warp Tunnel / Matrix Rain
      if (st.mode === 'tunnel') {
        const speedMult = 0.65 + pulse.bass * 2.25 + pulse.beat * 0.9;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < warpStars.length; i++) {
          const ws = warpStars[i];
          ws.pz = ws.z;
          ws.z -= dt * ws.speed * speedMult;
          if (ws.z <= 0.06) {
            ws.z = 1.65;
            ws.pz = ws.z;
          }
          const sx = cxScreen + (ws.x / ws.z) * w * 0.56;
          const sy = cyScreen + (ws.y / ws.z) * h * 0.56;
          const px = cxScreen + (ws.x / ws.pz) * w * 0.56;
          const py = cyScreen + (ws.y / ws.pz) * h * 0.56;
          const depthAlpha = Math.max(0, Math.min(0.9, (1.65 - ws.z) * 0.55));
          ctx.strokeStyle = rgba(ws.tint ? curP : curA, depthAlpha * 0.75);
          ctx.lineWidth = Math.max(0.7, (1.7 - ws.z) * 1.85);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        ctx.restore();
      } else if (st.mode === 'glitch') {
        ctx.save();
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const bassBoost = 1 + pulse.bass * 2.4;
        for (let i = 0; i < matrixCols.length; i++) {
          const col = matrixCols[i];
          col.y += dt * col.speed * bassBoost;
          if (col.y > 1.25) col.y = -0.2;
          const x = col.xNorm * w;
          const headY = col.y * h;
          for (let k = 0; k < 7; k++) {
            const gy = headY - k * 18;
            if (gy < -20 || gy > h + 20) continue;
            const chIdx = Math.floor((col.seed + Math.floor(t * 9) + k * 7) % MATRIX_GLYPHS.length);
            const ch = MATRIX_GLYPHS[Math.abs(chIdx)];
            const fade = (1 - k / 7) * (k === 0 ? 0.42 : 0.16);
            ctx.fillStyle = k === 0 ? rgba(curA, fade) : rgba(i % 2 === 0 ? curP : curS, fade);
            ctx.fillText(ch, x, gy);
          }
        }
        ctx.restore();
      } else if (st.particleMode !== 'none') {
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

      // Shooting Comets
      if (comets.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = comets.length - 1; i >= 0; i--) {
          const cm = comets[i];
          cm.life += dt;
          if (cm.life >= cm.maxLife) {
            comets.splice(i, 1);
            continue;
          }
          cm.x += cm.vx * dt;
          cm.y += cm.vy * dt;
          const fade = Math.sin((cm.life / cm.maxLife) * Math.PI);
          const tailX = cm.x - cm.vx * 0.18;
          const tailY = cm.y - cm.vy * 0.18;
          const g = ctx.createLinearGradient(tailX, tailY, cm.x, cm.y);
          g.addColorStop(0, rgba(curP, 0));
          g.addColorStop(1, rgba(curA, fade * 0.72));
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(cm.x, cm.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // LAYER 2: 6 Flagship Canvas Worlds
      if (activeGlobal >= 0 && world.length > 0 && sprites) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const nebR = Math.min(w, h) * 0.34 + pulse.bass * 52;
        ctx.globalAlpha = 0.08 + pulse.bass * 0.06;
        ctx.drawImage(sprites.primary, cxScreen - nebR, cyScreen - nebR, nebR * 2, nebR * 2);
        ctx.restore();

        if (st.mode === 'constellation' || st.mode === 'branches') {
          const breath = 1 + pulse.bass * 0.032;
          ctx.save();
          ctx.translate(cxScreen, cyScreen);
          ctx.scale(breath, breath);
          ctx.translate(-cxScreen, -cyScreen);

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
                ctx.lineWidth = 1.2 + segGlow * (1.6 + pulse.beat * 0.9);
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.quadraticCurveTo(c1x, c1y, qx, qy);
                ctx.stroke();

                // Flowing synapse energy impulse along branch
                if (b.glow > 0.25) {
                  const orbT = (t * 1.9 + a.seed * 0.1) % 1;
                  const ox = (1 - orbT) * (1 - orbT) * ax + 2 * (1 - orbT) * orbT * ctrlX + orbT * orbT * bx;
                  const oy = (1 - orbT) * (1 - orbT) * ay + 2 * (1 - orbT) * orbT * ctrlY + orbT * orbT * by;
                  ctx.globalCompositeOperation = 'lighter';
                  const or = 12 + pulse.beat * 8;
                  ctx.drawImage(sprites.accent, ox - or, oy - or, or * 2, or * 2);
                }

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

                // Sprouting neural micro-tendrils around active Branches focal node
                if (st.mode === 'branches') {
                  for (let k = 0; k < 3; k++) {
                    const ang = k * 2.1 + node.seed;
                    const len = 26 + pulse.beat * 14;
                    ctx.strokeStyle = rgba(curP, g * 0.45);
                    ctx.lineWidth = 0.9;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(
                      sx + Math.cos(ang + 0.4) * len * 0.55,
                      sy + Math.sin(ang + 0.4) * len * 0.55,
                      sx + Math.cos(ang) * len,
                      sy + Math.sin(ang) * len
                    );
                    ctx.stroke();
                  }
                }
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
          ctx.restore();
        } else if (st.mode === 'web') {
          // MODE 3: SILKY LUMINOUS WEB + SACRED GEOMETRY RING
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
              ctx.strokeStyle = isActSpoke ? rgba(curP, 0.78) : rgba(curA, 0.09 + pulse.bass * 0.07);
              ctx.lineWidth = isActSpoke ? 1.6 : 0.75;
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

            // Counter-rotating sacred polygon resonance around core
            const polyR = maxR * 0.32 * (1 + pulse.beat * 0.14);
            ctx.strokeStyle = rgba(curS, 0.22 + pulse.beat * 0.3);
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let v = 0; v <= 6; v++) {
              const pa = (v / 6) * Math.PI * 2 - t * 0.35;
              const px = cxScreen + Math.cos(pa) * polyR;
              const py = cyScreen + Math.sin(pa) * polyR;
              if (v === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();

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
        } else if (st.mode === 'tunnel') {
          // MODE 4: HYPERWARP 3D — 3D Perspective Deep-Space Lyric Flight + Stereoscopic Echo
          const minDim = Math.min(w, h);

          // Concentric hyperdrive portal rings
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let r = 0; r < 5; r++) {
            const prog = (r / 5 + t * 0.35) % 1;
            const ringR = (0.08 + Math.pow(prog, 1.9) * 0.65) * minDim * (1 + pulse.bass * 0.14);
            const alpha = Math.sin(prog * Math.PI) * (0.14 + pulse.beat * 0.14);
            ctx.strokeStyle = rgba(r % 2 === 0 ? curP : curS, alpha);
            ctx.lineWidth = 1.2 + prog * 1.4;
            ctx.beginPath();
            ctx.arc(cxScreen, cyScreen, ringR, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();

          // Render back-to-front so active hero word sits crisp in foreground
          const wStart = Math.max(0, activeGlobal - 2);
          const wEnd = Math.min(world.length - 1, activeGlobal + 7);
          const focalBase = Math.min(54, Math.max(34, w * 0.045));

          for (let i = wEnd; i >= wStart; i--) {
            const node = world[i];
            const rel = i - smoothGlobal;
            const z = Math.max(0.24, 1 + rel * 0.68);
            const proj = 1 / z;

            // Spiral gently through deep space; pull factor zeroes at active center
            const spiralPull = Math.min(1, Math.abs(rel) * 1.05);
            const spiralAng = i * 1.18 + t * 0.24;
            const worldOffX = Math.cos(spiralAng) * 240 * spiralPull * Math.sign(rel || 1);
            const worldOffY = Math.sin(spiralAng) * 155 * spiralPull;

            const sx = cxScreen + worldOffX * proj;
            const sy = cyScreen + worldOffY * proj;

            const alpha =
              rel < -0.55
                ? Math.max(0, 1 - (-0.55 - rel) * 1.15)
                : Math.max(0.05, 1 - Math.max(0, rel) / 7.5);
            if (alpha <= 0.03) continue;

            const isHero = Math.abs(rel) < 0.45;
            const fontPx = focalBase * proj * (isHero ? 1 + pulse.beat * 0.07 : 0.72);
            if (fontPx < 8 || fontPx > 260) continue;

            ctx.save();
            ctx.translate(sx, sy);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${isHero ? 800 : 600} ${fontPx.toFixed(1)}px "Syne", sans-serif`;

            if (isHero) {
              const heroFocus = 1 - Math.abs(rel) / 0.45;
              // Radial bloom sprite + segmented HUD reticle
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const hr = 110 + pulse.bass * 45;
              ctx.globalAlpha = 0.55 * heroFocus;
              ctx.drawImage(sprites.primary, -hr, -hr, hr * 2, hr * 2);

              ctx.rotate(t * 0.4);
              ctx.setLineDash([14, 10]);
              ctx.strokeStyle = rgba(curP, 0.36 * heroFocus);
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.arc(0, 0, minDim * 0.21 + pulse.beat * 14, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();

              // 3D Stereoscopic chromatic split
              const split = 2.5 + pulse.beat * 5.5;
              ctx.fillStyle = rgba(curP, 0.52 * alpha * heroFocus);
              ctx.fillText(node.text, -split, 1.5);
              ctx.fillStyle = rgba(curS, 0.52 * alpha * heroFocus);
              ctx.fillText(node.text, split, -1.5);
            }

            ctx.fillStyle = isHero
              ? rgba(curA, Math.min(1, alpha))
              : rgba(i % 2 === 0 ? curA : curP, alpha * 0.78);
            ctx.fillText(node.text, 0, 0);
            ctx.restore();
          }
        } else if (st.mode === 'mirror') {
          // MODE 5: PRISM STAGE MIRROR — Concert Beams + Chrome Horizon + Liquid Floor Reflection
          const line = st.lyrics[st.activeLineIdx];
          if (line && line.words.length > 0) {
            const horizonY = h * 0.53;

            // Volumetric overhead stage light cones
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const beamSources = [0.16, 0.37, 0.63, 0.84];
            beamSources.forEach((bxNorm, bIdx) => {
              const bx = bxNorm * w;
              const sway = Math.sin(t * (0.65 + bIdx * 0.12) + bIdx * 1.4) * (w * 0.08);
              const tx = cxScreen + sway + (bxNorm - 0.5) * w * 0.18;
              const spread = 52 + pulse.beat * 36;
              const bg = ctx.createLinearGradient(bx, -20, tx, horizonY);
              const beamCol = bIdx % 2 === 0 ? curP : curS;
              bg.addColorStop(0, rgba(beamCol, 0.16 + pulse.beat * 0.12));
              bg.addColorStop(1, rgba(beamCol, 0));
              ctx.fillStyle = bg;
              ctx.beginPath();
              ctx.moveTo(bx - 12, -20);
              ctx.lineTo(bx + 12, -20);
              ctx.lineTo(tx + spread, horizonY);
              ctx.lineTo(tx - spread, horizonY);
              ctx.closePath();
              ctx.fill();
            });
            ctx.restore();

            // Laser Horizon Plane + Symmetric Equalizer Teeth
            ctx.save();
            const hGrad = ctx.createLinearGradient(w * 0.06, horizonY, w * 0.94, horizonY);
            hGrad.addColorStop(0, rgba(curP, 0));
            hGrad.addColorStop(0.25, rgba(curP, 0.55));
            hGrad.addColorStop(0.5, rgba(curA, 0.85));
            hGrad.addColorStop(0.75, rgba(curS, 0.55));
            hGrad.addColorStop(1, rgba(curS, 0));
            ctx.strokeStyle = hGrad;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(w * 0.06, horizonY);
            ctx.lineTo(w * 0.94, horizonY);
            ctx.stroke();

            const spec = pulse.spectrum;
            const teeth = 24;
            const step = (w * 0.36) / teeth;
            for (let k = 0; k < teeth; k++) {
              const amp = (spec[k] || 0) * (36 + pulse.bass * 18);
              ctx.fillStyle = rgba(k % 2 === 0 ? curP : curS, 0.28 + (spec[k] || 0) * 0.5);
              ctx.fillRect(cxScreen + k * step, horizonY - amp, 2.2, amp);
              ctx.fillRect(cxScreen - (k + 1) * step, horizonY - amp, 2.2, amp);
              ctx.globalAlpha = 0.25;
              ctx.fillRect(cxScreen + k * step, horizonY, 2.2, amp * 0.65);
              ctx.fillRect(cxScreen - (k + 1) * step, horizonY, 2.2, amp * 0.65);
              ctx.globalAlpha = 1;
            }
            ctx.restore();

            // Measure words & auto-fit nicely inside viewport
            const words = line.words;
            const rawFontPx = Math.min(48, Math.max(24, w * 0.036));
            ctx.font = `700 ${rawFontPx}px "Space Grotesk", sans-serif`;
            const gap = 16;
            const widths = words.map((wd) => ctx.measureText(wd.text).width);
            const totalW = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, words.length - 1);
            const fitScale = Math.min(1, (w * 0.86) / Math.max(1, totalW));
            const fontPx = rawFontPx * fitScale;
            const scaledGap = gap * fitScale;
            ctx.font = `700 ${fontPx.toFixed(1)}px "Space Grotesk", sans-serif`;
            const scaledWidths = words.map((wd) => ctx.measureText(wd.text).width);
            const finalTotalW =
              scaledWidths.reduce((a, b) => a + b, 0) + scaledGap * Math.max(0, words.length - 1);

            let cursorX = cxScreen - finalTotalW * 0.5;
            const baselineY = horizonY - 40;

            if (reflCtx) {
              reflCtx.clearRect(0, 0, reflCanvas.width, reflCanvas.height);
              reflCtx.font = `700 ${fontPx.toFixed(1)}px "Space Grotesk", sans-serif`;
              reflCtx.textAlign = 'left';
              reflCtx.textBaseline = 'bottom';
            }

            words.forEach((wd, idx) => {
              const ww = scaledWidths[idx];
              const isAct = idx === st.activeWordIdx;
              const isSung = idx < st.activeWordIdx;
              const wordY = baselineY - (isAct ? 9 + pulse.beat * 6 : 0);

              if (isAct) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const wr = 74 + pulse.beat * 28;
                ctx.drawImage(sprites.primary, cursorX + ww * 0.5 - wr, wordY - fontPx * 0.45 - wr, wr * 2, wr * 2);
                ctx.restore();
              }

              ctx.save();
              ctx.textAlign = 'left';
              ctx.textBaseline = 'bottom';
              ctx.font = `700 ${fontPx.toFixed(1)}px "Space Grotesk", sans-serif`;
              const col = isAct
                ? rgba(curA, 1)
                : isSung
                  ? rgba(curP, 0.88)
                  : 'rgba(255,255,255,0.28)';
              ctx.fillStyle = col;
              ctx.fillText(wd.text, cursorX, wordY);

              // Also mirror onto scratch buffer near bottom for wave slicing
              if (reflCtx) {
                reflCtx.fillStyle = col;
                reflCtx.fillText(wd.text, cursorX, reflCanvas.height - (isAct ? 12 : 4));
              }
              ctx.restore();

              cursorX += ww + scaledGap;
            });

            // Liquid rippled floor reflection below horizonY
            if (reflCtx) {
              const strips = 14;
              const srcH = Math.min(115, fontPx * 1.45);
              const srcTop = reflCanvas.height - srcH;
              const stripSrcH = srcH / strips;
              const destH = srcH * 0.72;
              const stripDestH = destH / strips;

              ctx.save();
              for (let s = 0; s < strips; s++) {
                const waveOffset = Math.sin(t * 5.2 + s * 0.75) * (1.2 + pulse.bass * 4.5) * (s / strips);
                const stripFade = Math.pow(1 - s / strips, 1.35) * 0.42;
                ctx.globalAlpha = stripFade;

                // Flip each strip smoothly down the obsidian glass floor
                ctx.save();
                ctx.translate(waveOffset, horizonY + 8 + s * stripDestH);
                ctx.scale(1, -1);
                ctx.drawImage(
                  reflCanvas,
                  0,
                  srcTop + srcH - (s + 1) * stripSrcH,
                  reflCanvas.width,
                  stripSrcH,
                  0,
                  -stripDestH,
                  w,
                  stripDestH
                );
                ctx.restore();
              }
              ctx.restore();
            }
          }
        } else if (st.mode === 'glitch') {
          // MODE 6: CYBER GLITCH — Holographic RGB Chromatic Split + Targeting Reticle
          const line = st.lyrics[st.activeLineIdx];
          const prevL = st.activeLineIdx > 0 ? st.lyrics[st.activeLineIdx - 1] : null;
          const nextL = st.activeLineIdx < st.lyrics.length - 1 ? st.lyrics[st.activeLineIdx + 1] : null;
          const heroWord = (line?.words[Math.max(0, st.activeWordIdx)]?.text || line?.text || '').toUpperCase();

          // Cyberpunk Tactical HUD Reticle framing center
          const boxW = Math.min(w * 0.86, 680);
          const boxH = Math.min(h * 0.34, 210);
          const lx = cxScreen - boxW * 0.5;
          const rx = cxScreen + boxW * 0.5;
          const ty = cyScreen - boxH * 0.5;
          const by = cyScreen + boxH * 0.5;
          const corner = 22;

          ctx.save();
          ctx.strokeStyle = rgba(curP, 0.38 + pulse.beat * 0.32);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          // Top-Left, Top-Right, Bottom-Left, Bottom-Right L-Brackets
          ctx.moveTo(lx, ty + corner); ctx.lineTo(lx, ty); ctx.lineTo(lx + corner, ty);
          ctx.moveTo(rx - corner, ty); ctx.lineTo(rx, ty); ctx.lineTo(rx, ty + corner);
          ctx.moveTo(lx, by - corner); ctx.lineTo(lx, by); ctx.lineTo(lx + corner, by);
          ctx.moveTo(rx - corner, by); ctx.lineTo(rx, by); ctx.lineTo(rx, by - corner);
          ctx.stroke();

          // Context lines
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '500 13px "JetBrains Mono", monospace';
          if (prevL) {
            ctx.fillStyle = rgba(curA, 0.25);
            ctx.fillText(`0x01 // ${prevL.text}`, cxScreen, ty - 24);
          }
          if (nextL) {
            ctx.fillStyle = rgba(curS, 0.28);
            ctx.fillText(`NEXT >> ${nextL.text}`, cxScreen, by + 28);
          }

          if (heroWord) {
            const heroPx = Math.min(84, Math.max(40, w * 0.068));
            const activeGlitch = Math.max(glitchSpike, pulse.beat * 0.65);
            const splitX = 2.5 + activeGlitch * 10;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const gr = 120 + pulse.bass * 45;
            ctx.globalAlpha = 0.45;
            ctx.drawImage(sprites.primary, cxScreen - gr, cyScreen - gr, gr * 2, gr * 2);
            ctx.restore();

            ctx.font = `800 ${heroPx.toFixed(1)}px "Syne", sans-serif`;

            // Chromatic RGB split silhouettes
            ctx.fillStyle = rgba(curP, 0.62);
            ctx.fillText(heroWord, cxScreen - splitX, cyScreen + 1.5);
            ctx.fillStyle = rgba(curS, 0.62);
            ctx.fillText(heroWord, cxScreen + splitX, cyScreen - 1.5);

            // Core crisp text + cyber slice tear during high beat/transition
            ctx.fillStyle = rgba(curA, 0.98);
            ctx.fillText(heroWord, cxScreen, cyScreen);

            if (activeGlitch > 0.28) {
              const sliceH = heroPx * 0.28;
              const sliceY = cyScreen - sliceH * 0.5 + (seeded(Math.floor(t * 24)) - 0.5) * heroPx * 0.5;
              const tearShift = (seeded(Math.floor(t * 31) + 7) - 0.5) * 28 * activeGlitch;
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, sliceY, w, sliceH);
              ctx.clip();
              ctx.fillStyle = rgba(curS, 0.9);
              ctx.fillText(heroWord, cxScreen + tearShift, cyScreen);
              ctx.restore();
            }
          }

          // Active line timeline under reticle
          if (line && line.words.length > 0) {
            ctx.font = '600 16px "Space Grotesk", sans-serif';
            const gap = 12;
            const totalW =
              line.words.reduce((acc, wd) => acc + ctx.measureText(wd.text).width, 0) +
              gap * Math.max(0, line.words.length - 1);
            let wx = cxScreen - totalW * 0.5;
            const wy = by - 28;
            line.words.forEach((wd, idx) => {
              const wWidth = ctx.measureText(wd.text).width;
              const isAct = idx === st.activeWordIdx;
              const isPastW = idx < st.activeWordIdx;
              ctx.fillStyle = isAct ? rgba(curP, 1) : isPastW ? rgba(curA, 0.85) : 'rgba(255,255,255,0.28)';
              ctx.fillText(wd.text, wx + wWidth * 0.5, wy);
              wx += wWidth + gap;
            });
          }
          ctx.restore();
        }
      }

      // LAYER 3: Expanding Shockwaves & Ignition Sparks
      if (shockwaves.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = shockwaves.length - 1; i >= 0; i--) {
          const sw = shockwaves[i];
          sw.life += dt;
          if (sw.life >= sw.maxLife) {
            shockwaves.splice(i, 1);
            continue;
          }
          const p = sw.life / sw.maxLife;
          const r = 12 + easeOutCubic(p) * sw.maxR;
          const alpha = Math.pow(1 - p, 1.8) * 0.45;
          ctx.strokeStyle = rgba(sw.warm ? curP : curS, alpha);
          ctx.lineWidth = Math.max(0.6, sw.lineWidth * (1 - p));
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

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

  return (
    <canvas
      ref={canvasRef}
      data-aura-stage-canvas="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-[5]"
    />
  );
};
