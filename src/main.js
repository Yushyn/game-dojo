// Звʼязок сторінки з грою: екрани, кнопки інструментів, кнопка дії, лідерборд.

import { TUNING } from './tuning.js';
import { start, tool, setTool, undo, action, reset, getState } from './game.js';
import { topScores, submitScore, initDb, dbReady } from './db.js';
import { initScreens, showScreen, currentScreen } from './screens.js';

const t = TUNING.texts;
const $ = (id) => document.getElementById(id);

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

// ── Тексти ігрового екрана ────────────────────────────────────
document.title = t.title;
put('title', 'textContent', t.title);
put('hint', 'textContent', t.hint);
put('tools-title', 'textContent', t.toolsTitle);
put('tool-push', 'textContent', t.toolPush);
put('tool-restore', 'textContent', t.toolRestore);
put('board-title', 'textContent', t.boardTitle);
put('name', 'placeholder', t.namePlaceholder);
put('save', 'textContent', t.saveButton);

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
  // екран завантаження чекає саме на цю відповідь
  isGameReady: () => getState().phase !== 'loading',

  onNewGame:  () => reset(),          // «Нова гра» — очки з нуля
  onLeaveGame: () => reset(),         // вийшли з гри в меню — раунд скидаємо
  onOpenLeaderboard: () => refreshBoard(),
});

// ── Інструменти ───────────────────────────────────────────────
const toolButtons = [...document.querySelectorAll('[data-tool]')];
function selectTool(name) {
  setTool(name);
  toolButtons.forEach((b) => b.classList.toggle('on', b.dataset.tool === name));
}
toolButtons.forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
selectTool(tool.name);

// ── Кнопка дії ────────────────────────────────────────────────
const actionBtn = $('action');
actionBtn?.addEventListener('click', () => action());

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (currentScreen() !== 'game') return;      // у меню гарячі клавіші не працюють
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if (e.key === '1') selectTool('push');
  if (e.key === '2') selectTool('restore');
});

// ── Показ стану ───────────────────────────────────────────────
// Гра сама повідомляє про зміни, а таймер оновлюємо щосекунди.
function render(s) {
  const st = s || getState();

  put('score', 'textContent', st.score);
  put('round', 'textContent', st.total ? (st.round + 1) + ' / ' + st.total : '—');
  put('boot-name', 'textContent',
      st.phase === 'intro' || st.phase === 'play' || st.phase === 'result' ? st.bootName : '—');

  const timerEl = $('timer');
  if (timerEl) {
    if (st.phase === 'play') {
      timerEl.textContent = Math.ceil(st.timeLeft) + ' с';
      timerEl.classList.toggle('warn', st.timeLeft <= 10);
    } else if (st.phase === 'intro') {
      timerEl.textContent = 'вступ';
      timerEl.classList.remove('warn');
    } else {
      timerEl.textContent = '—';
      timerEl.classList.remove('warn');
    }
  }

  if (actionBtn) {
    let label = '', show = true;
    if (st.phase === 'idle') label = t.btnStart;
    else if (st.phase === 'result') label = st.passed
      ? (st.round + 1 < st.total ? t.btnNext : t.btnStart)
      : t.btnRetry;
    else if (st.phase === 'done') label = t.btnAgain;
    else show = false;
    actionBtn.textContent = label;
    actionBtn.style.display = show ? '' : 'none';
  }

  toolButtons.forEach((b) => { b.disabled = !st.canEdit; });
}

setInterval(() => render(), 250);
render();

// ── Лідерборд ─────────────────────────────────────────────────
// Той самий список показується у двох місцях: у панелі збоку від
// гри і на окремому екрані з меню.
const nameEl = $('name'), saveBtn = $('save');
const boards = [$('board'), $('board-full')].filter(Boolean);

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
  if (!name) { statusEl.textContent = 'Впиши імʼя.'; nameEl?.focus(); return; }
  saveBtn.disabled = true;
  statusEl.textContent = 'Зберігаю…';
  const res = await submitScore(name, getState().score);
  saveBtn.disabled = false;
  statusEl.textContent = res.ok ? 'Збережено.' : `Не збереглось: ${res.reason}`;
  if (res.ok) refreshBoard();
});

// Базу підключаємо ПІСЛЯ запуску гри, щоб мертва мережа не блокувала картинку.
initDb().then(refreshBoard);
