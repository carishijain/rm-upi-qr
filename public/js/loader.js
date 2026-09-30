// Port of BreathingLoader.swift (a SwiftUI particle-sphere view) to plain
// canvas 2D, so the same effect can run as this site's opening screen.
// The math below mirrors the Swift file section by section: a Fibonacci
// sphere of points, a breathing (pulsing) radius, per-particle turbulence,
// 3D rotation, and a simple perspective projection with painter's-algorithm
// depth sorting. Anyone comparing the two side by side should be able to
// follow along.

const PARTICLE_COUNT = 170;
const SPHERE_SIZE = 110; // SwiftUI default was 144pt on a full screen; this
// canvas is smaller (a loading screen, not the whole view), so it's scaled
// down to match — same proportions, just sized for this use.
const BREATHING_SPEED = 2.5;
const ROTATION_SPEED = 0.9;
const DOT_SIZE = 10;
const FOCAL_LENGTH = 400;
const SHOW_DURATION_MS = 4000;
const FADE_MS = 400;

// ---------- particle cloud (mirrors BreathingParticle.makeCloud) ----------

function makeParticleCloud(count) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const particles = [];
  for (let index = 0; index < count; index++) {
    const y = 1 - (index / (count - 1)) * 2;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;

    // Same integer hash as the Swift version, so the per-particle phase
    // pattern (which makes the turbulence look organic rather than
    // synchronized) matches exactly.
    let hash = (index + 1) >>> 0;
    hash = (hash ^ (hash >>> 16)) >>> 0;
    hash = Math.imul(hash, 0x7feb352d) >>> 0;
    hash = (hash ^ (hash >>> 15)) >>> 0;
    hash = Math.imul(hash, 0x846ca68b) >>> 0;
    hash = (hash ^ (hash >>> 16)) >>> 0;
    const phase = (hash / 0xffffffff) * 10;

    particles.push({
      id: index,
      base: { x: Math.cos(theta) * horizontalRadius, y, z: Math.sin(theta) * horizontalRadius },
      phase,
      colorIndex: index % 2,
    });
  }
  return particles;
}

// ---------- 3D rotation (mirrors BreathingVector.rotated(by:axis:)) ----------

function rotateY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function rotateX(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

// ---------- per-frame layout (mirrors renderFrame(at:)) ----------

function renderFrame(particles, elapsed) {
  const time = Math.max(0, elapsed);
  const maxRadius = SPHERE_SIZE;
  const breath = (Math.sin(time * BREATHING_SPEED) + 1) / 2;
  const currentRadius = maxRadius * (80 / 140 + (60 / 140) * breath);
  const turbulence = 30 * breath * (SPHERE_SIZE / 144); // scaled with sphere size
  const expansionBonus = 4 * breath;

  const rendered = particles.map((p) => {
    let pos = {
      x: p.base.x * currentRadius + Math.sin(time * 3 + p.phase) * turbulence,
      y: p.base.y * currentRadius + Math.cos(time * 4 + p.phase) * turbulence,
      z: p.base.z * currentRadius + Math.sin(time * 5 + p.phase) * turbulence,
    };
    pos = rotateY(pos, time * ROTATION_SPEED);
    pos = rotateX(pos, time * 0.2);

    const depthScale = FOCAL_LENGTH / Math.max(FOCAL_LENGTH + pos.z, 1);
    const rearOpacity = 0.5 + 0.5 * ((pos.z + maxRadius) / (maxRadius * 2));

    return {
      id: p.id,
      x: pos.x * depthScale,
      y: pos.y * depthScale,
      z: pos.z,
      size: (DOT_SIZE + expansionBonus) * depthScale,
      opacity: pos.z < 0 ? Math.min(Math.max(rearOpacity, 0), 1) : 1,
      colorIndex: p.colorIndex,
    };
  });

  rendered.sort((a, b) => (a.z === b.z ? a.id - b.id : a.z - b.z));
  return rendered;
}

// ---------- drawing ----------

function draw(ctx, cssSize, dpr, particles, colors) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssSize, cssSize);
  const center = cssSize / 2;
  const authoredDiameter = (SPHERE_SIZE + 30 + DOT_SIZE) * 2;
  const fitScale = Math.min(1, cssSize / authoredDiameter);

  for (const particle of particles) {
    const visualSize = particle.size * fitScale;
    if (visualSize <= 0) continue;
    const cx = center + particle.x * fitScale;
    const cy = center + particle.y * fitScale;
    ctx.globalAlpha = particle.opacity;
    ctx.fillStyle = particle.colorIndex === 0 ? colors.primary : colors.secondary;
    ctx.beginPath();
    ctx.ellipse(cx, cy, visualSize / 2, visualSize / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- the loading screen itself ----------

export function initLoader() {
  const root = document.getElementById("app-loader");
  if (!root) return;
  const canvas = document.getElementById("loader-canvas");
  const ctx = canvas.getContext("2d");
  const particles = makeParticleCloud(PARTICLE_COUNT);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function sizeCanvas() {
    const cssSize = Math.min(220, Math.round(root.clientWidth * 0.55));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssSize + "px";
    canvas.style.height = cssSize + "px";
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    return { cssSize, dpr };
  }

  function currentColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue("--ink").trim() || "#1a2420",
      secondary: styles.getPropertyValue("--steel").trim() || "#4a5a64",
    };
  }

  let { cssSize, dpr } = sizeCanvas();
  const colors = currentColors();
  const start = performance.now();
  let rafId = null;

  function frame(now) {
    const elapsed = (now - start) / 1000;
    const rendered = renderFrame(particles, elapsed);
    draw(ctx, cssSize, dpr, rendered, colors);
    if (!reduceMotion) rafId = requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    // Respect the OS preference: draw one still frame instead of animating,
    // matching the Swift view's own reduceMotion behaviour.
    draw(ctx, cssSize, dpr, renderFrame(particles, 0), colors);
  } else {
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener(
    "resize",
    () => {
      ({ cssSize, dpr } = sizeCanvas());
    },
    { passive: true }
  );

  setTimeout(() => {
    if (rafId) cancelAnimationFrame(rafId);
    root.classList.add("fade-out");
    setTimeout(() => root.remove(), FADE_MS);
  }, SHOW_DURATION_MS);
}

initLoader();
