// ══════════════════════════════════════════════════════════════
//  ЕКРАНИ ПОЗА ГРОЮ
//  Титул → завантаження → меню → гра / лідерборд / автори.
//
//  Тут немає жодного тексту: усі написи беруться з блоку
//  `screens` у tuning.js. Правити треба там.
// ══════════════════════════════════════════════════════════════

import { TUNING } from './tuning.js';

const S = TUNING.screens;
const $ = (id) => document.getElementById(id);

let current = '';
let hooks = {};
let loadingStarted = false;
let gameEverOpened = false;

// ══════════════════════════════════════════════════════════════
//  ПЕРЕМИКАННЯ
// ══════════════════════════════════════════════════════════════

export function showScreen(name) {
  const all = document.querySelectorAll('[data-screen]');
  let found = false;

  all.forEach((el) => {
    const on = el.dataset.screen === name;
    el.classList.toggle('on', on);
    if (on) found = true;
  });

  if (!found) {
    console.error('Немає екрана "' + name + '" у index.html — схоже, index.html старий.');
    return;
  }

  current = name;
  hooks.onShow?.(name);

  // Завантаження запускається рівно один раз, при першому заході.
  if (name === 'loading' && !loadingStarted) {
    loadingStarted = true;
    runLoading();
  }
}

export function currentScreen() { return current; }

// ══════════════════════════════════════════════════════════════
//  ЗАПУСК
// ══════════════════════════════════════════════════════════════

export function initScreens(callbacks) {
  hooks = callbacks || {};

  fillTexts();
  paintArt();
  bindButtons();

  showScreen('press');
}

// ── Написи з tuning.js ────────────────────────────────────────
function fillTexts() {
  const set = (id, value) => { const el = $(id); if (el && value !== undefined) el.textContent = value; };

  set('s-press',         S.btnPressStart);
  set('s-menu-title',    TUNING.texts.title);
  set('s-load-note',     S.loadingText);
  set('s-go-game',       S.btnNewGame);
  set('s-go-board',      S.btnLeaderboard);
  set('s-go-credits',    S.btnCredits);
  set('s-board-title',   S.leaderboardTitle);
  set('s-credits-title', S.creditsTitle);

  document.querySelectorAll('.back').forEach((b) => { b.textContent = S.btnBack; });

  // Автори: список беремо з tuning.js
  const list = $('credits-list');
  if (list) {
    list.innerHTML = '';
    (S.credits || []).forEach((group) => {
      const role = document.createElement('p');
      role.className = 'credits-role';
      role.textContent = group.role;
      list.appendChild(role);

      (group.names || []).forEach((n) => {
        const p = document.createElement('p');
        p.className = 'credits-name';
        p.textContent = n;
        list.appendChild(p);
      });
    });
  }
}

// ── Фон меню — та сама картинка, що й у грі ───────────────────
function paintArt() {
  if (!TUNING.background.show || !TUNING.background.src) return;
  const url = 'url("' + TUNING.background.src + '")';
  document.querySelectorAll('[data-art]').forEach((el) => { el.style.backgroundImage = url; });
}

// ── Кнопки ────────────────────────────────────────────────────
// Будь-яка кнопка з data-go="ім'я екрана" веде на цей екран.
function bindButtons() {
  document.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;

    // На чорному екрані працює будь-яка клавіша — як і написано на кнопці.
    const helper = ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'];
    if (current === 'press' && !helper.includes(e.key)) { go('loading'); return; }

    if (e.key === 'Escape' && (current === 'leaderboard' || current === 'credits')) go('menu');
  });
}

function go(name) {
  // Перший клік по сторінці — єдина мить, коли браузер дозволяє
  // увімкнути звук. Не проґав її.
  if (current === 'press') unlockAudio();

  if (name === 'game') {
    gameEverOpened = true;
    hooks.onNewGame?.();
  }
  if (name === 'leaderboard') hooks.onOpenLeaderboard?.();
  if (name === 'menu' && gameEverOpened) hooks.onLeaveGame?.();
  showScreen(name);
}

// ══════════════════════════════════════════════════════════════
//  ЗВУК
//  Браузер глушить будь-яке аудіо, доки людина не клацне по
//  сторінці. Кнопка PRESS TO START і є цим клацанням: тут ми
//  створюємо звуковий канал, і далі музику можна вмикати будь-коли.
// ══════════════════════════════════════════════════════════════

let audio = null;

// Коли зʼявиться музика — брати канал звідси.
export function audioContext() { return audio; }

function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) {
    console.warn('Звук недоступний:', e.message);   // не критично, гра працює далі
  }
}

// ══════════════════════════════════════════════════════════════
//  ЗАВАНТАЖЕННЯ
//  Смужка показує справжній прогрес, а не вигаданий: чекаємо,
//  поки завантажиться фон і поки гра скаже, що готова.
// ══════════════════════════════════════════════════════════════

function runLoading() {
  const fill = $('s-load-fill');
  const pct  = $('s-load-pct');

  const jobs = [];
  if (TUNING.background.show && TUNING.background.src) jobs.push(loadImage(TUNING.background.src));
  jobs.push(waitForGame());

  let done = 0;
  jobs.forEach((p) => p.then(() => { done++; }));

  const t0 = performance.now();
  const minMs  = (S.loadingMinSeconds || 0) * 1000;
  const stopMs = (S.loadingMaxSeconds || 15) * 1000;
  let shown = 0;

  function tick(now) {
    const elapsed = now - t0;
    const real = done / jobs.length;

    // Показане значення плавно наздоганяє справжнє,
    // і додатково не дозволяємо смужці стояти на місці.
    const target = Math.max(real, Math.min(0.9, elapsed / Math.max(minMs, 600)));
    shown += (target - shown) * 0.12;

    const ready  = real >= 1 && elapsed >= minMs;
    const giveUp = elapsed >= stopMs;

    if (ready || giveUp) shown = 1;

    const v = Math.round(shown * 100);
    if (fill) fill.style.width = v + '%';
    if (pct)  pct.textContent  = v + '%';

    if (shown > 0.995) {
      setTimeout(() => { if (current === 'loading') showScreen('menu'); }, 320);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function loadImage(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload  = () => res(true);
    im.onerror = () => res(false);   // фон не критичний, просто йдемо далі
    im.src = src;
  });
}

// Гра сама повідомляє, коли картинки на місці: її фаза
// перестає бути 'loading'.
function waitForGame() {
  return new Promise((res) => {
    const check = () => {
      if (hooks.isGameReady?.()) return res(true);
      setTimeout(check, 80);
    };
    check();
  });
}
