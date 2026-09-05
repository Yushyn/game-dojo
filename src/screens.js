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
  toggleVideo(name);
  updateMusic(name);
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
  buildFeet();
  prepMusic();
  preloadButtons();
  bindButtons();

  showScreen('press');
}

// ── Написи з tuning.js ────────────────────────────────────────
function fillTexts() {
  const set = (id, value) => { const el = $(id); if (el && value !== undefined) el.textContent = value; };

  set('s-press',         S.btnPressStart);
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

// ── Сліди на екрані завантаження ──────────────────────────────
// Аркуш один, а відбитків на ньому вісім. Замість того щоб різати
// картинку на файли, ми кладемо її вісім разів і кожному шару
// показуємо лише його відбиток. Далі вони по черзі проступають
// знизу вгору — виходить хода.
function buildFeet() {
  const box = $('s-feet');
  const A = S.loadingArt;
  if (!box || !A) return;

  box.style.setProperty('--cycle', A.cycleSeconds + 's');
  box.innerHTML = '';

  const pause = A.cycleSeconds / A.count;   // затримка між кроками

  // Рахуємо знизу вгору: перший крок — найнижчий відбиток.
  for (let i = 0; i < A.count; i++) {
    const fromTop = A.count - 1 - i;                    // номер зверху
    const isRight = (fromTop % 2 === 0) === !!A.topIsRight;
    const [x1, x2] = isRight ? A.rightX : A.leftX;

    const yTop = A.firstY + fromTop * A.stepY;
    const yBot = Math.min(yTop + A.printHeight, A.height);

    const pc = (v, whole) => (v / whole * 100).toFixed(3) + '%';

    const layer = document.createElement('i');
    layer.style.backgroundImage = 'url("' + A.src + '")';
    // inset(зверху справа знизу зліва) — лишаємо видимим один відбиток
    layer.style.clipPath = 'inset(' + pc(yTop, A.height) + ' ' +
                                      pc(A.width - x2, A.width) + ' ' +
                                      pc(A.height - yBot, A.height) + ' ' +
                                      pc(x1, A.width) + ')';
    layer.style.setProperty('--delay', (i * pause).toFixed(3) + 's');
    box.appendChild(layer);
  }
}

// ── Тло екранів поза грою ─────────────────────────────────────
// Нерухомий кадр лягає на всі три екрани одразу, а в меню поверх
// нього грає відео. Якщо відео не підтягнеться — лишиться кадр,
// і меню все одно виглядатиме як задумано.
function paintArt() {
  const V = S.menuVideo || {};
  const still = V.poster || (TUNING.background.show ? TUNING.background.src : '');

  if (still) {
    const url = 'url("' + still + '")';
    document.querySelectorAll('[data-art]').forEach((el) => { el.style.backgroundImage = url; });
  }

  const vid = $('s-menu-video');
  if (!vid) return;

  // Людям, які просили менше руху в системі, показуємо кадр.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = V.sources || (V.src ? [V.src] : []);
  if (!list.length || V.play === false || calm) { vid.remove(); return; }

  if (V.poster) vid.poster = V.poster;
  list.forEach((src) => {
    const el = document.createElement('source');
    el.src = src;
    if (src.endsWith('.webm')) el.type = 'video/webm';
    if (src.endsWith('.mp4'))  el.type = 'video/mp4';
    vid.appendChild(el);
  });
  vid.load();
}

// Відео крутиться лише поки видно меню — щоб дарма не гріти ноутбук.
function toggleVideo(name) {
  const vid = $('s-menu-video');
  if (!vid) return;
  if (name === 'menu') {
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});   // браузер може відмовити, це не біда
  } else {
    vid.pause();
  }
}

// ── Наведення й натиск ────────────────────────────────────────
// Картинки станів кнопки браузер завантажує лише коли вони вперше
// знадобляться — тобто перше наведення блимало б порожнечею.
// Тому просимо його взяти їх заздалегідь.
function preloadButtons() {
  ['assets/btn-hover.png', 'assets/btn-pressed.png'].forEach((src) => {
    const im = new Image();
    im.src = src;
  });
}

// ══════════════════════════════════════════════════════════════
//  МУЗИКА
//  Два канали: один для меню, другий для самої гри. Обидва
//  зациклені, обидва слухаються одного вимикача.
// ══════════════════════════════════════════════════════════════

// Якщо в tuning.js блоку music немає — беремо ці значення.
// Так було не завжди: раніше без блоку музика мовчки зникала,
// і зрозуміти чому було неможливо. Тепер вона грає в будь-якому разі.
const MUSIC_FALLBACK = {
  menu:        'assets/menu-music.mp3',
  // Кілька імен на випадок, якщо файл поклали під іншою назвою:
  // пробуємо по черзі, беремо перше, що справді відкрилось.
  game:        ['assets/game-music.mp3', 'assets/fit.mp3'],
  volume:      0.5,
  fadeSeconds: 1.5,
  showMute:    true,
};

const players = {};      // { menu: <audio>, game: <audio> }
const fades   = {};      // таймери плавного наростання
let muted = false;
const MUTE_KEY = 'music-muted';

function musicConf() {
  const M = S.music || {};

  // Імена файлів складаємо, а не заміняємо: спершу пробуємо те, що
  // написано в tuning.js, потім запасні. Інакше одне ім'я з tuning
  // перекривало б увесь список, і при друкарській помилці чи іншій
  // назві файлу музика мовчала б без пояснень.
  const both = (a, b) => [...new Set([].concat(a || [], b || []))];

  return {
    ...MUSIC_FALLBACK,
    ...M,
    menu: both(M.menu || M.src, MUSIC_FALLBACK.menu),   // src — стара назва поля
    game: both(M.game,          MUSIC_FALLBACK.game),
  };
}

function prepMusic() {
  const M = musicConf();
  muted = localStorage.getItem(MUTE_KEY) === '1';

  hook('menu', $('s-music'), M.menu);
  hook('game', $('s-music-game'), M.game);

  const btn = $('s-mute');
  if (!btn) return;
  if (M.showMute === false || !players.menu) { btn.remove(); return; }

  paintMute(btn);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();               // клік не має йти далі по меню
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    paintMute(btn);
    updateMusic(current);
  });
}

function hook(key, el, src) {
  if (!el || !src) return;

  const list = Array.isArray(src) ? src.slice() : [src];
  el.loop = true;
  el.volume = 0;
  players[key] = el;

  // Якщо файлу за першим іменем немає — тихо пробуємо наступне.
  // Раніше в такому разі музика просто мовчала, і зрозуміти чому
  // можна було лише через вкладку Network.
  let i = 0;
  const tryNext = () => {
    if (i >= list.length) {
      console.warn('Музика «' + key + '» не знайдена. Шукав: ' + list.join(', '));
      delete players[key];
      return;
    }
    el.src = list[i++];
    el.load();
  };
  el.addEventListener('error', tryNext);
  tryNext();
}

function paintMute(btn) {
  // Напис каже, що станеться від натиску, а не який стан зараз.
  btn.textContent = muted
    ? (S.muteOn  || 'Sound: turn on')
    : (S.muteOff || 'Sound: turn off');
}

// Де яка музика доречна
function trackFor(name) {
  if (name === 'game') return 'game';
  if (name === 'menu' || name === 'leaderboard' || name === 'credits') return 'menu';
  return null;   // чорний екран і завантаження — тиша
}

function updateMusic(name) {
  const want = muted ? null : trackFor(name);
  Object.keys(players).forEach((key) => {
    if (key === want) fadeIn(key); else fadeOut(key);
  });
}

function fadeIn(key) {
  const el = players[key];
  if (!el) return;
  const M = musicConf();

  const p = el.play();
  if (p && p.catch) p.catch(() => {});   // браузер може відмовити — не біда

  clearInterval(fades[key]);
  const target = M.volume ?? 0.5;
  const steps = Math.max(1, Math.round((M.fadeSeconds ?? 1.5) * 20));
  let i = Math.round(el.volume / target * steps);   // якщо вже звучить — не з нуля
  fades[key] = setInterval(() => {
    i++;
    el.volume = Math.max(0, Math.min(target, target * i / steps));
    if (i >= steps) clearInterval(fades[key]);
  }, 50);
}

function fadeOut(key) {
  const el = players[key];
  if (!el || el.paused) return;
  clearInterval(fades[key]);
  const steps = 12;
  let i = steps;
  const from = el.volume;
  fades[key] = setInterval(() => {
    i--;
    el.volume = Math.max(0, from * i / steps);
    if (i <= 0) { clearInterval(fades[key]); el.pause(); }
  }, 25);
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
  const V = S.menuVideo || {};
  if (V.poster) jobs.push(loadImage(V.poster));
  if (TUNING.background.show && TUNING.background.src) jobs.push(loadImage(TUNING.background.src));
  jobs.push(waitForVideo());
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

    // Поки не готові — тримаємо смужку трохи нижче кінця, інакше
    // вона доповзає до ста сама й екран зникає раніше часу.
    const cap = (ready || giveUp) ? 1 : 0.985;
    shown = Math.min(shown, cap);

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

// Відео великого розміру, тож чекаємо, поки його стане досить
// для безперервного програвання. Але не більше чотирьох секунд:
// краще показати меню з нерухомим кадром, ніж тримати людину.
function waitForVideo() {
  return new Promise((res) => {
    const vid = $('s-menu-video');
    if (!vid || !vid.children.length) return res(true);
    if (vid.readyState >= 3) return res(true);
    const done = () => res(true);
    vid.addEventListener('canplaythrough', done, { once: true });
    vid.addEventListener('error', done, { once: true });
    setTimeout(done, 4000);
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
