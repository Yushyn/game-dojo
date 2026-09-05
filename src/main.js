// Звʼязок сторінки з грою: інтерфейс поверх полотна, екран результату,
// лідерборд. Кнопок «Почати» й «Інструмент» більше немає — раунди йдуть
// самі, а єдине, що вибирає гравець, це розмір пензля.

import { TUNING } from './tuning.js';
import { start, undo, reset, getState, brushOptions, setBrush } from './game.js';
import { topScores, submitScore, initDb, dbReady } from './db.js';
import { initScreens, showScreen, currentScreen } from './screens.js';

// Позначка для сторожа запуску в index.html: код дожив досюди,
// значить, усі файли на місці.
window.__gameBooted = true;

const t = TUNING.texts;
const $ = (id) => document.getElementById(id);

// Підставляє числа в шаблон: fill('Round {n}/{total}', { n: 1, total: 2 })
function fill(str, vals) {
  return String(str || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

const missing = [];
function put(id, prop, value) {
  const el = $(id);
  if (!el) { missing.push(id); return; }
  if (value !== undefined) el[prop] = value;
}

addEventListener('error', (e) => {
  const s = $('status');
  if (s) s.textContent = 'Помилка: ' + e.message;
});

// ── Тексти ────────────────────────────────────────────────────
document.title = t.title;
put('s-result-title', 'textContent', t.resultTitle);
put('s-result-label', 'textContent', t.resultScore);
put('name',           'placeholder', t.namePlaceholder);
put('save',           'textContent', t.saveButton);

if (missing.length) {
  console.error('У index.html немає елементів:', missing.join(', '),
    '— схоже, index.html лишився старий. Заміни його з архіву.');
}

// ── Запуск гри ────────────────────────────────────────────────
// Картинки їдуть одразу, ще поки людина дивиться на титульний екран.
const canvas = $('stage');
const statusEl = $('status');
if (!canvas) console.error('У index.html немає <canvas id="stage">.');

start(canvas, {
  onUpdate: render,
  onError: (why) => { if (statusEl) statusEl.textContent = why; },
});

// ── Екрани ────────────────────────────────────────────────────
initScreens({
  isGameReady: () => getState().phase !== 'loading',

  onNewGame:   () => reset(),   // «Нова гра» — очки з нуля, раунд стартує одразу
  onLeaveGame: () => reset(),   // вийшли в меню — раунд скидаємо
  onOpenLeaderboard: () => refreshBoard(),
});

// ══════════════════════════════════════════════════════════════
//  КНОПКИ РОЗМІРУ ПЕНЗЛЯ
//  Три восьмикутники внизу екрана. Кружечок усередині малюється за
//  справжнім діаметром пензля з tuning.js, лише зменшений так, щоб
//  найбільший саме вміщався в кнопку. Тому кружечки завжди чесно
//  показують співвідношення розмірів: змінила числа — змінились і вони.
// ══════════════════════════════════════════════════════════════

const BRUSH_LABELS = [t.brushSmall, t.brushMedium, t.brushBig];
const brushBox = $('brushes');
let brushButtons = [];

function buildBrushes() {
  if (!brushBox) return;
  const sizes = brushOptions();
  const max = Math.max(...sizes);

  brushBox.innerHTML = '';
  brushButtons = sizes.map((size, i) => {
    const b = document.createElement('button');
    b.className = 'sq';
    b.type = 'button';
    b.title = BRUSH_LABELS[i] || (size + ' px');
    b.setAttribute('aria-label', b.title);

    // 62 — найбільший кружечок у пікселях макета, щоб лишились поля
    const d = Math.max(10, Math.round(62 * size / max));
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.width  = 'calc(var(--u) * ' + d + ')';
    dot.style.height = 'calc(var(--u) * ' + d + ')';
    b.appendChild(dot);

    b.addEventListener('click', () => setBrush(i));
    brushBox.appendChild(b);
    return b;
  });
}
buildBrushes();

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (currentScreen() !== 'game') return;      // у меню гарячі клавіші не працюють
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  const n = Number(e.key);
  if (n >= 1 && n <= brushButtons.length) setBrush(n - 1);
});

// ══════════════════════════════════════════════════════════════
//  ПОКАЗ СТАНУ
// ══════════════════════════════════════════════════════════════

const barEl = $('hud-bar');
const timerEl = $('hud-timer');
let resultShown = false;

function render(s) {
  const st = s || getState();

  put('hud-round', 'textContent',
      fill(t.hudRound, { n: st.round + 1, total: st.total || 1 }));
  put('hud-goal', 'textContent', fill(t.hudGoal, { pass: st.pass }));

  // Таймер і смужка. Під час вступу робочий час ще не йде — там
  // пишемо, що зараз відбувається, а смужка стоїть порожня.
  if (timerEl) {
    if (st.phase === 'play') {
      timerEl.textContent = fill(t.hudTimer, { sec: Math.ceil(st.timeLeft) });
      timerEl.classList.toggle('warn', st.timeLeft <= 10);
    } else if (st.phase === 'intro') {
      timerEl.textContent = st.introT < TUNING.intro.bootSeconds ? t.introBoot : t.introOutline;
      timerEl.classList.remove('warn');
    } else {
      timerEl.textContent = fill(t.hudTimer, { sec: 0 });
      timerEl.classList.remove('warn');
    }
  }

  if (barEl) {
    // Смужка наповнюється в міру того, як час спливає.
    const total = TUNING.round.totalSeconds || 1;
    const done = st.phase === 'play' ? 1 - st.timeLeft / total
               : (st.phase === 'result' || st.phase === 'done') ? 1 : 0;
    barEl.style.width = Math.max(0, Math.min(1, done)) * 100 + '%';
  }

  brushButtons.forEach((b, i) => {
    b.classList.toggle('on', i === st.brush);
    b.disabled = !st.canEdit;
  });

  // Усі чоботи пройдено — самі переводимо на екран результату.
  if (st.phase === 'done' && !resultShown && currentScreen() === 'game') {
    resultShown = true;
    put('s-result-score', 'textContent', st.score);
    if (statusEl) statusEl.textContent = '';
    showScreen('result');
  }
  if (st.phase !== 'done') resultShown = false;
}

setInterval(() => render(), 200);
render();

// ══════════════════════════════════════════════════════════════
//  ЛІДЕРБОРД
// ══════════════════════════════════════════════════════════════

const nameEl = $('name'), saveBtn = $('save');
const boards = [$('board-full')].filter(Boolean);

if (nameEl) {
  nameEl.value = localStorage.getItem('player') || '';
  nameEl.addEventListener('input', () => localStorage.setItem('player', nameEl.value));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function paintBoard(html) { boards.forEach((el) => { el.innerHTML = html; }); }

async function refreshBoard() {
  if (!boards.length) return;
  if (!dbReady) { paintBoard('<li class="empty">База недоступна</li>'); return; }
  const rows = await topScores();
  paintBoard(rows.length
    ? rows.map((r, i) => `<li><span class="rank">${i + 1}</span><span class="who">${escapeHtml(r.player)}</span><span class="pts">${r.score}</span></li>`).join('')
    : `<li class="empty">${escapeHtml(t.emptyBoard)}</li>`);
}

saveBtn?.addEventListener('click', async () => {
  const name = (nameEl?.value || '').trim();
  if (!name) { statusEl.textContent = t.needName; nameEl?.focus(); return; }
  saveBtn.disabled = true;
  statusEl.textContent = t.saving;
  const res = await submitScore(name, getState().score);
  saveBtn.disabled = false;
  statusEl.textContent = res.ok ? t.saved : 'Не збереглось: ' + res.reason;
  if (res.ok) refreshBoard();
});

// Базу підключаємо ПІСЛЯ запуску гри, щоб мертва мережа не блокувала картинку.
initDb().then(refreshBoard);
