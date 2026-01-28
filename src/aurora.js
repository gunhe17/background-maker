/**
 * Background rendering engine.
 * Draws soft gradient blobs onto a Canvas, animated by a time parameter.
 * All rendering is deterministic given a time value — this enables frame-perfect export.
 */

const DEFAULT_LAYER_COLORS = [
  '#7c7cff', // indigo
  '#3b82f6', // blue
  '#a855f7', // purple
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#34d399', // emerald
];

// Each layer has a unique orbit phase and direction so they feel organic.
// period is gone — cycle count is now controlled per-layer via layerCycles.
const LAYER_ORBITS = [
  { phaseX: 0.0, phaseY: 0.3, dirX: 1, dirY: 1 },
  { phaseX: 0.5, phaseY: 0.8, dirX: -1, dirY: 1 },
  { phaseX: 0.2, phaseY: 0.6, dirX: 1, dirY: -1 },
  { phaseX: 0.7, phaseY: 0.1, dirX: -1, dirY: -1 },
  { phaseX: 0.4, phaseY: 0.9, dirX: 1, dirY: -1 },
  { phaseX: 0.9, phaseY: 0.4, dirX: -1, dirY: 1 },
];

// ── Shape templates ──

/** Generate a seeded random number (deterministic per layer index). */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Build a random smooth blob path for a given layer index.
 * Returns an array of { angle, radius } control points.
 * Deterministic per index so it stays consistent across frames.
 */
function buildRandomBlobPoints(layerIndex) {
  const rng = seededRandom(layerIndex * 7919 + 1301);
  const pointCount = 5 + Math.floor(rng() * 4); // 5–8 vertices
  const points = [];
  for (let j = 0; j < pointCount; j++) {
    const angle = (j / pointCount) * Math.PI * 2;
    const radius = 0.6 + rng() * 0.4; // 0.6–1.0 of blobRadius
    points.push({ angle, radius });
  }
  return points;
}

// Pre-generate blob points for up to 6 layers
const BLOB_POINTS = Array.from({ length: 6 }, (_, i) => buildRandomBlobPoints(i));

const SHAPE_TYPES = {
  circle: 'circle',
  ellipse: 'ellipse',
  ring: 'ring',
  blob: 'blob',
};

const MOTION_TYPES = {
  lissajous: 'lissajous',
  orbit: 'orbit',
  drift: 'drift',
  breathe: 'breathe',
  wave: 'wave',
};

// ── Motion functions ──
// Each returns { offsetX, offsetY } given (t, orbit, motionRange)

function motionLissajous(t, orbit, range) {
  return {
    offsetX: Math.sin((t + orbit.phaseX) * Math.PI * 2) * orbit.dirX * range,
    offsetY: Math.sin((t + orbit.phaseY) * Math.PI * 2) * orbit.dirY * range,
  };
}

function motionOrbit(t, orbit, range) {
  const angle = (t + orbit.phaseX) * Math.PI * 2;
  return {
    offsetX: Math.cos(angle) * range * orbit.dirX,
    offsetY: Math.sin(angle) * range * orbit.dirY,
  };
}

function motionDrift(t, orbit, range) {
  // Slow horizontal drift that wraps around
  const drift = ((t * orbit.dirX + orbit.phaseX) % 1) * range * 2 - range;
  const sway = Math.sin((t + orbit.phaseY) * Math.PI * 2) * range * 0.2;
  return { offsetX: drift, offsetY: sway };
}

function motionBreathe(_t, _orbit, _range) {
  return { offsetX: 0, offsetY: 0 };
}

function motionWave(t, orbit, range) {
  const waveX = Math.sin((t + orbit.phaseX) * Math.PI * 2) * range;
  const waveY = Math.sin((t * 2 + orbit.phaseY) * Math.PI * 2) * range * 0.25;
  return { offsetX: waveX * orbit.dirX, offsetY: waveY };
}

function getMotionOffset(type, t, orbit, range) {
  switch (type) {
    case MOTION_TYPES.orbit: return motionOrbit(t, orbit, range);
    case MOTION_TYPES.drift: return motionDrift(t, orbit, range);
    case MOTION_TYPES.breathe: return motionBreathe(t, orbit, range);
    case MOTION_TYPES.wave: return motionWave(t, orbit, range);
    default: return motionLissajous(t, orbit, range);
  }
}

// ── Shape drawing ──

function drawCircle(c, cx, cy, blobRadius, color, opacity) {
  c.save();
  c.globalAlpha = opacity;
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, blobRadius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.55, color + '40');
  grad.addColorStop(1, 'transparent');
  c.fillStyle = grad;
  c.fillRect(cx - blobRadius, cy - blobRadius, blobRadius * 2, blobRadius * 2);
  c.restore();
}

function drawEllipse(c, cx, cy, blobRadius, color, opacity, layerIndex) {
  const aspect = 0.5 + (layerIndex % 3) * 0.25; // 0.5, 0.75, 1.0 alternating
  c.save();
  c.globalAlpha = opacity;
  c.translate(cx, cy);
  c.scale(1, aspect);
  const grad = c.createRadialGradient(0, 0, 0, 0, 0, blobRadius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.55, color + '40');
  grad.addColorStop(1, 'transparent');
  c.fillStyle = grad;
  c.fillRect(-blobRadius, -blobRadius, blobRadius * 2, blobRadius * 2);
  c.restore();
}

function drawRing(c, cx, cy, blobRadius, color, opacity) {
  c.save();
  c.globalAlpha = opacity;
  const innerR = blobRadius * 0.35;
  const grad = c.createRadialGradient(cx, cy, innerR, cx, cy, blobRadius);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.2, color + '60');
  grad.addColorStop(0.5, color);
  grad.addColorStop(0.75, color + '40');
  grad.addColorStop(1, 'transparent');
  c.fillStyle = grad;
  c.fillRect(cx - blobRadius, cy - blobRadius, blobRadius * 2, blobRadius * 2);
  c.restore();
}

function drawBlob(c, cx, cy, blobRadius, color, opacity, layerIndex) {
  const points = BLOB_POINTS[layerIndex % BLOB_POINTS.length];
  c.save();
  c.globalAlpha = opacity;

  // Build smooth closed path using quadratic curves
  c.beginPath();
  const len = points.length;
  for (let j = 0; j < len; j++) {
    const curr = points[j];
    const next = points[(j + 1) % len];
    const r1 = curr.radius * blobRadius;
    const r2 = next.radius * blobRadius;
    const x1 = cx + Math.cos(curr.angle) * r1;
    const y1 = cy + Math.sin(curr.angle) * r1;
    const x2 = cx + Math.cos(next.angle) * r2;
    const y2 = cy + Math.sin(next.angle) * r2;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (j === 0) {
      // Move to midpoint of first edge
      const prev = points[len - 1];
      const rp = prev.radius * blobRadius;
      const xp = cx + Math.cos(prev.angle) * rp;
      const yp = cy + Math.sin(prev.angle) * rp;
      c.moveTo((xp + x1) / 2, (yp + y1) / 2);
    }
    c.quadraticCurveTo(x1, y1, mx, my);
  }
  c.closePath();

  // Fill with radial gradient
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, blobRadius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.6, color + '50');
  grad.addColorStop(1, 'transparent');
  c.fillStyle = grad;
  c.fill();
  c.restore();
}

function drawShape(type, c, cx, cy, blobRadius, color, opacity, layerIndex) {
  switch (type) {
    case SHAPE_TYPES.ellipse:
      drawEllipse(c, cx, cy, blobRadius, color, opacity, layerIndex);
      break;
    case SHAPE_TYPES.ring:
      drawRing(c, cx, cy, blobRadius, color, opacity);
      break;
    case SHAPE_TYPES.blob:
      drawBlob(c, cx, cy, blobRadius, color, opacity, layerIndex);
      break;
    default:
      drawCircle(c, cx, cy, blobRadius, color, opacity);
      break;
  }
}

// ── Renderer ──

export class BackgroundRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.animFrameId = null;
    this.startTime = null;

    // Default settings
    this.settings = {
      bgColor: '#050814',
      layerCount: 4,
      layerColors: [...DEFAULT_LAYER_COLORS],
      layerShapes: Array(6).fill(SHAPE_TYPES.circle),
      layerMotions: Array(6).fill(MOTION_TYPES.lissajous),
      layerCycles: [1, 2, 1, 3, 2, 1], // integer cycles per loop (ensures perfect loop)
      layerMotionRanges: Array(6).fill(250),
      layerOpacities: Array(6).fill(0.75),
      layerScaleRanges: Array(6).fill(1.4),
      blur: 160,
      blendMode: 'screen', // screen | multiply | overlay | soft-light
      loopDuration: 10000, // loop period in ms (0 = no loop)
    };
  }

  /** Update one or more settings. Partial update supported. */
  updateSettings(partial) {
    Object.assign(this.settings, partial);
  }

  /** Resize the canvas to match its display size (call on window resize). */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Render a single frame at the given time (ms).
   */
  renderFrame(time, ctx, width, height) {
    const c = ctx || this.ctx;
    const w = width || this.canvas.getBoundingClientRect().width;
    const h = height || this.canvas.getBoundingClientRect().height;
    const s = this.settings;

    // Background
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = s.bgColor;
    c.fillRect(0, 0, w, h);

    // Draw each layer
    c.globalCompositeOperation = s.blendMode;

    for (let i = 0; i < s.layerCount; i++) {
      const orbit = LAYER_ORBITS[i % LAYER_ORBITS.length];
      const color = s.layerColors[i] || DEFAULT_LAYER_COLORS[i % DEFAULT_LAYER_COLORS.length];

      // Per-layer settings
      const layerShape = s.layerShapes[i] || SHAPE_TYPES.circle;
      const layerMotion = s.layerMotions[i] || MOTION_TYPES.lissajous;
      const layerCycles = s.layerCycles[i] ?? 1;
      const layerRange = s.layerMotionRanges[i] ?? 250;
      const layerOpacity = s.layerOpacities[i] ?? 0.75;
      const layerScale = s.layerScaleRanges[i] ?? 1.4;

      // t advances by exactly layerCycles integers per loopDuration → perfect loop
      const loopMs = s.loopDuration || 10000;
      const t = (time / loopMs) * layerCycles;

      // Motion
      const { offsetX, offsetY } = getMotionOffset(layerMotion, t, orbit, layerRange);

      // Scale oscillation
      const breatheExtra = layerMotion === MOTION_TYPES.breathe ? 0.3 : 0;
      const scale = 1.0 + (layerScale - 1.0 + breatheExtra) * (0.5 + 0.5 * Math.sin((t + orbit.phaseX * 2) * Math.PI * 2));

      // Layer center position
      const baseCx = w * (0.2 + 0.6 * ((i * 0.618) % 1));
      const baseCy = h * (0.2 + 0.6 * (((i * 0.618 + 0.5) % 1)));
      const cx = baseCx + offsetX;
      const cy = baseCy + offsetY;

      const blobRadius = Math.max(w, h) * 0.5 * scale;

      drawShape(layerShape, c, cx, cy, blobRadius, color, layerOpacity, i);
    }

    c.globalCompositeOperation = 'source-over';
  }

  /**
   * Prepare reusable canvases for export at given dimensions.
   * Call once before the frame loop to avoid per-frame allocation.
   */
  initExport(exportWidth, exportHeight) {
    const s = this.settings;
    const previewWidth = this.canvas.getBoundingClientRect().width || 1920;
    const ratio = exportWidth / previewWidth;
    const blurPx = Math.round(s.blur * ratio);
    const pad = blurPx * 2;

    // Source canvas (oversized for blur padding)
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = exportWidth + pad * 2;
    srcCanvas.height = exportHeight + pad * 2;

    // Output canvas (final cropped result)
    const outCanvas = document.createElement('canvas');
    outCanvas.width = exportWidth;
    outCanvas.height = exportHeight;

    this._export = { srcCanvas, outCanvas, blurPx, pad, exportWidth, exportHeight };
  }

  /**
   * Render a single frame for export.
   * Reuses canvases created by initExport() to avoid per-frame allocation.
   * Returns the output canvas (caller converts to PNG blob).
   */
  renderExportFrame(time) {
    const { srcCanvas, outCanvas, blurPx, pad, exportWidth, exportHeight } = this._export;
    const s = this.settings;

    // 1. Render to oversized canvas with padding for blur bleed
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.fillStyle = s.bgColor;
    srcCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);

    srcCtx.save();
    srcCtx.translate(pad, pad);
    this.renderFrame(time, srcCtx, exportWidth, exportHeight);
    srcCtx.restore();

    // 2. Draw with real gaussian blur, cropping padding
    const outCtx = outCanvas.getContext('2d');
    outCtx.clearRect(0, 0, exportWidth, exportHeight);
    outCtx.filter = `blur(${blurPx}px)`;
    outCtx.drawImage(srcCanvas, -pad, -pad);
    outCtx.filter = 'none';

    return outCanvas;
  }

  /** Release export canvases. */
  cleanupExport() {
    this._export = null;
  }

  /** Start the real-time preview animation loop. */
  startPreview() {
    this.resize();
    this.canvas.style.filter = `blur(${this.settings.blur}px)`;
    this.canvas.style.transform = `scale(${this._blurScale()})`;
    this.startTime = performance.now();

    const loop = (now) => {
      let time = now - this.startTime;
      const loop_ms = this.settings.loopDuration;
      if (loop_ms > 0) time = time % loop_ms;
      this.renderFrame(time);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /** Stop the preview loop. */
  stopPreview() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Calculate scale needed to hide blur edge artifacts. */
  _blurScale() {
    const rect = this.canvas.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height) || 1;
    // Need blur pixels of margin on each side → 2*blur total
    return 1 + (2 * this.settings.blur) / minDim + 0.05;
  }

  /** Update CSS blur on the canvas element (for live preview). */
  updateBlur() {
    this.canvas.style.filter = `blur(${this.settings.blur}px)`;
    this.canvas.style.transform = `scale(${this._blurScale()})`;
  }
}

const BLEND_MODES = ['screen', 'multiply', 'overlay', 'soft-light'];

// Expose constants for controls
export { SHAPE_TYPES, MOTION_TYPES, BLEND_MODES };

// Expose a singleton renderer
const canvas = document.getElementById('preview-canvas');
export const renderer = new BackgroundRenderer(canvas);

// Start preview on load
renderer.startPreview();

// Handle resize
window.addEventListener('resize', () => renderer.resize());
