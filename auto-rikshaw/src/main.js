const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayEyebrow = document.getElementById("overlay-eyebrow");
const overlayTitle = document.getElementById("overlay-title");
const overlayMsg = document.getElementById("overlay-msg");
const startBtn = document.getElementById("start-btn");
const scoreEl = document.getElementById("score");
const statsEl = document.querySelector(".stats");
const tapLeft = document.getElementById("tap-left");
const tapRight = document.getElementById("tap-right");
const muteBtn = document.getElementById("mute-btn");
const flashEl = document.getElementById("flash");

const LANES = 3;
const BASE_SPEED = 220;
const MAX_SPEED = 620;
const SPEED_RAMP = 18;
const SPAWN_BASE = 1.15;
const SPAWN_MIN = 0.42;

const CAR_COLORS = ["#c73e1d", "#2d6a4f", "#1d3557", "#7b2cbf", "#457b9d", "#bc6c25"];
const BIKE_COLORS = ["#111111", "#222222", "#334155"];

let W = 0;
let H = 0;
let dpr = 1;
let laneWidth = 0;
let roadLeft = 0;
let roadWidth = 0;

/* ---------- Audio (procedural Web Audio) ---------- */
const audio = {
  ctx: null,
  master: null,
  engine: null,
  engineGain: null,
  muted: false,
  unlocked: false,
};

function ensureAudio() {
  if (audio.ctx) return audio.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = audio.muted ? 0 : 0.55;
  audio.master.connect(audio.ctx.destination);
  return audio.ctx;
}

async function unlockAudio() {
  const ac = ensureAudio();
  if (!ac) return;
  if (ac.state === "suspended") await ac.resume();
  audio.unlocked = true;
}

function setMuted(muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.55;
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteBtn.classList.toggle("muted", muted);
  try {
    localStorage.setItem("rickshaw-muted", muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq, dur, type = "square", vol = 0.12, slide = 0) {
  const ac = ensureAudio();
  if (!ac || !audio.unlocked) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, vol = 0.2, filterFreq = 800) {
  const ac = ensureAudio();
  if (!ac || !audio.unlocked) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.8;
  const gain = ac.createGain();
  const t0 = ac.currentTime;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  src.start(t0);
  src.stop(t0 + dur);
}

function playStart() {
  tone(110, 0.12, "sawtooth", 0.08, 40);
  setTimeout(() => tone(165, 0.18, "sawtooth", 0.1, 80), 80);
  setTimeout(() => noiseBurst(0.15, 0.12, 400), 40);
}

function playSwerve(dir) {
  const base = dir < 0 ? 420 : 520;
  tone(base, 0.09, "triangle", 0.09, dir < 0 ? -180 : 180);
  noiseBurst(0.06, 0.06, 1200);
}

function playCrash() {
  noiseBurst(0.35, 0.35, 280);
  tone(90, 0.4, "sawtooth", 0.18, -60);
  setTimeout(() => tone(55, 0.5, "square", 0.1, -30), 60);
  setTimeout(() => noiseBurst(0.25, 0.2, 150), 90);
}

function playNearMiss() {
  tone(880, 0.05, "sine", 0.05, 200);
  noiseBurst(0.08, 0.08, 2000);
}

function playMilestone() {
  tone(523, 0.08, "sine", 0.07, 0);
  setTimeout(() => tone(784, 0.12, "sine", 0.08, 0), 70);
}

function startEngineLoop() {
  const ac = ensureAudio();
  if (!ac || !audio.unlocked || audio.engine) return;

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 55;

  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 8;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 280;

  const gain = ac.createGain();
  gain.gain.value = 0.0001;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);

  osc.start();
  lfo.start();

  audio.engine = { osc, lfo, filter, gain };
  audio.engineGain = gain;
  gain.gain.exponentialRampToValueAtTime(0.07, ac.currentTime + 0.3);
}

function stopEngineLoop() {
  if (!audio.engine || !audio.ctx) return;
  const { osc, lfo, gain } = audio.engine;
  const t = audio.ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      osc.stop();
      lfo.stop();
    } catch {
      /* ignore */
    }
    audio.engine = null;
    audio.engineGain = null;
  }, 280);
}

function updateEngineSound(speed) {
  if (!audio.engine || !audio.ctx) return;
  const t = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  const freq = 55 + t * 70;
  const cutoff = 280 + t * 420;
  const vol = 0.05 + t * 0.07;
  const now = audio.ctx.currentTime;
  audio.engine.osc.frequency.setTargetAtTime(freq, now, 0.08);
  audio.engine.filter.frequency.setTargetAtTime(cutoff, now, 0.1);
  audio.engine.lfo.frequency.setTargetAtTime(8 + t * 10, now, 0.1);
  if (!audio.muted) {
    audio.engine.gain.gain.setTargetAtTime(vol, now, 0.1);
  }
}

/* ---------- Game state ---------- */
const state = {
  running: false,
  gameOver: false,
  elapsed: 0,
  score: 0,
  lastMilestone: 0,
  speed: BASE_SPEED,
  playerLane: 1,
  playerX: 0,
  playerY: 0,
  lean: 0,
  wheelAngle: 0,
  vehicles: [],
  particles: [],
  speedLines: [],
  scenery: [],
  roadOffset: 0,
  spawnTimer: 0,
  lastTime: 0,
  shake: 0,
  flash: 0,
  exhaustTimer: 0,
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = rect.width;
  H = rect.height;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  roadWidth = Math.min(W * 0.92, 420);
  roadLeft = (W - roadWidth) / 2;
  laneWidth = roadWidth / LANES;
  state.playerY = H - Math.min(H * 0.18, 120);
  state.playerX = laneCenter(state.playerLane);

  if (state.scenery.length === 0) initScenery();
}

function laneCenter(lane) {
  return roadLeft + laneWidth * (lane + 0.5);
}

function initScenery() {
  state.scenery = [];
  for (let i = 0; i < 14; i++) {
    state.scenery.push({
      side: i % 2 === 0 ? -1 : 1,
      y: (i / 14) * H * 1.4 - H * 0.2,
      kind: Math.random() < 0.45 ? "tree" : Math.random() < 0.5 ? "pole" : "stall",
      hue: 20 + Math.random() * 40,
    });
  }
}

async function resetGame() {
  await unlockAudio();
  playStart();
  stopEngineLoop();
  startEngineLoop();

  state.running = true;
  state.gameOver = false;
  state.elapsed = 0;
  state.score = 0;
  state.lastMilestone = 0;
  state.speed = BASE_SPEED;
  state.playerLane = 1;
  state.playerX = laneCenter(1);
  state.lean = 0;
  state.wheelAngle = 0;
  state.vehicles = [];
  state.particles = [];
  state.speedLines = [];
  state.roadOffset = 0;
  state.spawnTimer = 0.6;
  state.shake = 0;
  state.flash = 0;
  state.exhaustTimer = 0;
  initScenery();
  scoreEl.textContent = "0";
  overlay.classList.add("hidden");
  document.getElementById("app").classList.remove("crashed");
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  state.shake = 16;
  state.flash = 1;
  stopEngineLoop();
  playCrash();
  burst(state.playerX, state.playerY - 20, "#f5c518", 28);
  burst(state.playerX, state.playerY - 30, "#e85d04", 16);
  burst(state.playerX, state.playerY - 10, "#fff", 10);

  flashEl.classList.remove("show");
  void flashEl.offsetWidth;
  flashEl.classList.add("show");

  document.getElementById("app").classList.add("crashed");

  overlayEyebrow.textContent = "Engine stalled";
  overlayTitle.textContent = "Crash!";
  overlayMsg.textContent = `You covered ${Math.floor(state.score)} meters before the jam caught up.`;
  startBtn.textContent = "Ride Again";
  overlay.classList.remove("hidden");
}

function moveLane(dir) {
  if (!state.running) return;
  const next = state.playerLane + dir;
  if (next < 0 || next >= LANES) return;
  state.playerLane = next;
  state.lean = dir * 0.42;
  playSwerve(dir);
  // tire squeak dust
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      x: state.playerX + (Math.random() - 0.5) * 20,
      y: state.playerY + 4,
      vx: -dir * (40 + Math.random() * 60),
      vy: -20 - Math.random() * 40,
      life: 0.25 + Math.random() * 0.25,
      maxLife: 0.5,
      color: "rgba(200,190,170,0.7)",
      size: 3 + Math.random() * 5,
      kind: "dust",
    });
  }
}

function spawnVehicle() {
  const lane = Math.floor(Math.random() * LANES);
  const sameLane = state.vehicles.filter((v) => v.lane === lane);
  if (sameLane.some((v) => v.y < 140)) return;

  const kind = Math.random() < 0.28 ? "bike" : Math.random() < 0.12 ? "bus" : "car";
  let w;
  let h;
  let color;
  if (kind === "bike") {
    w = laneWidth * 0.28;
    h = 52;
    color = BIKE_COLORS[Math.floor(Math.random() * BIKE_COLORS.length)];
  } else if (kind === "bus") {
    w = laneWidth * 0.62;
    h = 110;
    color = "#e9c46a";
  } else {
    w = laneWidth * 0.52;
    h = 78;
    color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }

  state.vehicles.push({
    lane,
    x: laneCenter(lane),
    y: -h - 20,
    w,
    h,
    kind,
    color,
    sway: Math.random() * Math.PI * 2,
    missed: false,
  });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.45 + Math.random() * 0.55,
      maxLife: 1,
      color,
      size: 2 + Math.random() * 5,
      kind: "spark",
    });
  }
}

function emitExhaust(dt) {
  state.exhaustTimer -= dt;
  if (state.exhaustTimer > 0) return;
  state.exhaustTimer = 0.04;
  const leanOff = state.lean * 18;
  state.particles.push({
    x: state.playerX - leanOff + (Math.random() - 0.5) * 8,
    y: state.playerY - 8,
    vx: (Math.random() - 0.5) * 20,
    vy: 30 + Math.random() * 40 + state.speed * 0.04,
    life: 0.35 + Math.random() * 0.25,
    maxLife: 0.6,
    color: `rgba(${90 + Math.random() * 40},${90 + Math.random() * 30},${80},0.55)`,
    size: 6 + Math.random() * 8,
    kind: "smoke",
  });
}

function update(dt) {
  if (!state.running) {
    state.shake = Math.max(0, state.shake - dt * 28);
    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.lean += (0 - state.lean) * Math.min(1, 6 * dt);
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === "smoke" ? -20 : 280) * dt;
      p.life -= dt;
      if (p.kind === "smoke") p.size += 20 * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    return;
  }

  state.elapsed += dt;
  state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.elapsed * SPEED_RAMP);
  state.score += state.speed * dt * 0.12;
  const scoreInt = Math.floor(state.score);
  scoreEl.textContent = String(scoreInt);

  // Milestone every 100m
  if (scoreInt >= state.lastMilestone + 100) {
    state.lastMilestone = Math.floor(scoreInt / 100) * 100;
    playMilestone();
    statsEl.classList.remove("pulse");
    void statsEl.offsetWidth;
    statsEl.classList.add("pulse");
  }

  updateEngineSound(state.speed);
  state.roadOffset = (state.roadOffset + state.speed * dt) % 80;
  state.wheelAngle += (state.speed / 28) * dt;
  state.lean += (0 - state.lean) * Math.min(1, 5 * dt);

  const targetX = laneCenter(state.playerLane);
  state.playerX += (targetX - state.playerX) * Math.min(1, 14 * dt);

  emitExhaust(dt);

  // Speed lines
  const speedT = (state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  if (Math.random() < 0.3 + speedT * 0.7) {
    const side = Math.random() < 0.5 ? -1 : 1;
    state.speedLines.push({
      x: roadLeft + roadWidth / 2 + side * (roadWidth * 0.15 + Math.random() * roadWidth * 0.35),
      y: -20,
      len: 12 + speedT * 40 + Math.random() * 30,
      speed: state.speed * (1.4 + Math.random() * 0.6),
      alpha: 0.15 + speedT * 0.35,
    });
  }
  for (const line of state.speedLines) {
    line.y += line.speed * dt;
  }
  state.speedLines = state.speedLines.filter((l) => l.y < H + 40);

  // Scenery scroll
  for (const s of state.scenery) {
    s.y += state.speed * dt * 0.95;
    if (s.y > H + 60) {
      s.y = -40 - Math.random() * 80;
      s.kind = Math.random() < 0.45 ? "tree" : Math.random() < 0.5 ? "pole" : "stall";
    }
  }

  const spawnInterval = Math.max(SPAWN_MIN, SPAWN_BASE - state.elapsed * 0.035);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnVehicle();
    state.spawnTimer = spawnInterval * (0.75 + Math.random() * 0.5);
  }

  const player = playerHitbox();

  for (const v of state.vehicles) {
    v.y += state.speed * dt;
    v.sway += dt * 3;
    v.x = laneCenter(v.lane) + Math.sin(v.sway) * 2;

    if (rectsOverlap(player, vehicleHitbox(v))) {
      endGame();
      return;
    }

    // Near miss: adjacent lane, close vertically
    if (
      !v.missed &&
      Math.abs(v.lane - state.playerLane) === 1 &&
      Math.abs(v.y - state.playerY) < 50
    ) {
      v.missed = true;
      playNearMiss();
      state.shake = Math.max(state.shake, 3);
    }
  }

  state.vehicles = state.vehicles.filter((v) => v.y < H + 140);

  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "smoke") {
      p.vy += -30 * dt;
      p.size += 18 * dt;
      p.vx *= 0.98;
    } else if (p.kind === "dust") {
      p.vy += 120 * dt;
    } else {
      p.vy += 280 * dt;
    }
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  state.shake = Math.max(0, state.shake - dt * 20);
  state.flash = Math.max(0, state.flash - dt * 2);
}

function playerHitbox() {
  const w = laneWidth * 0.42;
  const h = 70;
  return {
    x: state.playerX - w / 2 + 6,
    y: state.playerY - h + 8,
    w: w - 12,
    h: h - 16,
  };
}

function vehicleHitbox(v) {
  return {
    x: v.x - v.w / 2 + 4,
    y: v.y - v.h + 6,
    w: v.w - 8,
    h: v.h - 12,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawScenery() {
  for (const s of state.scenery) {
    const edge = s.side < 0 ? roadLeft - 8 : roadLeft + roadWidth + 8;
    const x = edge + s.side * (18 + (s.kind === "stall" ? 10 : 0));

    if (s.kind === "tree") {
      ctx.fillStyle = "#2a231c";
      ctx.fillRect(x - 3, s.y - 10, 6, 28);
      ctx.fillStyle = `hsl(${95 + s.hue * 0.2}, 35%, 28%)`;
      ctx.beginPath();
      ctx.arc(x, s.y - 28, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 10, s.y - 18, 12, 0, Math.PI * 2);
      ctx.arc(x + 10, s.y - 18, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === "pole") {
      ctx.fillStyle = "#5c5348";
      ctx.fillRect(x - 2, s.y - 50, 4, 60);
      ctx.fillStyle = "#c9a227";
      ctx.beginPath();
      ctx.arc(x, s.y - 50, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `hsl(${s.hue}, 55%, 42%)`;
      roundRect(x - 14, s.y - 22, 28, 24, 3);
      ctx.fill();
      ctx.fillStyle = "#1a1510";
      roundRect(x - 16, s.y - 26, 32, 6, 2);
      ctx.fill();
    }
  }
}

function drawRoad() {
  ctx.fillStyle = "#3a342c";
  ctx.fillRect(0, 0, W, H);

  drawScenery();

  ctx.fillStyle = "#2b3036";
  ctx.fillRect(roadLeft, 0, roadWidth, H);

  const edgeGradL = ctx.createLinearGradient(roadLeft - 18, 0, roadLeft + 10, 0);
  edgeGradL.addColorStop(0, "rgba(0,0,0,0)");
  edgeGradL.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = edgeGradL;
  ctx.fillRect(roadLeft - 18, 0, 28, H);

  const edgeGradR = ctx.createLinearGradient(
    roadLeft + roadWidth - 10,
    0,
    roadLeft + roadWidth + 18,
    0
  );
  edgeGradR.addColorStop(0, "rgba(0,0,0,0.35)");
  edgeGradR.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = edgeGradR;
  ctx.fillRect(roadLeft + roadWidth - 10, 0, 28, H);

  ctx.strokeStyle = "rgba(245, 197, 24, 0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([28, 22]);
  ctx.lineDashOffset = -state.roadOffset;
  for (let i = 1; i < LANES; i++) {
    const x = roadLeft + laneWidth * i;
    ctx.beginPath();
    ctx.moveTo(x, -40);
    ctx.lineTo(x, H + 40);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(242, 232, 213, 0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(roadLeft + 3, 0);
  ctx.lineTo(roadLeft + 3, H);
  ctx.moveTo(roadLeft + roadWidth - 3, 0);
  ctx.lineTo(roadLeft + roadWidth - 3, H);
  ctx.stroke();

  const haze = ctx.createLinearGradient(0, 0, 0, H * 0.35);
  haze.addColorStop(0, "rgba(61, 52, 40, 0.55)");
  haze.addColorStop(1, "rgba(61, 52, 40, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(roadLeft, 0, roadWidth, H * 0.35);
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCar(v) {
  const x = v.x;
  const y = v.y;
  const w = v.w;
  const h = v.h;
  const bob = Math.sin(v.sway * 2) * 1.2;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, w * 0.48, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y + bob);

  if (v.kind === "bike") {
    ctx.fillStyle = v.color;
    roundRect(-w / 2, -h, w, h * 0.55, 6);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    roundRect(-w * 0.28, -h * 0.95, w * 0.56, h * 0.28, 4);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, -8, w * 0.38, 0, Math.PI * 2);
    ctx.arc(0, -h + 10, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // headlight blink
    ctx.fillStyle = `rgba(255, 240, 180, ${0.5 + Math.sin(v.sway * 4) * 0.4})`;
    ctx.beginPath();
    ctx.arc(0, -h + 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = v.color;
  roundRect(-w / 2, -h, w, h, v.kind === "bus" ? 8 : 10);
  ctx.fill();

  ctx.fillStyle = "rgba(200, 230, 255, 0.55)";
  if (v.kind === "bus") {
    roundRect(-w * 0.38, -h + 12, w * 0.76, 22, 4);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      roundRect(-w * 0.38, -h + 42 + i * 20, w * 0.76, 14, 3);
      ctx.fill();
    }
  } else {
    roundRect(-w * 0.34, -h + 12, w * 0.68, h * 0.28, 5);
    ctx.fill();
    roundRect(-w * 0.34, -h * 0.42, w * 0.68, h * 0.18, 4);
    ctx.fill();
  }

  ctx.fillStyle = "#ffe566";
  roundRect(-w * 0.36, -10, 10, 6, 2);
  ctx.fill();
  roundRect(w * 0.36 - 10, -10, 10, 6, 2);
  ctx.fill();

  // Soft headlight beams
  const beam = ctx.createLinearGradient(0, 0, 0, 50);
  beam.addColorStop(0, "rgba(255, 230, 140, 0.18)");
  beam.addColorStop(1, "rgba(255, 230, 140, 0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, 0);
  ctx.lineTo(-w * 0.55, 55);
  ctx.lineTo(w * 0.55, 55);
  ctx.lineTo(w * 0.3, 0);
  ctx.fill();

  ctx.restore();
}

function drawWheel(cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.wheelAngle);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.lineTo(r * 0.7, 0);
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(0, r * 0.7);
  ctx.stroke();
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRickshaw() {
  const x = state.playerX;
  const y = state.playerY;
  const w = laneWidth * 0.48;
  const h = 78;
  const bob = Math.sin(state.elapsed * 12) * 1.5;
  const lean = state.lean;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x + lean * 10, y + 6, w * 0.5, 9, lean * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(lean);

  // Body
  ctx.fillStyle = "#f5c518";
  roundRect(-w / 2, -h, w, h * 0.72, 10);
  ctx.fill();

  ctx.fillStyle = "#1a1510";
  roundRect(-w / 2, -h * 0.38, w, h * 0.38, 8);
  ctx.fill();

  ctx.fillStyle = "#2d6a4f";
  ctx.fillRect(-w / 2, -h * 0.42, w, 6);

  ctx.fillStyle = "rgba(170, 210, 230, 0.65)";
  roundRect(-w * 0.36, -h + 10, w * 0.72, h * 0.28, 6);
  ctx.fill();

  // Window glint animation
  const glint = (Math.sin(state.elapsed * 3) + 1) * 0.5;
  ctx.fillStyle = `rgba(255,255,255,${0.08 + glint * 0.12})`;
  roundRect(-w * 0.3, -h + 14, w * 0.25, h * 0.2, 4);
  ctx.fill();

  ctx.strokeStyle = "#1a1510";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h + 4);
  ctx.lineTo(w * 0.42, -h + 4);
  ctx.stroke();

  ctx.fillStyle = "#1a1510";
  roundRect(-w * 0.12, -12, w * 0.24, 14, 4);
  ctx.fill();

  drawWheel(0, 4, 11);
  drawWheel(-w * 0.32, 2, 9);
  drawWheel(w * 0.32, 2, 9);

  // Headlight pulse
  const pulse = 0.55 + Math.sin(state.elapsed * 8) * 0.35;
  ctx.fillStyle = `rgba(255, 243, 191, ${pulse})`;
  ctx.beginPath();
  ctx.arc(0, -18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 230, 140, ${0.12 + pulse * 0.1})`;
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.lineTo(-28, 40);
  ctx.lineTo(28, 40);
  ctx.lineTo(6, -14);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    const lifeT = Math.max(0, p.life / (p.maxLife || 0.8));
    ctx.globalAlpha = p.kind === "smoke" ? lifeT * 0.45 : Math.max(0, lifeT * 1.4);
    ctx.fillStyle = p.color;
    if (p.kind === "smoke") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSpeedLines() {
  ctx.lineWidth = 2;
  for (const line of state.speedLines) {
    ctx.strokeStyle = `rgba(242, 232, 213, ${line.alpha})`;
    ctx.beginPath();
    ctx.moveTo(line.x, line.y);
    ctx.lineTo(line.x, line.y + line.len);
    ctx.stroke();
  }
}

function drawSpeedVignette() {
  const t = (state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  if (t <= 0 && state.flash <= 0) return;
  const g = ctx.createRadialGradient(
    W / 2,
    H * 0.55,
    H * 0.2,
    W / 2,
    H * 0.55,
    H * 0.85
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.15 + t * 0.28})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 120, 40, ${state.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (state.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake,
      (Math.random() - 0.5) * state.shake
    );
  }

  drawRoad();
  drawSpeedLines();

  const sorted = [...state.vehicles].sort((a, b) => a.y - b.y);
  for (const v of sorted) drawCar(v);

  drawRickshaw();
  drawParticles();
  drawSpeedVignette();

  ctx.restore();
}

function loop(ts) {
  if (!state.lastTime) state.lastTime = ts;
  let dt = (ts - state.lastTime) / 1000;
  state.lastTime = ts;
  dt = Math.min(dt, 0.05);

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------- Controls ---------- */
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
    e.preventDefault();
    moveLane(-1);
  } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
    e.preventDefault();
    moveLane(1);
  } else if ((e.key === "Enter" || e.key === " ") && !state.running) {
    e.preventDefault();
    resetGame();
  } else if (e.key === "m" || e.key === "M") {
    setMuted(!audio.muted);
  }
});

function bindTap(el, dir) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    moveLane(dir);
    el.classList.add("pressed");
    setTimeout(() => el.classList.remove("pressed"), 120);
  });
}

bindTap(tapLeft, -1);
bindTap(tapRight, 1);

canvas.addEventListener(
  "pointerdown",
  (e) => {
    if (!state.running) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    moveLane(x < rect.width / 2 ? -1 : 1);
  },
  { passive: true }
);

startBtn.addEventListener("click", () => resetGame());

muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  unlockAudio().then(() => setMuted(!audio.muted));
});

try {
  if (localStorage.getItem("rickshaw-muted") === "1") setMuted(true);
} catch {
  /* ignore */
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(loop);
