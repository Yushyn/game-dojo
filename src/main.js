// Звʼязок сторінки з грою: інтерфейс поверх полотна, екран результату,
// лідерборд. Кнопок «Почати» й «Інструмент» більше немає — раунди йдуть
// самі, а єдине, що вибирає гравець, це розмір пензля.

import { TUNING } from './tuning.js';
import { start, undo, reset, getState, brushOptions, setBrush, setPaused } from './game.js';
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

// Закрити вікно виходу без зняття паузи — гру все одно зараз скинуть
function hideAsk() { const b = document.getElementById('ask'); if (b) b.hidden = true; }

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
put('ask-title', 'textContent', t.askLeave);
put('ask-note',  'textContent', t.askNote);
put('ask-yes',   'textContent', t.askYes);
put('ask-no',    'textContent', t.askNo);
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

  onNewGame:   () => { hideAsk(); reset(); },  // очки з нуля, раунд стартує одразу
  onLeaveGame: () => { hideAsk(); reset(); },  // вийшли в меню — раунд скидаємо
  onOpenLeaderboard: () => refreshBoard(),
});

// ══════════════════════════════════════════════════════════════
//  КНОПКИ ІНСТРУМЕНТІВ
//  Три восьмикутники внизу екрана. Що на них намальовано і який
//  діаметр пензля за кожним стоїть — усе в блоці `brush` у tuning.js.
//  Сторінка нічого не вигадує: бере список інструментів і малює його.
// ══════════════════════════════════════════════════════════════

const brushBox = $('brushes');
let brushButtons = [];

function buildBrushes() {
  if (!brushBox) return;
  const B = TUNING.brush;
  const tools = brushOptions();
  const max = Math.max(...tools.map((t) => t.size));
  const mix = Math.max(0, Math.min(1, B.buttonSizeMix ?? 0.55));
  const fit = B.buttonIconScale ?? 0.86;

  brushBox.innerHTML = '';
  brushButtons = tools.map((tool, i) => {
    const b = document.createElement('button');
    b.className = 'sq';
    b.type = 'button';
    b.title = tool.name || (tool.size + ' px');
    b.setAttribute('aria-label', b.title);

    // Картинка інструмента на кнопці. Її розмір ЧАСТКОВО йде за
    // діаметром пензля: при mix = 1 різниця рівно пропорційна,
    // при 0 всі три однакові. Так видно, що інструменти різні,
    // але найменший не перетворюється на цятку.
    const rel = tool.size / max;                 // 0..1
    const k = fit * (1 - mix + mix * rel);       // частка від кнопки
    const box = document.createElement('span');
    box.className = 'tool';
    box.style.width  = Math.round(k * 100) + '%';
    box.style.height = Math.round(k * 100) + '%';

    if (tool.icon) {
      const im = document.createElement('img');
      im.src = tool.icon;
      im.alt = '';
      box.appendChild(im);
    } else {
      box.classList.add('dot');                  // картинки немає — старий кружечок
    }
    b.appendChild(box);

    b.addEventListener('click', () => setBrush(i));
    brushBox.appendChild(b);
    return b;
  });
}
buildBrushes();

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (currentScreen() !== 'game') return;      // у меню гарячі клавіші не працюють

  // Поки відкрите питання про вихід — Esc відповідає «ні»,
  // а решта клавіш нічого не робить.
  if (askBox && !askBox.hidden) {
    if (e.key === 'Escape') closeAsk();
    return;
  }
  if (e.key === 'Escape') { openAsk(); return; }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  const n = Number(e.key);
  if (n >= 1 && n <= brushButtons.length) setBrush(n - 1);
});

// ══════════════════════════════════════════════════════════════
//  ВИХІД У МЕНЮ
//  Хрестик не викидає одразу: спершу питає. Поки питання на
//  екрані, гра стоїть на паузі — таймер не тікає, стопу рухати
//  не можна, а сцена притемнена самим вікном.
// ══════════════════════════════════════════════════════════════

const askBox = $('ask');

function openAsk() {
  if (!askBox || !askBox.hidden) return;
  askBox.hidden = false;
  setPaused(true);
  $('ask-no')?.focus();
}

function closeAsk() {
  if (!askBox || askBox.hidden) return;
  askBox.hidden = true;
  setPaused(false);
}

$('hud-close')?.addEventListener('click', openAsk);
$('ask-no')?.addEventListener('click', closeAsk);

// «Так» — нічого не зберігаємо, просто йдемо в меню.
// Знімаємо паузу ПЕРЕД виходом, інакше гра лишиться замороженою.
$('ask-yes')?.addEventListener('click', () => {
  askBox.hidden = true;
  setPaused(false);
  showScreen('menu');
  reset();
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
  if (!dbReady) { paintBoard('<li class="lb-empty">База недоступна</li>'); return; }
  const rows = await topScores();
  // Значки місця є лише для перших трьох — далі просто номер.
  paintBoard(rows.length
    ? rows.map((r, i) => {
        const place = i + 1;
        const badge = place <= 3 ? ' lb-p' + place : '';
        return `<li class="lb-row"><i class="lb-badge${badge}">${place}</i>` +
               `<span class="who">${escapeHtml(r.player)}</span>` +
               `<span class="pts">${r.score}</span></li>`;
      }).join('')
    : `<li class="lb-empty">${escapeHtml(t.emptyBoard)}</li>`);
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
