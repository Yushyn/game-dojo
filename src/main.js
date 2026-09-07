// Звʼязок сторінки з грою: інтерфейс поверх полотна, екран результату,
// лідерборд. Кнопок «Почати» й «Інструмент» більше немає — раунди йдуть
// самі, а єдине, що вибирає гравець, це розмір пензля.

import { TUNING } from './tuning.js';
import { start, undo, reset, getState, brushOptions, setBrush, setPaused,
         gotoRound, lastRound } from './game.js';
import { topScores, submitScore, qualifies, initDb, dbReady } from './db.js';
import { initScreens, showScreen, currentScreen, isMuted, duckMusic, playButtonClickSound } from './screens.js';

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
const warned = new Set();
function put(id, prop, value) {
  const el = $(id);
  if (!el) {
    missing.push(id);
    if (!warned.has(id)) {
      warned.add(id);
      console.error('У index.html немає елемента «' + id + '». ' +
        'Найчастіше це старий index.html у кеші браузера — ' +
        'онови сторінку з Ctrl+Shift+R (на Mac ⌘+Shift+R).');
    }
    return;
  }
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
put('s-lost-title', 'textContent', t.lostTitle);
put('s-lost-note',  'textContent', t.lostNote);
put('lost-again',   'textContent', t.lostAgain);
put('lost-menu',    'textContent', t.lostMenu);
put('s-result-title', 'textContent', t.resultTitle);
put('s-result-label', 'textContent', t.resultScore);
put('name',           'placeholder', t.namePlaceholder);
put('save',           'textContent', t.saveButton);

if (missing.length) {
  console.error('У index.html немає елементів:', missing.join(', '),
    '— схоже, index.html лишився старий. Заміни його з архіву.');
}

// ── Запуск гри ────────────────────────────────────────────────
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

  onNewGame:   () => { hideAsk(); reset(); setPaused(false); },

  onLeaveGame: () => { hideAsk(); reset(); setPaused(true); },
  onOpenLeaderboard: () => refreshBoard(),
});

// ══════════════════════════════════════════════════════════════
//  КНОПКИ ІНСТРУМЕНТІВ
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

    const rel = tool.size / max;
    const k = fit * (1 - mix + mix * rel);
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
      box.classList.add('dot');
    }
    b.appendChild(box);

    b.addEventListener('click', () => {
      playButtonClickSound();
      setBrush(i);
    });
    brushBox.appendChild(b);
    return b;
  });
}
buildBrushes();

// ── Змінна для збереження введеного тексту-чіту ────────────────
let cheatBuffer = '';

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (currentScreen() !== 'game') return;

  if (askBox && !askBox.hidden) {
    if (e.key === 'Escape') closeAsk();
    return;
  }
  if (e.key === 'Escape') { openAsk(); return; }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  const n = Number(e.key);
  if (n >= 1 && n <= brushButtons.length) setBrush(n - 1);

  // ── ЛОГІКА ЧІТ-КОДІВ ─────────────────────────────────────────
  // Буфер один на всі коди — другого слухача клавіш заводити не
  // треба. Набране копиться тут, а перевірки йдуть по черзі.
  const st = getState();
  if (e.key.length === 1 && e.key !== ' ') {
    cheatBuffer += e.key.toLowerCase();

    if (cheatBuffer.length > 50) {
      cheatBuffer = cheatBuffer.slice(-25);
    }

    // 1. Назва рівня без пробілів — зарахувати раунд на 100%.
    //    Як і було: тільки в робочий час, коли раунд справді йде.
    if (st.phase === 'play') {
      const targetName = (st.bootName || '').replace(/\s+/g, '').toLowerCase();

      if (targetName && cheatBuffer.includes(targetName)) {
        cheatBuffer = '';

        if (typeof window.__cheatWin === 'function') {
          window.__cheatWin();
        }
        return;
      }
    }

    // 2. cinderella — перескочити на останній чобіт.
    //    Тут фаза не важлива: код спрацює й під час вступу,
    //    і на екрані результату, аби була відкрита гра.
    const jump = String(TUNING.texts?.cheats?.lastLevel || '').toLowerCase();

    if (jump && cheatBuffer.includes(jump)) {
      cheatBuffer = '';
      gotoRound(lastRound());
      console.log('Чіт: перехід на останній рівень (' + (lastRound() + 1) + ')');
    }
  }
});

// ══════════════════════════════════════════════════════════════
//  ВИХІД У МЕНЮ
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

$('ask-yes')?.addEventListener('click', () => {
  askBox.hidden = true;
  setPaused(false);
  showScreen('menu');
  reset();
});

// ══════════════════════════════════════════════════════════════
//  ЖИТТЯ
// ══════════════════════════════════════════════════════════════

const livesBox = $('lives');
let lifeIcons = [];

function buildLives() {
  if (!livesBox) return;
  const L = TUNING.lives || {};
  const count = Math.max(1, L.count ?? 2);
  const icons = L.icons || [];

  livesBox.style.setProperty('--life-red', L.iconRed ?? '#c02020');
  livesBox.style.setProperty('--life-red-alpha', L.iconRedAlpha ?? 0.9);
  livesBox.style.setProperty('--life-dim', L.iconDim ?? 0.45);
  livesBox.style.setProperty('--life-idle', L.iconIdle ?? 0.5);
  livesBox.classList.toggle('no-highlight', L.iconHighlight === false);
  livesBox.style.setProperty('--life-white', L.iconWhite ?? '#ffffff');
  livesBox.style.setProperty('--life-white-alpha', L.iconWhiteAlpha ?? 0.95);
  livesBox.style.setProperty('--life-glow', (L.iconGlow ?? 14) + 'px');
  livesBox.style.setProperty('--life-icon-fade', (L.iconFadeSeconds ?? 0.5) + 's');

  livesBox.innerHTML = '';
  lifeIcons = [];
  for (let i = 0; i < count; i++) {
    const src = icons[i] || icons[icons.length - 1];
    if (!src) break;

    const cell = document.createElement('span');
    cell.className = 'life';

    const im = document.createElement('img');
    im.src = src;
    im.alt = '';
    cell.appendChild(im);

    const glow = document.createElement('i');
    glow.className = 'life-glow';
    glow.style.webkitMaskImage = 'url("' + src + '")';
    glow.style.maskImage = 'url("' + src + '")';
    cell.appendChild(glow);

    const tint = document.createElement('i');
    tint.className = 'life-tint';
    tint.style.webkitMaskImage = 'url("' + src + '")';
    tint.style.maskImage = 'url("' + src + '")';
    cell.appendChild(tint);

    livesBox.appendChild(cell);
    lifeIcons.push(cell);
  }
}
buildLives();

// ── Повноекранний ролик при втраті життя ──────────────────────
const animList  = [].concat(TUNING.lives?.anim || []);
const soundList = [].concat(TUNING.lives?.animSound || []);
const animEl    = $('life-anim');
const soundEl   = $('life-sound');
let animPlaying = false;

const isVideo = (src) => /\.(webm|mp4)$/i.test(String(src));
const pick = (list, i) => (list.length ? list[Math.min(i || 0, list.length - 1)] : '');

if (animEl && !animList.some(isVideo)) animEl.remove();
if (soundEl && !soundList.length) soundEl.remove();

// ── Попереднє завантаження відео ──────────────────────────────
// Відсутній файл більше не мовчить: про нього видно в консолі
// одразу при запуску сторінки, ще до першого ролика.
function preload(src) {
  if (!src) return;
  const el = document.createElement(isVideo(src) ? 'video' : 'audio');
  el.preload = 'auto';
  el.addEventListener('error', () => {
    console.error('Файл ролика не знайдено: ' + src +
      '\nПеревір, чи лежить він у папці assets/ САМЕ під цим імʼям, ' +
      'і чи збігається ім’я з тим, що написано в src/tuning.js.');
  });
  el.src = src;
}

animList.forEach(preload);

// ── Звукові доріжки роликів ───────────────────────────────────
// На КОЖЕН файл — свій власний елемент, створений і завантажений
// одразу при запуску сторінки.
//
// Раніше елемент був один на всі ролики, а потрібний файл йому
// підставляли в саму мить показу — і одразу ж викликали play().
// Браузер не встигав перечитати нове джерело й відмовляв, тому
// ПЕРШИЙ ролик щоразу йшов німим, а другий уже грав: до нього
// елемент був уже прогрітий попереднім файлом. З тієї ж причини
// мовчав і ролик перемоги — він єдиний на своєму елементі, тобто
// для нього кожен показ перший.
//
// Тепер підставляти нічого не треба: у мить показу файл уже
// завантажений і лежить у своєму елементі.
function buildSounds(list, reuse) {
  return list.filter(Boolean).map((src, i) => {
    const el = (i === 0 && reuse) ? reuse : document.createElement('audio');
    el.preload = 'auto';
    el.dataset.unlock = '1';   // screens.js розблокує його на першому кліку
    el.addEventListener('error', () => {
      console.error('Звуковий файл не знайдено: ' + src +
        '\nПеревір ім’я в папці assets/ і в src/tuning.js.');
    });
    el.src = src;
    if (!el.isConnected) document.body.appendChild(el);
    return el;
  });
}

// Ролику з номером більшим, ніж є файлів, дістається останній —
// так само, як і з відео.
function soundFor(pool, idx) {
  return pool.length ? pool[Math.min(idx || 0, pool.length - 1)] : null;
}

const animSounds = buildSounds(soundList, soundEl);

// Якщо окремого mp3 немає, беремо звукову доріжку, вшиту в саме
// відео. Гірше за окремий файл — його не глушить вимикач Sound —
// але незрівнянно краще за німий ролик.
//
// Браузер називає причину відмови одним словом, і слова ці
// означають зовсім різні речі, тому перекладаємо їх одразу:
// шукати доведеться в різних місцях.
function whyNoSound(name) {
  if (name === 'NotSupportedError') {
    return 'браузер не отримав файл. Найчастіше це 404: файла за цією адресою ' +
      'на сервері немає. Перевір РЕГІСТР літер в імені — на Netlify ' +
      'Auch_.mp3 і auch_.mp3 це різні файли, а на Windows однакові, ' +
      'тому локально працює, а на сайті ні. І перевір, чи файл ' +
      'справді закомічений і запушений у репозиторій';
  }
  if (name === 'NotAllowedError') {
    return 'браузер заборонив звук: сторінка ще не отримала жодного кліку';
  }
  if (name === 'AbortError') {
    return 'відтворення перервали новим завантаженням';
  }
  return name || 'невідома причина';
}

function fallbackToVideoTrack(videoEl, src, name) {
  console.error('Звук ролика не заграв: ' + src +
    '\nПричина: ' + whyNoSound(name) +
    '.\nПоки що вмикаю доріжку, вшиту в саме відео.');
  if (videoEl && !isMuted()) videoEl.muted = false;
}

const fadeEl = $('life-fade');
const fadeMs = Math.round((TUNING.lives?.fadeSeconds ?? 0.35) * 1000);
let fadeTimer = 0;

if (fadeEl) fadeEl.style.setProperty('--life-fade', (fadeMs / 1000) + 's');

function showLifeAnim(on, idx) {
  if (!animEl || on === animPlaying) return;
  const src = pick(animList, idx);
  if (on && !isVideo(src)) return;

  animPlaying = on;
  clearTimeout(fadeTimer);

  if (on) {
    fadeEl?.classList.add('on');

    fadeTimer = setTimeout(() => {
      animEl.hidden = false;
      if (animEl.getAttribute('src') !== src) animEl.src = src;
      try { animEl.currentTime = 0; } catch (e) {}
      animEl.play().catch(() => {});
      playAnimSound(idx);
      fadeEl?.classList.remove('on');
    }, fadeMs);

    duckMusic(true);
  } else {
    fadeEl?.classList.add('on');
    animEl.hidden = true;
    animEl.pause();
    stopAnimSound();
    duckMusic(false);

    fadeTimer = setTimeout(() => fadeEl?.classList.remove('on'), 30);
  }
}

function playAnimSound(idx) {
  if (isMuted()) return;
  const el = soundFor(animSounds, idx);
  if (!el) {
    fallbackToVideoTrack(animEl, '(файл не вказано в tuning.js)', 'NotSupportedError');
    return;
  }
  el.volume = TUNING.lives?.animSoundVolume ?? 0.9;
  try { el.currentTime = 0; } catch (e) {}
  const p = el.play();
  if (p && p.catch) p.catch((e) => fallbackToVideoTrack(animEl, el.getAttribute('src'), e?.name));
}

function stopAnimSound() {
  if (animEl) animEl.muted = true;   // знімаємо аварійне вмикання доріжки
  animSounds.forEach((el) => {
    el.pause();
    try { el.currentTime = 0; } catch (e) {}
  });
}

// ── Переможна катсцена ────────────────────────────────────────
const winList   = [].concat(TUNING.win?.anim || []);
const winSounds = [].concat(TUNING.win?.animSound || []);
const winEl     = $('win-anim');
const winSoundEl = $('win-sound');
let winPlaying = false;

if (winEl && !winList.some(isVideo)) winEl.remove();
if (winSoundEl && !winSounds.length) winSoundEl.remove();

winList.forEach(preload);
const winSoundEls = buildSounds(winSounds, winSoundEl);

let winFadeTimer = 0;

function showWinAnim(on) {
  if (on === winPlaying) return;
  const src = pick(winList, 0);
  winPlaying = on;
  clearTimeout(winFadeTimer);

  if (on) {
    duckMusic(true);
    if (winEl && isVideo(src)) {
      fadeEl?.classList.add('on');
      winFadeTimer = setTimeout(() => {
        winEl.hidden = false;
        if (winEl.getAttribute('src') !== src) winEl.src = src;
        try { winEl.currentTime = 0; } catch (e) {}
        winEl.play().catch(() => {});
        // Звук запускаємо разом із картинкою, а не на 0.35 с
        // раніше: раніше він стартував ще під час затемнення
        // і йшов попереду відео.
        playWinSound();
        fadeEl?.classList.remove('on');
      }, fadeMs);
    } else {
      playWinSound();
    }
  } else {
    if (winEl) { winEl.hidden = true; winEl.pause(); winEl.muted = true; }
    stopWinSound();
    duckMusic(false);
  }
}

function playWinSound() {
  if (isMuted()) return;
  const el = soundFor(winSoundEls, 0);
  if (!el) {
    fallbackToVideoTrack(winEl, '(файл не вказано в tuning.js)', 'NotSupportedError');
    return;
  }
  el.volume = TUNING.win?.animSoundVolume ?? 0.9;
  try { el.currentTime = 0; } catch (e) {}
  const p = el.play();
  if (p && p.catch) p.catch((e) => fallbackToVideoTrack(winEl, el.getAttribute('src'), e?.name));
}

function stopWinSound() {
  winSoundEls.forEach((el) => {
    el.pause();
    try { el.currentTime = 0; } catch (e) {}
  });
}

// ══════════════════════════════════════════════════════════════
//  ЗВУК ТАБЛИЧКИ З РЕЗУЛЬТАТОМ РАУНДУ
//  APPROVED і REJECTED мають свій звук. Файли задаються в
//  tuning.js, блок round: passSound і failSound.
//  Елементи — свої на кожен файл і завантажені наперед, з тієї ж
//  причини, що й у роликів: підставляти src у мить показу не
//  можна, браузер не встигає й мовчить.
// ══════════════════════════════════════════════════════════════

const passSounds = buildSounds([TUNING.round?.passSound].filter(Boolean));
const failSounds = buildSounds([TUNING.round?.failSound].filter(Boolean));

function playResultSound(passed) {
  if (isMuted()) return;
  const el = soundFor(passed ? passSounds : failSounds, 0);
  if (!el) return;   // звук навмисно не заданий — це не помилка
  el.volume = TUNING.round?.resultSoundVolume ?? 0.9;
  try { el.currentTime = 0; } catch (e) {}
  const p = el.play();
  if (p && p.catch) {
    p.catch((e) => console.error('Звук результату не заграв: ' +
      el.getAttribute('src') + '\nПричина: ' + whyNoSound(e?.name)));
  }
}

// ══════════════════════════════════════════════════════════════
//  ПОКАЗ СТАНУ
// ══════════════════════════════════════════════════════════════

const barEl = $('hud-bar');
const timerEl = $('hud-timer');
let resultShown = false;
let lostShown = false;
let resultSoundDone = false;

function render(s) {
  const st = s || getState();

  document.body.dataset.phase = st.phase;

  put('hud-round', 'textContent',
      fill(t.hudRound, { name: st.bootName, n: st.round + 1, total: st.total || 1 }));
  put('hud-total', 'textContent', fill(t.hudTotal, { score: st.score }));
  put('hud-goal', 'textContent', fill(t.hudGoal, { pass: st.pass }));

  renderTime(st);

  brushButtons.forEach((b, i) => {
    b.classList.toggle('on', i === st.brush);
    b.disabled = !st.canEdit;
  });

  const activeIdx = st.lives - 1;
  lifeIcons.forEach((el, i) => {
    const lost = i >= st.lives;
    el.classList.toggle('lost', lost);
    el.classList.toggle('active', !lost && i === activeIdx);
  });

  showLifeAnim(!!st.showAnim && currentScreen() === 'game', st.lifeIndex);
  showWinAnim(!!st.showWin && currentScreen() === 'game');

  // Табличка зʼявляється в ту саму мить, коли починається фаза
  // 'result', тож звук вішаємо на її початок. Прапорець потрібен,
  // бо render() викликається кільканадцять разів за цей час.
  if (st.phase === 'result' && !resultSoundDone && currentScreen() === 'game') {
    resultSoundDone = true;
    playResultSound(st.passed);
  }
  if (st.phase !== 'result') resultSoundDone = false;

  if (st.phase === 'lost' && !lostShown && currentScreen() === 'game') {
    lostShown = true;
    endRun(false, st.score);
  }
  if (st.phase !== 'lost') lostShown = false;

  if (st.phase === 'done' && !resultShown && currentScreen() === 'game') {
    resultShown = true;
    endRun(true, st.score);
  }
  if (st.phase !== 'done') resultShown = false;
}

// ── Чим закінчилась гра ───────────────────────────────────────
// Місце в таблиці залежить тільки від очок, а не від того, дійшов
// гравець до кінця чи витратив усі ноги. Тому програш із гарним
// рахунком веде на той самий екран збереження, що й перемога, —
// просто з іншим заголовком.
//
// Звичайний екран програшу лишається для тих, кому до таблиці не
// вистачило: пропонувати їм вписати імʼя означало б обіцяти
// місце, якого немає.
async function endRun(won, score) {
  if (!won) {
    let ok = false;
    try {
      const q = await qualifies(score);
      // unknown — це «база мовчить, ми не знаємо». Для перемоги
      // поле все одно показуємо, а от переможеному краще не
      // обіцяти таблицю навмання.
      ok = q.ok && !q.unknown;
    } catch (e) {
      ok = false;
    }
    // Гравець міг за цей час вийти в меню або почати нову гру.
    if (currentScreen() !== 'game') return;
    if (!ok) { showScreen('lost'); return; }
  }

  put('s-result-title', 'textContent', won ? t.resultTitle : (t.lostQualifiedTitle || t.lostTitle));
  put('s-result-label', 'textContent', t.resultScore);
  put('s-result-score', 'textContent', score);
  lastRunScore = score;
  if (statusEl) statusEl.textContent = '';
  showScreen('result');
}

// Рахунок саме тієї гри, що скінчилась. Раніше при збереженні
// бралось поточне значення з рушія — а воно вже могло бути іншим,
// якщо гравець устиг натиснути «Ще раз».
let lastRunScore = 0;

function renderTime(st) {
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
    const total = TUNING.round.totalSeconds || 1;
    const left = st.phase === 'play' ? st.timeLeft / total
               : st.phase === 'intro' ? 1 : 0;
    const pc = Math.max(0, Math.min(1, left)) * 100;
    const next = pc.toFixed(2) + '%';
    if (next !== lastBarWidth) { barEl.style.width = next; lastBarWidth = next; }
  }
}
let lastBarWidth = '';

(function timeLoop() {
  requestAnimationFrame(timeLoop);
  renderTime(getState());
})();

setInterval(() => render(), 200);
render();

$('lost-again')?.addEventListener('click', () => {
  showScreen('game');
  reset();
});

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
  const res = await submitScore(name, lastRunScore);
  saveBtn.disabled = false;
  statusEl.textContent = res.ok ? t.saved : 'Не збереглось: ' + res.reason;
  if (!res.ok) return;
  refreshBoard();
  setTimeout(() => { if (currentScreen() === 'result') showScreen('menu'); }, 900);
});

initDb().then(refreshBoard);