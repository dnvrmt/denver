// Simple Jet Defender game
// Place assets in ./assets/ folder (see README in this message for filenames)

// CONFIG
const ASSET_PATH = 'assets/';
const PLAYER_IMG = ASSET_PATH + 'jet.png';
const ENEMY_IMAGES = [
  ASSET_PATH + 'enemy1.jpg',
  ASSET_PATH + 'enemy2.jpg',
  ASSET_PATH + 'enemy3.jpg'
];
const BULLET_IMG = ASSET_PATH + 'bullet.png'; // recommended name
const POWER_DOUBLE = ASSET_PATH + 'double.png';
const POWER_SHIELD = ASSET_PATH + 'shield.png';
const SOUND_SHOOT = ASSET_PATH + 'shoot.mp3';
const SOUND_EXPLODE = ASSET_PATH + 'explosion.mp3';
const MUSIC_BG = ASSET_PATH + 'background_music.mp3';

const MAX_LEVEL = 5;
const SHIELD_DURATION = 15000; // ms

// Canvas setup
const bgCanvas = document.getElementById('bg-canvas');
const canvas = document.getElementById('game-canvas');
const bgCtx = bgCanvas.getContext('2d');
const ctx = canvas.getContext('2d');

let w, h;
function resize() {
  w = canvas.width = bgCanvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  h = canvas.height = bgCanvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  bgCanvas.style.width = window.innerWidth + 'px';
  bgCanvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resize);
resize();

// UI elements
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const highscoreEl = document.getElementById('highscore');
const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');
const shootBtn = document.getElementById('shoot-btn');

let audioShoot = new Audio(SOUND_SHOOT);
let audioExplode = new Audio(SOUND_EXPLODE);
let music = new Audio(MUSIC_BG);
music.loop = true;
music.volume = 0.35;

// Preload images
// Debug helper
const debugEl = document.createElement('div');
debugEl.style.position = 'fixed';
debugEl.style.top = '0';
debugEl.style.right = '0';
debugEl.style.background = 'rgba(0,0,0,0.8)';
debugEl.style.color = '#fff';
debugEl.style.padding = '10px';
debugEl.style.zIndex = '9999';
debugEl.style.pointerEvents = 'none';
debugEl.style.fontSize = '12px';
debugEl.style.fontFamily = 'monospace';
document.body.appendChild(debugEl);
function log(msg) { debugEl.innerHTML += msg + '<br>'; }

// Preload images
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.src = src;
    i.onload = () => { log('Loaded: ' + src); res(i); };
    i.onerror = () => { log('FAILED: ' + src); rej(src); };
  });
}
let IMAGES = {};
Promise.all([
  loadImage(PLAYER_IMG).then(i => IMAGES.player = i).catch(() => console.warn('Missing player image')),
  ...ENEMY_IMAGES.map((p, idx) => loadImage(p).then(i => IMAGES['enemy' + idx] = i).catch((e) => console.warn('Missing enemy', p))),
  loadImage(BULLET_IMG).then(i => IMAGES.bullet = i).catch(() => console.warn('Missing bullet', BULLET_IMG)),
  loadImage(POWER_DOUBLE).then(i => IMAGES.pdouble = i).catch(() => console.warn('Missing power double')),
  loadImage(POWER_SHIELD).then(i => IMAGES.pshield = i).catch(() => console.warn('Missing power shield')),
  loadImage(ASSET_PATH + 'explosion.png').then(i => IMAGES.explosion = i).catch(() => {/* optional */ })
]).catch(() => {/* ignore individual failures */ });

// Simple starfield on bgCanvas
const stars = Array.from({ length: 200 }, () => {
  return { x: Math.random() * w, y: Math.random() * h, z: Math.random() * 1.5 + 0.5, s: Math.random() * 1.5 + 0.2 };
});
function drawStars(dt) {
  bgCtx.clearRect(0, 0, w, h);
  bgCtx.fillStyle = '#000010';
  bgCtx.fillRect(0, 0, w, h);
  for (let s of stars) {
    s.y += s.z * (dt * 0.06);
    if (s.y > h) { s.y = -10; s.x = Math.random() * w; }
    bgCtx.beginPath();
    const alpha = Math.min(1, 0.6 + s.s * 0.3);
    bgCtx.fillStyle = `rgba(255,255,255,${alpha})`;
    bgCtx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
    bgCtx.fill();
  }
}

// GAME STATE
let player, bullets = [], enemies = [], powerups = [], particles = [];
let lastTime = 0;
let spawnTimer = 0;
let spawnInterval = 1500; // ms (decreases with level)
let running = false;
let score = 0;
let highscore = localStorage.getItem('jetGameHighScore') ? parseInt(localStorage.getItem('jetGameHighScore')) : 0;
highscoreEl.textContent = 'High: ' + highscore;
let level = 1;
let lives = 3;

// Player object
function createPlayer() {
  return {
    x: w / 2,
    y: h - 140 * devicePixelRatio,
    w: 64 * devicePixelRatio,
    h: 64 * devicePixelRatio,
    speed: 550 * devicePixelRatio,
    cooldown: 0,
    doubleShotUntil: 0,
    shieldUntil: 0,
    alive: true
  };
}

function spawnEnemy() {
  // enemy types: choose random image
  const type = Math.floor(Math.random() * ENEMY_IMAGES.length);
  const img = IMAGES['enemy' + type];
  // spawn at random x, y=-...
  const size = (40 + Math.random() * 40) * devicePixelRatio;
  const x = Math.random() * (w - size) + size / 2;
  const y = -50 * devicePixelRatio;
  const speed = (80 + Math.random() * 120 + (level - 1) * 40) * devicePixelRatio;
  enemies.push({ x, y, size, speed, img, rot: Math.random() * 0.6 - 0.3, hp: 1 + Math.floor(level / 2) });
}

function spawnPowerup(x, y) {
  const what = Math.random() < 0.5 ? 'double' : 'shield';
  const img = what === 'double' ? IMAGES.pdouble : IMAGES.pshield;
  powerups.push({ x, y, vy: 120 * devicePixelRatio, what, img, size: 48 * devicePixelRatio });
}

// bullet spawn
function shoot() {
  if (!player || !player.alive) return;
  if (player.cooldown > 0) return;
  player.cooldown = 200; // ms between shots
  audioShoot.currentTime = 0;
  audioShoot.play().catch(() => { });
  const bx = player.x;
  const by = player.y - player.h * 0.4;
  const speed = 900 * devicePixelRatio;
  if (Date.now() < player.doubleShotUntil) {
    // double bullets
    bullets.push({ x: bx - 18 * devicePixelRatio, y: by, vx: -80 * devicePixelRatio, vy: -speed, size: 22 * devicePixelRatio, img: IMAGES.bullet });
    bullets.push({ x: bx + 18 * devicePixelRatio, y: by, vx: 80 * devicePixelRatio, vy: -speed, size: 22 * devicePixelRatio, img: IMAGES.bullet });
  } else {
    bullets.push({ x: bx, y: by, vx: 0, vy: -speed, size: 22 * devicePixelRatio, img: IMAGES.bullet });
  }
}

// collisions
function rectCollide(a, b) {
  return a.x - (a.w || a.size) / 2 < b.x + (b.w || b.size) / 2 &&
    a.x + (a.w || a.size) / 2 > b.x - (b.w || b.size) / 2 &&
    a.y - (a.h || a.size) / 2 < b.y + (b.h || b.size) / 2 &&
    a.y + (a.h || a.size) / 2 > b.y - (b.h || b.size) / 2;
}

function spawnExplosion(x, y, amount = 20, color = '#ffcc66') {
  for (let i = 0; i < amount; i++) {
    particles.push({
      x, y,
      vx: (Math.random() * 2 - 1) * 250 * devicePixelRatio,
      vy: (Math.random() * 2 - 1) * 250 * devicePixelRatio,
      life: 500 + Math.random() * 700,
      t: 0,
      color,
      size: (2 + Math.random() * 4) * devicePixelRatio
    });
  }
  audioExplode.currentTime = 0;
  audioExplode.play().catch(() => { });
}

function update(dt) {
  // dt in ms
  // update player cooldowns
  if (player.cooldown > 0) player.cooldown -= dt;
  // spawn enemies
  spawnTimer += dt;
  if (spawnTimer > spawnInterval) {
    spawnTimer = 0;
    // spawn multiple sometimes
    const count = Math.min(1 + Math.floor(level / 2), 4);
    for (let i = 0; i < count; i++) spawnEnemy();
  }

  // move bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * (dt / 1000);
    b.y += b.vy * (dt / 1000);
    if (b.y < -100 || b.x < -200 || b.x > w + 200) bullets.splice(i, 1);
  }

  // move enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed * (dt / 1000);
    e.rot += 0.01 * (dt / 16);
    // check collision with player
    const enemyBox = { x: e.x, y: e.y, size: e.size };
    const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectCollide(enemyBox, playerBox)) {
      if (Date.now() < player.shieldUntil) {
        // shield blocks, destroy enemy
        spawnExplosion(e.x, e.y, 12, '#66ccff');
        enemies.splice(i, 1);
        score += 10;
      } else {
        // player hit
        spawnExplosion(e.x, e.y, 18);
        enemies.splice(i, 1);
        lives--;
        flashUI(livesEl);
        if (lives <= 0) { gameOver(); return; }
        // respawn player in middle
        player.x = w / 2;
      }
      continue;
    }
    // check bullets hit enemy
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (rectCollide({ x: b.x, y: b.y, size: b.size }, enemyBox)) {
        bullets.splice(j, 1);
        e.hp--;
        spawnExplosion(b.x, b.y, 8);
        if (e.hp <= 0) {
          spawnExplosion(e.x, e.y, 26);
          // chance to spawn powerup
          if (Math.random() < 0.12) { spawnPowerup(e.x, e.y); }
          enemies.splice(i, 1);
          score += 10;
        }
        break;
      }
    }
    // remove if off screen
    if (e.y > h + 100) enemies.splice(i, 1);
  }

  // powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy * (dt / 1000);
    if (rectCollide({ x: p.x, y: p.y, size: p.size }, { x: player.x, y: player.y, w: player.w, h: player.h })) {
      // collect
      if (p.what === 'double') {
        player.doubleShotUntil = Date.now() + 10000; // 10s double
      } else {
        player.shieldUntil = Date.now() + SHIELD_DURATION;
      }
      spawnExplosion(p.x, p.y, 12, '#88ff88');
      powerups.splice(i, 1);
      continue;
    }
    if (p.y > h + 100) powerups.splice(i, 1);
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const par = particles[i];
    par.t += dt;
    par.x += par.vx * (dt / 1000);
    par.y += par.vy * (dt / 1000);
    if (par.t > par.life) particles.splice(i, 1);
  }

  // level up check
  if (score > level * 100 && level < MAX_LEVEL) {
    level++;
    levelUp();
  }

  // update UI
  scoreEl.textContent = 'Score: ' + score;
  levelEl.textContent = 'Level: ' + level;
  livesEl.textContent = 'Lives: ' + lives;
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('jetGameHighScore', highscore);
    highscoreEl.textContent = 'High: ' + highscore;
  }
}

// draw
function draw() {
  ctx.clearRect(0, 0, w, h);
  // draw player
  if (IMAGES.player) {
    const p = IMAGES.player;
    const px = player.x, py = player.y, pw = player.w, ph = player.h;
    ctx.save();
    ctx.translate(px, py);
    // shield visual
    if (Date.now() < player.shieldUntil) {
      const t = (player.shieldUntil - Date.now()) / SHIELD_DURATION;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(pw, ph) * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,200,255,${0.15 + 0.35 * t})`;
      ctx.fill();
    }
    ctx.drawImage(p, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
  } else {
    // fallback player rectangle
    ctx.fillStyle = '#0ff';
    ctx.fillRect(player.x - 32 * devicePixelRatio, player.y - 32 * devicePixelRatio, 64 * devicePixelRatio, 64 * devicePixelRatio);
  }

  // bullets
  for (let b of bullets) {
    if (IMAGES.bullet) {
      const s = b.size;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.drawImage(IMAGES.bullet, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ff6';
      ctx.fillRect(b.x - 6 * devicePixelRatio, b.y - 10 * devicePixelRatio, 12 * devicePixelRatio, 20 * devicePixelRatio);
    }
  }

  // enemies
  for (let e of enemies) {
    if (e.img) {
      const s = e.size;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.drawImage(e.img, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = '#f55';
      ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
    }
  }

  // powerups
  for (let p of powerups) {
    if (p.img) {
      const s = p.size;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = '#8f8';
      ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
    }
  }

  // particles
  for (let par of particles) {
    const alpha = 1 - par.t / par.life;
    ctx.fillStyle = hexToRgba(par.color, alpha);
    ctx.beginPath();
    ctx.arc(par.x, par.y, par.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // HUD effects: small glow when double shot active
  if (Date.now() < player.doubleShotUntil) {
    ctx.fillStyle = 'rgba(255,255,120,0.04)';
    ctx.fillRect(0, 0, w, h);
  }
}

// helper
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function levelUp() {
  spawnInterval = Math.max(400, spawnInterval - 180);
  flashUI(levelEl);
  // small reward for leveling
  score += 10 * level;
}

// UI flash
function flashUI(el) {
  el.style.transform = 'scale(1.12)';
  setTimeout(() => el.style.transform = '', 120);
}

// main loop
function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min(40, ts - lastTime);
  lastTime = ts;
  drawStars(dt);
  if (running) {
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Input handling
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') { e.preventDefault(); shoot(); }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let touchLeft = false, touchRight = false, touchShoot = false;
leftBtn.addEventListener('touchstart', e => { e.preventDefault(); touchLeft = true; });
leftBtn.addEventListener('touchend', e => { touchLeft = false; });
rightBtn.addEventListener('touchstart', e => { e.preventDefault(); touchRight = true; });
rightBtn.addEventListener('touchend', e => { touchRight = false; });
shootBtn.addEventListener('touchstart', e => { e.preventDefault(); touchShoot = true; shoot(); });
shootBtn.addEventListener('touchend', e => { touchShoot = false; });

// simple pointer move for mobile dragging too
let dragging = false;
window.addEventListener('pointerdown', e => { if (e.clientY > window.innerHeight * 0.6) dragging = true; });
window.addEventListener('pointerup', e => { dragging = false; });
window.addEventListener('pointermove', e => { if (dragging) { player.x = e.clientX * devicePixelRatio; } });

// game update movement
setInterval(() => {
  if (!player || !running) return;
  const frameSec = 16 / 1000;
  // keyboard movement
  if (keys['arrowleft'] || keys['a'] || touchLeft) { player.x -= player.speed * frameSec; }
  if (keys['arrowright'] || keys['d'] || touchRight) { player.x += player.speed * frameSec; }
  // auto shooting if touchShoot held
  if (touchShoot) { shoot(); }
  // bounds
  player.x = Math.max(player.w / 2, Math.min(player.x, w - player.w / 2));
}, 16);

// Start / restart functions
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  startGame();
});

function startGame() {
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  running = true;
  // reset state
  bullets = []; enemies = []; powerups = []; particles = [];
  spawnInterval = 1500;
  spawnTimer = 0;
  score = 0;
  level = 1;
  lives = 3;
  player = createPlayer();
  lastTime = 0;
  music.currentTime = 0;
  music.play().catch(() => { });
}

// Game Over
function gameOver() {
  running = false;
  music.pause();
  finalScoreEl.textContent = 'Score: ' + score;
  gameOverScreen.classList.remove('hidden');
}

// small auto-save high score on unload
window.addEventListener('beforeunload', () => {
  if (score > highscore) localStorage.setItem('jetGameHighScore', score);
});

// expose for debugging
window._game = { startGame };

// Optional: keyboard shoot on space already implemented

// Simple animation for start screen background (pulsing)
const startPulse = () => {
  const el = document.querySelector('.overlay h1');
  if (!el) return;
  el.animate([{ filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.6))' }, { filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.8))' }], { duration: 2000, direction: 'alternate', iterations: Infinity });
};
startPulse();
