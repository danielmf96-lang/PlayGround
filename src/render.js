// ============================================================
// DECOMP — canvas renderer
// ============================================================

import { WORLD } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

const PALETTE = [
  [0, [30, 132, 161]],
  [25, [16, 99, 132]],
  [60, [8, 67, 95]],
  [110, [4, 43, 67]],
  [170, [3, 24, 42]],
  [230, [2, 14, 27]],
  [300, [0, 6, 13]],
];

function waterColor(depth) {
  const d = clamp(depth, 0, 300);
  for (let i = 0; i < PALETTE.length - 1; i++) {
    const [d0, c0] = PALETTE[i];
    const [d1, c1] = PALETTE[i + 1];
    if (d >= d0 && d <= d1) {
      const t = (d - d0) / (d1 - d0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return PALETTE[PALETTE.length - 1][1];
}

const TIER = [
  ['#ffd88a', '255,200,110'],
  ['#ffb454', '255,166,78'],
  ['#ff8a4d', '255,122,65'],
  ['#ff6347', '255,84,58'],
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 1; this.H = 1; this.dpr = 1;
    this.scale = 12;
    this.camX = 60; this.camY = 30;
    this.time = 0;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.diverAngle = 0;
    this.ripples = [];
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this._buildDecor();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.light.width = Math.round(this.W * this.dpr);
    this.light.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = this.H / WORLD.viewM;
  }

  _buildDecor() {
    const rnd = mulberry32(7781);
    this.kelp = [];
    for (let i = 0; i < 26; i++) {
      this.kelp.push({
        x: rnd() < 0.5 ? 6 + rnd() * 16 : 100 + rnd() * 15,
        depth: 62 + rnd() * 62,
        height: 7 + rnd() * 18,
        phase: rnd() * TAU,
        width: 1.4 + rnd() * 2.6,
        hue: 120 + rnd() * 50,
      });
    }
    this.rocks = [];
    for (let i = 0; i < 18; i++) {
      this.rocks.push({
        x: rnd() < 0.5 ? rnd() * 20 : 100 + rnd() * 20,
        depth: 100 + rnd() * 170,
        r: 2 + rnd() * 7,
        phase: rnd() * TAU,
      });
    }
    this.spires = [
      { x: 24, base: 76, h: 42, w: 7, lean: 0.5 },
      { x: 106, base: 100, h: 54, w: 9, lean: -0.6 },
      { x: 44, base: 300, h: 78, w: 13, lean: 0.8 },
      { x: 84, base: 300, h: 58, w: 10, lean: -0.4 },
    ];
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      this.stars.push({ x: rnd(), y: rnd() * 0.5, a: 0.1 + rnd() * 0.5 });
    }
    this.rayPhase = rnd() * 10;
    this.snowSeed = rnd() * 1000;
    this.currentSeed = rnd() * 1000;
  }

  mapX(x) { return (x - this.camX) * this.scale + this.W / 2; }
  mapY(d) { return (d - this.camY) * this.scale + this.H / 2; }

  _setCam(cam) {
    const visW = this.W / this.scale;
    let cx = visW >= WORLD.width ? WORLD.width / 2 : clamp(cam.x, visW / 2, WORLD.width - visW / 2);
    let cy = cam.y;
    if (cam.shake > 0.01) {
      const sh = cam.shake * 5;
      cx += (Math.random() - 0.5) * sh;
      cy += (Math.random() - 0.5) * sh;
    }
    this.camX = cx;
    this.camY = cy;
    this.visW = visW;
  }

  // ============================================================
  // BACKGROUND
  // ============================================================
  drawBackdrop(camY, t, opts = {}) {
    const { W, H, ctx } = this;
    const topDepth = camY - WORLD.viewM / 2;
    const botDepth = camY + WORLD.viewM / 2;
    const cTop = waterColor(topDepth);
    const cBot = waterColor(botDepth);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(cTop));
    g.addColorStop(0.55, rgb(waterColor(camY)));
    g.addColorStop(1, rgb(cBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // deep haze / depth vignette
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.1, W * 0.5, H * 0.55, H * 0.95);
    vg.addColorStop(0, 'rgba(0,10,18,0)');
    vg.addColorStop(0.62, 'rgba(0,5,11,0.16)');
    vg.addColorStop(1, 'rgba(0,2,6,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // subtle vertical bands of light in the upper water
    if (camY < 120) {
      const fade = clamp(1 - camY / 130, 0, 1);
      const bg = ctx.createLinearGradient(W * 0.35, 0, W * 0.62, H);
      bg.addColorStop(0, `rgba(80,210,235,${0.11 * fade})`);
      bg.addColorStop(0.5, `rgba(40,160,195,${0.04 * fade})`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawSky(t) {
    const { ctx, W } = this;
    const waterY = this.mapY(0);
    if (waterY <= -20) return;
    const top = Math.max(-H_UNUSED, waterY - this.H * 0.8);
    const g = ctx.createLinearGradient(0, Math.max(0, top), 0, waterY);
    g.addColorStop(0, '#081827');
    g.addColorStop(0.45, '#173e52');
    g.addColorStop(0.78, '#3d7481');
    g.addColorStop(1, '#d69b70');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Math.max(0, waterY));

    // stars
    ctx.save();
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(210,240,255,${s.a * 0.7})`;
      ctx.fillRect(s.x * W, s.y * Math.max(0, waterY - 20), 1.2, 1.2);
    }
    ctx.restore();

    // horizon glow
    const hg = ctx.createRadialGradient(W * 0.72, waterY, 4, W * 0.72, waterY, W * 0.45);
    hg.addColorStop(0, 'rgba(255,205,150,0.4)');
    hg.addColorStop(0.4, 'rgba(255,160,110,0.12)');
    hg.addColorStop(1, 'rgba(255,140,100,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, Math.max(0, waterY));
    ctx.restore();

    // distant clouds
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#d8eef5';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 0.31 + t * 0.003) % 1.3 - 0.15) * W;
      const cy = waterY - 40 - (i % 3) * 22;
      const cw = 90 + i * 34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, 6, 0, 0, TAU);
      ctx.ellipse(cx + cw * 0.4, cy - 5, cw * 0.55, 4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // waterline
    const wl = ctx.createLinearGradient(0, waterY - 2, 0, waterY + 10);
    wl.addColorStop(0, 'rgba(150,230,245,0.65)');
    wl.addColorStop(1, 'rgba(60,150,175,0)');
    ctx.fillStyle = wl;
    ctx.fillRect(0, waterY - 2, W, 14);

    // waves
    ctx.save();
    ctx.strokeStyle = 'rgba(178,238,250,0.34)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      for (let x = -10; x <= W + 10; x += 8) {
        const y = waterY + r * 4 + Math.sin(x * 0.024 + t * 0.9 + r * 1.6) * (1.8 - r * 0.4);
        if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = 0.5 - r * 0.13;
      ctx.stroke();
    }
    ctx.restore();

    this.drawBoat(W * 0.72, waterY, t);
  }

  drawBoat(x, waterY, t) {
    const { ctx } = this;
    const bob = Math.sin(t * 0.85) * 2.2;
    const y = waterY + bob;
    ctx.save();
    ctx.translate(x, y);

    // reflection
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffce9e';
    ctx.beginPath();
    ctx.ellipse(0, 14, 64, 4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // hull
    ctx.fillStyle = '#101f27';
    ctx.beginPath();
    ctx.moveTo(-62, -8);
    ctx.lineTo(66, -8);
    ctx.lineTo(48, 8);
    ctx.lineTo(-46, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,130,0.25)';
    ctx.fillRect(-48, -8, 98, 2.5);

    // cabin
    ctx.fillStyle = '#132832';
    ctx.beginPath();
    ctx.moveTo(-24, -8);
    ctx.lineTo(-18, -31);
    ctx.lineTo(16, -31);
    ctx.lineTo(25, -8);
    ctx.closePath();
    ctx.fill();
    // windows
    ctx.fillStyle = 'rgba(255,206,150,0.7)';
    ctx.fillRect(-13, -26, 6, 5);
    ctx.fillRect(0, -26, 6, 5);
    ctx.fillStyle = 'rgba(120,220,245,0.3)';
    ctx.fillRect(10, -26, 5, 5);

    // mast + crane
    ctx.strokeStyle = '#0d1c24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(34, -8); ctx.lineTo(34, -50);
    ctx.moveTo(34, -50); ctx.lineTo(52, -36);
    ctx.stroke();
    // hanging cable
    ctx.strokeStyle = 'rgba(200,230,235,0.2)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(52, -36);
    ctx.lineTo(52, -20 + Math.sin(t * 1.2) * 2);
    ctx.stroke();

    // beacon
    const blink = (Math.sin(t * 2.4) + 1) / 2;
    ctx.fillStyle = `rgba(255,120,90,${0.35 + blink * 0.65})`;
    ctx.beginPath();
    ctx.arc(34, -51, 2, 0, TAU);
    ctx.fill();
    const glow = ctx.createRadialGradient(34, -51, 0, 34, -51, 18);
    glow.addColorStop(0, `rgba(255,100,80,${0.22 + blink * 0.2})`);
    glow.addColorStop(1, 'rgba(255,100,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(16, -69, 36, 36);

    ctx.restore();
  }

  drawRays(camY, t) {
    if (camY > 150) return;
    const { ctx, W, H } = this;
    const waterY = this.mapY(0);
    const fade = clamp(1 - camY / 150, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(W * 0.72, waterY);
    const rays = [
      [-0.55, 0.28, 0.1, 0.8],
      [-0.32, 0.42, 0.13, 1.0],
      [-0.05, 0.24, 0.07, 0.6],
      [0.18, 0.36, 0.1, 0.7],
      [0.43, 0.18, 0.06, 0.5],
    ];
    for (let i = 0; i < rays.length; i++) {
      const [ang, w, a, len] = rays[i];
      const sway = Math.sin(t * 0.16 + i * 1.7) * 0.035;
      const L = H * len * 1.4;
      const dx = Math.sin(ang + sway) * L;
      const dy = Math.cos(ang + sway) * L;
      const wx = Math.cos(ang) * W * w;
      const grad = ctx.createLinearGradient(0, 0, dx, dy);
      grad.addColorStop(0, `rgba(180,245,255,${a * fade * 0.42})`);
      grad.addColorStop(0.5, `rgba(130,225,245,${a * fade * 0.14})`);
      grad.addColorStop(1, 'rgba(80,190,220,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-wx * 0.2, 0);
      ctx.lineTo(wx * 0.2, 0);
      ctx.lineTo(dx + wx, dy);
      ctx.lineTo(dx - wx, dy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawCliffs(camY) {
    const { ctx, H, W } = this;
    const top = this.mapY(90);
    if (top > H) return;
    const startY = Math.max(0, top);
    const rnd = mulberry32(441);
    const step = 26;
    ctx.save();

    // left wall
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, startY - 20);
    let x = 0;
    for (let y = startY - 20; y <= H + 30; y += step) {
      const d = (y - H / 2) / this.scale + camY;
      const w = 26 + Math.sin(d * 0.11 + 1.7) * 12 + Math.sin(d * 0.31) * 6;
      ctx.lineTo(w, y + 4);
      x = w;
    }
    ctx.lineTo(0, H + 30);
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, 0, 90, 0);
    lg.addColorStop(0, 'rgba(1,7,12,0.96)');
    lg.addColorStop(0.7, 'rgba(2,12,19,0.7)');
    lg.addColorStop(1, 'rgba(2,12,19,0)');
    ctx.fillStyle = lg;
    ctx.fill();

    // right wall
    ctx.beginPath();
    ctx.moveTo(W, H + 30);
    ctx.lineTo(W, startY + 30);
    for (let y = startY + 30; y <= H + 40; y += step) {
      const d = (y - H / 2) / this.scale + camY;
      const w = W - (30 + Math.sin(d * 0.09 + 4.2) * 16 + Math.sin(d * 0.27) * 7);
      ctx.lineTo(w, y + 6);
    }
    ctx.lineTo(W, H + 40);
    ctx.closePath();
    const rg = ctx.createLinearGradient(W, 0, W - 100, 0);
    rg.addColorStop(0, 'rgba(1,6,11,0.97)');
    rg.addColorStop(0.72, 'rgba(2,10,17,0.65)');
    rg.addColorStop(1, 'rgba(2,10,17,0)');
    ctx.fillStyle = rg;
    ctx.fill();

    // rim highlights
    ctx.strokeStyle = 'rgba(70,150,175,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = startY; y <= H; y += step) {
      const d = (y - H / 2) / this.scale + camY;
      const w = 26 + Math.sin(d * 0.11 + 1.7) * 12 + Math.sin(d * 0.31) * 6;
      if (y === startY) ctx.moveTo(w, y + 4); else ctx.lineTo(w, y + 4);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawShelf(camY, t) {
    const { ctx } = this;
    const top = this.mapY(54);
    const bot = this.mapY(92);
    if (bot < -20 || top > this.H + 20) return;

    ctx.save();

    // left shelf
    const pts = [
      [0, 57], [7, 58.5], [13, 61], [21, 63.5], [29, 68], [33, 74], [28, 80], [17, 84], [7, 88], [0, 90],
    ];
    ctx.beginPath();
    ctx.moveTo(this.mapX(0), this.mapY(57));
    for (const [x, d] of pts) ctx.lineTo(this.mapX(x), this.mapY(d));
    ctx.lineTo(this.mapX(0), this.mapY(102));
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, top, 0, bot);
    lg.addColorStop(0, 'rgba(11,35,45,0.9)');
    lg.addColorStop(0.4, 'rgba(5,20,28,0.96)');
    lg.addColorStop(1, 'rgba(1,6,10,1)');
    ctx.fillStyle = lg;
    ctx.fill();

    // rim light on shelf edge
    ctx.beginPath();
    ctx.moveTo(this.mapX(0), this.mapY(57));
    for (const [x, d] of pts) ctx.lineTo(this.mapX(x), this.mapY(d));
    ctx.strokeStyle = 'rgba(105,220,225,0.32)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // rock shelves / cracks
    ctx.strokeStyle = 'rgba(90,175,185,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(this.mapX(2), this.mapY(61 + i * 4.5));
      ctx.bezierCurveTo(
        this.mapX(12), this.mapY(63 + i * 4.2),
        this.mapX(20), this.mapY(67 + i * 4.4),
        this.mapX(30), this.mapY(69 + i * 4.1)
      );
      ctx.stroke();
    }

    // bioluminescent growth along the shelf lip
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 22; i++) {
      const bx = 1 + i * 1.4;
      const bd = 57.6 + Math.sin(i * 0.9) * 1.8 + i * 0.18;
      const a = 0.16 + (Math.sin(t * 1.6 + i) * 0.5 + 0.5) * 0.3;
      ctx.fillStyle = `rgba(90,255,220,${a})`;
      ctx.beginPath();
      ctx.arc(this.mapX(bx), this.mapY(bd), 1.3, 0, TAU);
      ctx.fill();
      if (i % 3 === 0) {
        const gg = ctx.createRadialGradient(this.mapX(bx), this.mapY(bd), 0, this.mapX(bx), this.mapY(bd), 10);
        gg.addColorStop(0, `rgba(80,255,210,${a * 0.35})`);
        gg.addColorStop(1, 'rgba(80,255,210,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(this.mapX(bx) - 10, this.mapY(bd) - 10, 20, 20);
      }
    }
    ctx.restore();

    // right shelf
    const rpts = [
      [120, 84], [111, 82], [102, 84], [96, 88], [92, 95], [100, 101], [112, 104], [120, 103],
    ];
    ctx.beginPath();
    ctx.moveTo(this.mapX(120), this.mapY(84));
    for (const [x, d] of rpts) ctx.lineTo(this.mapX(x), this.mapY(d));
    ctx.lineTo(this.mapX(120), this.mapY(115));
    ctx.closePath();
    const rg = ctx.createLinearGradient(0, this.mapY(82), 0, this.mapY(110));
    rg.addColorStop(0, 'rgba(9,31,41,0.9)');
    rg.addColorStop(1, 'rgba(1,6,10,1)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(this.mapX(120), this.mapY(84));
    for (const [x, d] of rpts) ctx.lineTo(this.mapX(x), this.mapY(d));
    ctx.strokeStyle = 'rgba(105,220,225,0.2)';
    ctx.stroke();

    // boulders on the shelf lip
    for (let i = 0; i < 8; i++) {
      const bx = 4 + i * 3.6;
      const bd = 59 + Math.sin(i * 1.9) * 2.2;
      const s = this.scale;
      ctx.fillStyle = 'rgba(2,10,15,0.96)';
      ctx.beginPath();
      ctx.ellipse(this.mapX(bx), this.mapY(bd), s * (0.7 + (i % 3) * 0.4), s * (0.35 + (i % 2) * 0.2), 0.2, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSpires(camY, t) {
    const { ctx } = this;
    for (const sp of this.spires) {
      const tip = this.mapY(sp.base - sp.h);
      const base = this.mapY(sp.base);
      if (base < -20 || tip > this.H + 20) continue;
      const x = this.mapX(sp.x);
      const w = sp.w * this.scale;
      const sway = Math.sin(t * 0.2 + sp.x) * 1.5;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - w, base);
      ctx.lineTo(x - w * 0.7 + sway, base - (base - tip) * 0.35);
      ctx.lineTo(x - w * 0.35, base - (base - tip) * 0.7);
      ctx.lineTo(x + sp.lean * w * 0.4, tip);
      ctx.lineTo(x + w * 0.55, tip + (base - tip) * 0.28);
      ctx.lineTo(x + w * 0.85, base - (base - tip) * 0.08);
      ctx.lineTo(x + w, base);
      ctx.closePath();
      const g = ctx.createLinearGradient(x, tip, x, base);
      g.addColorStop(0, 'rgba(24,58,68,0.88)');
      g.addColorStop(0.35, 'rgba(8,28,38,0.95)');
      g.addColorStop(1, 'rgba(1,7,11,1)');
      ctx.fillStyle = g;
      ctx.fill();
      // rim
      ctx.strokeStyle = 'rgba(110,225,225,0.3)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + sp.lean * w * 0.4, tip);
      ctx.lineTo(x + w * 0.55, tip + (base - tip) * 0.28);
      ctx.lineTo(x + w * 0.85, base - (base - tip) * 0.08);
      ctx.stroke();
      // little ledges
      ctx.strokeStyle = 'rgba(60,140,155,0.08)';
      for (let i = 1; i < 4; i++) {
        const yy = tip + (base - tip) * (0.25 + i * 0.17);
        ctx.beginPath();
        ctx.moveTo(x - w * 0.3, yy);
        ctx.lineTo(x + w * 0.55, yy + 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawWhale(camY, t) {
    if (camY < 72 || camY > 250) return;
    const { ctx } = this;
    const depth = 150 + Math.sin(t * 0.06) * 10;
    const x = 58 + Math.sin(t * 0.021) * 26;
    const s = this.scale * 0.9;
    const y = this.mapY(depth);
    if (y < -180 || y > this.H + 180) return;
    ctx.save();
    ctx.translate(this.mapX(x), y);
    ctx.scale(1, 0.42);
    ctx.fillStyle = 'rgba(2,12,18,0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 23 * s, 9 * s, 0.05, 0, TAU);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(-22 * s, 0);
    ctx.quadraticCurveTo(-29 * s, -6 * s, -36 * s, -10 * s);
    ctx.quadraticCurveTo(-31 * s, -1 * s, -36 * s, 9 * s);
    ctx.quadraticCurveTo(-28 * s, 5 * s, -22 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    // pectoral fin
    ctx.beginPath();
    ctx.moveTo(2 * s, 6 * s);
    ctx.quadraticCurveTo(-5 * s, 15 * s, -12 * s, 17 * s);
    ctx.quadraticCurveTo(-4 * s, 9 * s, -1 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    // faint glowing eye
    ctx.fillStyle = 'rgba(120,240,235,0.22)';
    ctx.beginPath();
    ctx.arc(17 * s, 0.8 * s, Math.max(1, 0.5 * s), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCaustics(camY, t) {
    if (camY > 110) return;
    const { ctx, W } = this;
    const y0 = this.mapY(0);
    const fade = clamp(1 - camY / 110, 0, 1) * 0.7;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, Math.max(0, y0), W, this.H - Math.max(0, y0));
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(150,245,255,${0.035 * fade})`;
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 7; row++) {
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 16) {
        const yy = y0 + 18 + row * 34 + Math.sin(x * 0.03 + t * 0.7 + row * 1.4) * 6 + Math.sin(x * 0.011 - t * 0.4) * 10;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawKelp(camY, t) {
    const { ctx } = this;
    for (const k of this.kelp) {
      if (k.depth - k.height > camY + 45 || k.depth < camY - 55) continue;
      const bx = this.mapX(k.x);
      const by = this.mapY(k.depth);
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = `hsla(${k.hue}, 48%, 36%, 0.95)`;
      ctx.lineWidth = k.width * 0.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const sway = Math.sin(t * 0.55 + k.phase) * 4;
      const midX = bx + sway * 0.5;
      const midY = by - k.height * 0.5 * this.scale * 0.5;
      const tipX = bx + sway;
      const tipY = by - k.height * this.scale * 0.5;
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();
      // blades
      for (let i = 1; i <= 4; i++) {
        const p = i / 5;
        const px = lerp(lerp(bx, midX, p * 2), tipX, Math.max(0, p * 2 - 1));
        const py = lerp(lerp(by, midY, p * 2), tipY, Math.max(0, p * 2 - 1));
        const dir = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + dir * 8, py - 4, px + dir * 11, py - 9);
        ctx.strokeStyle = `hsla(${k.hue}, 50%, 40%, 0.7)`;
        ctx.lineWidth = k.width * 0.38;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawSeabed(camY, t) {
    const { ctx, W, H } = this;
    const floorY = this.mapY(WORLD.floor);
    if (floorY < -60) return;
    const rnd = mulberry32(991);
    const g = ctx.createLinearGradient(0, floorY - 40, 0, H);
    g.addColorStop(0, 'rgba(1,10,15,0.4)');
    g.addColorStop(0.35, 'rgba(2,12,17,0.95)');
    g.addColorStop(1, 'rgba(0,3,7,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    let yy = floorY;
    ctx.lineTo(0, floorY + 8);
    for (let x = 0; x <= W + 20; x += 34) {
      const n = Math.sin(x * 0.013 + 1.2) * 9 + Math.sin(x * 0.037) * 5;
      ctx.lineTo(x, floorY + 6 + n);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // rocks
    for (let i = 0; i < 12; i++) {
      const rx = rnd() * W;
      const rw = 12 + rnd() * 42;
      const rh = 5 + rnd() * 16;
      const ry = floorY + 10 + rnd() * 26;
      ctx.fillStyle = 'rgba(1,7,12,0.9)';
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWreck(camY, t, special) {
    const { ctx } = this;
    const y = this.mapY(292);
    if (y < -260 || y > this.H + 260) return;
    const x = this.mapX(58);
    const s = this.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.06);

    // shadowy freighter hull, roughly 55 m long
    ctx.fillStyle = 'rgba(2,7,11,0.94)';
    ctx.beginPath();
    ctx.moveTo(-25 * s, 6 * s);
    ctx.lineTo(-23 * s, 0.4 * s);
    ctx.lineTo(-12 * s, -0.8 * s);
    ctx.lineTo(6 * s, -0.4 * s);
    ctx.lineTo(23 * s, 1.8 * s);
    ctx.lineTo(27 * s, 5.4 * s);
    ctx.lineTo(23 * s, 9 * s);
    ctx.lineTo(-19 * s, 10 * s);
    ctx.closePath();
    ctx.fill();

    // deck rail / rim light
    ctx.strokeStyle = 'rgba(90,180,195,0.2)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-23 * s, 0.45 * s);
    ctx.lineTo(-12 * s, -0.75 * s);
    ctx.lineTo(6 * s, -0.35 * s);
    ctx.lineTo(23 * s, 1.85 * s);
    ctx.stroke();

    // broken superstructure
    ctx.fillStyle = 'rgba(2,9,14,0.96)';
    ctx.beginPath();
    ctx.moveTo(-2 * s, 0);
    ctx.lineTo(1 * s, -6 * s);
    ctx.lineTo(10 * s, -6.4 * s);
    ctx.lineTo(13 * s, -1 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,165,180,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // windows
    const winGlow = ctx.createRadialGradient(8 * s, -3 * s, 0, 8 * s, -3 * s, 7 * s);
    winGlow.addColorStop(0, 'rgba(80,220,220,0.14)');
    winGlow.addColorStop(1, 'rgba(80,220,220,0)');
    ctx.fillStyle = winGlow;
    ctx.fillRect(-4 * s, -9 * s, 20 * s, 14 * s);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(100,225,225,${0.12 + Math.sin(t * 1.3 + i) * 0.04})`;
      ctx.fillRect((3.4 + i * 2.3) * s, -4.2 * s, 0.9 * s, 1.1 * s);
    }

    // hull portholes
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = 'rgba(70,190,200,0.09)';
      ctx.beginPath();
      ctx.arc((-17 + i * 5.4) * s, 5.2 * s, 0.55 * s, 0, TAU);
      ctx.fill();
    }

    // broken ribs / exposed deck
    ctx.strokeStyle = 'rgba(90,160,175,0.15)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 8; i++) {
      const rx = (-19 + i * 5.2) * s;
      ctx.beginPath();
      ctx.moveTo(rx, 1.2 * s);
      ctx.lineTo(rx + 0.5 * s, -2.4 * s);
      ctx.stroke();
    }

    // debris field
    ctx.fillStyle = 'rgba(2,8,12,0.86)';
    ctx.fillRect(-31 * s, 8.4 * s, 7 * s, 1.4 * s);
    ctx.fillRect(26 * s, 7.2 * s, 5 * s, 1.1 * s);
    ctx.restore();

    if (special) {
      // beacon beam upward
      const bx = this.mapX(58);
      const by = this.mapY(288);
      const beam = ctx.createLinearGradient(0, by - 260, 0, by);
      beam.addColorStop(0, 'rgba(255,150,80,0)');
      beam.addColorStop(0.7, 'rgba(255,140,70,0.035)');
      beam.addColorStop(1, 'rgba(255,140,70,0.14)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = beam;
      ctx.fillRect(bx - 9, by - 260, 18, 260);
      ctx.restore();
    }
  }

  drawVents(run, t) {
    const { ctx } = this;
    for (const v of run.vents) {
      const x = this.mapX(v.x);
      const y = this.mapY(v.depth);
      if (y < -60 || y > this.H + 40) continue;
      const ph = (t * v.rate + v.phase) % 1;
      for (let i = 0; i < 3; i++) {
        const p = (ph + i / 3) % 1;
        const yy = y - p * 26;
        const xx = x + Math.sin(p * 6 + v.phase) * 5;
        ctx.fillStyle = `rgba(120,210,220,${0.05 * (1 - p)})`;
        ctx.beginPath();
        ctx.arc(xx, yy, 3 + p * 5, 0, TAU);
        ctx.fill();
      }
    }
  }

  // ============================================================
  // ENTITIES
  // ============================================================
  drawLoot(it, t) {
    if (it.taken) return;
    const { ctx } = this;
    const x = this.mapX(it.x);
    const y = this.mapY(it.depth + Math.sin(t * 1.3 + it.bob) * 0.22);
    const s = this.scale * 1.0;
    const tier = TIER[Math.min(3, it.tier)];
    const pulse = 0.6 + Math.sin(t * 2 + it.phase) * 0.4;

    if (it.kind === 'blackbox') {
      this.drawBlackBox(x, y, s, t);
      return;
    }

    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 6);
    glow.addColorStop(0, `rgba(${tier[1]},${0.16 + pulse * 0.13})`);
    glow.addColorStop(0.5, `rgba(${tier[1]},0.05)`);
    glow.addColorStop(1, `rgba(${tier[1]},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - s * 6, y - s * 6, s * 12, s * 12);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(t * 1.3 + it.phase) * 0.5;
    ctx.rotate(Math.sin(it.phase + t * 0.5) * 0.08);
    ctx.translate(0, bob);

    if (it.kind === 'crate') {
      ctx.fillStyle = '#4b3520';
      ctx.fillRect(-s * 0.85, -s * 0.62, s * 1.7, s * 1.24);
      ctx.fillStyle = `rgba(${tier[1]},0.32)`;
      ctx.fillRect(-s * 0.85, -s * 0.62, s * 1.7, s * 0.16);
      ctx.fillRect(-s * 0.85, s * 0.34, s * 1.7, s * 0.16);
      ctx.strokeStyle = `rgba(${tier[1]},0.55)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(-s * 0.85, -s * 0.62, s * 1.7, s * 1.24);
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0);
      ctx.moveTo(0, -s * 0.6); ctx.lineTo(0, s * 0.6);
      ctx.strokeStyle = `rgba(${tier[1]},0.22)`;
      ctx.stroke();
      // emblem
      ctx.fillStyle = `rgba(${tier[1]},${0.5 + pulse * 0.4})`;
      ctx.fillRect(-s * 0.13, -s * 0.13, s * 0.26, s * 0.26);
    } else if (it.kind === 'urn') {
      ctx.fillStyle = '#2a3a3c';
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.6);
      ctx.bezierCurveTo(-s * 0.9, -s * 0.1, -s * 0.65, s * 0.7, 0, s * 0.72);
      ctx.bezierCurveTo(s * 0.65, s * 0.7, s * 0.9, -s * 0.1, s * 0.5, -s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(${tier[1]},0.45)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = `rgba(${tier[1]},0.4)`;
      ctx.fillRect(-s * 0.28, -s * 0.8, s * 0.56, s * 0.22);
      ctx.beginPath();
      ctx.arc(0, 0.1, s * 0.22, 0, TAU);
      ctx.stroke();
    } else {
      // barrel
      ctx.fillStyle = '#253b3c';
      ctx.beginPath();
      ctx.roundRect(-s * 0.55, -s * 0.8, s * 1.1, s * 1.6, s * 0.2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${tier[1]},0.4)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = `rgba(${tier[1]},0.28)`;
      ctx.fillRect(-s * 0.58, -s * 0.25, s * 1.16, s * 0.16);
      ctx.fillRect(-s * 0.58, s * 0.18, s * 1.16, s * 0.16);
      ctx.fillStyle = `rgba(${tier[1]},0.6)`;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.09, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBlackBox(x, y, s, t) {
    const { ctx } = this;
    const pulse = (Math.sin(t * 3) + 1) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 8);
    glow.addColorStop(0, `rgba(255,130,70,${0.2 + pulse * 0.18})`);
    glow.addColorStop(1, 'rgba(255,130,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - s * 8, y - s * 8, s * 16, s * 16);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(t * 1.1) * 0.8;
    ctx.translate(0, bob);
    ctx.fillStyle = '#241a12';
    ctx.fillRect(-s * 1.15, -s * 0.62, s * 2.3, s * 1.24);
    ctx.strokeStyle = 'rgba(255,170,90,0.75)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-s * 1.15, -s * 0.62, s * 2.3, s * 1.24);
    ctx.fillStyle = 'rgba(255,180,90,0.16)';
    ctx.fillRect(-s * 0.98, -s * 0.45, s * 1.96, s * 0.9);
    // signal light
    ctx.fillStyle = pulse > 0.5 ? '#ffb15c' : '#7a3a18';
    ctx.beginPath();
    ctx.arc(s * 0.78, -s * 0.3, s * 0.12, 0, TAU);
    ctx.fill();
    // stripes
    ctx.fillStyle = 'rgba(255,160,80,0.45)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.8, -s * 0.2 + i * s * 0.22, s * 1.6, s * 0.06);
    ctx.restore();

    // floating label
    ctx.save();
    ctx.font = `600 ${Math.max(8, s * 0.62)}px ui-monospace, monospace`;
    ctx.fillStyle = `rgba(255,190,130,${0.5 + pulse * 0.4})`;
    ctx.textAlign = 'center';
    ctx.fillText('BLACK BOX', x, y - s * 2.2);
    ctx.restore();
  }

  drawCanister(c, t) {
    if (c.taken) return;
    const { ctx } = this;
    const x = this.mapX(c.x);
    const y = this.mapY(c.depth + Math.sin(t * 1.6 + c.phase) * 0.25);
    const s = this.scale * 0.9;
    const pulse = 0.55 + Math.sin(t * 2.6 + c.phase) * 0.45;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 6.5);
    glow.addColorStop(0, `rgba(80,255,220,${0.11 + pulse * 0.12})`);
    glow.addColorStop(1, 'rgba(80,255,220,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - s * 7, y - s * 7, s * 14, s * 14);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#0d4a4a';
    ctx.beginPath();
    ctx.roundRect(-s * 0.48, -s * 0.85, s * 0.96, s * 1.7, s * 0.3);
    ctx.fill();
    ctx.strokeStyle = `rgba(90,255,225,${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(140,255,235,0.75)';
    ctx.fillRect(-s * 0.18, -s * 0.85, s * 0.36, s * 0.28);
    ctx.fillStyle = '#8ffff0';
    ctx.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s * 0.6);
    ctx.fillRect(-s * 0.24, -s * 0.26, s * 0.48, s * 0.12);
    ctx.restore();
  }

  drawJelly(j, t) {
    const { ctx } = this;
    const d = j.renderDepth ?? j.depth;
    const x = this.mapX(j.x);
    const y = this.mapY(d);
    const s = this.scale * 1.05 * j.size;
    if (y < -80 || y > this.H + 80) return;

    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + Math.sin(t * 1.6 + j.phase) * 0.09;
    ctx.scale(pulse, 2 - pulse);

    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3.2);
    glow.addColorStop(0, 'rgba(255,120,190,0.14)');
    glow.addColorStop(0.5, 'rgba(180,90,255,0.05)');
    glow.addColorStop(1, 'rgba(180,90,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-s * 3.4, -s * 3.4, s * 6.8, s * 6.8);
    ctx.restore();

    // tentacles
    ctx.strokeStyle = 'rgba(255,150,205,0.3)';
    ctx.lineWidth = Math.max(0.7, s * 0.05);
    for (let i = 0; i < 6; i++) {
      const ox = (i - 2.5) * s * 0.16;
      ctx.beginPath();
      ctx.moveTo(ox, s * 0.2);
      ctx.bezierCurveTo(
        ox + Math.sin(t * 1.1 + i) * s * 0.25, s * 0.9,
        ox + Math.sin(t * 0.9 + i * 2) * s * 0.3, s * 1.4,
        ox + Math.sin(t * 1.3 + i) * s * 0.15, s * 2
      );
      ctx.stroke();
    }

    // bell
    const bell = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.35);
    bell.addColorStop(0, 'rgba(255,190,230,0.42)');
    bell.addColorStop(0.5, 'rgba(225,120,220,0.24)');
    bell.addColorStop(1, 'rgba(140,80,220,0.06)');
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, s * 0.1);
    ctx.bezierCurveTo(-s * 0.72, -s * 0.7, s * 0.72, -s * 0.7, s * 0.6, s * 0.1);
    ctx.bezierCurveTo(s * 0.4, s * 0.34, -s * 0.4, s * 0.34, -s * 0.6, s * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,235,0.5)';
    ctx.lineWidth = Math.max(0.6, s * 0.035);
    ctx.stroke();
    // rim glow
    ctx.strokeStyle = 'rgba(255,220,250,0.7)';
    ctx.beginPath();
    ctx.moveTo(-s * 0.58, s * 0.11);
    ctx.quadraticCurveTo(0, s * 0.3, s * 0.58, s * 0.11);
    ctx.stroke();
    ctx.restore();
  }

  drawFish(f, t) {
    const { ctx } = this;
    const x = this.mapX(f.x);
    const y = this.mapY(f.depth + Math.sin(t * f.wobble + f.phase) * 1.2);
    const s = this.scale * 0.55 * f.size;
    if (x < -30 || x > this.W + 30 || y < -20 || y > this.H + 20) return;
    const dir = f.speed >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    if (f.deep) {
      ctx.fillStyle = 'rgba(70,140,170,0.24)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 2.1, s * 0.7, 0.12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,255,230,0.5)';
      ctx.beginPath();
      ctx.arc(s * 1.4, -s * 0.1, Math.max(0.7, s * 0.13), 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(6,26,36,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 2.2, s * 0.72, 0.1, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 1.8, 0);
      ctx.lineTo(-s * 3, -s * 0.8);
      ctx.lineTo(-s * 2.7, s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawDiver(run, t, xDepth, opts = {}) {
    const { ctx } = this;
    const x = this.mapX(xDepth.x);
    const y = this.mapY(xDepth.depth);
    const s = this.scale * 0.148;
    const vx = opts.vx ?? 0;
    const vy = opts.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    let target = Math.atan2(vy, vx || 0.001);
    if (speed < 0.5) target = opts.idleAngle ?? -0.08;
    // smooth
    let diff = target - this.diverAngle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    this.diverAngle += diff * 0.18;
    const angle = clamp(this.diverAngle, -1.25, 1.25);
    const facing = vx < -0.2 ? -1 : 1;

    // green glow around diver
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 26);
    glow.addColorStop(0, 'rgba(120,235,255,0.16)');
    glow.addColorStop(0.4, 'rgba(70,190,220,0.05)');
    glow.addColorStop(1, 'rgba(70,190,220,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - s * 27, y - s * 27, s * 54, s * 54);
    ctx.restore();

    // lamp bloom behind the body
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lampGlow = ctx.createRadialGradient(x + facing * s * 13, y, 0, x + facing * s * 13, y, s * 7);
    lampGlow.addColorStop(0, 'rgba(225,255,255,0.55)');
    lampGlow.addColorStop(0.3, 'rgba(160,245,255,0.18)');
    lampGlow.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = lampGlow;
    ctx.fillRect(x + facing * s * 13 - s * 7, y - s * 7, s * 14, s * 14);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(facing, 1);
    if (run?.invuln > 0 && Math.floor(t * 12) % 2 === 0) ctx.globalAlpha = 0.5;

    const kick = Math.sin(t * (speed > 2 ? 14 : 7)) * (0.35 + Math.min(0.65, speed / 6));

    // trailing fins / legs
    ctx.strokeStyle = '#08141c';
    ctx.lineWidth = s * 2.2;
    ctx.lineCap = 'round';
    for (let leg = 0; leg < 2; leg++) {
      const side = leg === 0 ? -1 : 1;
      const k = kick * side;
      ctx.beginPath();
      ctx.moveTo(-s * 5, side * s * 1.2);
      ctx.quadraticCurveTo(-s * 10, side * s * 2.4 + k * s * 3, -s * 14, side * s * 2.4 + k * s * 5.5);
      ctx.strokeStyle = leg === 0 ? '#0a1a24' : '#0d202b';
      ctx.lineWidth = s * 2;
      ctx.stroke();
      // fin
      ctx.save();
      ctx.translate(-s * 14, side * s * 2.4 + k * s * 5.5);
      ctx.rotate(k * 0.5 - 0.15);
      ctx.fillStyle = leg === 0 ? '#c98f3a' : '#e0a445';
      ctx.beginPath();
      ctx.ellipse(-s * 2.8, 0, s * 3.6, s * 0.85, 0.16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,225,150,0.4)';
      ctx.beginPath();
      ctx.ellipse(-s * 3.2, -s * 0.18, s * 2.4, s * 0.32, 0.16, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // tank
    ctx.save();
    ctx.translate(-s * 2.2, -s * 4.4);
    ctx.rotate(-0.1);
    ctx.fillStyle = '#16262c';
    ctx.beginPath();
    ctx.roundRect(-s * 3.4, -s * 1.7, s * 7.4, s * 3.4, s * 1.2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,220,230,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,245,255,0.35)';
    ctx.fillRect(-s * 2.6, -s * 1.2, s * 1.4, s * 2.4);
    ctx.fillStyle = '#c98f3a';
    ctx.fillRect(s * 3.2, -s * 0.55, s * 0.8, s * 1.1);
    ctx.restore();

    // body
    const body = ctx.createLinearGradient(-s * 6, -s * 4, s * 8, s * 5);
    body.addColorStop(0, '#0a151d');
    body.addColorStop(0.55, '#122a36');
    body.addColorStop(1, '#2a5c6b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(s * 1.5, 0, s * 8.2, s * 3.2, 0.02, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,225,245,0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // back rim light
    ctx.strokeStyle = 'rgba(175,250,255,0.28)';
    ctx.lineWidth = s * 0.3;
    ctx.beginPath();
    ctx.ellipse(s * 1.5, -s * 0.35, s * 7.7, s * 2.5, 0.03, -2.6, -0.5);
    ctx.stroke();
    // harness strap
    ctx.strokeStyle = 'rgba(210,170,90,0.4)';
    ctx.lineWidth = s * 0.38;
    ctx.beginPath();
    ctx.moveTo(-s * 1.2, -s * 2.7);
    ctx.lineTo(s * 0.4, s * 2.8);
    ctx.stroke();

    // shoulder + arm
    ctx.strokeStyle = '#0d1f29';
    ctx.lineWidth = s * 1.9;
    ctx.beginPath();
    ctx.moveTo(s * 5.8, s * 1.2);
    ctx.quadraticCurveTo(s * 7, s * 4, s * 4.6, s * 5.6);
    ctx.stroke();
    // glove
    ctx.fillStyle = '#1d3a45';
    ctx.beginPath();
    ctx.arc(s * 4.4, s * 5.7, s * 1.1, 0, TAU);
    ctx.fill();

    // oxygen hose
    ctx.strokeStyle = 'rgba(120,200,210,0.35)';
    ctx.lineWidth = s * 0.55;
    ctx.beginPath();
    ctx.moveTo(-s * 4.5, -s * 3.2);
    ctx.quadraticCurveTo(-s * 6.5, -s * 1, -s * 3.5, s * 0.5);
    ctx.stroke();

    // head + helmet
    ctx.fillStyle = '#0d202a';
    ctx.beginPath();
    ctx.arc(s * 9.2, -s * 0.4, s * 3.15, 0, TAU);
    ctx.fill();
    // helmet shell
    ctx.fillStyle = '#17313b';
    ctx.beginPath();
    ctx.arc(s * 9.2, -s * 0.4, s * 3.4, 0, TAU);
    ctx.fill();
    // visor
    const visor = ctx.createLinearGradient(s * 7.5, -s * 3, s * 12, s * 2);
    visor.addColorStop(0, 'rgba(130,245,255,0.85)');
    visor.addColorStop(0.6, 'rgba(70,190,220,0.5)');
    visor.addColorStop(1, 'rgba(20,80,100,0.35)');
    ctx.fillStyle = visor;
    ctx.beginPath();
    ctx.ellipse(s * 10.3, -s * 0.3, s * 2.2, s * 2.6, 0.08, -1.9, 1.9);
    ctx.fill();
    // visor shine
    ctx.fillStyle = 'rgba(240,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(s * 10, -s * 1.3, s * 1, s * 0.45, -0.4, 0, TAU);
    ctx.fill();

    // lamp housing
    ctx.fillStyle = '#c98f3a';
    ctx.fillRect(s * 12, -s * 1.4, s * 1.5, s * 2.8);
    ctx.fillStyle = '#fff8d8';
    ctx.beginPath();
    ctx.arc(s * 13.7, 0, s * 1.15, 0, TAU);
    ctx.fill();

    // tiny glints
    ctx.fillStyle = 'rgba(255,235,170,0.9)';
    ctx.beginPath();
    ctx.arc(s * 13.7, 0, s * 0.4, 0, TAU);
    ctx.fill();

    ctx.restore();

    // ---- headlamp beam ----
    if (!opts.noBeam) {
      const lamp = (run?.gear?.lamp || 15) * this.scale * 1.15;
      const dir = facing;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const bx = x + dir * s * 13;
      const by = y;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, lamp);
      g.addColorStop(0, 'rgba(180,248,255,0.15)');
      g.addColorStop(0.28, 'rgba(120,225,245,0.05)');
      g.addColorStop(0.7, 'rgba(80,195,220,0.018)');
      g.addColorStop(1, 'rgba(70,180,210,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.arc(bx, by, lamp, -0.55 + (dir < 0 ? Math.PI : 0), 0.55 + (dir < 0 ? Math.PI : 0));
      ctx.closePath();
      ctx.fill();

      // dust motes suspended in the beam
      const baseAng = dir < 0 ? Math.PI - 0.3 : 0.3;
      for (let i = 0; i < 16; i++) {
        const tt = ((t * 0.11 + i * 0.17) % 1);
        const ang = baseAng + Math.sin(i * 4.1 + t * 0.8) * 0.34;
        const dist = lamp * (0.12 + tt * 0.82);
        const px = bx + Math.cos(ang) * dist;
        const py = by + Math.sin(ang) * dist;
        const a = (1 - tt) * (0.12 + (i % 3) * 0.05);
        ctx.fillStyle = `rgba(200,250,255,${a})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.7 + (i % 3) * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // bubbles from regulator
    if (!opts.noBubbles) {
      for (let i = 0; i < 3; i++) {
        const bp = ((t * 0.55 + i * 0.33) % 1);
        const bx = x - s * 1 + Math.sin(t * 3 + i) * 3;
        const by = y - s * 4 - bp * s * 22;
        ctx.strokeStyle = `rgba(180,245,255,${0.32 * (1 - bp)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(bx, by, 1 + bp * 2.4, 0, TAU);
        ctx.stroke();
      }
    }
  }

  drawLampBeam(xw, depth, lampMeters, facing, t) {
    const { ctx } = this;
    const x = this.mapX(xw);
    const y = this.mapY(depth);
    const s = this.scale * 0.148;
    const lamp = lampMeters * this.scale * 1.45;
    const bx = x + facing * s * 13;
    const by = y;
    const ang = facing > 0 ? 0.3 : Math.PI - 0.3;
    const spread = 0.52;
    if (by < -lamp || by > this.H + lamp) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, lamp, ang - spread, ang + spread);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, lamp);
    g.addColorStop(0, 'rgba(200,252,255,0.34)');
    g.addColorStop(0.18, 'rgba(150,240,255,0.14)');
    g.addColorStop(0.55, 'rgba(100,215,240,0.05)');
    g.addColorStop(1, 'rgba(80,190,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - lamp, by - lamp, lamp * 2, lamp * 2);

    // volumetric motes
    for (let i = 0; i < 26; i++) {
      const tt = ((t * 0.1 + i * 0.137) % 1);
      const a2 = ang + Math.sin(i * 4.7 + t * 0.7) * 0.42;
      const dist = lamp * (0.06 + tt * 0.9);
      const px = bx + Math.cos(a2) * dist;
      const py = by + Math.sin(a2) * dist;
      const aa = (1 - tt) * (0.08 + (i % 4) * 0.03);
      ctx.fillStyle = `rgba(210,252,255,${aa})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.6 + (i % 3) * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // LIGHTING + FX
  // ============================================================
  drawLighting(run, xDepth, t) {
    const { W, H, ctx } = this;
    const depth = xDepth.depth;
    const darkness = 0.10 + clamp(depth / 290, 0, 1) * 0.7;
    const lc = this.lctx;
    lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lc.clearRect(0, 0, W, H);
    lc.fillStyle = `rgba(0,3,8,${darkness})`;
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'destination-out';

    const x = this.mapX(xDepth.x);
    const y = this.mapY(xDepth.depth);
    const s = this.scale * 0.1;
    const lamp = (run?.gear?.lamp || 15) * this.scale * 1.35;

    // soft bubble of visibility around the diver
    const amb = lamp * 0.42;
    const ag = lc.createRadialGradient(x, y, 0, x, y, amb);
    ag.addColorStop(0, 'rgba(0,0,0,1)');
    ag.addColorStop(0.5, 'rgba(0,0,0,0.72)');
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = ag;
    lc.beginPath();
    lc.arc(x, y, amb, 0, TAU);
    lc.fill();

    // directional headlamp cone (layered for soft edges)
    const facing = (run?.vx || 0) < -0.2 ? -1 : 1;
    const dirAng = facing > 0 ? 0.32 : Math.PI - 0.32;
    const bx = x + facing * s * 12;
    const by = y;
    for (let i = 0; i < 4; i++) {
      const spread = 0.66 - i * 0.11;
      const alpha = 0.3 + i * 0.18;
      lc.save();
      lc.beginPath();
      lc.moveTo(bx, by);
      lc.arc(bx, by, lamp * (0.75 + i * 0.07), dirAng - spread, dirAng + spread);
      lc.closePath();
      lc.clip();
      const g = lc.createRadialGradient(bx, by, 0, bx, by, lamp * (0.75 + i * 0.07));
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(0, 0, W, H);
      lc.restore();
    }

    // surface light shaft
    if (this.camY < 90) {
      const waterY = this.mapY(0);
      const fade = clamp(1 - this.camY / 90, 0, 1);
      const wg = lc.createLinearGradient(0, waterY, 0, waterY + H * 0.75);
      wg.addColorStop(0, `rgba(0,0,0,${0.55 * fade})`);
      wg.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = wg;
      lc.fillRect(0, 0, W, H);
    }

    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.restore();

    // additive lamp bloom on top
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, lamp * 0.72);
    bloom.addColorStop(0, 'rgba(185,250,255,0.16)');
    bloom.addColorStop(0.3, 'rgba(110,225,245,0.06)');
    bloom.addColorStop(1, 'rgba(60,160,200,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(bx - lamp, by - lamp, lamp * 2, lamp * 2);
    ctx.restore();
  }

  drawCeiling(run, t) {
    const { ctx, W } = this;
    const c = run.ceiling;
    if (c == null || c < 0.8) return;
    const y = this.mapY(c);
    if (y < -30 || y > this.H + 30) return;

    ctx.save();
    // danger tint above the ceiling
    {
      const waterY = Math.max(0, this.mapY(0));
      if (y > waterY + 2) {
        const g = ctx.createLinearGradient(0, waterY, 0, y);
        g.addColorStop(0, 'rgba(255,60,50,0.015)');
        g.addColorStop(0.7, 'rgba(255,70,50,0.04)');
        g.addColorStop(1, 'rgba(255,90,60,0.09)');
        ctx.fillStyle = g;
        ctx.fillRect(0, waterY, W, y - waterY);
      }
    }

    // green off-gas band just below the line
    {
      const y2 = this.mapY(c + 6);
      const g = ctx.createLinearGradient(0, y, 0, y2);
      g.addColorStop(0, 'rgba(90,255,190,0.055)');
      g.addColorStop(1, 'rgba(90,255,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, Math.max(0, y2 - y));
    }

    // dashed line
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -t * 26;
    ctx.strokeStyle = 'rgba(255,180,84,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // glow
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(0, y - 16, 0, y + 16);
    g.addColorStop(0, 'rgba(255,150,60,0)');
    g.addColorStop(0.5, 'rgba(255,170,80,0.1)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 16, W, 32);
    ctx.globalCompositeOperation = 'source-over';

    // label
    const label = `N₂ CEILING  ${Math.round(c)} M`;
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(label).width;
    const lx = Math.min(W - tw - 44, 92);
    ctx.fillStyle = 'rgba(8,5,2,0.72)';
    ctx.fillRect(lx - 8, y - 24, tw + 16, 16);
    ctx.strokeStyle = 'rgba(255,180,84,0.35)';
    ctx.strokeRect(lx - 8, y - 24, tw + 16, 16);
    ctx.fillStyle = 'rgba(255,196,120,0.95)';
    ctx.fillText(label, lx, y - 12);
    ctx.font = '500 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,170,90,0.55)';
    ctx.fillText('SAFE TO HOLD BELOW', lx, y + 30);

    // chevrons pointing down
    ctx.strokeStyle = 'rgba(255,180,84,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const cx = (i + 0.5) * (W / 5) + Math.sin(t + i) * 3;
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 7);
      ctx.lineTo(cx, y + 11);
      ctx.lineTo(cx + 4, y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawScreenVignette(depth, bends) {
    const { W, H, ctx } = this;
    const v = ctx.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.7, 'rgba(0,4,8,0.14)');
    v.addColorStop(1, 'rgba(0,2,5,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    // faint deep blue top gradient
    if (depth > 180) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.35);
      g.addColorStop(0, `rgba(20,90,140,${0.03 + (depth - 180) / 6000})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.35);
    }
  }

  drawDepthRuler(run) {
    const { ctx, W, H } = this;
    const x = W - 18;
    const top = 120;
    const bottom = H - 150;
    if (bottom - top < 120) return;
    const meters = (bottom - top) / this.scale;
    const start = this.camY - meters / 2;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(150,230,250,0.2)';
    ctx.fillStyle = 'rgba(160,235,250,0.42)';
    ctx.font = '7px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let m = Math.ceil(start / 10) * 10; m < start + meters; m += 10) {
      if (m < 0 || m > WORLD.floor) continue;
      const y = top + ((m - start) / meters) * (bottom - top);
      const major = m % 50 === 0;
      ctx.beginPath();
      ctx.moveTo(x - (major ? 9 : 4), y);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (major) ctx.fillText(String(m), x - 12, y + 2.4);
    }
    // current depth marker
    const dy = top + ((run.depth - start) / meters) * (bottom - top);
    if (dy > top - 4 && dy < bottom + 4) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#7defff';
      ctx.beginPath();
      ctx.moveTo(x + 1, dy);
      ctx.lineTo(x - 6, dy - 4);
      ctx.lineTo(x - 6, dy + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawOffscreenMarkers(run, t) {
    if (!run) return;
    const { ctx, W, H } = this;
    const x = this.mapX(run.x);
    const y = this.mapY(run.depth);
    const items = [];
    for (const c of run.canisters) {
      if (c.taken) continue;
      const dy = c.depth - run.depth;
      if (Math.abs(dy) < 34 && (Math.abs(c.x - run.x) > this.visW / 2 - 3)) items.push({ x: c.x, depth: c.depth, col: '90,255,225', kind: 'air' });
    }
    for (const it of run.items) {
      if (!it.special || it.taken) continue;
      items.push({ x: it.x, depth: it.depth, col: '255,160,85', kind: 'box' });
    }
    for (const m of items) {
      const mx = this.mapX(m.x);
      const my = this.mapY(m.depth);
      if (mx > 12 && mx < W - 12 && my > 20 && my < H - 20) continue;
      const edge = mx < 12 ? 18 : mx > W - 12 ? W - 18 : clamp(mx, 18, W - 18);
      const ey = clamp(my, 44, H - 44);
      const ang = Math.atan2(my - ey, mx - edge);
      ctx.save();
      ctx.translate(edge, ey);
      ctx.rotate(ang);
      ctx.fillStyle = `rgba(${m.col},${0.5 + Math.sin(t * 3) * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(m.x - run.x, m.depth - run.depth));
      ctx.save();
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillStyle = `rgba(${m.col},0.6)`;
      ctx.textAlign = 'center';
      ctx.fillText(`${d}M`, edge, ey + 14);
      ctx.restore();
    }
  }

  drawPickupTexts(run, t) {
    const { ctx } = this;
    for (const txt of run.texts) {
      const x = this.mapX(txt.x);
      const y = this.mapY(txt.depth);
      const a = clamp(txt.life / 1.4, 0, 1);
      ctx.save();
      ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,220,150,${a})`;
      ctx.shadowColor = 'rgba(255,180,90,0.8)';
      ctx.shadowBlur = 10;
      ctx.fillText(txt.text, x, y);
      ctx.restore();
    }
  }

  drawBendsBubbles(run, t) {
    const { ctx, W, H } = this;
    if (run.bends < 8 && !run.aboveCeiling) return;
    const intensity = clamp(run.bends / 100 + (run.aboveCeiling ? 0.2 : 0), 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i++) {
      const seed = i * 17.3;
      const x = ((Math.sin(seed) * 0.5 + 0.5) * W + t * (8 + i * 2)) % W;
      const y = H - ((t * (20 + i * 3) + seed * 20) % H);
      const r = 1 + (i % 4) * 1.4;
      ctx.strokeStyle = `rgba(255,120,120,${0.06 + intensity * 0.12})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCurrents(run, t) {
    if (!run || !run.currents.length) return;
    const { ctx, W, H } = this;
    for (const c of run.currents) {
      const y0 = this.mapY(c.depth - c.width / 2);
      const y1 = this.mapY(c.depth + c.width / 2);
      if (y1 < 0 || y0 > H) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 26; i++) {
        const seed = (i * 37 + this.currentSeed) % 100;
        const ph = ((t * 0.13 * (0.6 + (seed % 5) / 6) + seed / 100) % 1.25) - 0.12;
        const x = c.force > 0 ? ph * W : (1 - ph) * W;
        const y = y0 + ((seed * 7.1) % Math.max(1, y1 - y0));
        const len = 18 + (seed % 5) * 14;
        const a = 0.03 + (seed % 3) * 0.012;
        const g = ctx.createLinearGradient(x, y, x + Math.sign(c.force) * len, y);
        g.addColorStop(0, `rgba(140,235,250,${a})`);
        g.addColorStop(1, 'rgba(140,235,250,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sign(c.force) * len, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ============================================================
  // PUBLIC
  // ============================================================
  renderDive(run, t) {
    this.time = t;
    const { ctx, W, H } = this;
    this._setCam(run.camera);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawBackdrop(this.camY, t);
    this.drawSky(t);
    this.drawRays(this.camY, t);
    this.drawCaustics(this.camY, t);
    this.drawCliffs(this.camY);
    this.drawSpires(this.camY, t);
    this.drawShelf(this.camY, t);
    this.drawKelp(this.camY, t);
    this.drawSeabed(this.camY, t);
    this.drawWreck(this.camY, t, run.contract?.special);

    this.drawWhale(this.camY, t);

    // fish behind
    for (const f of run.fish) this.drawFish(f, t);
    this.drawVents(run, t);

    // items
    for (const it of run.items) this.drawLoot(it, t);
    for (const c of run.canisters) this.drawCanister(c, t);
    for (const j of run.jellies) this.drawJelly(j, t);

    // bubbles and particles (behind diver)
    for (const p of run.particles) this.drawParticle(p, t);
    this.drawCurrents(run, t);
    for (const b of run.bubbles) {
      const x = this.mapX(b.x);
      const y = this.mapY(b.depth);
      ctx.strokeStyle = `rgba(170,240,255,${0.25 * Math.min(1, b.life)})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.6, b.r * this.scale * 0.5), 0, TAU);
      ctx.stroke();
    }

    // diver
    this.drawDiver(run, t, { x: run.x, depth: run.depth }, { vx: run.vx, vy: run.vy });

    // pickup texts
    this.drawPickupTexts(run, t);

    // darkness & lamp
    this.drawLighting(run, { x: run.x, depth: run.depth }, t);
    this.drawLampBeam(run.x, run.depth, run.gear.lamp, run.vx < -0.2 ? -1 : 1, t);

    // glowing particles on top of darkness
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of run.particles) {
      if (!p.glow) continue;
      const x = this.mapX(p.x);
      const y = this.mapY(p.depth);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const a = p.a * (0.55 + Math.sin(t * 2 + p.x) * 0.3);
      ctx.fillStyle = `rgba(120,255,240,${a * 0.35})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.restore();

    this.drawCeiling(run, t);
    this.drawOffscreenMarkers(run, t);
    this.drawDepthRuler(run);
    this.drawBendsBubbles(run, t);
    this.drawScreenVignette(run.depth, run.bends);

    if (run.flash > 0) {
      ctx.fillStyle = `rgba(160,240,255,${run.flash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (run.aboveCeiling) {
      ctx.fillStyle = `rgba(255,40,35,${0.02 + Math.min(0.08, (run.ceiling - run.depth) * 0.002)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawParticle(p, t) {
    const { ctx } = this;
    const x = this.mapX(p.x);
    const y = this.mapY(p.depth);
    if (x < -4 || x > this.W + 4 || y < -4 || y > this.H + 4) return;
    const tw = 0.6 + Math.sin(t * 1.5 + p.x * 3) * 0.4;
    ctx.fillStyle = `rgba(190,235,245,${p.a * 0.5 * tw})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, p.r * this.scale), 0, TAU);
    ctx.fill();
  }

  renderTitle(t) {
    const { ctx, W, H } = this;
    this._setCam({ x: 66, y: 31 });
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawBackdrop(this.camY, t);
    this.drawSky(t);
    this.drawRays(this.camY, t);
    this.drawCaustics(this.camY, t);
    this.drawCliffs(this.camY);
    this.drawSpires(this.camY, t);
    this.drawShelf(this.camY, t);
    this.drawKelp(this.camY, t);
    this.drawSeabed(this.camY, t);
    this.drawWreck(this.camY, t, true);

    // fish school
    for (let i = 0; i < 22; i++) {
      const ph = i * 1.7;
      const f = {
        x: ((i * 13 + t * (2.2 + (i % 3) * 0.5)) % 150) - 15,
        depth: 26 + Math.sin(ph) * 16 + (i % 4) * 4,
        speed: 1,
        size: 0.5 + (i % 4) * 0.18,
        phase: ph,
        wobble: 1,
        deep: false,
      };
      this.drawFish(f, t);
    }
    // far fish
    for (let i = 0; i < 5; i++) {
      const f = {
        x: 20 + i * 18,
        depth: 50 + i * 7,
        speed: -1,
        size: 1.2,
        phase: i,
        wobble: 0.6,
        deep: true,
      };
      this.drawFish(f, t);
    }

    // particles
    const rnd = mulberry32(99);
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const px = rnd() * W;
      const py = ((rnd() * H + t * (6 + (i % 4) * 3)) % (H + 20)) - 10;
      const a = 0.1 + rnd() * 0.35;
      ctx.fillStyle = `rgba(190,235,245,${a})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.6 + rnd(), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // demo diver
    const dive = {
      x: 84 + Math.sin(t * 0.12) * 3,
      depth: 34 + Math.sin(t * 0.2) * 4,
      vx: Math.cos(t * 0.12) * 0.4,
      vy: Math.cos(t * 0.2) * 0.8,
      invuln: 0,
      gear: { lamp: 20 },
    };
    // gentle bubbles
    this.drawDiver(dive, t, { x: dive.x, depth: dive.depth }, { vx: dive.vx, vy: dive.vy, idleAngle: 0.35 });

    // lighting anchored on diver (less dark for the title)
    const lc = this.lctx;
    lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lc.clearRect(0, 0, W, H);
    lc.fillStyle = 'rgba(0,3,8,0.2)';
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'destination-out';
    const dx = this.mapX(dive.x);
    const dy = this.mapY(dive.depth);
    const lamp = 20 * this.scale * 1.35;
    const g = lc.createRadialGradient(dx, dy, 0, dx, dy, lamp);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.beginPath();
    lc.arc(dx, dy, lamp, 0, TAU);
    lc.fill();
    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.restore();

    this.drawLampBeam(dive.x, dive.depth, 20, 1, t);

    this.drawScreenVignette(30, 0);

    // bottom haze so the title text reads
    const hz = ctx.createLinearGradient(0, 0, W * 0.68, 0);
    hz.addColorStop(0, 'rgba(1,7,12,0.7)');
    hz.addColorStop(0.7, 'rgba(1,7,12,0.18)');
    hz.addColorStop(1, 'rgba(1,7,12,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, W, H);
  }
}

const H_UNUSED = 0;
