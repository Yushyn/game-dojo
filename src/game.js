import { GAME } from './config.js';
import { TUNING } from './tuning.js';
import { enemy, sendMyMovement, tickBot, isPlayingWithBot, respawnBot } from './main.js';

const T = TUNING;
const TILE = T.field.tile; // 32px

// ── Візуальний розмір персонажа на екрані ─────────────────────────────
const DISPLAY_SIZE = 42; 

// ── Розміри поля та відцентрилювання ──────────────────────────────────
const COLS = 29; 
const ROWS = 15; 
const OFFSET_X = Math.floor((GAME.width - COLS * TILE) / 2);  
const OFFSET_Y = Math.floor((GAME.height - ROWS * TILE) / 2); 

// ── Інпут (WASD / ЦФІВ / Стрілки) ────────────────────────────────────
const keys = new Set();
let spacePressed = false;

addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'ц', 'ф', 'і', 'в'].includes(key)) {
    e.preventDefault();
  }
  if (e.key === ' ' && !e.repeat) spacePressed = true;
  keys.add(key);
});

addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const held = (...names) => names.some((n) => keys.has(n.toLowerCase()));

// ── Поле ──────────────────────────────────────────────────────────────
const LEVEL = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    const isOuterWall = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
    const isPillar = (r % 3 === 0) && (c % 4 === 0);
    row.push(isOuterWall || isPillar ? 1 : 0);
  }
  LEVEL.push(row);
}

function boxHitsWall(x, y, w, h) {
  const relX0 = x - OFFSET_X;
  const relY0 = y - OFFSET_Y;
  const relX1 = x + w - 1 - OFFSET_X;
  const relY1 = y + h - 1 - OFFSET_Y;

  const c0 = Math.floor(relX0 / TILE);
  const c1 = Math.floor(relX1 / TILE);
  const r0 = Math.floor(relY0 / TILE);
  const r1 = Math.floor(relY1 / TILE);

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || LEVEL[r]?.[c] === 1) {
        return true;
      }
    }
  }
  return false;
}

function moveAxis(entity, dx, dy) {
  const nx = entity.x + dx;
  const ny = entity.y + dy;
  if (boxHitsWall(nx, ny, entity.w, entity.h)) return false;
  entity.x = nx;
  entity.y = ny;
  return true;
}

// ── Спрайтова анімація ────────────────────────────────────────────────
class SpriteSheet {
  constructor(src, frameW, frameH) {
    this.img = new Image();
    this.img.src = src;
    this.frameW = frameW;
    this.frameH = frameH;
    this.loaded = false;
    this.img.onload = () => { this.loaded = true; };
    this.img.onerror = () => { this.loaded = false; };
  }
  draw(ctx, frame, row, x, y, w, h) {
    if (!this.loaded) return false;
    ctx.drawImage(
      this.img,
      frame * this.frameW, row * this.frameH, this.frameW, this.frameH,
      Math.round(x), Math.round(y), w, h
    );
    return true;
  }
}

const heroSheet = new SpriteSheet('assets/hero.png', 70, 70);

// ── Стан ──────────────────────────────────────────────────────────────
const player = {
  x: OFFSET_X + TILE * 1.5, 
  y: OFFSET_Y + TILE * 1.5,
  w: T.player.size, 
  h: T.player.size,
  speed: T.player.speed,
  dir: 8,
  frame: 0, 
  frameTimer: 0, 
  moving: false,
  usedBombs: 0
};

const pickups = [];
const bombs = [];
const explosions = [];

function spawnPickup() {
  const s = T.pickups.size;
  for (let tries = 0; tries < 300; tries++) {
    const c = Math.floor(Math.random() * (COLS - 2)) + 1;
    const r = Math.floor(Math.random() * (ROWS - 2)) + 1;
    if (LEVEL[r][c] === 0) {
      const x = OFFSET_X + c * TILE + (TILE - s) / 2;
      const y = OFFSET_Y + r * TILE + (TILE - s) / 2;
      pickups.push({ x, y, w: s, h: s, t: 0 });
      return;
    }
  }
}
for (let i = 0; i < T.pickups.count; i++) spawnPickup();

const state = { score: 0, time: 0, running: true };

export function placeBomb(ownerX, ownerY, scoreVal, usedBombsCounter) {
  const available = Math.floor(scoreVal / 25) - usedBombsCounter;
  if (available > 0) {
    bombs.push({
      x: ownerX + T.player.size / 2,
      y: ownerY + T.player.size / 2,
      timer: 3.0,
      radius: 70
    });
    return true;
  }
  return false;
}

// ── Оновлення ─────────────────────────────────────────────────────────
function update(dt) {
  if (!state.running) return;
  state.time += dt;

  let dx = 0, dy = 0;
  if (held('arrowleft', 'a', 'ф')) dx -= 1;
  if (held('arrowright', 'd', 'в')) dx += 1;
  if (held('arrowup', 'w', 'ц')) dy -= 1;
  if (held('arrowdown', 's', 'і')) dy += 1;

  player.moving = dx !== 0 || dy !== 0;

  if (dx > 0 && dy === 0)       player.dir = 0;
  else if (dx > 0 && dy > 0)   player.dir = 1;
  else if (dx === 0 && dy > 0)  player.dir = 2;
  else if (dx < 0 && dy > 0)   player.dir = 3;
  else if (dx < 0 && dy === 0)  player.dir = 4;
  else if (dx < 0 && dy < 0)   player.dir = 5;
  else if (dx === 0 && dy < 0)  player.dir = 6;
  else if (dx > 0 && dy < 0)   player.dir = 7;
  else if (!player.moving)     player.dir = 8;

  if (dx && dy) { const k = Math.SQRT1_2; dx *= k; dy *= k; }

  moveAxis(player, dx * player.speed * dt, 0);
  moveAxis(player, 0, dy * player.speed * dt);

  if (spacePressed) {
    if (placeBomb(player.x, player.y, state.score, player.usedBombs)) {
      player.usedBombs++;
    }
    spacePressed = false;
  }

  if (player.moving) {
    sendMyMovement(player.x, player.y, player.dir, player.frame);
  }

  tickBot(pickups, boxHitsWall, player, dt);

  player.frameTimer += dt;
  const animSpeed = player.moving ? T.player.animationSpeed : (T.player.animationSpeed / 2);
  if (player.frameTimer > 1 / animSpeed) {
    player.frameTimer = 0;
    player.frame = (player.frame + 1) % 7;
  }

  // Бомби
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.timer -= dt;

    if (b.timer <= 0) {
      explosions.push({ x: b.x, y: b.y, radius: b.radius, timer: 0.3 });

      const playerDist = Math.hypot((player.x + player.w / 2) - b.x, (player.y + player.h / 2) - b.y);
      if (playerDist <= b.radius) {
        player.x = OFFSET_X + TILE * 1.5;
        player.y = OFFSET_Y + TILE * 1.5;
        state.score = Math.max(0, state.score - 50);
        onScoreChange?.(state.score);
      }

      if (enemy) {
        const enemyW = enemy.w || T.player.size;
        const enemyH = enemy.h || T.player.size;
        const enemyDist = Math.hypot((enemy.x + enemyW / 2) - b.x, (enemy.y + enemyH / 2) - b.y);

        if (enemyDist <= b.radius) {
          respawnBot();
          if (enemy.score !== undefined) {
            enemy.score = Math.max(0, enemy.score - 50);
          }
        }
      }

      for (let j = pickups.length - 1; j >= 0; j--) {
        const p = pickups[j];
        if (Math.hypot((p.x + p.w / 2) - b.x, (p.y + p.h / 2) - b.y) <= b.radius) {
          pickups.splice(j, 1);
          spawnPickup();
        }
      }

      bombs.splice(i, 1);
    }
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.timer -= dt;
    if (exp.timer <= 0) explosions.splice(i, 1);
  }

  // Монетки
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;

    const hitPlayer =
      player.x < p.x + p.w && player.x + player.w > p.x &&
      player.y < p.y + p.h && player.y + player.h > p.y;

    if (hitPlayer) {
      pickups.splice(i, 1);
      state.score += T.pickups.scoreValue;
      spawnPickup();
      onScoreChange?.(state.score);
      continue;
    }

    if (enemy) {
      const eW = enemy.w || T.player.size;
      const eH = enemy.h || T.player.size;
      const hitEnemy =
        enemy.x < p.x + p.w && enemy.x + eW > p.x &&
        enemy.y < p.y + p.h && enemy.y + eH > p.y;

      if (hitEnemy) {
        pickups.splice(i, 1);
        if (enemy.score !== undefined) enemy.score += T.pickups.scoreValue;
        spawnPickup();
      }
    }
  }
}

// ── Малювання ─────────────────────────────────────────────────────────
function drawMap(ctx, isLit = false) {
  ctx.fillStyle = isLit ? '#1b1828' : '#09080e'; // Підлога: світла у ліхтарику, темна поза ним
  ctx.fillRect(0, 0, GAME.width, GAME.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (LEVEL[r][c] !== 1) continue;
      const wx = OFFSET_X + c * TILE;
      const wy = OFFSET_Y + r * TILE;

      // Стіни у світлі яскраві, поза ним — ледь помітні силуети
      ctx.fillStyle = isLit ? '#524b78' : '#141220';
      ctx.fillRect(wx, wy, TILE, TILE);
      ctx.fillStyle = isLit ? '#736ba6' : '#1d1a2e';
      ctx.fillRect(wx, wy, TILE, 3);
    }
  }
}

function constructFlashlightPath(ctx, px, py, dirIndex, lightRadius = 260, coneAngle = Math.PI / 2.8) {
  const angles = [
    0,                  // 0: [→]
    Math.PI / 4,        // 1: [↘]
    Math.PI / 2,        // 2: [↓]
    (3 * Math.PI) / 4,  // 3: [↙]
    Math.PI,            // 4: [←]
    -(3 * Math.PI) / 4, // 5: [↖]
    -Math.PI / 2,       // 6: [↑]
    -Math.PI / 4,       // 7: [↗]
    Math.PI / 2         // 8: [•]
  ];

  const angle = angles[dirIndex !== undefined ? dirIndex : 8];

  // Аура навколо
  ctx.arc(px, py, 45, 0, Math.PI * 2);
  
  // Конус
  ctx.moveTo(px, py);
  ctx.arc(px, py, lightRadius, angle - coneAngle / 2, angle + coneAngle / 2);
  ctx.closePath();
}

function render(ctx) {
  // КРОК 1. Малюємо базову темну карту
  drawMap(ctx, false);

  // КРОК 2. Малюємо ЯСКРАВУ карту тільки там, куди світять ліхтарики
  ctx.save();
  ctx.beginPath();

  const pCenterX = player.x + player.w / 2;
  const pCenterY = player.y + player.h / 2;
  constructFlashlightPath(ctx, pCenterX, pCenterY, player.dir, 260);

  if (enemy) {
    const eW = enemy.w || T.player.size;
    const eH = enemy.h || T.player.size;
    const eCenterX = enemy.x + eW / 2;
    const eCenterY = enemy.y + eH / 2;
    constructFlashlightPath(ctx, eCenterX, eCenterY, enemy.dir, 240);
  }

  // Обрізаємо зону рендеру суворо за конусами світла
  ctx.clip();

  // Малюємо яскраве поле та стіни у світлі
  drawMap(ctx, true);

  // М'який ефект світіння ліхтаря
  const beamGrad = ctx.createRadialGradient(pCenterX, pCenterY, 10, pCenterX, pCenterY, 260);
  beamGrad.addColorStop(0, 'rgba(255, 255, 230, 0.25)');
  beamGrad.addColorStop(0.7, 'rgba(255, 255, 200, 0.08)');
  beamGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(0, 0, GAME.width, GAME.height);

  ctx.restore();

  // КРОК 3. Малюємо ігрові об'єкти поверх усього
  // 1. Монетки
  for (const p of pickups) {
    const bob = Math.sin(p.t * T.pickups.bobSpeed) * T.pickups.bobHeight;
    ctx.fillStyle = T.colors.pickup;
    ctx.fillRect(p.x, p.y + bob, p.w, p.h);
  }

  // 2. Бомби
  for (const b of bombs) {
    const blink = Math.sin(b.timer * 20) > 0;
    ctx.fillStyle = blink ? '#ff4444' : '#111111';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(b.x - 1, b.y - 14, 2, 5);
  }

  // 3. Вибухи
  for (const exp of explosions) {
    ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const offsetX = (DISPLAY_SIZE - player.w) / 2;
  const offsetY = (DISPLAY_SIZE - player.h) / 2;

  // 4. Гравець
  const drew = heroSheet.draw(
    ctx, 
    player.frame, 
    player.dir, 
    player.x - offsetX, 
    player.y - offsetY, 
    DISPLAY_SIZE, 
    DISPLAY_SIZE
  );

  if (!drew) {
    ctx.fillStyle = T.colors.player;
    ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);
  }

  // 5. Супротивник / Бот
  if (enemy) {
    const eW = enemy.w || T.player.size;
    const eH = enemy.h || T.player.size;
    const enemyOffsetX = (DISPLAY_SIZE - eW) / 2;
    const enemyOffsetY = (DISPLAY_SIZE - eH) / 2;

    const drewEnemy = heroSheet.draw(
      ctx,
      enemy.frame || 0,
      enemy.dir !== undefined ? enemy.dir : 8,
      enemy.x - enemyOffsetX,
      enemy.y - enemyOffsetY,
      DISPLAY_SIZE,
      DISPLAY_SIZE
    );

    if (!drewEnemy) {
      ctx.fillStyle = T.colors.enemy || '#ff595e';
      ctx.fillRect(Math.round(enemy.x), Math.round(enemy.y), eW, eH);
    }
  }

  // 6. Інтерфейс
  const availableBombs = Math.max(0, Math.floor(state.score / 25) - player.usedBombs);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px monospace';
  ctx.fillText(`Бомби [Space]: ${availableBombs} (наступна через ${25 - (state.score % 25)} очок)`, 15, 25);
}

// ── Цикл ──────────────────────────────────────────────────────────────
let onScoreChange = null;
export function setScoreListener(fn) { onScoreChange = fn; }
export function getState() { return state; }
export function resetGame() {
  state.score = 0; state.time = 0; state.running = true;
  player.x = OFFSET_X + TILE * 1.5; 
  player.y = OFFSET_Y + TILE * 1.5;
  player.usedBombs = 0;
  pickups.length = 0;
  bombs.length = 0;
  explosions.length = 0;
  for (let i = 0; i < T.pickups.count; i++) spawnPickup();
  onScoreChange?.(0);
}

export function start(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}