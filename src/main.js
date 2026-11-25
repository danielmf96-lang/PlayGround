// ============================================================
// DECOMP — app shell, UI, loop
// ============================================================

import {
  WORLD, CONTRACTS, UPGRADES, DEFAULT_UPGRADES,
  createRun, updateRun, gearStats, upgradeCost, surfaceOutcome,
} from './world.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';

const SAVE_KEY = 'decomp.save.v1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const DEFAULT_SAVE = {
  contract: 0,
  completed: 0,
  money: 0,
  totalEarned: 0,
  bestDepth: 0,
  bestCargo: 0,
  upgrades: { ...DEFAULT_UPGRADES },
  muted: false,
  dives: 0,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const s = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SAVE),
      ...s,
      upgrades: { ...DEFAULT_UPGRADES, ...(s.upgrades || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

let save = loadSave();
const sound = new Sound();
sound.muted = !!save.muted;

let renderer;
let run = null;
let state = 'title';
let paused = false;
let shopReturn = 'brief';
let lastTime = performance.now();
let clock = 0;
let input = { x: 0, y: 0, boost: false };
let keys = new Set();
let touchActive = false;
let stick = { active: false, pointerId: null, x: 0, y: 0 };
let toastId = 0;
let lastAlarm = 0;
let lastUi = {};
let flashAmount = 0;
let diveStartMoney = 0;
let endingData = null;

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ============================================================
// SAVE
// ============================================================
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}
function hasProgress() {
  return save.completed > 0 || save.money > 0 || save.totalEarned > 0 || Object.values(save.upgrades).some(Boolean);
}
function resetSave() {
  save = structuredClone(DEFAULT_SAVE);
  persist();
  renderTitleStats();
  updateMuteUI();
}

// ============================================================
// SCREENS
// ============================================================
const screens = ['titleScreen', 'howScreen', 'briefScreen', 'shopScreen', 'endScreen', 'pauseScreen'];
function hideScreens() { for (const id of screens) $(id).classList.add('hidden'); }
function showScreen(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
}
function setHudVisible(v) {
  $('hud').classList.toggle('hidden', !v);
  if (v && isTouch) $('touchControls').classList.remove('hidden');
  if (!v) $('touchControls').classList.add('hidden');
}

// ============================================================
// TITLE
// ============================================================
function renderTitleStats() {
  const best = save.bestDepth > 0 ? `${Math.round(save.bestDepth)} M` : '—';
  $('titleBest').textContent = best;
  $('titleEarned').textContent = `$${save.totalEarned.toLocaleString()}`;
  $('titleContracts').textContent = `${Math.min(4, save.completed)} / 4`;
  $('resetBtn').classList.toggle('hidden', !hasProgress());
  const done = save.completed >= CONTRACTS.length;
  $('startBtn').textContent = done ? 'FREE DIVE' : 'BEGIN CONTRACT';
}

function openTitle() {
  state = 'title';
  paused = false;
  hideScreens();
  showScreen('titleScreen');
  setHudVisible(false);
  renderTitleStats();
  run = null;
}

function openBriefing() {
  if (save.completed >= CONTRACTS.length) {
    startFreeDive();
    return;
  }
  const c = CONTRACTS[save.contract];
  state = 'briefing';
  hideScreens();
  showScreen('briefScreen');
  setHudVisible(false);
  renderer?.resize();

  $('briefCode').textContent = `CONTRACT ${c.code} / 04`;
  $('briefDivision').textContent = c.division;
  $('briefName').textContent = c.name;
  $('briefDesc').textContent = c.desc;
  $('briefDepth').textContent = `${c.depth} M`;
  $('briefQuota').textContent = `$${c.quota.toLocaleString()}`;
  $('briefBonus').textContent = `$${c.bonus.toLocaleString()}`;
  $('briefSpecial').classList.toggle('hidden', !c.special);

  const g = gearStats(save.upgrades);
  $('gearTank').textContent = `${g.maxAir} AIR`;
  $('gearLamp').textContent = `${g.lamp} M`;
  $('gearFins').textContent = `${Math.round(g.speed * 100)}%`;
  $('gearSuit').textContent = `N₂ ${Math.round(g.absorb * 100)}%`;
  $('briefTip').innerHTML = save.completed === 0
    ? '<span class="key">W</span><span class="key">S</span> to swim · hold at the amber ceiling to off-gas'
    : '<span class="key">SPACE</span> boost · watch your N₂ ceiling on the way up';
}

// ============================================================
// DIVE LIFECYCLE
// ============================================================
function startDive(freeDive = false) {
  sound.init();
  const idx = freeDive ? CONTRACTS.length - 1 : save.contract;
  run = createRun(idx, save.upgrades, { freeDive });
  if (freeDive) {
    run.quota = 0;
    run.special = false;
    run.specialDone = true;
    run.cargo = 0;
  }
  run.bestDepth = save.bestDepth;
  state = 'dive';
  paused = false;
  diveStartMoney = save.money;
  lastAlarm = 0;
  input = { x: 0, y: 0, boost: false };
  keys.clear();
  hideScreens();
  setHudVisible(true);
  renderer.resize();
  updateHud(true);
  addToast(freeDive ? 'FREE DIVE — NO QUOTA. GO DEEP.' : `CONTRACT ${run.contract.code} — ${run.contract.name}`, 'good', 3.2);
  setTimeout(() => {
    if (state === 'dive') addToast('COLLECT SALVAGE · RETURN BEFORE AIR RUNS OUT', '', 3.4);
  }, 900);
}

function startFreeDive() {
  startDive(true);
}

function togglePause(force) {
  if (state !== 'dive' && state !== 'paused') return;
  const want = force !== undefined ? force : state === 'dive';
  if (want && state === 'dive') {
    state = 'paused';
    paused = true;
    $('pauseSub').textContent = `DEPTH ${Math.round(run.depth)} M · ${Math.round(run.air)} AIR · N₂ ${Math.round(run.n2)}% · $${run.cargo.toLocaleString()} CARGO`;
    showScreen('pauseScreen');
    setHudVisible(false);
    input = { x: 0, y: 0, boost: false };
  } else if (!want && state === 'paused') {
    state = 'dive';
    paused = false;
    hideScreens();
    setHudVisible(true);
    lastTime = performance.now();
  }
}

function finishDive(trigger) {
  if (!run || state === 'end') return;
  const out = surfaceOutcome(run);
  const n2Debt = run.ceiling > 1.8 || run.n2 > 8.5;
  const bendsBad = run.bends >= 35;
  let success = false;
  let cause = '';

  if (trigger === 'surface') {
    if (n2Debt) cause = 'SURFACED WITH N₂ DEBT';
    else if (bendsBad) cause = 'DECOMPRESSION SICKNESS';
    else if (!out.ok) cause = 'QUOTA NOT MET';
    else success = true;
  } else if (trigger === 'outOfAir') {
    cause = 'OUT OF AIR';
  } else if (trigger === 'bends') {
    cause = 'DECOMPRESSION SICKNESS';
  } else {
    cause = 'DIVE ABANDONED';
  }

  const stats = {
    cause,
    depth: run.peakDepth,
    cargo: run.cargo,
    quota: run.quota,
    time: run.timeAlive,
    pickups: run.pickups,
    special: run.specialDone,
    freeDive: run.freeDive,
    contractIndex: run.contractIndex,
    bends: run.bends,
    air: run.air,
  };

  state = 'end';
  setHudVisible(false);
  hideScreens();
  showScreen('endScreen');

  if (success) {
    const bonus = run.freeDive ? 0 : run.contract.bonus;
    const earnings = run.cargo + bonus;
    save.money += earnings;
    save.totalEarned += earnings;
    save.bestDepth = Math.max(save.bestDepth, run.peakDepth);
    save.bestCargo = Math.max(save.bestCargo, run.cargo);
    save.dives++;
    if (!run.freeDive) {
      save.completed = Math.max(save.completed, run.contractIndex + 1);
      save.contract = Math.min(CONTRACTS.length - 1, run.contractIndex + 1);
    }
    persist();
    renderTitleStats();
    endingData = { ...stats, earnings, bonus, success: true };
    showEndScreen(endingData, 'success');
    sound.success();
  } else {
    save.dives++;
    persist();
    renderTitleStats();
    endingData = { ...stats, success: false };
    showEndScreen(endingData, 'fail');
    sound.fail();
  }
}

// ============================================================
// END SCREEN
// ============================================================
function showEndScreen(data, kind) {
  const panel = $('endScreen').querySelector('.end-panel');
  panel.classList.remove('fail', 'win');
  const finalWin = kind === 'success' && !data.freeDive && data.contractIndex === CONTRACTS.length - 1;
  if (kind === 'fail') panel.classList.add('fail');
  if (finalWin) panel.classList.add('win');

  const statsHtml = [];
  if (kind === 'success') {
    $('endKicker').textContent = data.freeDive ? 'FREE DIVE COMPLETE' : 'CONTRACT COMPLETE';
    $('endTitle').textContent = finalWin ? 'TRENCH CLEARED' : (data.freeDive ? 'SURFACE' : 'CARGO BANKED');
    $('endSub').textContent = finalWin
      ? 'The black box is aboard. Four contracts, one trench, and a body that made it back. Free dive unlocked.'
      : (data.freeDive
        ? 'No quota, no contract. Just you, the dark, and whatever the trench gave up.'
        : 'The crew hauls you over the rail. Your cargo is weighed, banked, and the next contract waits.');
    statsHtml.push(
      `<div class="end-stat earn"><span class="eyebrow">SALVAGE</span><span>$${data.cargo.toLocaleString()}</span></div>`,
      `<div class="end-stat earn"><span class="eyebrow">CONTRACT BONUS</span><span>$${data.bonus.toLocaleString()}</span></div>`,
      `<div class="end-stat earn"><span class="eyebrow">BANKED</span><span>$${data.earnings.toLocaleString()}</span></div>`,
      `<div class="end-stat"><span class="eyebrow">MAX DEPTH</span><span>${Math.round(data.depth)} M</span></div>`,
      `<div class="end-stat"><span class="eyebrow">DIVE TIME</span><span>${fmtTime(data.time)}</span></div>`,
      `<div class="end-stat"><span class="eyebrow">RECOVERED</span><span>${data.pickups} ITEMS</span></div>`
    );
    $('endNextBtn').textContent = 'EQUIPMENT';
    $('endNextBtn').classList.toggle('hidden', !!data.freeDive);
    $('endRetryBtn').classList.toggle('hidden', !data.freeDive);
    $('endRetryBtn').textContent = 'DIVE AGAIN';
    $('endTitleBtn').textContent = 'TITLE';
  } else {
    $('endKicker').textContent = 'DIVE LOST';
    $('endTitle').textContent = data.cause;
    $('endSub').textContent = data.cause === 'QUOTA NOT MET'
      ? 'You surfaced without the cargo to pay for the dive. The contract is still open.'
      : (data.cause === 'SURFACED WITH N₂ DEBT'
        ? 'You came up before your body was ready. The chamber is waiting; the cargo is not.'
        : (data.cause === 'OUT OF AIR'
          ? 'The tank ran dry in the dark. The crew marks the line and moves on.'
          : (data.cause === 'DIVE ABANDONED'
            ? 'You left the cargo on the bottom. No pay, no shame, no cargo.'
            : 'Nitrogen bubbles in the blood. The dive is over.')));
    statsHtml.push(
      `<div class="end-stat loss"><span class="eyebrow">CARGO LOST</span><span>$${data.cargo.toLocaleString()}</span></div>`,
      `<div class="end-stat"><span class="eyebrow">QUOTA</span><span>$${data.quota.toLocaleString()}</span></div>`,
      `<div class="end-stat"><span class="eyebrow">MAX DEPTH</span><span>${Math.round(data.depth)} M</span></div>`,
      `<div class="end-stat"><span class="eyebrow">DIVE TIME</span><span>${fmtTime(data.time)}</span></div>`,
      `<div class="end-stat"><span class="eyebrow">N₂ LOAD</span><span>${Math.round(run?.n2 || 0)}%</span></div>`,
      `<div class="end-stat"><span class="eyebrow">BENDS</span><span>${Math.round(data.bends)}%</span></div>`
    );
    $('endNextBtn').classList.add('hidden');
    $('endRetryBtn').classList.remove('hidden');
    $('endRetryBtn').textContent = data.freeDive ? 'DIVE AGAIN' : 'RETRY DIVE';
    $('endTitleBtn').textContent = 'TITLE';
  }
  $('endStats').innerHTML = statsHtml.join('');
}

// ============================================================
// SHOP
// ============================================================
const ICONS = {
  tank: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="9" y="7" width="12" height="18" rx="5"/><path d="M13 7V4h4v3M15 4V1M12 12h6M12 17h6"/></svg>`,
  lamp: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 11h9l5 4-5 4H8z"/><path d="M8 11V8h9v3M17 15l7-5v10l-7-5"/></svg>`,
  fins: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 6l4 8-1 9c3 2 8 0 9-3l-3-9-4-6z"/><path d="M4 12l5 2"/></svg>`,
  suit: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M10 6h10l3 5-2 3v10H9V14l-2-3z"/><path d="M12 6V3h6v3M12 14h6M15 14v10"/></svg>`,
  deco: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="15" cy="12" r="6"/><path d="M15 6V2M15 22v6M9 12H3M27 12h-6M10 12l3 3M20 12l-3-3"/><circle cx="15" cy="12" r="2"/></svg>`,
};

function openShop(origin = 'brief') {
  shopReturn = origin;
  state = 'shop';
  hideScreens();
  showScreen('shopScreen');
  setHudVisible(false);
  renderShop();
}

function renderShop() {
  $('shopCash').textContent = `$${save.money.toLocaleString()}`;
  const grid = $('upgradeGrid');
  grid.innerHTML = UPGRADES.map((u) => {
    const lv = save.upgrades[u.id] || 0;
    const maxed = lv >= u.max;
    const cost = maxed ? 0 : upgradeCost(u, lv);
    const can = !maxed && save.money >= cost;
    const pips = Array.from({ length: u.max }, (_, i) => `<span class="pip ${i < lv ? 'on' : ''}"></span>`).join('');
    return `
      <div class="upgrade-card ${lv > 0 ? 'owned' : ''} ${maxed ? 'maxed' : ''}">
        <div class="upgrade-top">
          <div class="upgrade-icon" style="color:${maxed ? 'var(--green)' : 'var(--cyan)'}">${ICONS[u.icon]}</div>
          <div class="upgrade-name">${u.name}</div>
          <div class="upgrade-cost">${maxed ? 'MAX' : `$${cost.toLocaleString()}`}</div>
        </div>
        <div class="upgrade-pips">${pips}</div>
        <div class="upgrade-desc">${maxed ? u.effect(lv) : u.desc[lv]}</div>
        <button class="upgrade-buy ${maxed ? 'owned-label' : ''}" data-upg="${u.id}" ${(!can || maxed) ? 'disabled' : ''}>
          ${maxed ? 'FULLY UPGRADED' : (can ? `INSTALL — $${cost.toLocaleString()}` : `NEED $${cost.toLocaleString()}`)}
        </button>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-upg]').forEach((btn) => {
    btn.addEventListener('click', () => buyUpgrade(btn.dataset.upg));
  });
  $('shopNextBtn').textContent = shopReturn === 'afterSuccess' ? 'NEXT CONTRACT' : 'CONTINUE';
}

function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return;
  const lv = save.upgrades[id] || 0;
  if (lv >= u.max) return;
  const cost = upgradeCost(u, lv);
  if (save.money < cost) return;
  save.money -= cost;
  save.upgrades[id] = lv + 1;
  persist();
  sound.click();
  renderShop();
}

function shopContinue() {
  sound.click();
  if (shopReturn === 'afterSuccess') {
    if (save.completed >= CONTRACTS.length) openTitle();
    else openBriefing();
  } else if (shopReturn === 'brief') {
    openBriefing();
  } else {
    openTitle();
  }
}

// ============================================================
// HUD
// ============================================================
const setText = (id, val) => {
  const el = $(id);
  if (el.textContent !== String(val)) el.textContent = val;
};

function updateHud(force = false) {
  if (!run || (state !== 'dive' && state !== 'paused')) return;
  const d = Math.round(run.depth);
  setText('depthVal', String(d).padStart(3, '0'));
  setText('pressureVal', `${(1 + run.depth / 10).toFixed(1)} ATM`);
  setText('timeVal', fmtTime(run.timeAlive));
  setText('contractCode', run.freeDive ? 'FREE DIVE' : `CONTRACT ${run.contract.code}`);
  setText('contractName', run.freeDive ? 'NO QUOTA' : run.contract.name);
  setText('cashVal', `$${save.money.toLocaleString()}`);

  const quota = Math.max(1, run.quota);
  const pct = run.freeDive ? 100 : clamp((run.cargo / quota) * 100, 0, 100);
  const qf = $('quotaFill');
  qf.style.width = `${pct}%`;
  setText('quotaText', run.freeDive ? `$${run.cargo.toLocaleString()} RECOVERED` : `$${run.cargo.toLocaleString()} / $${run.quota.toLocaleString()}`);

  let obj = 'RECOVER SALVAGE — RETURN TO THE SURFACE';
  let priority = false;
  if (!run.freeDive) {
    if (run.special && !run.specialDone) {
      obj = 'PRIORITY: BLACK BOX AT 288 M';
      priority = true;
    } else if (run.quotaMet) {
      obj = 'QUOTA MET — CLEAR YOUR CEILING AND SURFACE';
    } else {
      obj = `RECOVER $${(run.quota - run.cargo).toLocaleString()} MORE SALVAGE`;
    }
  }
  setText('objectiveRow', obj);
  $('objectiveRow').classList.toggle('priority', priority);

  const air = Math.round(run.air);
  setText('airVal', `${air}`);
  $('airFill').style.width = `${clamp((run.air / run.maxAir) * 100, 0, 100)}%`;
  $('airGauge').classList.toggle('low', run.air < run.maxAir * 0.32 && run.air >= run.maxAir * 0.16);
  $('airGauge').classList.toggle('critical', run.air < run.maxAir * 0.16);

  setText('n2Val', `${Math.round(run.n2)}%`);
  $('n2Fill').style.width = `${clamp(run.n2, 0, 100)}%`;
  $('n2Gauge').classList.toggle('danger', run.n2 > 55 || run.aboveCeiling);
  setText('ceilingVal', run.ceiling > 0.6 ? `CEILING ${Math.round(run.ceiling)} M` : 'CEILING 0 M · SURFACE CLEAR');

  let deco = 'SAFE TO ASCEND';
  let cls = '';
  if (run.aboveCeiling) { deco = 'ABOVE CEILING — DESCEND NOW'; cls = 'danger'; }
  else if (run.offgassing && run.n2 > 7.5) { deco = 'OFF-GASSING — HOLD STEADY'; cls = 'offgas'; }
  else if (run.ongassing && run.n2 > 9) { deco = 'ON-GASSING — DEPTH LOAD'; cls = 'warn'; }
  else if (run.vy < -0.6) { deco = 'ASCENDING — LOAD LOCKED'; cls = 'ascend'; }
  else if (run.ceiling <= 0.6) { deco = 'SURFACE CLEAR — ASCEND'; cls = 'offgas'; }
  setText('decoState', deco);
  $('decoState').className = `deco-state ${cls}`;

  // warnings
  const warns = [];
  if (run.aboveCeiling) warns.push({ t: `ABOVE CEILING — HOLD AT ${Math.ceil(run.ceiling)} M`, d: true });
  if (run.bends > 45) warns.push({ t: `BENDS ${Math.round(run.bends)}% — DESCEND BELOW CEILING`, d: true });
  if (run.air < run.maxAir * 0.16) warns.push({ t: `AIR CRITICAL — ${Math.round(run.air)} UNITS`, d: true });
  else if (run.air < run.maxAir * 0.3) warns.push({ t: 'AIR LOW — FIND A CANISTER' });
  if (run.depth < 2.2 && run.ceiling > 1.8) warns.push({ t: `N₂ DEBT — HOLD AT ${Math.ceil(run.ceiling)} M`, d: true });
  const wkey = warns.map((w) => w.t).join('|');
  if (force || lastUi.wkey !== wkey) {
    lastUi.wkey = wkey;
    $('warnings').innerHTML = warns.map((w) => `<div class="warning ${w.d ? 'danger' : ''}">${w.t}</div>`).join('');
  }

  // alarm sounds
  const now = performance.now();
  if ((run.aboveCeiling || run.air < run.maxAir * 0.1) && now - lastAlarm > 900) {
    lastAlarm = now;
    sound.alarm();
  }

  // surface prompt
  const atSurface = run.depth < 2.5 && (run.peakDepth > 8 || run.quotaMet);
  const sp = $('surfacePrompt');
  if (atSurface) {
    sp.classList.remove('hidden');
    const canSafe = run.ceiling <= 1.8 && run.n2 <= 8.5 && run.bends < 35;
    if (run.freeDive) {
      $('surfacePromptText').textContent = canSafe ? `SURFACE & BANK $${run.cargo.toLocaleString()}` : `N₂ DEBT — HOLD AT ${Math.ceil(run.ceiling)} M`;
      $('surfaceBtn').textContent = canSafe ? 'SURFACE' : 'SURFACE ANYWAY';
    } else if (run.special && !run.specialDone) {
      $('surfacePromptText').textContent = 'BLACK BOX NOT RECOVERED — KEEP DIVING';
      $('surfaceBtn').textContent = 'SURFACE ANYWAY';
    } else if (run.quotaMet) {
      $('surfacePromptText').textContent = canSafe ? 'QUOTA MET — SURFACE TO BANK' : `N₂ DEBT — HOLD AT ${Math.ceil(run.ceiling)} M`;
      $('surfaceBtn').textContent = canSafe ? 'SURFACE' : 'SURFACE ANYWAY';
    } else {
      $('surfacePromptText').textContent = 'QUOTA NOT MET — SURFACE TO ABORT';
      $('surfaceBtn').textContent = 'SURFACE ANYWAY';
    }
  } else {
    sp.classList.add('hidden');
  }

  // bends vignette
  const v = clamp((run.bends / 100) * 0.85 + (run.aboveCeiling ? 0.16 : 0), 0, 0.92);
  $('bendsVignette').style.opacity = v.toFixed(3);

  // flash
  $('flash').style.opacity = flashAmount.toFixed(3);
}

function addToast(text, cls = '', life = 2.8) {
  const zone = $('toastZone');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.dataset.id = String(++toastId);
  el.textContent = text;
  zone.appendChild(el);
  while (zone.children.length > 4) zone.firstChild.remove();
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(8px)';
    setTimeout(() => el.remove(), 320);
  }, life * 1000);
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'loot') {
      run.texts.push({ x: e.x, depth: e.depth, text: `+$${e.value.toLocaleString()}`, life: 1.5 });
      sound.collect(e.value);
      addToast(`SALVAGE +$${e.value.toLocaleString()}`, 'good', 1.9);
    } else if (e.type === 'air') {
      sound.air();
      run.texts.push({ x: e.x, depth: e.depth, text: `AIR +${e.amount}`, life: 1.5, color: 'teal' });
      addToast(`AIR CANISTER +${e.amount}`, 'good', 1.9);
    } else if (e.type === 'sting') {
      sound.sting();
      flashAmount = 0.85;
      $('flash').style.opacity = '0.85';
      run.texts.push({ x: e.x, depth: e.depth, text: 'STING', life: 1.2 });
      addToast('JELLYFISH STING — AIR −7 · N₂ +7', 'bad', 2.4);
    } else if (e.type === 'blackbox') {
      sound.blackbox();
      flashAmount = 1;
      run.texts.push({ x: e.x, depth: e.depth, text: 'BLACK BOX +$1,600', life: 2.4 });
      addToast('BLACK BOX RECOVERED — SURFACE WHEN CLEAR', 'good', 4);
    } else if (e.type === 'death') {
      finishDive(e.cause === 'OUT OF AIR' ? 'outOfAir' : 'bends');
      return;
    }
  }
  if (run?.dead) {
    if (run.deathCause === 'OUT OF AIR') finishDive('outOfAir');
    else finishDive('bends');
  }
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ============================================================
// INPUT
// ============================================================
const keyMap = {
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  ' ': 'boost', space: 'boost',
};

function updateInputFromKeys() {
  let x = 0; let y = 0;
  if (keys.has('left')) x -= 1;
  if (keys.has('right')) x += 1;
  if (keys.has('up')) y -= 1;
  if (keys.has('down')) y += 1;
  input.x = x;
  input.y = y;
  input.boost = keys.has('boost');
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
    if (state === 'dive') e.preventDefault();
  }
  if (k === 'escape' || k === 'p') {
    if (state === 'dive' || state === 'paused') { togglePause(); e.preventDefault(); }
    return;
  }
  if (k === 'm') { toggleMute(); return; }
  if (k === 'e' || k === 'enter') {
    if (state === 'dive' && run.depth < 2.5) { finishDive('surface'); }
    return;
  }
  const mapped = keyMap[k];
  if (mapped) {
    keys.add(mapped);
    updateInputFromKeys();
    if (state === 'dive' && e.repeat && mapped === 'boost') e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  const mapped = keyMap[k];
  if (mapped) {
    keys.delete(mapped);
    updateInputFromKeys();
  }
});

window.addEventListener('blur', () => {
  keys.clear();
  updateInputFromKeys();
  if (state === 'dive') togglePause(true);
});

// ----- touch joystick -----
function setupTouch() {
  if (!isTouch) return;
  document.body.classList.add('touch');
  const base = $('stickBase');
  const knob = $('stickKnob');
  const radius = 44;
  let center = { x: 0, y: 0 };

  function start(e) {
    e.preventDefault();
    sound.init();
    stick.active = true;
    stick.pointerId = e.pointerId;
    const r = base.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    base.setPointerCapture?.(e.pointerId);
    move(e);
  }
  function move(e) {
    if (!stick.active || (stick.pointerId != null && e.pointerId !== stick.pointerId)) return;
    e.preventDefault();
    let dx = e.clientX - center.x;
    let dy = e.clientY - center.y;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx = (dx / d) * radius; dy = (dy / d) * radius; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.x = dx / radius;
    input.y = dy / radius;
  }
  function end(e) {
    if (stick.pointerId != null && e.pointerId !== stick.pointerId) return;
    stick.active = false;
    stick.pointerId = null;
    knob.style.transform = 'translate(0,0)';
    input.x = 0;
    input.y = 0;
  }
  base.addEventListener('pointerdown', start);
  base.addEventListener('pointermove', move);
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  base.addEventListener('lostpointercapture', end);

  const boost = $('boostBtn');
  boost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.init();
    input.boost = true;
    boost.setPointerCapture?.(e.pointerId);
  });
  const bEnd = (e) => { e.preventDefault(); input.boost = false; };
  boost.addEventListener('pointerup', bEnd);
  boost.addEventListener('pointercancel', bEnd);
  boost.addEventListener('lostpointercapture', bEnd);

  // prevent page gestures on the play surface
  $('app').addEventListener('touchmove', (e) => {
    if (state === 'dive') e.preventDefault();
  }, { passive: false });
}

// ============================================================
// AUDIO UI
// ============================================================
function updateMuteUI() {
  const btn = $('muteBtn');
  const pbtn = $('pauseMuteBtn');
  btn.classList.toggle('muted', sound.muted);
  btn.textContent = sound.muted ? '✕' : '♪';
  pbtn.textContent = `SOUND: ${sound.muted ? 'OFF' : 'ON'}`;
  sound.setMuted(sound.muted);
}
function toggleMute() {
  sound.init();
  sound.muted = !sound.muted;
  save.muted = sound.muted;
  persist();
  updateMuteUI();
  sound.click();
}

// ============================================================
// MAIN LOOP
// ============================================================
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  clock += dt;

  if (state === 'dive' && run) {
    const events = [];
    updateRun(run, dt, input, events);
    handleEvents(events);
    if (state === 'dive') {
      updateHud();
      sound.update(dt, run.depth);
    }
  }

  // subtle idle camera drift for title
  if (state !== 'dive' && state !== 'paused' && state !== 'end') {
    if (run) run.camera.y = run.camera.y;
  }

  if (run && (state === 'dive' || state === 'paused' || state === 'end')) {
    renderer.renderDive(run, clock);
  } else {
    renderer.renderTitle(clock);
  }

  if (state === 'dive') {
    if (flashAmount > 0) {
      flashAmount = Math.max(0, flashAmount - dt * 2.2);
      $('flash').style.opacity = flashAmount.toFixed(3);
    }
    const v = clamp((run.bends / 100) * 0.85 + (run.aboveCeiling ? 0.16 : 0), 0, 0.92);
    $('bendsVignette').style.opacity = v.toFixed(3);
  } else {
    $('bendsVignette').style.opacity = '0';
  }

  requestAnimationFrame(frame);
}

// ============================================================
// WIRING
// ============================================================
function wire() {
  $('startBtn').addEventListener('click', () => {
    sound.init(); sound.click();
    if (save.completed >= CONTRACTS.length) startFreeDive();
    else openBriefing();
  });
  $('howBtn').addEventListener('click', () => { sound.init(); sound.click(); showScreen('howScreen'); });
  $('resetBtn').addEventListener('click', () => {
    if (confirm('Reset all dive progress, cash, and equipment?')) {
      resetSave(); sound.click();
    }
  });

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => {
      sound.click();
      if (state === 'title') showScreen('titleScreen');
      else openBriefing();
    });
  });

  $('diveBtn').addEventListener('click', () => { sound.click(); startDive(); });
  $('briefShopBtn').addEventListener('click', () => { sound.init(); sound.click(); openShop('brief'); });
  $('briefBackBtn').addEventListener('click', () => { sound.click(); openTitle(); });

  $('shopNextBtn').addEventListener('click', shopContinue);
  $('shopResetBtn').addEventListener('click', () => {
    if (confirm('Reset all progress, cash, and equipment? This cannot be undone.')) {
      resetSave(); sound.click(); openTitle();
    }
  });

  $('pauseBtn').addEventListener('click', () => { sound.click(); togglePause(true); });
  $('muteBtn').addEventListener('click', toggleMute);
  $('resumeBtn').addEventListener('click', () => { sound.click(); togglePause(false); });
  $('pauseMuteBtn').addEventListener('click', toggleMute);
  $('restartBtn').addEventListener('click', () => {
    sound.click();
    if (!run) return;
    const free = run.freeDive;
    hideScreens();
    startDive(free);
  });
  $('quitBtn').addEventListener('click', () => {
    sound.click();
    if (run) finishDive('abandon');
  });

  $('surfaceBtn').addEventListener('click', () => {
    sound.click();
    finishDive('surface');
  });

  $('endNextBtn').addEventListener('click', () => {
    sound.click();
    if (!endingData) return;
    openShop('afterSuccess');
  });
  $('endRetryBtn').addEventListener('click', () => {
    sound.click();
    hideScreens();
    startDive(!!endingData?.freeDive);
  });
  $('endTitleBtn').addEventListener('click', () => { sound.click(); openTitle(); });
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  renderer = new Renderer($('scene'));
  renderer.resize();
  wire();
  updateMuteUI();
  renderTitleStats();
  setupTouch();
  openTitle();
  requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });

  // rotate nudge on small portrait screens during dive
  const checkOrient = () => {
    const portrait = window.innerHeight > window.innerWidth && isTouch;
    $('rotateNudge').classList.toggle('hidden', !(portrait && state === 'dive'));
  };
  window.addEventListener('resize', checkOrient);
  setInterval(checkOrient, 1200);
}

// prevent iOS double-tap zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());
boot();

// Exposed for automated checks / debugging.
window.__DECOMP = {
  get run() { return run; },
  get state() { return state; },
  get save() { return save; },
  startDive,
  finishDive,
  openBriefing,
  openTitle,
};
