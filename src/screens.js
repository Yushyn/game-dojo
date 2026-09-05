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
  prepFullscreen();
  prepHowto();
  preloadButtons();
  bindButtons();

  showScreen('press');
}

// ── Написи з tuning.js ────────────────────────────────────────
function fillTexts() {
  const set = (id, value) => { const el = $(id); if (el && value !== undefined) el.textContent = value; };

  set('s-press',         S.btnPressStart);
  set('s-rotate-text',   S.rotateHint);
  set('s-load-note',     S.loadingText);
  set('s-go-game',       S.btnNewGame);
  set('s-go-board',      S.btnLeaderboard);
  set('s-go-credits',    S.btnCredits);
  set('s-board-title',   S.leaderboardTitle);
  set('s-credits-title', S.creditsTitle);

  document.querySelectorAll('.back').forEach((b) => { b.textContent = S.btnBack; });

  buildTeam();
}

// ── Автори: фото команди з підписами ──────────────────────────
// Кожен підпис стоїть під своєю людиною. Відсотки лежать
// у tuning.js, у списку team, і зняті з самої картинки.
function buildTeam() {
  const box = $('s-team');
  const P = S.teamPhoto || {};
  if (!box) return;

  box.innerHTML = '';

  // Підписи стоять у відсотках, тому їхня основа має збігатися
  // з КАРТИНКОЮ, а не з екраном. Інакше на вузькому вікні, де
  // фото вужче за контейнер, підписи розʼїжджаються з людьми.
  const stage = document.createElement('div');
  stage.className = 'cr-stage';

  const pic = document.createElement('picture');
  if (P.webp) {
    const src = document.createElement('source');
    src.srcset = P.webp; src.type = 'image/webp';
    pic.appendChild(src);
  }
  const img = document.createElement('img');
  img.src = P.png || P.webp || '';
  img.alt = S.creditsTitle || 'Credits';
  pic.appendChild(img);
  stage.appendChild(pic);

  const names = document.createElement('div');
  names.className = 'cr-names';
  (S.team || []).forEach((p) => {
    const el = document.createElement('span');
    el.className = 'cr-name';
    el.style.left = p.x + '%';

    // Імʼя й прізвище окремими рядками — підпис виходить удвічі
    // вужчим, і сусідні не налазять один на одного.
    const parts = String(p.name).trim().split(/\s+/);
    const first = document.createElement('b');
    first.textContent = parts.shift();
    el.appendChild(first);
    if (parts.length) {
      const rest = document.createElement('i');
      rest.textContent = parts.join(' ');
      el.appendChild(rest);
    }
    names.appendChild(el);
  });
  stage.appendChild(names);
  box.appendChild(stage);

  // Ширину смуги з підписами беремо з реального розміру картинки.
  // CSS тут не помічник: фото масштабується по висоті, і його
  // ширина стає відома лише після розкладки. Тому міряємо.
  const fit = () => {
    const w = img.getBoundingClientRect().width;
    if (w) names.style.width = w + 'px';
  };
  img.addEventListener('load', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(img);
  addEventListener('resize', fit);
  fit();
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

  // Ім'я файлу може бути одне або кілька — так само, як у музики.
  // Беремо перше, що справді відкрилось: аркуш зі слідами приходив
  // від художника під різними назвами, і без цього екран
  // завантаження мовчки лишався порожнім.
  const names = [].concat(A.src || [], 'assets/loading-feet.png');
  pickFile(names).then((src) => {
    box.querySelectorAll('i').forEach((el) => {
      el.style.backgroundImage = 'url("' + src + '")';
    });
  });

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

// ══════════════════════════════════════════════════════════════
//  ПОВНИЙ ЕКРАН
//  Браузер дозволяє розгорнутись лише у відповідь на дію людини.
//  Такою дією є клік по PRESS TO START — іншої нагоди не буде,
//  тому просимо саме там.
//
//  На iPhone повний екран для сторінок не працює взагалі — це
//  обмеження Safari, обійти його нічим. Там гра просто займає
//  все вікно, а якщо телефон тримають вертикально, показується
//  прохання повернути його.
// ══════════════════════════════════════════════════════════════

function goFullscreen() {
  const el = document.documentElement;
  const ask = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!ask || document.fullscreenElement) return;

  const p = ask.call(el, { navigationUI: 'hide' });
  if (p && p.then) {
    p.then(lockLandscape).catch(() => {});   // відмовили — не біда, працюємо у вікні
  } else {
    setTimeout(lockLandscape, 200);
  }
}

// Поворот екрана вміє замикати лише Android. Safari й десктоп
// просто відмовляють, і це нормально.
function lockLandscape() {
  try {
    const o = screen.orientation;
    if (o && o.lock) o.lock('landscape').catch(() => {});
  } catch (e) { /* не підтримується */ }
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else {
    goFullscreen();
  }
}

// ── Інструкція для iPhone ─────────────────────────────────────
function openHowto(open) {
  const box = $('howto');
  if (!box) return;
  box.hidden = !open;
  if (open) $('s-howto-close')?.focus({ preventScroll: true });
}

function prepHowto() {
  $('s-howto-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openHowto(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('howto')?.hidden) openHowto(false);
  });
}

// Гра запущена з домашнього екрана — панелей браузера вже немає.
function isStandalone() {
  return window.navigator.standalone === true ||
         matchMedia('(display-mode: fullscreen)').matches ||
         matchMedia('(display-mode: standalone)').matches;
}

function prepFullscreen() {
  const btn = $('s-full');
  if (!btn) return;

  if (isStandalone()) { btn.remove(); return; }   // вже й так на весь екран

  const ask = document.documentElement.requestFullscreen ||
              document.documentElement.webkitRequestFullscreen;

  // iPhone: кнопки повного екрана не буде, бо Safari її не виконає.
  // Натомість підказуємо єдиний спосіб, який там справді працює.
  if (!ask) {
    btn.textContent = S.homescreenHint || 'Add to Home Screen for fullscreen';
    btn.addEventListener('click', (e) => { e.stopPropagation(); openHowto(true); });
    return;
  }

  const paint = () => {
    btn.textContent = (document.fullscreenElement || document.webkitFullscreenElement)
      ? (S.fullscreenOff || 'Windowed')
      : (S.fullscreenOn  || 'Fullscreen');
  };
  paint();
  document.addEventListener('fullscreenchange', paint);
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
}

// ── Наведення й натиск ────────────────────────────────────────
// Картинки станів кнопки браузер завантажує лише коли вони вперше
// знадобляться — тобто перше наведення блимало б порожнечею.
// Тому просимо його взяти їх заздалегідь.
function preloadButtons() {
  ['assets/MenuButton_holder_88_100_88.png', 'assets/MenuButton_pressed_88_100_88.png',
   'assets/SquareButton_pressed.png'].forEach((src) => {
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
  // Кілька імен на випадок, якщо файл поклали під іншою назвою:
  // пробуємо по черзі, беремо перше, що справді відкрилось.
  // Перші — імена, під якими файли прийшли від художника,
  // другі — як вони називались у версіях 19-25.
  menu:        ['assets/The_Macabre_Waltz.mp3', 'assets/menu-music.mp3'],
  game:        ['assets/fit.mp3', 'assets/game-music.mp3'],
  volume:      0.5,
  fadeSeconds: 1.5,
  showMute:    true,
};

// Грім у меню. Він не окрема музика, а доріжка до відео: звук
// довжиною 6.10 с проти 6.08 с відео, удар припадає на 4.2 с,
// коли спалах уже почався. Тому його не крутять самостійно —
// його веде відео, кадр у кадр.
const THUNDER_FALLBACK = {
  src:    ['assets/sound.mp3', 'assets/menu-thunder.mp3'],
  volume: 0.7,
  offset: 0,   // + зсуває звук пізніше за картинку, у секундах
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

function thunderConf() {
  const T = S.thunder || {};
  return {
    ...THUNDER_FALLBACK,
    ...T,
    src: [...new Set([].concat(T.src || [], THUNDER_FALLBACK.src))],
  };
}

function prepMusic() {
  const M = musicConf();
  muted = localStorage.getItem(MUTE_KEY) === '1';

  hook('menu', $('s-music'), M.menu);
  hook('game', $('s-music-game'), M.game);
  hook('thunder', $('s-thunder'), thunderConf().src);

  // Гримить рівно стільки, скільки триває відео, і не зациклюється
  // сам по собі — інакше за пару хвилин звук поїхав би від картинки.
  const th = players.thunder;
  if (th) { th.loop = false; th.volume = thunderConf().volume; }
  bindThunder();

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

// Притишити музику гри, поки на екрані ролик втрати життя.
// Без цього зациклений трек рівня просто перекрикує «ой»:
// у ролику перші пʼять секунд — тиха атмосфера, і лише в кінці
// удар. На тлі музики його майже не чути.
export function duckMusic(on) {
  if (!players.game) return;
  if (on) {
    fadeOut('game');
  } else if (current === 'game' && !muted) {
    fadeIn('game');            // повертаємо з того ж місця, плавно
  }
}

// Чи вимкнений звук. Потрібно main.js: ролик втрати життя має
// мовчати, коли людина вимкнула звук у меню.
export function isMuted() { return muted; }

function paintMute(btn) {
  // Напис каже, що станеться від натиску, а не який стан зараз.
  btn.textContent = muted
    ? (S.muteOn  || 'Sound: turn on')
    : (S.muteOff || 'Sound: turn off');
}

// Де яка музика доречна
function trackFor(name) {
  if (name === 'game') return 'game';
  if (name === 'menu' || name === 'leaderboard' || name === 'credits' ||
      name === 'result' || name === 'lost') return 'menu';
  return null;   // чорний екран і завантаження — тиша
}

function updateMusic(name) {
  const want = muted ? null : trackFor(name);
  Object.keys(players).forEach((key) => {
    if (key === 'thunder') return;      // ним керує відео, не екран
    if (key === want) fadeIn(key); else fadeOut(key);
  });
  syncThunder();
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

// ── Грім під відео меню ───────────────────────────────────────
// Звук веде відео, а не власний таймер: щоразу, коли ролик
// починається спочатку, грім теж починається спочатку. Якщо вони
// все ж розійшлись більше ніж на чверть секунди, звук підтягується
// до кадру. Так спалах і удар лишаються разом хоч на п'ятому колі.
let lastVideoT = 0;

function bindThunder() {
  const vid = $('s-menu-video');
  if (!vid || !players.thunder) return;
  vid.addEventListener('timeupdate', syncThunder);
  vid.addEventListener('play', syncThunder);
}

function syncThunder() {
  const th = players.thunder;
  const vid = $('s-menu-video');
  if (!th || !vid) return;

  if (muted || current !== 'menu' || vid.paused) {
    if (!th.paused) th.pause();
    return;
  }

  const C = thunderConf();
  const now = vid.currentTime;

  // Відео пішло на нове коло — починаємо звук заново.
  if (now < lastVideoT - 0.3) { th.currentTime = 0; }
  lastVideoT = now;

  const target = now - C.offset;
  const len = th.duration || 0;

  if (target < 0 || (len && target >= len)) {
    if (!th.paused) th.pause();          // у цій частині ролика тиша
    return;
  }

  if (Math.abs(th.currentTime - target) > 0.25) th.currentTime = target;
  if (th.paused) { const p = th.play(); if (p && p.catch) p.catch(() => {}); }
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

    if (e.key === 'Escape' &&
        (current === 'leaderboard' || current === 'credits' ||
         current === 'result' || current === 'lost')) go('menu');
  });
}

function go(name) {
  // Перший клік по сторінці — єдина мить, коли браузер дозволяє
  // і увімкнути звук, і розгорнутись на весь екран. Не проґав її.
  if (current === 'press') unlockAudio();

  // Просимо повний екран не лише на першому кліку. Браузер міг
  // відмовити з десятка причин; кожен наступний дотик — нова
  // законна нагода спитати ще раз, і людині це нічого не коштує.
  goFullscreen();

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

// Перше ім'я зі списку, за яким справді є файл.
// Якщо не відкрилось жодне — віддаємо останнє, щоб не ламати розмітку.
function pickFile(list) {
  const names = list.filter(Boolean);
  return names.reduce(
    (chain, name) => chain.then((found) => found || loadImage(name).then((ok) => (ok ? name : null))),
    Promise.resolve(null)
  ).then((found) => found || names[names.length - 1]);
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
