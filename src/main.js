import { GAME } from './config.js';
import { TUNING } from './tuning.js';
import { start, setScoreListener, getState, resetGame, placeBomb } from './game.js';
import { topScores, submitScore, dbReady, supabase } from './db.js';

const playerId = 'player_' + Math.random().toString(36).substr(2, 9);

let currentRoom = null;
let roomChannel = null;
export let isPlayingWithBot = false;
let botInstance = null;
let pollInterval = null;
let botTimeout = null;

export const enemy = {
  x: 200,
  y: 200,
  w: TUNING.player.size,
  h: TUNING.player.size,
  dir: 8,
  frame: 0,
  frameTimer: 0,
  moving: false,
  score: 0
};

// 2. Клас Бота (з інтелектуальним ковзанням по кутах)
class Bot {
  constructor(x = 200, y = 200) {
    this.x = x;
    this.y = y;
    this.w = TUNING.player.size;
    this.h = TUNING.player.size;
    this.speed = TUNING.enemy.botSpeed || 150;
    this.avoidDir = 1;
    this.detourTimer = 0;
    this.dir = 8;
    this.frame = 0;
    this.frameTimer = 0;
    this.usedBombs = 0;
    this.bombCooldown = 0;
    enemy.score = 0;
  }

  hasLineOfSight(target, boxHitsWallFn) {
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const checkX = this.x + (target.x - this.x) * (i / steps);
      const checkY = this.y + (target.y - this.y) * (i / steps);
      if (boxHitsWallFn(checkX, checkY, this.w, this.h)) return false;
    }
    return true;
  }

  update(pickupsList, boxHitsWallFn, playerObj, dt = 0.016) {
    if (!pickupsList || pickupsList.length === 0) return;

    if (this.bombCooldown > 0) this.bombCooldown -= dt;
    if (this.detourTimer > 0) this.detourTimer -= dt;

    let target = null;
    let minDist = Infinity;

    for (const p of pickupsList) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < minDist && this.hasLineOfSight(p, boxHitsWallFn)) {
        minDist = d;
        target = p;
      }
    }

    if (!target) {
      minDist = Infinity;
      for (const p of pickupsList) {
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        if (d < minDist) {
          minDist = d;
          target = p;
        }
      }
    }

    if (!target) return;

    // Бомби
    if (minDist < 40 && this.bombCooldown <= 0) {
      if (placeBomb(this.x, this.y, enemy.score, this.usedBombs)) {
        this.usedBombs++;
        this.bombCooldown = 5.0;
      }
    }

    const oldX = this.x;
    const oldY = this.y;

    let dx = target.x - this.x;
    let dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 6) {
      const stepX = (dx / dist) * this.speed * dt;
      const stepY = (dy / dist) * this.speed * dt;

      const canX = !boxHitsWallFn(this.x + stepX, this.y, this.w, this.h);
      const canY = !boxHitsWallFn(this.x, this.y + stepY, this.w, this.h);

      // 1. Рух по X з ковзанням
      if (canX) {
        this.x += stepX;
      } else {
        // Якщо вперлися по X, перевіряємо, чи можна закруглити кут по Y (Smart Corner Slide)
        const slideUp = !boxHitsWallFn(this.x, this.y - this.speed * dt, this.w, this.h);
        const slideDown = !boxHitsWallFn(this.x, this.y + this.speed * dt, this.w, this.h);

        if (dy < 0 && slideUp) {
          this.y -= this.speed * dt;
        } else if (dy > 0 && slideDown) {
          this.y += this.speed * dt;
        } else if (slideUp || slideDown) {
          if (this.detourTimer <= 0) {
            this.avoidDir = slideUp ? -1 : 1;
            this.detourTimer = 0.5;
          }
          this.y += this.speed * dt * this.avoidDir;
        }
      }

      // 2. Рух по Y з ковзанням
      if (canY) {
        this.y += stepY;
      } else {
        // Якщо вперлися по Y, перевіряємо, чи можна закруглити кут по X
        const slideLeft = !boxHitsWallFn(this.x - this.speed * dt, this.y, this.w, this.h);
        const slideRight = !boxHitsWallFn(this.x + this.speed * dt, this.y, this.w, this.h);

        if (dx < 0 && slideLeft) {
          this.x -= this.speed * dt;
        } else if (dx > 0 && slideRight) {
          this.x += this.speed * dt;
        } else if (slideLeft || slideRight) {
          if (this.detourTimer <= 0) {
            this.avoidDir = slideLeft ? -1 : 1;
            this.detourTimer = 0.5;
          }
          this.x += this.speed * dt * this.avoidDir;
        }
      }
    }

    const movedX = this.x - oldX;
    const movedY = this.y - oldY;
    const isMoving = Math.abs(movedX) > 0.05 || Math.abs(movedY) > 0.05;

    // Анімація напрямку
    if (isMoving) {
      const angle = Math.atan2(movedY, movedX);
      if (angle >= -Math.PI / 8 && angle < Math.PI / 8) this.dir = 0;
      else if (angle >= Math.PI / 8 && angle < 3 * Math.PI / 8) this.dir = 1;
      else if (angle >= 3 * Math.PI / 8 && angle < 5 * Math.PI / 8) this.dir = 2;
      else if (angle >= 5 * Math.PI / 8 && angle < 7 * Math.PI / 8) this.dir = 3;
      else if (angle >= 7 * Math.PI / 8 || angle < -7 * Math.PI / 8) this.dir = 4;
      else if (angle >= -7 * Math.PI / 8 && angle < -5 * Math.PI / 8) this.dir = 5;
      else if (angle >= -5 * Math.PI / 8 && angle < -3 * Math.PI / 8) this.dir = 6;
      else if (angle >= -3 * Math.PI / 8 && angle < -Math.PI / 8) this.dir = 7;

      this.frameTimer += dt;
      if (this.frameTimer > 1 / TUNING.player.animationSpeed) {
        this.frameTimer = 0;
        this.frame = (this.frame + 1) % 7;
      }
    } else {
      this.dir = 8;
      this.frameTimer += dt;
      if (this.frameTimer > 1 / (TUNING.player.animationSpeed / 2)) {
        this.frameTimer = 0;
        this.frame = (this.frame + 1) % 7;
      }
    }

    enemy.x = this.x;
    enemy.y = this.y;
    enemy.dir = this.dir;
    enemy.frame = this.frame;
    enemy.moving = isMoving;
  }
}

// 3. Метчмейкінг
async function findMatch() {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = TUNING.texts.statusSearching;

  if (pollInterval) clearInterval(pollInterval);
  if (botTimeout) clearTimeout(botTimeout);
  if (roomChannel) supabase.removeChannel(roomChannel);

  currentRoom = null;
  isPlayingWithBot = false;

  console.log("🚀 [MATCH] Початок пошуку. Мій ID:", playerId);

  if (!supabase) {
    console.error("❌ Supabase не підключено!");
    startPVEBotGame();
    return;
  }

  try {
    const thirtySecAgo = new Date(Date.now() - 30000).toISOString();
    await supabase.from('matchmaking_queue').delete().lt('created_at', thirtySecAgo);
  } catch (e) {
    console.warn("Попередження при очищенні черги:", e);
  }

  const { data: waitingList, error: selectErr } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('status', 'waiting')
    .neq('player_id', playerId)
    .order('created_at', { ascending: true });

  if (selectErr) {
    console.error("❌ Помилка читання черги (перевірте SQL таблицю в Supabase):", selectErr);
  }

  if (waitingList && waitingList.length > 0) {
    const opponent = waitingList[0];
    const roomId = `room_${opponent.id}`;

    console.log("✅ Знайдено суперника у черзі!", opponent);

    await supabase
      .from('matchmaking_queue')
      .update({ status: 'matched', room_id: roomId })
      .eq('id', opponent.id);

    startPVPGame(roomId, 'player2');
    return;
  }

  const { data: myEntryArray, error: insertErr } = await supabase
    .from('matchmaking_queue')
    .insert([{ player_id: playerId, status: 'waiting' }])
    .select();

  if (insertErr || !myEntryArray || myEntryArray.length === 0) {
    console.error("❌ Помилка створення запису в черзі:", insertErr);
    startPVEBotGame();
    return;
  }

  const myEntry = myEntryArray[0];
  console.log("⏳ Записано в чергу з ID:", myEntry.id, "Чекаємо 30 секунд...");

  pollInterval = setInterval(async () => {
    const { data: checkArray } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('id', myEntry.id);

    if (checkArray && checkArray.length > 0) {
      const check = checkArray[0];
      if (check.status === 'matched') {
        console.log("⚔️ Суперник підключився! Вхід у кімнату:", check.room_id);
        clearInterval(pollInterval);
        clearTimeout(botTimeout);
        startPVPGame(check.room_id, 'player1');
      }
    }
  }, 1000);

  botTimeout = setTimeout(async () => {
    console.log("⏰ 30 секунд минуло. Запуск бота.");
    clearInterval(pollInterval);

    await supabase
      .from('matchmaking_queue')
      .delete()
      .eq('id', myEntry.id);

    if (!currentRoom) {
      startPVEBotGame();
    }
  }, (TUNING.matchmaking.matchTimeoutSeconds || 30) * 1000);
}

function startPVEBotGame() {
  if (pollInterval) clearInterval(pollInterval);
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = TUNING.texts.statusBot;
  
  isPlayingWithBot = true;
  botInstance = new Bot(200, 200);
}

function startPVPGame(roomId, role) {
  if (pollInterval) clearInterval(pollInterval);
  if (botTimeout) clearTimeout(botTimeout);

  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `${TUNING.texts.statusPVP} (${role})`;

  isPlayingWithBot = false;
  currentRoom = roomId;

  if (roomChannel) supabase.removeChannel(roomChannel);

  roomChannel = supabase.channel(roomId);
  roomChannel
    .on('broadcast', { event: 'move' }, (payload) => {
      if (payload.sender !== playerId) {
        enemy.x = payload.x;
        enemy.y = payload.y;
        enemy.dir = payload.dir !== undefined ? payload.dir : 8;
        enemy.frame = payload.frame || 0;
      }
    })
    .subscribe();
}

export function sendMyMovement(x, y, dir, frame) {
  if (roomChannel && !isPlayingWithBot) {
    roomChannel.send({
      type: 'broadcast',
      event: 'move',
      payload: { sender: playerId, x, y, dir, frame }
    });
  }
}

// 4. Інтерфейс
const t = TUNING.texts;
document.title = t.title;
document.getElementById('title').textContent = t.title;
document.getElementById('controls-hint').textContent = t.controlsHint;
document.getElementById('score-label').textContent = t.scoreLabel;
document.getElementById('board-title').textContent = t.boardTitle;
document.getElementById('name').placeholder = t.namePlaceholder;
document.getElementById('save').textContent = t.saveButton;
document.getElementById('reset').textContent = t.resetButton;

const canvas = document.getElementById('game');
canvas.width = GAME.width;
canvas.height = GAME.height;

const scoreEl = document.getElementById('score');
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const nameEl = document.getElementById('name');
const saveBtn = document.getElementById('save');
const resetBtn = document.getElementById('reset');

setScoreListener((s) => { scoreEl.textContent = s; });

nameEl.value = localStorage.getItem('player') || '';
nameEl.addEventListener('input', () => localStorage.setItem('player', nameEl.value));

async function refreshBoard() {
  if (!dbReady) {
    boardEl.innerHTML = '<li class="empty">Supabase не підключений</li>';
    return;
  }
  const rows = await topScores();
  if (!rows.length) {
    boardEl.innerHTML = `<li class="empty">${escapeHtml(t.emptyBoard)}</li>`;
    return;
  }
  boardEl.innerHTML = rows
    .map((r, i) => `<li><span class="rank">${i + 1}</span><span class="who">${escapeHtml(r.player)}</span><span class="pts">${r.score}</span></li>`)
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

saveBtn.addEventListener('click', async () => {
  const name = nameEl.value.trim();
  if (!name) { statusEl.textContent = 'Впиши імʼя, щоб зберегти результат.'; nameEl.focus(); return; }

  saveBtn.disabled = true;
  statusEl.textContent = 'Зберігаю…';
  const res = await submitScore(name, getState().score);
  saveBtn.disabled = false;

  if (res.ok) {
    statusEl.textContent = 'Результат збережено.';
    refreshBoard();
  } else {
    statusEl.textContent = `Не збереглось: ${res.reason}`;
  }
});

resetBtn.addEventListener('click', () => {
  resetGame();
  findMatch();
  canvas.focus();
});

start(canvas);
findMatch();
refreshBoard();