// ============================================================
// DECOMP — simulation
// ============================================================

export const WORLD = {
  width: 120,
  floor: 300,
  viewM: 76,
  surface: 0,
};

export const CONTRACTS = [
  {
    code: '01',
    name: 'KELP SHELF',
    division: 'SHELF OPERATIONS',
    depth: 75,
    quota: 700,
    bonus: 400,
    desc: 'A research trawler scattered cargo across the kelp shelf. Recover enough salvage to make the fuel bill worth it.',
    scanMax: 96,
  },
  {
    code: '02',
    name: 'THE DROP-OFF',
    division: 'SLOPE OPERATIONS',
    depth: 150,
    quota: 1750,
    bonus: 900,
    desc: 'The shelf falls away into open blue. Deeper cargo, stronger currents, and the first real nitrogen load.',
    scanMax: 180,
  },
  {
    code: '03',
    name: 'MIDNIGHT TRENCH',
    division: 'TRENCH OPERATIONS',
    depth: 220,
    quota: 2900,
    bonus: 1500,
    desc: 'No sunlight reaches the trench. Your lamp is the only horizon. Watch the ceiling — the ascent is longer than the fall.',
    scanMax: 250,
  },
  {
    code: '04',
    name: 'ABYSSAL WRECK',
    division: 'SALVAGE RECOVERY',
    depth: 275,
    quota: 4200,
    bonus: 2400,
    special: true,
    desc: 'The lost freighter sits in the black at 288 metres. Bring up the black box — and enough cargo to pay for the dive.',
    scanMax: 300,
  },
];

export const UPGRADES = [
  {
    id: 'tank', name: 'AIR TANK', max: 3, baseCost: 850, icon: 'tank',
    desc: ['+35 air capacity', '+35 air capacity', '+35 air capacity'],
    effect: (lv) => `${110 + lv * 35} AIR`,
  },
  {
    id: 'lamp', name: 'DIVE LAMP', max: 2, baseCost: 700, icon: 'lamp',
    desc: ['+7 m beam reach', '+7 m beam reach'],
    effect: (lv) => `${15 + lv * 7} M`,
  },
  {
    id: 'fins', name: 'CARBON FINS', max: 2, baseCost: 780, icon: 'fins',
    desc: ['+12% swim speed', '+12% swim speed'],
    effect: (lv) => `${Math.round((1 + lv * 0.12) * 100)}%`,
  },
  {
    id: 'suit', name: 'DECO SUIT', max: 2, baseCost: 950, icon: 'suit',
    desc: ['-18% nitrogen absorption', '-18% nitrogen absorption'],
    effect: (lv) => `${Math.round((1 - lv * 0.18) * 100)}%`,
  },
  {
    id: 'deco', name: 'O₂ MIX RIG', max: 2, baseCost: 900, icon: 'deco',
    desc: ['+22% off-gas rate', '+22% off-gas rate'],
    effect: (lv) => `${Math.round((1 + lv * 0.22) * 100)}%`,
  },
];

export const DEFAULT_UPGRADES = { tank: 0, lamp: 0, fins: 0, suit: 0, deco: 0 };

export function gearStats(up) {
  return {
    maxAir: 110 + up.tank * 35,
    lamp: 15 + up.lamp * 7,
    speed: 1 + up.fins * 0.12,
    absorb: 1 - up.suit * 0.18,
    offgas: 1 + up.deco * 0.22,
  };
}

export function upgradeCost(upg, level) {
  return Math.round((upg.baseCost * Math.pow(1.85, level)) / 10) * 10;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function lootValue(depth, r) {
  if (depth < 80) return Math.round((65 + r * 75) / 5) * 5;
  if (depth < 160) return Math.round((145 + r * 120) / 5) * 5;
  if (depth < 235) return Math.round((275 + r * 150) / 5) * 5;
  return Math.round((445 + r * 210) / 5) * 5;
}

function lootKind(depth) {
  if (depth < 80) return pick(['crate', 'crate', 'urn']);
  if (depth < 160) return pick(['crate', 'urn', 'barrel']);
  if (depth < 235) return pick(['barrel', 'urn', 'crate']);
  return pick(['barrel', 'urn', 'barrel']);
}

export function createRun(contractIndex, upgrades, opts = {}) {
  const contract = CONTRACTS[contractIndex];
  const stats = gearStats(upgrades);
  const maxD = opts.freeDive ? 300 : contract.depth;

  const run = {
    contractIndex,
    contract,
    freeDive: !!opts.freeDive,
    gear: stats,
    time: 0,
    depth: 3.2,
    x: 60,
    vx: 0,
    vy: 0,
    air: stats.maxAir,
    maxAir: stats.maxAir,
    n2: 0,
    bends: 0,
    cargo: 0,
    quota: contract.quota,
    special: !!contract.special,
    specialDone: !contract.special,
    items: [],
    canisters: [],
    jellies: [],
    currents: [],
    fish: [],
    vents: [],
    particles: [],
    texts: [],
    camera: { x: 60, y: 20, shake: 0 },
    invuln: 0,
    dead: false,
    deathCause: '',
    timeAlive: 0,
    peakDepth: 1.2,
    lastDepth: 1.2,
    ascentRate: 0,
    offgassing: false,
    ongassing: false,
    atSurface: false,
    quotaMet: false,
    tips: {},
    surfaced: false,
    surfaceReady: false,
    pickups: 0,
    canisterCount: 0,
    flash: 0,
    bubbles: [],
    lampFlicker: 1,
  };

  // ---- salvage ----
  const count = opts.freeDive ? 26 : 24;
  const used = [];
  for (let i = 0; i < count; i++) {
    let d = 0;
    for (let tries = 0; tries < 20; tries++) {
      // Bias slightly deep so descending is rewarded.
      d = 14 + Math.pow(Math.random(), 0.72) * (maxD - 14);
      if (used.every((u) => Math.abs(u - d) > 7)) break;
    }
    used.push(d);
    run.items.push({
      id: `loot${i}`,
      x: rand(20, 100),
      depth: Math.round(d * 10) / 10,
      value: lootValue(d, Math.random()),
      kind: lootKind(d),
      phase: rand(0, Math.PI * 2),
      bob: rand(0, Math.PI * 2),
      taken: false,
      tier: d < 80 ? 0 : d < 160 ? 1 : d < 235 ? 2 : 3,
    });
  }

  // ---- air canisters (always worth finding) ----
  const canDepth = [0.32, 0.6, 0.82, 1.0];
  for (let i = 0; i < canDepth.length; i++) {
    run.canisters.push({
      x: rand(26, 94),
      depth: Math.max(18, Math.round(canDepth[i] * maxD + rand(-4, 4))),
      amount: 32,
      phase: rand(0, Math.PI * 2),
      taken: false,
    });
  }

  // ---- jellyfish ----
  const jellies = 6;
  for (let i = 0; i < jellies; i++) {
    const d = 26 + (i / (jellies - 1)) * (maxD - 26) + rand(-8, 8);
    run.jellies.push({
      x: rand(24, 96),
      baseX: 0,
      depth: clamp(d, 20, maxD + 6),
      phase: rand(0, Math.PI * 2),
      drift: rand(1.4, 3.2) * (Math.random() > 0.5 ? 1 : -1),
      size: rand(0.8, 1.35),
      bobAmp: rand(1.5, 4),
      bobSpeed: rand(0.4, 0.9),
      hit: false,
    });
  }
  for (const j of run.jellies) j.baseX = j.x;

  // ---- currents ----
  if (maxD > 90) {
    run.currents.push({
      depth: Math.round(maxD * 0.34), width: 13,
      force: (Math.random() > 0.5 ? 1 : -1) * 2.2, phase: rand(0, 6),
      strength: 1,
    });
    run.currents.push({
      depth: Math.round(maxD * 0.7), width: 12,
      force: (Math.random() > 0.5 ? 1 : -1) * 2.8, phase: rand(0, 6),
      strength: 1,
    });
  }

  // ---- decorative fish ----
  for (let i = 0; i < 26; i++) {
    run.fish.push({
      x: rand(0, WORLD.width),
      depth: rand(12, Math.max(40, maxD + 20)),
      speed: rand(1.2, 4.2) * (Math.random() > 0.5 ? 1 : -1),
      size: rand(0.5, 1.5),
      phase: rand(0, Math.PI * 2),
      wobble: rand(0.4, 1.4),
      deep: Math.random() > 0.78,
    });
  }

  // ---- vents ----
  for (let i = 0; i < 7; i++) {
    run.vents.push({
      x: rand(10, 110),
      depth: WORLD.floor - rand(1, 5),
      phase: rand(0, Math.PI * 2),
      rate: rand(0.4, 1.1),
    });
  }

  // ---- black box ----
  if (contract.special && !opts.freeDive) {
    run.items.push({
      id: 'blackbox',
      x: 58,
      depth: 288,
      value: 1600,
      kind: 'blackbox',
      phase: 0,
      bob: 0,
      taken: false,
      tier: 4,
      special: true,
    });
  }

  return run;
}

export function updateRun(run, dt, input, events) {
  if (run.dead) return;
  const stats = run.gear;
  const contract = run.contract;
  run.time += dt;
  run.timeAlive += dt;

  // ---------- movement ----------
  let ix = input.x || 0;
  let iy = input.y || 0;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  const boosting = !!input.boost && mag > 0.1 && run.air > 0 && run.depth > 0.9;
  const boostMul = boosting ? 1.42 : 1;

  const accel = 22 * stats.speed * boostMul;
  run.vx += ix * accel * dt;
  run.vy += iy * accel * dt;

  // gentle current push
  for (const c of run.currents) {
    if (Math.abs(run.depth - c.depth) < c.width / 2) {
      run.vx += c.force * dt * 1.25;
    }
  }

  // buoyancy: barely positive, keeps the diver floating when idle
  run.vy -= 0.12 * dt;

  const drag = Math.pow(0.08, dt); // ≈ exp(-2.53 dt)
  run.vx *= drag;
  run.vy *= drag;

  const maxV = 7.4 * stats.speed * boostMul;
  const sp = Math.hypot(run.vx, run.vy);
  if (sp > maxV) { run.vx = (run.vx / sp) * maxV; run.vy = (run.vy / sp) * maxV; }

  run.x += run.vx * dt;
  const oldDepth = run.depth;
  run.depth += run.vy * dt;

  // bounds
  if (run.x < 4) { run.x = 4; run.vx = Math.max(0, run.vx); }
  if (run.x > WORLD.width - 4) { run.x = WORLD.width - 4; run.vx = Math.min(0, run.vx); }
  if (run.depth < 0.8) {
    run.depth = 0.8;
    if (run.vy < 0) run.vy = 0;
    if (oldDepth > 2) events.push({ type: 'surface' });
  }
  if (run.depth > WORLD.floor - 2) {
    run.depth = WORLD.floor - 2;
    if (run.vy > 0) run.vy = 0;
  }

  run.ascentRate = (run.depth - oldDepth) / Math.max(dt, 0.0001); // negative = up
  run.peakDepth = Math.max(run.peakDepth, run.depth);
  run.atSurface = run.depth < 2.2;
  run.invuln = Math.max(0, run.invuln - dt);
  run.flash = Math.max(0, run.flash - dt * 3);

  // ---------- nitrogen model ----------
  // Ceiling = the shallowest depth the body can tolerate right now.
  const ceiling = Math.max(0, (run.n2 - 7) * 3.2);
  run.ceiling = ceiling;
  const depthAboveCeiling = ceilDelta(run.depth, ceiling);

  run.offgassing = false;
  run.ongassing = false;
  run.aboveCeiling = false;

  if (depthAboveCeiling > 5.5) {
    // deep enough to keep loading tissue
    if (run.depth > 6 && run.vy > -0.35) {
      const absorb = (0.38 + run.depth * 0.0042) * stats.absorb;
      run.n2 = clamp(run.n2 + absorb * dt, 0, 100);
      run.ongassing = true;
    }
  } else if (depthAboveCeiling >= -0.8 && run.depth > 0.9) {
    // in the off-gas band just below the ceiling
    const rate = 1.18 * stats.offgas;
    run.n2 = Math.max(0, run.n2 - rate * dt);
    run.offgassing = true;
  } else {
    // above the ceiling: bubbles form
    run.aboveCeiling = true;
    const over = ceiling - run.depth;
    run.bends = clamp(run.bends + over * 0.82 * dt, 0, 100);
    run.camera.shake = Math.max(run.camera.shake, Math.min(1, over / 25 + 0.2));
    events.push({ type: 'aboveCeiling', over });
  }
  if (!run.aboveCeiling) {
    run.bends = Math.max(0, run.bends - 1.15 * dt);
  }

  // ---------- air ----------
  if (run.depth > 0.9) {
    const speedRatio = Math.min(1, Math.hypot(run.vx, run.vy) / 6);
    let drain = (0.185 + run.depth * 0.00225) * (1 + 0.62 * speedRatio);
    if (boosting) drain *= 1.55;
    run.air = Math.max(0, run.air - drain * dt);
    if (run.air <= 0) {
      run.dead = true;
      run.deathCause = 'OUT OF AIR';
      events.push({ type: 'death', cause: 'OUT OF AIR' });
      return;
    }
    if (run.air < run.maxAir * 0.22 && !run.tips.lowAir) {
      run.tips.lowAir = true;
      events.push({ type: 'lowAir' });
    }
    if (run.air > run.maxAir * 0.3) run.tips.lowAir = false;
  }
  if (run.bends >= 100) {
    run.dead = true;
    run.deathCause = 'DECOMPRESSION SICKNESS';
    events.push({ type: 'death', cause: 'DECOMPRESSION SICKNESS' });
    return;
  }

  // ---------- pickups ----------
  for (const it of run.items) {
    if (it.taken) continue;
    it.bob += dt;
    const radius = it.kind === 'blackbox' ? 4.2 : 3.0;
    if (Math.abs(it.depth - run.depth) < radius && Math.abs(it.x - run.x) < radius + 0.6) {
      it.taken = true;
      run.pickups++;
      run.cargo += it.value;
      if (it.special) {
        run.specialDone = true;
        run.flash = 0.9;
        events.push({ type: 'blackbox', value: it.value, x: it.x, depth: it.depth });
      } else {
        events.push({ type: 'loot', value: it.value, x: it.x, depth: it.depth });
      }
      run.bubbles.push({ x: it.x, depth: it.depth, life: 0.8, r: 0.5, vy: -2 });
    }
  }

  for (const c of run.canisters) {
    if (c.taken) continue;
    c.phase += dt;
    if (Math.abs(c.depth - run.depth) < 3.2 && Math.abs(c.x - run.x) < 3.4) {
      c.taken = true;
      const before = run.air;
      run.air = Math.min(run.maxAir, run.air + c.amount);
      run.canisterCount++;
      events.push({ type: 'air', amount: Math.round(run.air - before), x: c.x, depth: c.depth });
    }
  }

  // jellyfish
  for (const j of run.jellies) {
    j.phase += dt;
    j.x = j.baseX + Math.sin(j.phase * 0.55 + j.drift) * 5.5;
    j.x = clamp(j.x, 8, WORLD.width - 8);
    const jd = j.depth + Math.sin(j.phase * j.bobSpeed + 1.3) * j.bobAmp;
    j.renderDepth = jd;
    if (run.invuln <= 0) {
      const dx = j.x - run.x;
      const dd = jd - run.depth;
      const hitR = 2.3 * j.size + 0.9;
      if (dx * dx + dd * dd < hitR * hitR) {
        run.invuln = 2.2;
        run.air = Math.max(0, run.air - 7);
        run.bends = clamp(run.bends + 7, 0, 100);
        run.flash = 0.8;
        run.camera.shake = 1;
        run.vx += (run.x - j.x) * 1.5;
        run.vy += (run.depth - jd) * 1.2;
        events.push({ type: 'sting', x: j.x, depth: jd });
      }
    }
  }

  // decorative fish
  for (const f of run.fish) {
    f.x += f.speed * dt;
    if (f.x < -4) f.x = WORLD.width + 4;
    if (f.x > WORLD.width + 4) f.x = -4;
    f.phase += dt * f.wobble;
  }

  // ---------- ambient particles (marine snow) ----------
  if (run.particles.length < 90) {
    for (let i = run.particles.length; i < 90; i++) {
      run.particles.push({
        x: Math.random() * WORLD.width,
        depth: Math.random() * (run.depth + 50),
        vx: rand(-0.25, 0.25),
        vy: rand(0.18, 0.7),
        r: rand(0.06, 0.22),
        glow: Math.random() > 0.78,
        a: rand(0.15, 0.7),
      });
    }
  }
  for (const p of run.particles) {
    p.depth += p.vy * dt;
    p.x += p.vx * dt;
    if (p.x < 0) p.x += WORLD.width;
    if (p.x > WORLD.width) p.x -= WORLD.width;
    if (p.depth > WORLD.floor + 4) {
      p.depth = Math.random() * (run.depth - 6);
      p.x = Math.random() * WORLD.width;
    }
  }

  // floating pickup text
  for (let i = run.texts.length - 1; i >= 0; i--) {
    const t = run.texts[i];
    t.life -= dt;
    t.depth -= dt * 1.4;
    if (t.life <= 0) run.texts.splice(i, 1);
  }

  // diver exhaust bubbles
  if (Math.random() < dt * (boosting ? 26 : 12)) {
    run.bubbles.push({
      x: run.x + rand(-0.4, 0.4),
      depth: run.depth - 0.8,
      life: rand(1.2, 2.4),
      r: rand(0.1, 0.32),
      vy: rand(-2.2, -1.2),
    });
  }
  for (let i = run.bubbles.length - 1; i >= 0; i--) {
    const b = run.bubbles[i];
    b.life -= dt;
    b.depth += b.vy * dt;
    b.x += Math.sin(run.time * 5 + i) * dt * 0.3;
    if (b.life <= 0 || b.depth < 0) run.bubbles.splice(i, 1);
  }

  // ---------- camera ----------
  const targetY = clamp(
    run.depth + (run.vy > 0 ? run.vy * 0.45 : run.vy * 0.3) - 2,
    17,
    WORLD.floor + 2
  );
  run.camera.y += (targetY - run.camera.y) * Math.min(1, dt * 3.4);
  run.camera.x += (run.x - run.camera.x) * Math.min(1, dt * 4.2);
  run.camera.shake = Math.max(0, run.camera.shake - dt * 1.8);

  // quota + surface readiness
  run.quotaMet = run.cargo >= run.quota;
  run.surfaceReady = run.atSurface && run.quotaMet && run.specialDone;
}

function ceilDelta(depth, ceiling) {
  // positive when depth is below the ceiling line (safe side)
  return depth - ceiling;
}

export function canSurface(run) {
  return run.depth < 2.4;
}

export function surfaceOutcome(run) {
  return {
    ok: run.quotaMet && run.specialDone,
    quotaMet: run.quotaMet,
    specialDone: run.specialDone,
    bends: run.bends,
  };
}
