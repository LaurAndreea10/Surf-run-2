const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

const $ = (selector) => document.querySelector(selector);
const scoreEl = $('#score');
const xpEl = $('#xp');
const coinsEl = $('#coins');
const bestEl = $('#best');
const modeNameEl = $('#modeName');
const overlay = $('#overlay');
const startBtn = $('#startBtn');
const pauseBtn = $('#pauseBtn');
const langBtn = $('#langBtn');
const soundBtn = $('#soundBtn');
const motionBtn = $('#motionBtn');
const missionList = $('#missionList');

const i18n = {
  ro: {
    title: 'Beach Mission Arcade',
    subtitle: 'Aleargă pe plajă, adună scoici, evită crabii și intră în apă când deblochezi placa.',
    reducedMotion: 'Motion', score: 'Scor', coins: 'Scoici', best: 'Record', mode: 'Mod',
    stage: 'Stage 1 · Beach', menuTitle: 'Pregătește-te pentru valuri',
    menuText: 'Completează misiuni pe nisip, adună energie și evită obstacolele. La 12 scoici intri în Surf Mode.',
    start: 'Start joc', pause: 'Pauză', resume: 'Continuă', missions: 'Misiuni', missionsTitle: 'Drumul spre apă',
    gameOver: 'Joc terminat', restart: 'Joacă din nou', surf: 'Surf Mode deblocat!',
    m1: 'Adună 12 scoici', m2: 'Sari peste 6 obstacole', m3: 'Supraviețuiește 45 secunde'
  },
  en: {
    title: 'Beach Mission Arcade',
    subtitle: 'Run across the beach, collect shells, dodge crabs and enter the water when the board unlocks.',
    reducedMotion: 'Motion', score: 'Score', coins: 'Shells', best: 'Best', mode: 'Mode',
    stage: 'Stage 1 · Beach', menuTitle: 'Get ready for the waves',
    menuText: 'Complete sand missions, build energy and avoid obstacles. At 12 shells you enter Surf Mode.',
    start: 'Start game', pause: 'Pause', resume: 'Resume', missions: 'Missions', missionsTitle: 'Road to water',
    gameOver: 'Game over', restart: 'Play again', surf: 'Surf Mode unlocked!',
    m1: 'Collect 12 shells', m2: 'Jump over 6 obstacles', m3: 'Survive 45 seconds'
  }
};

let lang = localStorage.getItem('surf2_lang') || 'ro';
let mode = 'story';
let best = Number(localStorage.getItem('surf2_best') || 0);
let soundOn = false;
let reducedMotion = false;
let audioCtx = null;
let rafId = 0;
let keys = new Set();
let game;

const baseMissions = () => [
  { key: 'm1', goal: 12, value: 0, done: false },
  { key: 'm2', goal: 6, value: 0, done: false },
  { key: 'm3', goal: 45, value: 0, done: false }
];

function newGame() {
  return {
    running: false,
    paused: false,
    over: false,
    time: 0,
    last: 0,
    score: 0,
    xp: 0,
    coins: 0,
    speed: mode === 'rush' ? 430 : 330,
    gravity: 1750,
    ground: 408,
    surfMode: false,
    messageTimer: 0,
    player: { x: 155, y: 408, w: 48, h: 70, vy: 0, lane: 0, inv: 0 },
    items: [],
    obstacles: [],
    particles: [],
    spawnItem: 0,
    spawnObstacle: 0,
    distance: 0,
    jumpsOver: 0,
    missions: baseMissions()
  };
}

game = newGame();
bestEl.textContent = best;

function t(key) { return i18n[lang][key] || key; }

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  langBtn.textContent = lang === 'ro' ? 'EN' : 'RO';
  pauseBtn.textContent = game.paused ? t('resume') : t('pause');
  renderMissions();
}

function renderMissions() {
  missionList.innerHTML = '';
  game.missions.forEach((mission) => {
    const li = document.createElement('li');
    li.className = mission.done ? 'done' : '';
    li.textContent = `${mission.done ? '✅' : '▫️'} ${t(mission.key)} · ${Math.min(mission.value, mission.goal)}/${mission.goal}`;
    missionList.appendChild(li);
  });
}

function beep(freq = 520, duration = 0.07, type = 'sine') {
  if (!soundOn) return;
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = type;
  gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function resetAndStart() {
  game = newGame();
  overlay.classList.add('hidden');
  game.running = true;
  game.last = performance.now();
  renderMissions();
  updateHud();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  if (mode === 'zen') return;
  game.over = true;
  game.running = false;
  best = Math.max(best, Math.floor(game.score));
  localStorage.setItem('surf2_best', best);
  bestEl.textContent = best;
  overlay.classList.remove('hidden');
  overlay.querySelector('h2').textContent = t('gameOver');
  overlay.querySelector('p:not(.badge)').textContent = `${t('score')}: ${Math.floor(game.score)} · XP: ${Math.floor(game.xp)} · ${t('coins')}: ${game.coins}`;
  startBtn.textContent = t('restart');
  beep(150, 0.2, 'sawtooth');
}

function updateHud() {
  scoreEl.textContent = Math.floor(game.score);
  xpEl.textContent = Math.floor(game.xp);
  coinsEl.textContent = game.coins;
  modeNameEl.textContent = mode[0].toUpperCase() + mode.slice(1) + (game.surfMode ? ' + Surf' : '');
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('.mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
  modeNameEl.textContent = mode[0].toUpperCase() + mode.slice(1);
}

function jump() {
  if (!game.running || game.paused) return;
  if (Math.abs(game.player.y - game.ground) < 2) {
    game.player.vy = game.surfMode ? -760 : -830;
    beep(620, 0.05);
    splash(game.player.x, game.player.y + game.player.h, '#fff5d0');
  }
}

function move(dir) {
  if (!game.running || game.paused) return;
  game.player.lane = Math.max(-1, Math.min(1, game.player.lane + dir));
}

function spawnShell() {
  const y = game.ground - 50 - Math.random() * 145;
  game.items.push({ x: canvas.width + 40, y, r: 14, taken: false, bob: Math.random() * 10 });
}

function spawnObstacle() {
  const types = game.surfMode ? ['buoy', 'wave', 'drift'] : ['crab', 'umbrella', 'castle'];
  const type = types[Math.floor(Math.random() * types.length)];
  const size = type === 'umbrella' ? 74 : 54;
  game.obstacles.push({ x: canvas.width + 80, y: game.ground + 10 - size, w: size, h: size, type, passed: false });
}

function splash(x, y, color = '#e8ffff') {
  if (reducedMotion) return;
  for (let i = 0; i < 12; i++) {
    game.particles.push({ x, y, vx: -120 + Math.random() * 240, vy: -220 + Math.random() * 160, life: .5 + Math.random() * .4, color });
  }
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleHit(player, item) {
  const cx = Math.max(player.x, Math.min(item.x, player.x + player.w));
  const cy = Math.max(player.y, Math.min(item.y, player.y + player.h));
  return Math.hypot(item.x - cx, item.y - cy) < item.r + 4;
}

function updateMissions() {
  const values = [game.coins, game.jumpsOver, Math.floor(game.time)];
  game.missions.forEach((mission, index) => {
    mission.value = values[index];
    const wasDone = mission.done;
    mission.done = mission.value >= mission.goal;
    if (!wasDone && mission.done) beep(880, 0.13, 'triangle');
  });
  renderMissions();
}

function unlockSurfMode() {
  if (game.surfMode || game.coins < 12) return;
  game.surfMode = true;
  game.speed += 45;
  game.messageTimer = 2.4;
  splash(game.player.x + 20, game.ground + 20, '#a7fff5');
  beep(980, 0.18, 'triangle');
}

function update(dt) {
  if (!game.running || game.paused) return;
  game.time += dt;
  game.distance += game.speed * dt;
  game.score += (game.surfMode ? 18 : 10) * dt;
  game.xp += (game.surfMode ? 8 : 5) * dt;
  if (mode === 'rush') game.speed += 7 * dt;
  if (mode === 'zen') game.score += 4 * dt;
  game.messageTimer = Math.max(0, game.messageTimer - dt);

  const targetLaneX = 155 + game.player.lane * 58;
  game.player.x += (targetLaneX - game.player.x) * Math.min(1, dt * 12);
  game.player.vy += game.gravity * dt;
  game.player.y += game.player.vy * dt;
  if (game.player.y > game.ground) {
    game.player.y = game.ground;
    game.player.vy = 0;
  }
  game.player.inv = Math.max(0, game.player.inv - dt);

  if (keys.has('ArrowLeft') || keys.has('a')) move(-1);
  if (keys.has('ArrowRight') || keys.has('d')) move(1);

  game.spawnItem -= dt;
  game.spawnObstacle -= dt;
  if (game.spawnItem <= 0) {
    spawnShell();
    game.spawnItem = .75 + Math.random() * 1.1;
  }
  if (game.spawnObstacle <= 0) {
    spawnObstacle();
    game.spawnObstacle = mode === 'zen' ? 2.2 : 1.15 + Math.random() * 1.15;
  }

  game.items.forEach((item) => {
    item.x -= game.speed * dt;
    item.bob += dt * 6;
    if (!item.taken && circleHit(game.player, item)) {
      item.taken = true;
      game.coins += 1;
      game.score += 35;
      game.xp += 12;
      splash(item.x, item.y, '#ffd166');
      beep(740, 0.06, 'triangle');
      unlockSurfMode();
    }
  });
  game.items = game.items.filter((item) => item.x > -40 && !item.taken);

  game.obstacles.forEach((ob) => {
    ob.x -= game.speed * dt;
    if (!ob.passed && ob.x + ob.w < game.player.x) {
      ob.passed = true;
      game.jumpsOver += 1;
      game.score += 18;
    }
    if (game.player.inv <= 0 && rectHit(game.player, ob)) {
      if (mode === 'zen') {
        game.player.inv = 1.1;
        game.score = Math.max(0, game.score - 30);
        splash(game.player.x, game.player.y + game.player.h, '#ffb3b3');
      } else {
        endGame();
      }
    }
  });
  game.obstacles = game.obstacles.filter((ob) => ob.x > -120);

  game.particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
  });
  game.particles = game.particles.filter((p) => p.life > 0);

  updateMissions();
  updateHud();
}

function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;
  const waveOffset = reducedMotion ? 0 : (game.distance * .025) % 80;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#61d9f4');
  grad.addColorStop(.48, '#9ef1f0');
  grad.addColorStop(.49, game.surfMode ? '#41c7d8' : '#f4c37a');
  grad.addColorStop(1, game.surfMode ? '#087e9c' : '#d9904a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#fff2a3';
  ctx.beginPath();
  ctx.arc(790, 92, 46, 0, Math.PI * 2);
  ctx.fill();

  for (let i = -2; i < 15; i++) {
    ctx.strokeStyle = game.surfMode ? 'rgba(255,255,255,.44)' : 'rgba(255,255,255,.32)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const y = game.surfMode ? 350 + Math.sin(i) * 8 : 300 + Math.sin(i) * 5;
    ctx.moveTo(i * 90 - waveOffset, y);
    ctx.quadraticCurveTo(i * 90 + 45 - waveOffset, y - 20, i * 90 + 90 - waveOffset, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,.36)';
  for (let i = 0; i < 9; i++) {
    const x = (i * 150 - game.distance * .07) % (w + 180) - 90;
    ctx.beginPath();
    ctx.ellipse(x, 72 + (i % 3) * 34, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const p = game.player;
  ctx.save();
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) ctx.globalAlpha = .45;
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  const lean = (p.x - (155 + p.lane * 58)) * -.003;
  ctx.rotate(lean);
  ctx.fillStyle = game.surfMode ? '#7ff7e7' : '#ff6f91';
  ctx.fillRect(-20, -20, 40, 42);
  ctx.fillStyle = '#532f1b';
  ctx.beginPath();
  ctx.arc(0, -38, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-23, 22, 46, 9);
  if (game.surfMode) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-34, 34, 68, 10);
  } else {
    ctx.strokeStyle = '#07323a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-18, 35); ctx.lineTo(-7, 49);
    ctx.moveTo(18, 35); ctx.lineTo(7, 49);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShell(item) {
  ctx.save();
  ctx.translate(item.x, item.y + Math.sin(item.bob) * 5);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, item.r, Math.PI, 0);
  ctx.lineTo(item.r, item.r * .8);
  ctx.lineTo(-item.r, item.r * .8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,45,20,.35)';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(i * 6, item.r * .8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObstacle(ob) {
  ctx.save();
  ctx.translate(ob.x, ob.y);
  if (ob.type === 'crab') {
    ctx.fillStyle = '#ff7b7b';
    ctx.beginPath(); ctx.ellipse(ob.w/2, ob.h/2, ob.w*.36, ob.h*.26, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ob.w*.38, ob.h*.35, 5, 0, Math.PI*2); ctx.arc(ob.w*.62, ob.h*.35, 5, 0, Math.PI*2); ctx.fill();
  } else if (ob.type === 'umbrella') {
    ctx.fillStyle = '#07323a'; ctx.fillRect(ob.w*.48, ob.h*.25, 5, ob.h*.72);
    ctx.fillStyle = '#ff6f91';
    ctx.beginPath(); ctx.arc(ob.w/2, ob.h*.28, ob.w*.42, Math.PI, 0); ctx.fill();
  } else if (ob.type === 'castle') {
    ctx.fillStyle = '#c98242';
    ctx.fillRect(6, 18, ob.w - 12, ob.h - 18);
    ctx.fillRect(8, 5, 12, 18); ctx.fillRect(ob.w-20, 5, 12, 18);
  } else if (ob.type === 'wave') {
    ctx.fillStyle = '#e6ffff'; ctx.beginPath(); ctx.arc(ob.w*.5, ob.h*.58, ob.w*.42, Math.PI, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#39c6e5'; ctx.fillRect(0, ob.h*.55, ob.w, ob.h*.35);
  } else if (ob.type === 'buoy') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ob.w/2, ob.h/2, ob.w*.36, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff5b5b'; ctx.lineWidth = 8; ctx.stroke();
  } else {
    ctx.fillStyle = '#6f4d35'; ctx.fillRect(12, 10, ob.w - 24, ob.h - 16);
  }
  ctx.restore();
}

function draw() {
  drawBackground();
  game.items.forEach(drawShell);
  game.obstacles.forEach(drawObstacle);
  drawPlayer();

  game.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  if (game.messageTimer > 0) {
    ctx.fillStyle = 'rgba(2,24,37,.74)';
    ctx.fillRect(300, 34, 360, 56);
    ctx.fillStyle = '#7ff7e7';
    ctx.font = '800 25px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(t('surf'), 480, 70);
    ctx.textAlign = 'start';
  }

  if (game.paused) {
    ctx.fillStyle = 'rgba(3,18,28,.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '900 52px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(t('pause'), canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'start';
  }
}

function loop(now) {
  const dt = Math.min(.033, (now - game.last) / 1000 || 0);
  game.last = now;
  update(dt);
  draw();
  if (game.running) rafId = requestAnimationFrame(loop);
}

startBtn.addEventListener('click', resetAndStart);
pauseBtn.addEventListener('click', () => {
  if (!game.running) return;
  game.paused = !game.paused;
  pauseBtn.textContent = game.paused ? t('resume') : t('pause');
  if (!game.paused) {
    game.last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
});

langBtn.addEventListener('click', () => {
  lang = lang === 'ro' ? 'en' : 'ro';
  localStorage.setItem('surf2_lang', lang);
  applyLang();
});

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.textContent = soundOn ? '🔊' : '🔈';
  beep(520, 0.06);
});

motionBtn.addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  document.body.classList.toggle('reduce-motion', reducedMotion);
  motionBtn.setAttribute('aria-pressed', String(reducedMotion));
});

document.querySelectorAll('.mode').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if ([' ', 'arrowup', 'w'].includes(key)) { event.preventDefault(); jump(); }
  if (key === 'p') pauseBtn.click();
});
document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

$('#leftBtn').addEventListener('click', () => move(-1));
$('#rightBtn').addEventListener('click', () => move(1));
$('#jumpBtn').addEventListener('click', jump);

let touchStartX = 0;
canvas.addEventListener('pointerdown', (event) => { touchStartX = event.clientX; });
canvas.addEventListener('pointerup', (event) => {
  const dx = event.clientX - touchStartX;
  if (Math.abs(dx) > 35) move(dx > 0 ? 1 : -1);
  else jump();
});

applyLang();
draw();
