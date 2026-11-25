// ============================================================
// DECOMP — procedural audio (WebAudio, no assets)
// ============================================================

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambient = null;
    this.depth = 0;
    this.lastPing = 0;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this._buildAmbient();
    this.started = true;
  }

  _buildAmbient() {
    const ctx = this.ctx;
    // ocean bed: filtered noise loop
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    noise.connect(lp).connect(ng).connect(this.master);
    noise.start();

    // deep drone
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.1;
    const dronep = ctx.createBiquadFilter();
    dronep.type = 'lowpass';
    dronep.frequency.value = 220;
    droneGain.connect(dronep).connect(this.master);
    const oscs = [];
    [41.2, 55, 82.4].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.06 : 0.5;
      o.connect(g).connect(droneGain);
      o.start();
      oscs.push(o);
    });

    // slow LFO on drone filter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain).connect(dronep.frequency);
    lfo.start();

    this.ambient = { noise, lp, ng, droneGain, dronep, oscs };
  }

  setDepth(depth) {
    this.depth = depth;
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = Math.max(130, 460 - depth * 1.05);
    this.ambient.lp.frequency.setTargetAtTime(f, t, 1.2);
    this.ambient.dronep.frequency.setTargetAtTime(Math.max(90, 230 - depth * 0.5), t, 1.5);
    this.ambient.droneGain.gain.setTargetAtTime(0.075 + Math.min(0.12, depth / 2200), t, 1.5);
  }

  update(dt, depth) {
    if (!this.ctx) return;
    this.setDepth(depth);
    this.lastPing += dt;
    if (this.lastPing > 13 + Math.random() * 9 && depth > 30) {
      this.lastPing = 0;
      this.ping();
    }
  }

  _env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    this._env(g, t0, 0.008, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noiseBurst(dur, freq, vol = 0.1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  click() { this.tone(520, 0.05, 'square', 0.05, -80); }
  hover() { this.tone(880, 0.03, 'sine', 0.025); }
  collect(value = 100) {
    const base = 620 + Math.min(400, value * 0.35);
    this.tone(base, 0.09, 'triangle', 0.1);
    this.tone(base * 1.5, 0.13, 'sine', 0.08, 0, 0.055);
    this.noiseBurst(0.05, 2600, 0.03);
  }
  air() {
    this.noiseBurst(0.35, 1400, 0.12);
    this.tone(330, 0.18, 'sine', 0.07, 220);
    this.tone(660, 0.22, 'sine', 0.05, 120, 0.08);
  }
  sting() {
    this.tone(140, 0.3, 'sawtooth', 0.12, -70);
    this.noiseBurst(0.2, 700, 0.15);
    this.tone(90, 0.4, 'square', 0.05, -30);
  }
  alarm() { this.tone(880, 0.1, 'square', 0.06); this.tone(660, 0.14, 'square', 0.05, 0, 0.12); }
  ping() {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 1240;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 1.3);
    this.tone(1860, 0.9, 'sine', 0.012, 0, 0.04);
  }
  blackbox() {
    this.tone(220, 0.5, 'triangle', 0.1, 40);
    this.tone(330, 0.6, 'sine', 0.08, 0, 0.12);
    this.tone(440, 0.7, 'sine', 0.07, 0, 0.24);
    this.noiseBurst(0.6, 400, 0.1);
  }
  success() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.55, 'sine', 0.07, 0, i * 0.13));
    this.noiseBurst(0.7, 700, 0.06);
  }
  fail() {
    [220, 196, 147].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.09, -20, i * 0.16));
    this.noiseBurst(0.9, 200, 0.08);
  }
  surface() {
    this.noiseBurst(0.7, 900, 0.14);
    this.tone(300, 0.3, 'sine', 0.07, 300);
  }
  boost() {
    this.noiseBurst(0.18, 600, 0.04);
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }
}
