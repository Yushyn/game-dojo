// ══════════════════════════════════════════════════════════════
//  ЕКРАНИ ПОЗА ГРОЮ
//  Титул → завантаження → вступний ролик → меню →
//  гра / лідерборд / автори.
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

// ── Звук кліку на UX-кнопки ──────────────────────────────────
let buttonClickAudio = null;

function prepButtonClickSound() {
  const src = S.buttonClickSound;
  if (!src) return;
  buttonClickAudio = new Audio(src);
  buttonClickAudio.preload = 'auto';

  // Універсальний слухач для всіх кнопок на сторінці
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .menu-item, .sq, .lb-close, .back, .mute');
    if (btn) {
      playButtonClickSound();
    }
  }, true);
}

export function playButtonClickSound() {
  if (isMuted()) return;
  
  // Якщо об'єкт звуку ще не створено або файл міняється
  if (!buttonClickAudio && S.buttonClickSound) {
    buttonClickAudio = new Audio(S.buttonClickSound);
  }
  
  if (!buttonClickAudio) return;

  try {
    // Клонуємо або скидаємо трек, щоб звук можна було швидко просклонувати/перезапустити
    const sound = buttonClickAudio.cloneNode();
    sound.volume = S.buttonClickVolume ?? 0.8;
    sound.play().catch((err) => {
      console.warn('Не вдалося відтворити звук кнопки:', err);
    });
  } catch (e) {}
}

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

  if (name === 'intro') playIntro();

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
  prepIntro();
  prepButtonClickSound();
  prepFullscreen();
  prepHowto();
  preloadButtons();
  bindButtons();

  showScreen('press');
}

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

  buildCreditsLogo();
  buildTeam();
}

// Логотип над фотографією команди. Якщо файл не знайдеться,
// рядок просто зникає — решта екрана лишається як була.
function buildCreditsLogo() {
  const box = $('s-credits-logo');
  if (!box) return;
  const L = S.creditsLogo || {};
  box.innerHTML = '';
  if (!L.on || !L.src) { box.hidden = true; return; }

  box.hidden = false;
  box.style.height       = (L.height ?? 16) + 'vh';
  box.style.marginTop    = (L.gapTop ?? 1) + 'vh';
  box.style.marginBottom = (L.gapBottom ?? 1) + 'vh';

  const img = document.createElement('img');
  img.alt = '';
  img.addEventListener('error', () => {
    box.hidden = true;
    console.warn('Логотип не знайдено: ' + L.src +
      ' — перевір, чи файл лежить у папці assets/');
  });
  img.src = L.src;
  box.appendChild(img);
}

// ── КОМАНДА НА ЕКРАНІ АВТОРІВ ─────────────────────────────────
// Замість фотографії тут може крутитись відео. Зациклюється воно
// так само, як дівчинка в грі: вбудований loop у браузера — це
// справжнє перемотування з паузою 150–250 мс, і око читає її як
// ривок. Тому заводимо ДВІ копії ролика й пускаємо їх по черзі:
// поки одна дограє, друга вже розкодована й проявляється поверх.
// Якщо відео не відкрилось (старий браузер, немає файла) —
// на його місце тихо стає звичайна картинка, як було раніше.
let teamVideos = [];    // [той, що в потоці, той, що поверх]
let teamCur = 0;        // яка копія зараз основна
let teamRaf = 0;
let teamCross = 0.12;   // за скільки секунд одна перетікає в іншу

function buildTeam() {
  const box = $('s-team');
  const P = S.teamPhoto || {};
  if (!box) return;

  stopTeamVideo();
  box.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'cr-stage';

  const clips = [].concat(P.video || []).filter(Boolean);
  const measured = clips.length ? buildTeamVideo(stage, P, clips)
                                : buildTeamPhoto(stage, P);

  const names = document.createElement('div');
  names.className = 'cr-names';
  (S.team || []).forEach((p) => {
    const el = document.createElement('span');
    el.className = 'cr-name';
    el.style.left = p.x + '%';

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

  // Підписи звужуються рівно до ширини картинки чи кадру,
  // інакше відсотки з tuning.js рахувались би від усього екрана.
  const fit = () => {
    const w = measured.getBoundingClientRect().width;
    if (w) names.style.width = w + 'px';
  };
  measured.addEventListener('load', fit);
  measured.addEventListener('loadedmetadata', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(measured);
  addEventListener('resize', fit);
  fit();
}

// Звичайне фото — запасний варіант і те, що було раніше.
function buildTeamPhoto(stage, P) {
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
  return img;
}

// Дві копії одного ролика в одній коробці: перша задає розмір,
// друга лежить точно поверх неї й чекає своєї черги.
function buildTeamVideo(stage, P, clips) {
  teamCross = Math.max(0, P.crossSeconds ?? 0.12);

  const box = document.createElement('div');
  box.className = 'cr-video';

  const make = (over) => {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.className = over ? 'cr-video-over' : '';
    clips.forEach((src) => {
      const s = document.createElement('source');
      s.src = src;
      if (/\.mp4$/i.test(src))  s.type = 'video/mp4';
      if (/\.webm$/i.test(src)) s.type = 'video/webm';
      v.appendChild(s);
    });
    box.appendChild(v);
    return v;
  };

  const a = make(false), b = make(true);
  teamVideos = [a, b];
  teamCur = 0;
  a.style.opacity = 1; b.style.opacity = 0;
  a.style.zIndex = 1;  b.style.zIndex = 2;
  stage.appendChild(box);

  // Відео не пішло або браузер не зрозумів прозорість —
  // тихо повертаємось до картинки.
  const toPhoto = (why) => {
    if (!box.isConnected) return;
    console.warn('Відео команди не показуємо (' + why + ') — лишається фото.');
    stopTeamVideo();
    box.remove();
    const img = buildTeamPhoto(stage, P);
    stage.insertBefore(img.parentNode, stage.firstChild);
  };
  a.addEventListener('error', () => toPhoto('файл не відкрився'), { once: true });
  a.addEventListener('loadeddata', () => {
    if (P.alphaCheck === false) return;
    if (!hasAlpha(a)) toPhoto('браузер не тримає прозорість');
  }, { once: true });

  if (current === 'credits') startTeamVideo();
  return a;
}

// Кут кадру зобовʼязаний бути порожнім. Якщо він раптом
// непрозорий — прозорість не спрацювала, і замість команди
// був би суцільний прямокутник.
function hasAlpha(video) {
  try {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 24, 24);
    g.drawImage(video, 0, 0, 24, 24);
    return g.getImageData(0, 0, 3, 3).data[3] < 200;
  } catch (e) {
    return true;   // не змогли перевірити — вважаємо, що все гаразд
  }
}

function startTeamVideo() {
  if (!teamVideos.length) return;
  const a = teamVideos[teamCur];
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
  if (!teamRaf) teamRaf = requestAnimationFrame(teamTick);
}

function stopTeamVideo() {
  if (teamRaf) { cancelAnimationFrame(teamRaf); teamRaf = 0; }
  teamVideos.forEach((v) => { try { v.pause(); v.currentTime = 0; } catch (e) {} });
  teamVideos = [];
}

function pauseTeamVideo() {
  if (teamRaf) { cancelAnimationFrame(teamRaf); teamRaf = 0; }
  teamVideos.forEach((v) => { try { v.pause(); } catch (e) {} });
}

function resumeTeamVideo() {
  if (!teamVideos.length) return;
  const a = teamVideos[teamCur];
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
  if (!teamRaf) teamRaf = requestAnimationFrame(teamTick);
}

// Кожен кадр дивимось, скільки лишилось поточній копії. Коли до
// кінця менше за час перетікання — заводимо другу й проявляємо її.
function teamTick() {
  teamRaf = requestAnimationFrame(teamTick);
  if (teamVideos.length < 2) return;

  const a = teamVideos[teamCur], b = teamVideos[1 - teamCur];
  const dur = a.duration;
  if (!dur || !isFinite(dur)) return;

  const left = dur - a.currentTime;

  if (b.paused && left <= teamCross + 0.08) {
    try { b.currentTime = 0; } catch (e) {}
    b.style.zIndex = 2;
    a.style.zIndex = 1;
    const p = b.play();
    if (p && p.catch) p.catch(() => {});
  }

  if (!b.paused) {
    const k = teamCross > 0
      ? Math.min(1, Math.max(0, (teamCross - left) / teamCross))
      : (left <= 0 ? 1 : 0);
    b.style.opacity = k;
  }

  if (a.ended || left <= 0) {
    a.style.opacity = 0;
    b.style.opacity = 1;
    try { a.pause(); a.currentTime = 0; } catch (e) {}
    teamCur = 1 - teamCur;
  }
}

function buildFeet() {
  const box = $('s-feet');
  const A = S.loadingArt;
  if (!box || !A) return;

  box.style.setProperty('--cycle', A.cycleSeconds + 's');
  box.innerHTML = '';

  const names = [].concat(A.src || [], 'assets/loading-feet.png');
  pickFile(names).then((src) => {
    box.querySelectorAll('i').forEach((el) => {
      el.style.backgroundImage = 'url("' + src + '")';
    });
  });

  const pause = A.cycleSeconds / A.count;

  for (let i = 0; i < A.count; i++) {
    const fromTop = A.count - 1 - i;
    const isRight = (fromTop % 2 === 0) === !!A.topIsRight;
    const [x1, x2] = isRight ? A.rightX : A.leftX;

    const yTop = A.firstY + fromTop * A.stepY;
    const yBot = Math.min(yTop + A.printHeight, A.height);

    const pc = (v, whole) => (v / whole * 100).toFixed(3) + '%';

    const layer = document.createElement('i');
    layer.style.clipPath = 'inset(' + pc(yTop, A.height) + ' ' +
                                      pc(A.width - x2, A.width) + ' ' +
                                      pc(A.height - yBot, A.height) + ' ' +
                                      pc(x1, A.width) + ')';
    layer.style.setProperty('--delay', (i * pause).toFixed(3) + 's');
    box.appendChild(layer);
  }
}

function paintArt() {
  const V = S.menuVideo || {};
  const still = V.poster || (TUNING.background.show ? TUNING.background.src : '');

  if (still) {
    const url = 'url("' + still + '")';
    document.querySelectorAll('[data-art]').forEach((el) => { el.style.backgroundImage = url; });
  }

  const vid = $('s-menu-video');
  if (!vid) return;

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

function toggleVideo(name) {
  if (name === 'credits') resumeTeamVideo(); else pauseTeamVideo();

  const vid = $('s-menu-video');
  if (!vid) return;
  if (name === 'menu') {
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
  } else {
    vid.pause();
  }
}

// ══════════════════════════════════════════════════════════════
//  ВСТУПНИЙ РОЛИК
//  Стоїть між завантаженням і меню й показується один раз.
//  Відео йде німим, звук — окремим mp3 поруч: так його глушить
//  той самий вимикач Sound, що й музику, і якщо браузер звук не
//  пустить, картинка все одно покажеться.
//  Налаштування — блок screens.introVideo у tuning.js.
// ══════════════════════════════════════════════════════════════

const INTRO_FALLBACK = {
  on:         true,
  src:        'assets/intro_text.mp4',
  sound:      'assets/intro_text.mp3',
  volume:     0.9,
  maxSeconds: 82,
  allowSkip:  true,
  skipText:   'Skip',
};

function introConf() { return { ...INTRO_FALLBACK, ...(S.introVideo || {}) }; }

let introDone     = false;  // ролик уже відіграв або його нічим показати
let introTimer    = 0;      // аварійний таймер, якщо подія «ended» не прийшла
let introTrackOk  = true;   // окремий mp3 знайшовся

// Чи є що показувати. Якщо ні — гра йде з завантаження одразу в меню.
function introReady() {
  const C = introConf();
  return C.on !== false && !!C.src && !!$('s-intro-video');
}

function prepIntro() {
  const C   = introConf();
  const vid = $('s-intro-video');
  if (!vid) return;

  if (C.on === false || !C.src) {
    vid.remove();
    $('s-intro-sound')?.remove();
    $('s-intro-skip')?.remove();
    introDone = true;
    return;
  }

  // Файл починає вантажитись одразу: до кінця завантаження
  // встигає набратись достатньо, щоб ролик пішов без затинки.
  vid.src = C.src;
  vid.load();

  vid.addEventListener('ended', endIntro);
  vid.addEventListener('error', () => {
    console.warn('Вступний ролик не знайдено: ' + C.src +
      ' — перевір, чи лежить файл у папці assets/');
    endIntro();
  });

  const snd = $('s-intro-sound');
  if (snd) {
    if (C.sound) {
      snd.dataset.unlock = '1';
      snd.src = C.sound;
      snd.load();
      // Немає mp3 — беремо доріжку з самого відео, щоб ролик
      // не лишився німим.
      snd.addEventListener('error', () => {
        console.warn('Звук вступного ролика не знайдено: ' + C.sound +
          ' — вмикаю доріжку з самого відео.');
        introTrackOk = false;
      });
    } else {
      introTrackOk = false;
      snd.remove();
    }
  } else {
    introTrackOk = false;
  }

  const skip = $('s-intro-skip');
  if (skip) {
    if (C.allowSkip === false) {
      skip.remove();
    } else {
      skip.textContent = C.skipText || 'Skip';
      skip.addEventListener('click', (e) => { e.stopPropagation(); endIntro(); });
    }
  }
}

function playIntro() {
  const C   = introConf();
  const vid = $('s-intro-video');
  const snd = $('s-intro-sound');
  if (!vid) { endIntro(); return; }

  const useTrack = !!snd && introTrackOk;

  // Німе відео браузер пускає завжди. Звук іде окремим каналом —
  // або з mp3, або, якщо його немає, з доріжки самого відео.
  vid.muted = useTrack || isMuted();
  try { vid.currentTime = 0; } catch (e) {}

  const p = vid.play();
  if (p && p.catch) {
    p.catch(() => {
      // Єдина причина відмови — незаглушений звук без дозволу.
      // Показуємо ролик німим, це краще за чорний екран.
      vid.muted = true;
      const again = vid.play();
      if (again && again.catch) again.catch(endIntro);
    });
  }

  if (useTrack && !isMuted()) {
    snd.volume = C.volume ?? 0.9;
    try { snd.currentTime = 0; } catch (e) {}
    snd.play().catch(() => {});
  }

  clearTimeout(introTimer);
  introTimer = setTimeout(endIntro, Math.round((C.maxSeconds ?? 82) * 1000));
}

function endIntro() {
  if (introDone) return;
  introDone = true;
  clearTimeout(introTimer);

  const vid = $('s-intro-video');
  const snd = $('s-intro-sound');
  if (vid) vid.pause();
  if (snd) { snd.pause(); try { snd.currentTime = 0; } catch (e) {} }

  // Помилка могла прилетіти ще під час завантаження, коли екрана
  // ролика на видноті немає. Тоді нічого не перемикаємо — просто
  // запамʼятали, що показувати нічого, і завантаження піде в меню.
  if (current === 'intro') showScreen('menu');
}

function goFullscreen() {
  const el = document.documentElement;
  const ask = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!ask || document.fullscreenElement) return;

  const p = ask.call(el, { navigationUI: 'hide' });
  if (p && p.then) {
    p.then(lockLandscape).catch(() => {});
  } else {
    setTimeout(lockLandscape, 200);
  }
}

function lockLandscape() {
  try {
    const o = screen.orientation;
    if (o && o.lock) o.lock('landscape').catch(() => {});
  } catch (e) {}
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } else {
    goFullscreen();
  }
}

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

function isStandalone() {
  return window.navigator.standalone === true ||
         matchMedia('(display-mode: fullscreen)').matches ||
         matchMedia('(display-mode: standalone)').matches;
}

function prepFullscreen() {
  const btn = $('s-full');
  if (!btn) return;

  if (isStandalone()) { btn.remove(); return; }

  const ask = document.documentElement.requestFullscreen ||
              document.documentElement.webkitRequestFullscreen;

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

function preloadButtons() {
  ['assets/MenuButton_holder_88_100_88.png', 'assets/MenuButton_pressed_88_100_88.png',
   'assets/SquareButton_pressed.png'].forEach((src) => {
    const im = new Image();
    im.src = src;
  });
}

// ══════════════════════════════════════════════════════════════
//  МУЗИКА
// ══════════════════════════════════════════════════════════════

const MUSIC_FALLBACK = {
  menu:        ['assets/The_Macabre_Waltz.mp3', 'assets/menu-music.mp3'],
  game:        ['assets/fit.mp3', 'assets/game-music.mp3'],
  volume:      0.5,
  fadeSeconds: 1.5,
  showMute:    true,
};

const THUNDER_FALLBACK = {
  src:    ['assets/sound.mp3', 'assets/menu-thunder.mp3'],
  volume: 0.7,
  offset: 0,
};

const players = {};
const fades   = {};
let muted = false;
const MUTE_KEY = 'music-muted';

function musicConf() {
  const M = S.music || {};
  const both = (a, b) => [...new Set([].concat(a || [], b || []))];

  return {
    ...MUSIC_FALLBACK,
    ...M,
    menu: both(M.menu || M.src, MUSIC_FALLBACK.menu),
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

  const th = players.thunder;
  if (th) { th.loop = false; th.volume = thunderConf().volume; }
  bindThunder();

  const btn = $('s-mute');
  if (!btn) return;
  if (M.showMute === false || !players.menu) { btn.remove(); return; }

  paintMute(btn);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
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

export function duckMusic(on) {
  if (!players.game) return;
  if (on) {
    fadeOut('game');
  } else if (current === 'game' && !muted) {
    fadeIn('game');
  }
}

export function isMuted() { return muted; }

function paintMute(btn) {
  btn.textContent = muted
    ? (S.muteOn  || 'Sound: turn on')
    : (S.muteOff || 'Sound: turn off');
}

function trackFor(name) {
  if (name === 'game') return 'game';
  if (name === 'menu' || name === 'leaderboard' || name === 'credits' ||
      name === 'result' || name === 'lost') return 'menu';
  return null;
}

function updateMusic(name) {
  const want = muted ? null : trackFor(name);
  Object.keys(players).forEach((key) => {
    if (key === 'thunder') return;
    if (key === want) fadeIn(key); else fadeOut(key);
  });
  syncThunder();
}

function fadeIn(key) {
  const el = players[key];
  if (!el) return;
  const M = musicConf();

  const p = el.play();
  if (p && p.catch) p.catch(() => {});

  clearInterval(fades[key]);
  const target = M.volume ?? 0.5;
  const steps = Math.max(1, Math.round((M.fadeSeconds ?? 1.5) * 20));
  let i = Math.round(el.volume / target * steps);
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

  if (now < lastVideoT - 0.3) { th.currentTime = 0; }
  lastVideoT = now;

  const target = now - C.offset;
  const len = th.duration || 0;

  if (target < 0 || (len && target >= len)) {
    if (!th.paused) th.pause();
    return;
  }

  if (Math.abs(th.currentTime - target) > 0.25) th.currentTime = target;
  if (th.paused) { const p = th.play(); if (p && p.catch) p.catch(() => {}); }
}

function bindButtons() {
  document.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;

    const helper = ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'];
    if (current === 'press' && !helper.includes(e.key)) { go('loading'); return; }

    // Пропустити вступний ролик. Навмисно не «будь-яка клавіша»:
    // з попереднього екрана рука ще на клавіатурі, і ролик
    // згортався б випадковим натиском.
    if (current === 'intro' &&
        (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      endIntro();
      return;
    }

    if (e.key === 'Escape' &&
        (current === 'leaderboard' || current === 'credits' ||
         current === 'result' || current === 'lost')) go('menu');
  });
}

function go(name) {
  if (current === 'press') unlockAudio();

  goFullscreen();

  if (name === 'game') {
    gameEverOpened = true;
    hooks.onNewGame?.();
  }
  if (name === 'leaderboard') hooks.onOpenLeaderboard?.();
  if (name === 'menu' && gameEverOpened) hooks.onLeaveGame?.();
  showScreen(name);
}

let audio = null;

export function audioContext() { return audio; }

function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();

    // Розблоковуємо звукові теги для iOS Safari та Android.
    //
    // Позначку data-unlock ставлять ті, хто ці елементи готує:
    // main.js — звуки роликів і результату, prepIntro нижче —
    // звук інтро. Раніше тут стояли три конкретні id, і в них на
    // цю мить ще не було жодного файлу. Браузер на такий play()
    // відповідає помилкою й лишає елемент у стані «джерело
    // непридатне» — саме через це мовчав перший ролик.
    //
    // Зупиняємо кожен елемент ОДРАЗУ, у тому самому такті, а не
    // в .then(). Це принципово:
    //
    // 1. На iOS властивість volume взагалі не працює — система
    //    лишає її одиницею, скільки б ти в неї не писав. Тому
    //    приглушити тут нічим, і поки ми чекали на .then(), усі
    //    звуки встигали заграти разом, на повну. Саме це й було
    //    чути на телефоні після натискання «Старт».
    // 2. .then() приходить не тоді, коли зручно, а коли файл
    //    завантажився. На мобільному інтернеті це могло статись
    //    уже посеред гри — і звук вискакував не в свою мить.
    //
    // Пара play()+pause() в одному такті лишається дозволом для
    // браузера, але почути там нічого: відтворення не встигає
    // початись. Заразом це змушує iOS почати качати файл, бо
    // атрибут preload він ігнорує й до першого play() не чіпає
    // файл узагалі. Через це на телефоні й мовчав перший
    // результат раунду.
    document.querySelectorAll('[data-unlock]').forEach((el) => {
      try {
        el.volume = 0;                 // працює скрізь, крім iOS
        const p = el.play();
        el.pause();                    // саме тут, синхронно
        try { el.currentTime = 0; } catch (e) {}
        el.volume = 1;
        // play() тепер відмовить із AbortError — це очікувано,
        // ми самі його й перервали.
        if (p && p.catch) p.catch(() => {});
        el.load();                     // тепер файл можна качати
      } catch (e) {}
    });
  } catch (e) {
    console.warn('Звук недоступний:', e.message);
  }
}

function runLoading() {
  const fill = $('s-load-fill');
  const pct  = $('s-load-pct');

  const jobs = [];
  const V = S.menuVideo || {};
  if (V.poster) jobs.push(loadImage(V.poster));
  if (TUNING.background.show && TUNING.background.src) jobs.push(loadImage(TUNING.background.src));
  jobs.push(waitForVideo());
  jobs.push(waitForIntro());
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

    const target = Math.max(real, Math.min(0.9, elapsed / Math.max(minMs, 600)));
    shown += (target - shown) * 0.12;

    const ready  = real >= 1 && elapsed >= minMs;
    const giveUp = elapsed >= stopMs;

    const cap = (ready || giveUp) ? 1 : 0.985;
    shown = Math.min(shown, cap);

    if (ready || giveUp) shown = 1;

    const v = Math.round(shown * 100);
    if (fill) fill.style.width = v + '%';
    if (pct)  pct.textContent  = v + '%';

    if (shown > 0.995) {
      setTimeout(() => {
        if (current !== 'loading') return;
        // Спершу вступний ролик, і тільки після нього — меню.
        // Якщо ролика немає або він уже відіграв, ідемо прямо в меню.
        showScreen(introReady() && !introDone ? 'intro' : 'menu');
      }, 320);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

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
    im.onerror = () => res(false);
    im.src = src;
  });
}

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

// Чекаємо не повного завантаження ролика, а лише початку: файл
// важкий, і решта дотягнеться вже під час показу. Інакше смужка
// завантаження стояла б хвилину на 98%.
function waitForIntro() {
  return new Promise((res) => {
    const vid = $('s-intro-video');
    if (!introReady() || !vid) return res(true);
    if (vid.readyState >= 3) return res(true);
    const done = () => res(true);
    vid.addEventListener('canplay', done, { once: true });
    vid.addEventListener('error',   done, { once: true });
    setTimeout(done, 5000);
  });
}

function waitForGame() {
  return new Promise((res) => {
    const check = () => {
      if (hooks.isGameReady?.()) return res(true);
      setTimeout(check, 80);
    };
    check();
  });
}