import React, { useEffect, useRef } from 'react';
import type { AudioPulseState, EdgeStyleId, VibePalette } from '../types';

interface LumnEdgeCanvasProps {
  edgeStyle: EdgeStyleId;
  palette: VibePalette;
  audioPulseRef: React.MutableRefObject<AudioPulseState>;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (isNaN(n)) return [0.66, 0.33, 0.97];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function edgeModeToInt(mode: EdgeStyleId): number {
  switch (mode) {
    case 'laser_orbit':
      return 1;
    case 'violet_prism':
      return 2;
    case 'breathing_aura':
      return 3;
    default:
      return 0; // lumn_vivid
  }
}

const VERT_SRC = `#version 300 es
precision highp float;
void main() {
  vec2 pos = vec2(
    float((gl_VertexID & 1) << 2) - 1.0,
    float((gl_VertexID & 2) << 1) - 1.0
  );
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;
uniform float uSubBass;
uniform float uBass;
uniform float uBeat;
uniform float uVocal;
uniform float uTreble;
uniform float uEnergy;
uniform int uMode;
uniform float uSpec[16];

out vec4 outColor;

float sampleSpec(float u) {
  float idx = clamp(u, 0.0, 1.0) * 15.0;
  int i0 = int(floor(idx));
  int i1 = min(15, i0 + 1);
  float f = fract(idx);
  return mix(uSpec[i0], uSpec[i1], f);
}

float waveProfile(float u, float t, float seed, float specVal, float bass, float vocal, float beat) {
  float w1 = 0.5 + 0.5 * sin(u * 6.2831853 * 1.25 + t * 0.95 + seed);
  float w2 = 0.5 + 0.5 * sin(u * 6.2831853 * 2.45 - t * 1.45 + seed * 1.73);
  float w3 = 0.5 + 0.5 * cos(u * 6.2831853 * 4.10 + t * 2.15 - seed * 0.87);
  float shape = pow(w1 * 0.50 + w2 * 0.34 + w3 * 0.16, 1.35);
  return 0.20 + shape * (0.42 + bass * 0.78 + beat * 0.62 + specVal * 0.58) + vocal * 0.22 * w2;
}

float orbitPulse(float perimU, float head, float tailLen) {
  float d = fract(head - perimU);
  float trail = exp(-d / tailLen) * step(d, tailLen * 4.2);
  float nose = exp(-pow(min(d, 1.0 - d) / 0.012, 2.0));
  return clamp(trail * 0.85 + nose * 1.15, 0.0, 1.4);
}

void main() {
  float invDpr = 1.0 / max(0.5, uDpr);
  vec2 p = gl_FragCoord.xy * invDpr;
  vec2 cssRes = uRes * invDpr;
  float w = cssRes.x;
  float h = cssRes.y;

  float dLeft = p.x;
  float dRight = w - p.x;
  float dBottom = p.y;
  float dTop = h - p.y;

  float minD = min(min(dLeft, dRight), min(dTop, dBottom));

  // Early-out for the pitch-black OLED interior (>84% of screen pixels!)
  float maxReach = uMode == 3 ? 48.0 : 82.0;
  if (minD > maxReach) {
    outColor = vec4(0.0);
    return;
  }

  float ux = p.x / max(1.0, w);
  float uy = p.y / max(1.0, h);
  float t = uTime;

  float calm = uMode == 3 ? 0.56 : 1.0;

  // Symmetric frequency mapping so edges breathe like real Lumn acoustic waves
  float specTop = sampleSpec(abs(ux - 0.5) * 1.9);
  float specBot = sampleSpec(abs(ux - 0.5) * 1.65);
  float specLeft = sampleSpec(abs(uy - 0.5) * 1.85);
  float specRight = sampleSpec(abs(uy - 0.5) * 1.85);

  float wTop = waveProfile(ux, t, 0.4, specTop, uBass, uVocal, uBeat) * calm;
  float wBot = waveProfile(1.0 - ux, t * 1.06, 2.3, specBot, uSubBass, uVocal, uBeat) * calm;
  float wLeft = waveProfile(uy, t * 0.94, 4.1, specLeft, uSubBass, uVocal, uBeat) * calm;
  float wRight = waveProfile(1.0 - uy, t * 1.02, 5.8, specRight, uBass, uTreble, uBeat) * calm;

  // Razor-crisp OLED bezel filament + sleek sculptural liquid wave spill (matches Reel Lumn!)
  float coreSigma = (1.35 + uBeat * 0.72 + uSubBass * 0.28) * (uMode == 3 ? 0.85 : 1.0);
  float baseSpan = (uMode == 3 ? 11.0 : 14.5) + uSubBass * 12.5 + uBeat * 20.0;

  float cTop = exp(-dTop * dTop / (2.0 * coreSigma * coreSigma)) * (0.76 + wTop * 0.44);
  float cBot = exp(-dBottom * dBottom / (2.0 * coreSigma * coreSigma)) * (0.76 + wBot * 0.44);
  float cLeft = exp(-dLeft * dLeft / (2.0 * coreSigma * coreSigma)) * (0.76 + wLeft * 0.44);
  float cRight = exp(-dRight * dRight / (2.0 * coreSigma * coreSigma)) * (0.76 + wRight * 0.44);

  float sTop = exp(-dTop / max(3.5, baseSpan * (0.24 + wTop * 0.84))) * (0.22 + wTop * 0.54) * smoothstep(maxReach, 0.0, dTop);
  float sBot = exp(-dBottom / max(3.5, baseSpan * (0.24 + wBot * 0.84))) * (0.22 + wBot * 0.54) * smoothstep(maxReach, 0.0, dBottom);
  float sLeft = exp(-dLeft / max(3.5, baseSpan * (0.22 + wLeft * 0.78))) * (0.20 + wLeft * 0.50) * smoothstep(maxReach, 0.0, dLeft);
  float sRight = exp(-dRight / max(3.5, baseSpan * (0.22 + wRight * 0.78))) * (0.20 + wRight * 0.50) * smoothstep(maxReach, 0.0, dRight);

  // Smooth corner union (prevents blocky square corner seams)
  float core = 1.0 - (1.0 - clamp(cTop, 0.0, 1.0)) * (1.0 - clamp(cBot, 0.0, 1.0)) * (1.0 - clamp(cLeft, 0.0, 1.0)) * (1.0 - clamp(cRight, 0.0, 1.0));
  float spill = 1.0 - (1.0 - clamp(sTop, 0.0, 1.0)) * (1.0 - clamp(sBot, 0.0, 1.0)) * (1.0 - clamp(sLeft, 0.0, 1.0)) * (1.0 - clamp(sRight, 0.0, 1.0));

  // Perimeter angle / loop coordinate [0..1) for smooth color flow & laser comets
  vec2 centered = (p / cssRes) - 0.5;
  float ang = atan(centered.y, centered.x);
  float perimU = fract(ang / 6.2831853 + 0.5);

  float colorMix = 0.5 + 0.5 * sin(ang * 2.0 + t * 0.72 + (uVocal - uSubBass) * 1.4);
  vec3 edgeCol = mix(uPrimary, uSecondary, colorMix * 0.68);

  float orbitBoost = 0.0;
  if (uMode == 1) {
    // Laser Orbit: dual high-velocity luminous plasma comets chasing around bezel
    float comet1 = orbitPulse(perimU, fract(t * 0.22), 0.14);
    float comet2 = orbitPulse(1.0 - perimU, fract(t * 0.17 + 0.5), 0.12);
    orbitBoost = max(comet1, comet2);
    edgeCol = mix(edgeCol, mix(uPrimary, uSecondary, comet2 / max(0.001, comet1 + comet2)), clamp(orbitBoost, 0.0, 1.0));
    core = clamp(core * 0.55 + orbitBoost * exp(-minD / (3.2 + uBeat * 2.2)), 0.0, 1.25);
    spill = clamp(spill * 0.65 + orbitBoost * exp(-minD / (34.0 + uBeat * 26.0)) * 0.7, 0.0, 1.0);
  } else if (uMode == 2) {
    // Violet Prism: shifting chromatic refraction ribbon around OLED perimeter
    vec3 prism = 0.55 + 0.45 * cos(vec3(0.0, 1.9, 3.8) + perimU * 6.2831853 * 1.5 - t * 0.95);
    edgeCol = mix(edgeCol, prism, 0.58);
  }

  // Hot white-tinted OLED filament center on the razor outer rim + beat-locked flare
  float hotCore = clamp(core * (0.64 + uBeat * 0.34 + orbitBoost * 0.25), 0.0, 1.0);
  vec3 finalRgb = mix(edgeCol, mix(uAccent, vec3(1.0), 0.72), hotCore * 0.76);

  // Subtle boost on heavy bass kicks like Lumn's real-time beat flash
  float beatLift = 1.0 + uBeat * 0.36 + uEnergy * 0.12;
  float alpha = clamp((core * 0.96 + spill * 0.84) * beatLift, 0.0, 1.0);

  // Subtle 1-LSB dithering inside visible glow to kill 8-bit OLED banding
  if (alpha > 0.004) {
    float n = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    finalRgb += (n - 0.5) / 180.0;
  }

  finalRgb = clamp(finalRgb, 0.0, 1.0);
  outColor = vec4(finalRgb * alpha, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/**
 * Reel-Grade 120fps GPU WebGL2 Lumn Perimeter Light Engine (with silky Canvas 2D fallback).
 * Renders razor-sharp OLED monitor edge tubes + audio-reactive undulating liquid light waves
 * with ZERO per-frame DOM mutations and ZERO CSS box-shadow blur rasterization.
 */
export const LumnEdgeCanvas: React.FC<LumnEdgeCanvasProps> = React.memo(({
  edgeStyle,
  palette,
  audioPulseRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({ edgeStyle, palette });
  propsRef.current = { edgeStyle, palette };

  useEffect(() => {
    if (edgeStyle === 'off') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    let prog: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;

    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
      if (gl) {
        prog = createProgram(gl);
        if (prog) {
          vao = gl.createVertexArray();
        } else {
          gl = null;
        }
      }
    } catch {
      gl = null;
    }

    if (!gl) {
      ctx2d = canvas.getContext('2d', { alpha: true });
      if (!ctx2d) return;
    }

    const uLoc =
      gl && prog
        ? {
            uRes: gl.getUniformLocation(prog, 'uRes'),
            uDpr: gl.getUniformLocation(prog, 'uDpr'),
            uTime: gl.getUniformLocation(prog, 'uTime'),
            uPrimary: gl.getUniformLocation(prog, 'uPrimary'),
            uSecondary: gl.getUniformLocation(prog, 'uSecondary'),
            uAccent: gl.getUniformLocation(prog, 'uAccent'),
            uSubBass: gl.getUniformLocation(prog, 'uSubBass'),
            uBass: gl.getUniformLocation(prog, 'uBass'),
            uBeat: gl.getUniformLocation(prog, 'uBeat'),
            uVocal: gl.getUniformLocation(prog, 'uVocal'),
            uTreble: gl.getUniformLocation(prog, 'uTreble'),
            uEnergy: gl.getUniformLocation(prog, 'uEnergy'),
            uMode: gl.getUniformLocation(prog, 'uMode'),
            uSpec: gl.getUniformLocation(prog, 'uSpec'),
          }
        : null;

    let cssW = window.innerWidth;
    let cssH = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const pw = Math.max(1, Math.floor(cssW * dpr));
      const ph = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      if (gl) {
        gl.viewport(0, 0, pw, ph);
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const curP: [number, number, number] = hexToRgb01(propsRef.current.palette.primary);
    const curS: [number, number, number] = hexToRgb01(propsRef.current.palette.secondary);
    const curA: [number, number, number] = hexToRgb01(propsRef.current.palette.accent);
    let cachedPHex = propsRef.current.palette.primary;
    let cachedSHex = propsRef.current.palette.secondary;
    let cachedAHex = propsRef.current.palette.accent;
    let targetP: [number, number, number] = [...curP];
    let targetS: [number, number, number] = [...curS];
    let targetA: [number, number, number] = [...curA];

    const spec16 = new Float32Array(16);
    let prevNow = performance.now();
    let elapsed = 0;
    let rafId = 0;

    const rgbCss = (rgb: [number, number, number], a: number) =>
      `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

    const draw2dFallback = (
      ctx: CanvasRenderingContext2D,
      t: number,
      mode: EdgeStyleId,
      subBass: number,
      bass: number,
      beat: number,
      vocal: number
    ) => {
      ctx.clearRect(0, 0, cssW, cssH);
      const calm = mode === 'breathing_aura' ? 0.58 : 1;
      const maxDepth = (32 + subBass * 28 + beat * 34) * calm;
      const segs = 24;

      const waveAt = (u: number, seed: number) => {
        const w1 = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 1.3 + t * 1.0 + seed);
        const w2 = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 2.5 - t * 1.5 + seed * 1.7);
        return (0.28 + Math.pow(w1 * 0.62 + w2 * 0.38, 1.35) * (0.72 + bass * 0.65 + beat * 0.55 + vocal * 0.25)) * maxDepth;
      };

      // Top liquid wave strip
      const gTop = ctx.createLinearGradient(0, 0, 0, maxDepth * 1.15);
      gTop.addColorStop(0, rgbCss(curA, (0.75 + beat * 0.22) * calm));
      gTop.addColorStop(0.18, rgbCss(curP, (0.58 + bass * 0.26) * calm));
      gTop.addColorStop(0.65, rgbCss(curP, 0.14 * calm));
      gTop.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gTop;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cssW, 0);
      for (let i = segs; i >= 0; i--) {
        const u = i / segs;
        ctx.lineTo(u * cssW, waveAt(u, 0.4));
      }
      ctx.closePath();
      ctx.fill();

      // Bottom liquid wave strip
      const gBot = ctx.createLinearGradient(0, cssH, 0, cssH - maxDepth * 1.15);
      gBot.addColorStop(0, rgbCss(curA, (0.75 + beat * 0.22) * calm));
      gBot.addColorStop(0.18, rgbCss(curS, (0.55 + bass * 0.26) * calm));
      gBot.addColorStop(0.65, rgbCss(curS, 0.14 * calm));
      gBot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gBot;
      ctx.beginPath();
      ctx.moveTo(0, cssH);
      ctx.lineTo(cssW, cssH);
      for (let i = segs; i >= 0; i--) {
        const u = i / segs;
        ctx.lineTo(u * cssW, cssH - waveAt(1 - u, 2.3));
      }
      ctx.closePath();
      ctx.fill();

      // Left liquid wave strip
      const gLeft = ctx.createLinearGradient(0, 0, maxDepth * 1.05, 0);
      gLeft.addColorStop(0, rgbCss(curA, (0.72 + beat * 0.22) * calm));
      gLeft.addColorStop(0.2, rgbCss(curP, (0.52 + bass * 0.25) * calm));
      gLeft.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gLeft;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, cssH);
      for (let i = segs; i >= 0; i--) {
        const u = i / segs;
        ctx.lineTo(waveAt(u, 4.1) * 0.9, u * cssH);
      }
      ctx.closePath();
      ctx.fill();

      // Right liquid wave strip
      const gRight = ctx.createLinearGradient(cssW, 0, cssW - maxDepth * 1.05, 0);
      gRight.addColorStop(0, rgbCss(curA, (0.72 + beat * 0.22) * calm));
      gRight.addColorStop(0.2, rgbCss(curS, (0.52 + bass * 0.25) * calm));
      gRight.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gRight;
      ctx.beginPath();
      ctx.moveTo(cssW, 0);
      ctx.lineTo(cssW, cssH);
      for (let i = segs; i >= 0; i--) {
        const u = i / segs;
        ctx.lineTo(cssW - waveAt(1 - u, 5.8) * 0.9, u * cssH);
      }
      ctx.closePath();
      ctx.fill();

      // Razor white-hot outer OLED bezel filament
      ctx.strokeStyle = rgbCss(curA, Math.min(1, (0.72 + beat * 0.28) * calm));
      ctx.lineWidth = 2.2 + beat * 1.1;
      ctx.strokeRect(1, 1, cssW - 2, cssH - 2);
    };

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) {
        prevNow = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001));
      prevNow = now;
      elapsed += dt;

      const { edgeStyle: curMode, palette: pal } = propsRef.current;
      if (curMode === 'off') return;

      if (pal.primary !== cachedPHex) {
        cachedPHex = pal.primary;
        targetP = hexToRgb01(cachedPHex);
      }
      if (pal.secondary !== cachedSHex) {
        cachedSHex = pal.secondary;
        targetS = hexToRgb01(cachedSHex);
      }
      if (pal.accent !== cachedAHex) {
        cachedAHex = pal.accent;
        targetA = hexToRgb01(cachedAHex);
      }
      const colLerp = 1 - Math.exp(-4.5 * dt);
      for (let c = 0; c < 3; c++) {
        curP[c] += (targetP[c] - curP[c]) * colLerp;
        curS[c] += (targetS[c] - curS[c]) * colLerp;
        curA[c] += (targetA[c] - curA[c]) * colLerp;
      }

      const ap = audioPulseRef.current;
      const subBass = ap.subBass ?? ap.bass;
      const bass = ap.bass;
      const beat = ap.beat;
      const vocal = ap.vocal ?? ap.mid;
      const treble = ap.treble ?? 0.08;
      const energy = ap.energy ?? bass;

      if (gl && prog && uLoc && !gl.isContextLost()) {
        const spec = ap.spectrum;
        for (let i = 0; i < 16; i++) {
          spec16[i] = ((spec[i * 2] || 0) + (spec[i * 2 + 1] || 0)) * 0.5;
        }
        gl.useProgram(prog);
        if (vao) gl.bindVertexArray(vao);
        gl.uniform2f(uLoc.uRes, canvas.width, canvas.height);
        gl.uniform1f(uLoc.uDpr, dpr);
        gl.uniform1f(uLoc.uTime, elapsed);
        gl.uniform3f(uLoc.uPrimary, curP[0], curP[1], curP[2]);
        gl.uniform3f(uLoc.uSecondary, curS[0], curS[1], curS[2]);
        gl.uniform3f(uLoc.uAccent, curA[0], curA[1], curA[2]);
        gl.uniform1f(uLoc.uSubBass, subBass);
        gl.uniform1f(uLoc.uBass, bass);
        gl.uniform1f(uLoc.uBeat, beat);
        gl.uniform1f(uLoc.uVocal, vocal);
        gl.uniform1f(uLoc.uTreble, treble);
        gl.uniform1f(uLoc.uEnergy, energy);
        gl.uniform1i(uLoc.uMode, edgeModeToInt(curMode));
        gl.uniform1fv(uLoc.uSpec, spec16);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        draw2dFallback(ctx2d, elapsed, curMode, subBass, bass, beat, vocal);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (gl) {
        if (vao) gl.deleteVertexArray(vao);
        if (prog) gl.deleteProgram(prog);
      }
    };
  }, [edgeStyle === 'off', audioPulseRef]);

  if (edgeStyle === 'off') return null;

  return (
    <canvas
      ref={canvasRef}
      data-aura-lumn-canvas="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
});
