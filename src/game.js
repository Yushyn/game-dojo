// ══════════════════════════════════════════════════════════════
//  GAME DOJO — підлаштуй стопу під чобіт
// ══════════════════════════════════════════════════════════════
//
//  ПРАВИЛА РАУНДУ
//  Праворуч показують чобіт. За кілька секунд він зникає, і далі
//  гравець по памʼяті мне стопу пензлем, щоб вона повторила його форму.
//  Коли час вийшов, чобіт накладається на стопу, і гра рахує,
//  наскільки силуети збіглися. Понад поріг — очки й наступний чобіт.
//
//  ЯК ПРАЦЮЄ ДЕФОРМАЦІЯ, простими словами
//  Оригінал ніколи не змінюється. Поруч живе «карта зміщень»: для
//  кожної точки результату записано, з якого місця оригіналу брати
//  колір. Спочатку там усюди нулі — картинка не змінена. Пензель
//  править саме цю карту, а картинка збирається за нею наново.
//  Через це якість не псується від сотні мазків, а «крок назад»
//  миттєвий — треба лише повернути карту в попередній стан.
//
//  ЯК РАХУЄТЬСЯ ЗБІГ
//  Беремо силует стопи й силует чобота, кожен вписуємо в однаковий
//  квадрат (щоб не залежало від розміру й положення) і накладаємо.
//  Відсоток = спільна площа / загальна площа. Це чесна міра
//  «наскільки це та сама форма».
//
// ══════════════════════════════════════════════════════════════

import { GAME } from './config.js';
import { TUNING } from './tuning.js';

const T = TUNING;

// ── Інструменти ───────────────────────────────────────────────
// Три кнопки внизу екрана. У кожної свій діаметр пензля і своя
// картинка — вона ж стає курсором, коли інструмент вибраний.
const TOOLS = buildTools();
const BRUSH_SIZES = TOOLS.map((t) => t.size);
let brushIndex = startBrush();

function buildTools() {
  const B = T.brush || {};
  if (B.tools && B.tools.length) return B.tools.map((t) => ({ ...t }));
  // Старий запис, коли були самі числа без картинок
  const sizes = (B.sizes && B.sizes.length) ? B.sizes : [140, 240, 380];
  return sizes.map((size) => ({ size }));
}

function startBrush() {
  return Math.min(TOOLS.length - 1, Math.max(0, T.brush.startIndex ?? 1));
}

// ── Полотно й буфери ──────────────────────────────────────────
let canvas = null, ctx = null;
let srcW = 0, srcH = 0;
let srcData = null;                    // оригінал стопи, не змінюється
let outImage = null, outData = null;   // результат деформації
let buf = null, bufCtx = null;
let dispX = null, dispY = null;        // карта зміщень
let prevX = null, prevY = null;        // її копія на час одного мазка
let imgX = 0, imgY = 0, imgScale = 1;

let failed = false, errorText = '';
let needsWarp = true;
let hooks = {};

// ── Чоботи ────────────────────────────────────────────────────
let boots = [];
let bgImage = null;      // фон, якщо є
let girlEls = [];        // по одному <video> на кожен ролик анімації
let girlCur = 0;         // який ролик зараз основний
let girlNext = -1;       // який проявляється поверх нього, або -1
let girlSheet = null;    // спрайтшит: запасний варіант, якщо відео не пішло
let girlT0 = 0;          // мить, коли її анімація почалась — для спрайтшита
let girlCross = 0.5;     // за скільки секунд один ролик перетікає в наступний
let toolIcons = [];      // картинки інструментів, по одній на кнопку
let pedImage = null;     // окремий шар пʼєдестала поверх неї
let baseBB = null;       // рамка НЕЗІМʼЯТОЇ стопи — за нею рахуємо розмір і місце
let footImages = [];     // по одній картинці ноги на кожне життя
let animImage = null;    // повноекранна заглушка при втраті життя
let tintBuf = null, tintCtxCache = null;   // полотно для червоної ноги

// ── Хід гри ───────────────────────────────────────────────────
const game = {
  // loading | idle | intro | play | result | dying | anim | done | lost
  phase: 'loading',
  round: 0,
  score: 0,
  t0: 0,
  timeLeft: 0,
  previewLeft: 0,
  introT: 0,
  canEdit: false,
  lives: 0,           // скільки життів лишилось
  lifeIndex: 0,       // якою ногою граємо: 0, 1, ...
  dieT0: 0,           // мить, коли почалась втрата життя
  lastLife: false,    // це була остання — далі вікно програшу
  paused: false,      // час стоїть: відкрите вікно «вийти в меню?»
  resultT0: 0,        // мить, коли показали результат раунду
  lastMatch: 0,
  lastPassed: false,
  lastPoints: 0,
};
let footBB = null;       // рамка видимої частини стопи, оновлюється при кожному збиранні
let roundFrame = null;    // де лежить чобіт цього раунду — рахується раз і не змінюється
let roundOutline = null;  // те саме для картинки контуру
let roundTarget = null;   // силует чобота на сітці порівняння
let roundCutY = 0;        // вище цієї лінії нога в підрахунок не йде

// ── Курсор ────────────────────────────────────────────────────
let pointerInside = false, pointerX = 0, pointerY = 0;
let drawing = false, lastBX = 0, lastBY = 0;

const undoStack = [];

// ══════════════════════════════════════════════════════════════
//  ЗАПУСК
// ══════════════════════════════════════════════════════════════

export function start(canvasEl, callbacks) {
  hooks = callbacks || {};
  canvas = canvasEl;
  if (!canvas) { console.error('Немає <canvas id="stage"> у index.html'); return; }

  canvas.width = GAME.width;
  canvas.height = GAME.height;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  girlT0 = performance.now();
  requestAnimationFrame(frame);

  try { bindPointer(); } catch (e) { return fail('Помилка запуску: ' + e.message); }

  // Декорації не критичні: якщо файлу немає, гра просто малює без нього.
  if (T.background.show) {
    loadImage(T.background.src)
      .then((im) => { bgImage = im; })
      .catch((e) => console.warn('Фон не завантажився:', e.message));
  }
  if (T.girl?.show) loadGirl();
  loadToolIcons();

  // Повноекранна заставка при втраті життя. Якщо це відео —
  // ним керує сторінка, тут вантажимо лише картинку.
  const A = T.lives?.anim || '';
  if (A && !/\.(webm|mp4)$/i.test(A)) {
    loadImage(A).then((im) => { animImage = im; })
      .catch((e) => console.warn('Заставка втрати життя не завантажилась:', e.message));
  }
  if (T.pedestal?.show) {
    loadImage(T.pedestal.src)
      .then((im) => { pedImage = im; })
      .catch((e) => console.warn('Пʼєдестал не завантажився:', e.message));
  }

  const feet = (T.image.sources && T.image.sources.length)
    ? T.image.sources : [T.image.src];
  const list = feet.concat(T.boots.map((b) => b.src));
  Promise.all(list.map(loadImage))
    .then((imgs) => {
      footImages = imgs.slice(0, feet.length);
      setupFoot(footImages[0]);
      // Порядок раундів беремо з `bootOrder`, якщо він заданий.
      // Числа там рахуються з одиниці — так зрозуміліше без коду.
      const all = T.boots.map((def, i) => prepBoot(def, imgs[feet.length + i]));
      const order = (T.bootOrder && T.bootOrder.length)
        ? T.bootOrder.map((n) => all[n - 1]).filter(Boolean)
        : all;
      boots = order.length ? order : all;
      if ((T.bootOrder || []).length && boots.length !== T.bootOrder.length) {
        console.warn('bootOrder: якісь номери вказують у порожнечу. ' +
          'У списку boots зараз ' + all.length + ' чобіт, нумерація з 1.');
      }
      reportBaselines();
      game.phase = 'idle';
      notify();

      // Контури не критичні: якщо якогось немає, крок вступу
      // просто покаже кольоровий силует замість малюнка.
      // Контури вантажимо по самих чоботях, а не за номером у списку:
      // після `bootOrder` порядок уже інший, і по номеру контур ліг би
      // не на той чобіт. Один файл на кілька чобіт — теж нормально.
      const seen = new Map();
      boots.forEach((b) => {
        if (!b.outlineSrc) return;
        const done = seen.get(b.outlineSrc);
        if (done) { done.push(b); return; }
        const waiting = [b];
        seen.set(b.outlineSrc, waiting);
        loadImage(b.outlineSrc)
          .then((im) => {
            const box = bboxOfImage(im);
            waiting.forEach((x) => { x.outline = im; x.outlineBBox = box; });
          })
          .catch((e) => console.warn('Контур не завантажився:', e.message));
      });
    })
    .catch((e) => fail(e.message));
}

// Картинки інструментів. Не критичні: якщо файлу немає, курсор
// просто лишиться кружечком, як був.
function loadToolIcons() {
  toolIcons = TOOLS.map(() => null);
  TOOLS.forEach((tool, i) => {
    if (!tool.icon) return;
    loadImage(tool.icon)
      .then((im) => { toolIcons[i] = im; })
      .catch((e) => console.warn('Іконка інструмента не завантажилась:', e.message));
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Не знайдено файл ' + src));
    setTimeout(() => rej(new Error('Картинка ' + src + ' не завантажується')), 15000);
    im.src = src;
  });
}

// Скільки відсотків збігу дає стопа, якої взагалі не торкались.
// Це нижня межа: ставити поріг нижче за неї безглуздо — раунд
// зараховуватиметься тому, хто нічого не робив.
function reportBaselines() {
  ensureWarp();
  const lines = boots.map((b) => {
    const fr = frameFor(b);
    roundCutY = cutLineFor(b, fr);
    const v = overlapPercent(footGrid(), bootGrid(b, fr));
    const fit = fr && fr.shrink < 0.999
      ? `, зменшено до ${Math.round(fr.shrink * 100)}% щоб улізти в рамку` : '';
    return `  ${b.name}: без жодного руху ${v.toFixed(1)}%, поріг ${b.pass}%${fit}`;
  });
  roundCutY = 0;
  console.log('Game Dojo — баланс порогів:\n' + lines.join('\n'));
}

function fail(message) {
  failed = true;
  errorText = message;
  console.error('Game Dojo:', message);
  hooks.onError?.(message);
}

function setupFoot(img) {
  const maxSide = Math.max(200, T.image.workResolution);
  const k = maxSide / Math.max(img.width, img.height);
  srcW = Math.max(2, Math.round(img.width * k));
  srcH = Math.max(2, Math.round(img.height * k));

  const tmp = document.createElement('canvas');
  tmp.width = srcW; tmp.height = srcH;
  const tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.imageSmoothingEnabled = true;
  tc.imageSmoothingQuality = 'high';
  tc.drawImage(img, 0, 0, srcW, srcH);
  srcData = tc.getImageData(0, 0, srcW, srcH).data;

  buf = document.createElement('canvas');
  buf.width = srcW; buf.height = srcH;
  bufCtx = buf.getContext('2d');
  outImage = bufCtx.createImageData(srcW, srcH);
  outData = outImage.data;

  const n = srcW * srcH;
  dispX = new Float32Array(n); dispY = new Float32Array(n);
  prevX = new Float32Array(n); prevY = new Float32Array(n);

  imgScale = 1; imgX = 0; imgY = 0;
  warp();                 // перше збирання дає рамку незімʼятої стопи
  baseBB = footBB;
  layout();
}

// Чобіт: зменшена копія для порівняння + готовий нормалізований силует
function prepBoot(def, img) {
  const maxSide = 420;
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * k));
  const h = Math.max(2, Math.round(img.height * k));

  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.drawImage(img, 0, 0, w, h);
  const mask = maskFrom(tc.getImageData(0, 0, w, h).data, w, h);
  const bb = bboxOf(mask, w, h);
  const back = img.width / w; // з координат маски назад у пікселі картинки

  return {
    name: def.name || '',
    outlineSrc: def.outline || '',
    pass: typeof def.passPercent === 'number' ? def.passPercent : T.round.passPercent,
    img,
    shape: makeSilhouette(img, T.colors.overlay),   // для накладання на стопу
    mask, mw: w, mh: h,
    scale:   typeof def.scale === 'number' ? def.scale : 1,
    offsetX: typeof def.offsetX === 'number' ? def.offsetX : 0,
    offsetY: typeof def.offsetY === 'number' ? def.offsetY : 0,
    bbox: bb && { cx: bb.cx * back, cy: bb.cy * back,
                  w: bb.w * back, h: bb.h * back, bottom: (bb.y1 + 1) * back },
  };
}

// Перефарбовуємо картинку в суцільний колір, лишаючи тільки її форму.
// Потрібно, бо чорний чобіт на темному тлі просто не видно.
function makeSilhouette(img, color) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Стопа має стояти підошвою на пʼєдесталі, тож рахуємо все від
// рамки самої стопи, ігноруючи прозорі поля навколо неї.
function layout() {
  const I = T.image;
  const bb = baseBB || { h: srcH, cx: srcW / 2, y1: srcH - 1 };
  imgScale = (GAME.height * I.heightPercent) / bb.h;
  imgX = Math.round(GAME.width * I.standX - bb.cx * imgScale);
  imgY = Math.round(GAME.height * I.standY - (bb.y1 + 1) * imgScale);
}

// ══════════════════════════════════════════════════════════════
//  СИЛУЕТИ І ПОРІВНЯННЯ ФОРМ
// ══════════════════════════════════════════════════════════════

// Що вважаємо «тілом» картинки: непрозоре і не біле
function maskFrom(data, W, H) {
  const m = new Uint8Array(W * H);
  for (let i = 0, n = W * H; i < n; i++) {
    const o = i << 2;
    if (data[o + 3] < 128) continue;
    if (data[o] > 245 && data[o + 1] > 245 && data[o + 2] > 245) continue;
    m[i] = 1;
  }
  return m;
}

function bboxOf(mask, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (!mask[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
           cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}

// Куди саме лягає чобіт на початку раунду. Рахуємо ОДИН раз, поки
// стопа ще не зім'ята, і далі не чіпаємо: інакше чобіт їздив би
// за стопою, і гравцеві не було б до чого підлаштовуватись.
// Рамка картинки в пікселях самої картинки
function bboxOfImage(img) {
  const maxSide = 420;
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * k));
  const h = Math.max(2, Math.round(img.height * k));
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.drawImage(img, 0, 0, w, h);
  const bb = bboxOf(maskFrom(tc.getImageData(0, 0, w, h).data, w, h), w, h);
  if (!bb) return null;
  const back = img.width / w;
  return { cx: bb.cx * back, cy: bb.cy * back,
           w: bb.w * back, h: bb.h * back, bottom: (bb.y1 + 1) * back };
}

function frameFor(boot, bbox, forceShrink) {
  const bb = bbox || boot.bbox;
  if (!footBB || !bb) return null;

  // Прикладаємо по ДОВЖИНІ стопи, а підошву чобота ставимо на ту саму
  // землю, що й підошву стопи. Раніше рівняли по більшій стороні — і чобіт
  // роздувався на всю ногу, бо стопа з гомілкою висока, а чобіт широкий.
  let k = (footBB.w / bb.w) * boot.scale;

  // ...і додатково вганяємо у дозволену рамку, щоб високі чоботи
  // не залазили на смужку часу, а довгі — на дівчинку.
  const shrink = forceShrink !== undefined ? forceShrink : shrinkToArea(bb, k);
  k *= shrink;

  return {
    k,
    shrink,
    dx: footBB.cx - bb.cx * k + boot.offsetX * footBB.w,
    dy: (footBB.y1 + 1) - bb.bottom * k + boot.offsetY * footBB.h,
  };
}

// У скільки разів зменшити чобіт, щоб він улігся в рамку з tuning.js.
// Рахуємо точно по краях: чобіт стоїть підошвою на землі стопи й
// вирівняний по її центру, тож де опиниться кожен його край, відомо
// наперед. 1 означає «і так влазить».
function shrinkToArea(bb, k) {
  const A = T.bootArea;
  if (!A || A.on === false || !footBB || !imgScale) return 1;

  // Межі рамки в координатах буфера стопи
  const toX = (f) => (GAME.width * f - imgX) / imgScale;
  const toY = (f) => (GAME.height * f - imgY) / imgScale;

  const sole = footBB.y1 + 1;              // підошва — вона лишається на місці
  const cx = footBB.cx;                    // чобіт вирівняний по центру стопи
  let s = 1;

  if (typeof A.top === 'number') {
    const room = sole - toY(A.top);        // скільки є вгору від підошви
    if (room > 0) s = Math.min(s, room / (bb.h * k));
  }
  // Ліворуч і праворуч чобіт росте від центру стопи в обидва боки,
  // тому беремо вужчий бік — інакше з одного краю все одно вилізе.
  const halves = [];
  if (typeof A.left === 'number') halves.push(cx - toX(A.left));
  if (typeof A.right === 'number') halves.push(toX(A.right) - cx);
  const half = halves.length ? Math.min(...halves) : 0;
  if (half > 0) s = Math.min(s, half / (bb.w * k / 2));

  return Math.max(0.05, Math.min(1, s));
}

// Де проходить лінія відрізу: по верху халяви чобота.
// Усе, що вище, у площу не зараховується — інакше довга гомілка
// псувала б результат, хоча в чобіт вона все одно не влазить.
function cutLineFor(boot, fr) {
  if (!T.compare.cutAboveBoot || !fr || !boot.bbox) return 0;
  const top = boot.bbox.bottom - boot.bbox.h;
  return fr.dy + (top + T.compare.cutOffset * boot.bbox.h) * fr.k;
}

// Силует стопи на сітці, натягнутій на весь буфер.
// Сітка нерухома, тому зсув і розмір стопи тепер теж мають значення.
function footGrid() {
  const G = T.compare.gridSize;
  const out = new Uint8Array(G * G);
  for (let j = 0; j < G; j++) {
    const y = Math.min(srcH - 1, Math.floor((j + 0.5) / G * srcH));
    if (y < roundCutY) continue;               // вище халяви не рахуємо
    for (let i = 0; i < G; i++) {
      const x = Math.min(srcW - 1, Math.floor((i + 0.5) / G * srcW));
      out[j * G + i] = outData[((y * srcW + x) << 2) + 3] >= 128 ? 1 : 0;
    }
  }
  return out;
}

// Силует чобота на тій самій сітці, покладений за рамкою раунду
function bootGrid(boot, fr) {
  const G = T.compare.gridSize;
  const out = new Uint8Array(G * G);
  if (!fr) return out;
  const sx = boot.mw / boot.img.width, sy = boot.mh / boot.img.height;
  for (let j = 0; j < G; j++) {
    const fy = (j + 0.5) / G * srcH;
    if (fy < roundCutY) continue;              // та сама лінія і для чобота
    const my = Math.round(((fy - fr.dy) / fr.k) * sy);
    if (my < 0 || my >= boot.mh) continue;
    for (let i = 0; i < G; i++) {
      const mx = Math.round((((i + 0.5) / G * srcW - fr.dx) / fr.k) * sx);
      if (mx < 0 || mx >= boot.mw) continue;
      out[j * G + i] = boot.mask[my * boot.mw + mx];
    }
  }
  return out;
}

// Спільна площа поділена на загальну
function overlapPercent(a, b) {
  if (!a || !b) return 0;
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni ? (inter / uni) * 100 : 0;
}

// ══════════════════════════════════════════════════════════════
//  МИША
// ══════════════════════════════════════════════════════════════

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (GAME.width / r.width),
           y: (e.clientY - r.top) * (GAME.height / r.height) };
}
function toImage(p) { return { x: (p.x - imgX) / imgScale, y: (p.y - imgY) / imgScale }; }

function bindPointer() {
  canvas.addEventListener('pointerenter', () => { pointerInside = true; });
  canvas.addEventListener('pointerleave', () => { if (!drawing) pointerInside = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (!game.canEdit) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    pointerX = p.x; pointerY = p.y; pointerInside = true;
    const b = toImage(p);
    lastBX = b.x; lastBY = b.y;
    drawing = true;
    pushUndo();
    stamp(b.x, b.y, 0, 0);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    pointerX = p.x; pointerY = p.y;
    if (!drawing || !game.canEdit) return;
    const b = toImage(p);
    strokeTo(b.x, b.y);
  });

  const finish = (e) => {
    if (!drawing) return;
    drawing = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

function strokeTo(bx, by) {
  const R = radiusInImage();
  const dx = bx - lastBX, dy = by - lastBY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.min(64, Math.ceil(dist / Math.max(1, R * 0.18))));
  for (let i = 1; i <= steps; i++) {
    const t0 = (i - 1) / steps, t1 = i / steps;
    stamp(lastBX + dx * t1, lastBY + dy * t1, dx * (t1 - t0), dy * (t1 - t0));
  }
  lastBX = bx; lastBY = by;
}

function brushSize() { return BRUSH_SIZES[brushIndex]; }

// Що саме показувати на кнопках: розмір, картинку й назву.
// Сторінка малює кнопки за цим списком, тому досить правити tuning.js.
export function brushOptions() { return TOOLS.map((t) => ({ ...t })); }
export function brushCurrent() { return brushIndex; }
export function setBrush(i) {
  if (i < 0 || i >= BRUSH_SIZES.length) return;
  brushIndex = i;
  notify();
}

function radiusInImage() { return (brushSize() / 2) / imgScale; }

// ══════════════════════════════════════════════════════════════
//  ПЕНЗЕЛЬ
// ══════════════════════════════════════════════════════════════
//
//  Нова карта в точці p = стара карта в точці (p − d), мінус d,
//  де d — на скільки має зсунутись вміст саме тут.
//  Другий доданок зсуває, перший тягне за собою те, що вже було
//  наліплено раніше — саме тому мазки складаються природно.

function stamp(cx, cy, mvx, mvy) {
  const R = radiusInImage();
  if (R < 0.5) return;

  const pad = Math.ceil(R) + 2;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(srcW - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(srcH - 1, Math.ceil(cy + R));
  if (x1 < x0 || y1 < y0) return;

  const cy0 = Math.max(0, y0 - pad), cy1 = Math.min(srcH - 1, y1 + pad);
  const cx0 = Math.max(0, x0 - pad), cx1 = Math.min(srcW - 1, x1 + pad);
  for (let y = cy0; y <= cy1; y++) {
    const a = y * srcW + cx0, b = y * srcW + cx1 + 1;
    prevX.set(dispX.subarray(a, b), a);
    prevY.set(dispY.subarray(a, b), a);
  }

  const R2 = R * R;
  const expo = 1 + (1 - clamp01(T.brush.hardness)) * 3;
  const s = clamp01(T.brush.strength);

  for (let y = y0; y <= y1; y++) {
    const vy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const vx = x - cx;
      const r2 = vx * vx + vy * vy;
      if (r2 >= R2) continue;

      const w = Math.pow(1 - r2 / R2, expo);
      if (w < 0.0008) continue;

      const i = y * srcW + x;

      const dx = mvx * s * w, dy = mvy * s * w;
      if (dx === 0 && dy === 0) continue;

      dispX[i] = sampleDisp(prevX, x - dx, y - dy) - dx;
      dispY[i] = sampleDisp(prevY, x - dx, y - dy) - dy;
    }
  }
  needsWarp = true;
}

function sampleDisp(arr, x, y) {
  if (x < 0) x = 0; else if (x > srcW - 1) x = srcW - 1;
  if (y < 0) y = 0; else if (y > srcH - 1) y = srcH - 1;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < srcW ? x0 + 1 : x0;
  const y1 = y0 + 1 < srcH ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = arr[y0 * srcW + x0], b = arr[y0 * srcW + x1];
  const c = arr[y1 * srcW + x0], d = arr[y1 * srcW + x1];
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ══════════════════════════════════════════════════════════════
//  ЗБИРАННЯ КАРТИНКИ
// ══════════════════════════════════════════════════════════════

function warp() {
  const W = srcW, H = srcH, src = srcData, out = outData;
  const maxX = W - 1, maxY = H - 1;
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;   // рамка видимої частини стопи

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x, o = i << 2;
      const ox = dispX[i], oy = dispY[i];

      if (ox === 0 && oy === 0) {                     // недоторкана точка
        out[o] = src[o]; out[o + 1] = src[o + 1];
        out[o + 2] = src[o + 2]; out[o + 3] = src[o + 3];
        if (out[o + 3] >= 128) {
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        continue;
      }

      let sx = x + ox, sy = y + oy;
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;

      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const iA = (y0 * W + x0) << 2, iB = (y0 * W + x1) << 2;
      const iC = (y1 * W + x0) << 2, iD = (y1 * W + x1) << 2;

      for (let c = 0; c < 4; c++) {
        const top = src[iA + c] + (src[iB + c] - src[iA + c]) * fx;
        const bot = src[iC + c] + (src[iD + c] - src[iC + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
      if (out[o + 3] >= 128) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
    }
  }
  footBB = bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1,
    w: bx1 - bx0 + 1, h: by1 - by0 + 1,
    cx: (bx0 + bx1 + 1) / 2, cy: (by0 + by1 + 1) / 2 };

  bufCtx.putImageData(outImage, 0, 0);
  needsWarp = false;
}

function ensureWarp() { if (needsWarp) warp(); }

// ══════════════════════════════════════════════════════════════
//  ХІД ГРИ
// ══════════════════════════════════════════════════════════════

function beginRound(i) {
  game.round = i;
  brushIndex = startBrush();     // кожен раунд починається із середньої кисті
  dispX.fill(0); dispY.fill(0);
  undoStack.length = 0;
  needsWarp = true;
  ensureWarp();                       // щоб рамка стопи була від НЕЗІМʼЯТОЇ стопи
  const boot = boots[i];
  roundFrame = frameFor(boot);
  // Контур зменшуємо ТИМ САМИМ множником, що й чобіт: якщо рахувати
  // окремо, його рамка на пару пікселів інша — і контур ліг би трохи
  // мимо чобота.
  roundOutline = boot.outlineBBox
    ? frameFor(boot, boot.outlineBBox, roundFrame ? roundFrame.shrink : undefined)
    : roundFrame;
  roundCutY = cutLineFor(boot, roundFrame);
  roundTarget = bootGrid(boot, roundFrame);
  game.t0 = performance.now();
  game.introT = 0;
  game.phase = 'intro';               // спершу вступ, робочий час почнеться після нього
  notify();
}

// Скільки триває вступ
function introTotal() { return T.intro.bootSeconds + T.intro.outlineSeconds; }

// Нога зʼявляється разом із контуром і плавно опускається на пʼєдестал.
// Повертає зсув у пікселях полотна, або null якщо ноги ще немає на сцені.
function footDrop() {
  if (game.phase === 'idle' || game.phase === 'lost') return null;
  if (game.phase !== 'intro') return 0;

  const I = T.intro;
  const t = game.introT - I.bootSeconds;
  if (t < 0) return null;
  if (I.footDropSeconds <= 0) return 0;

  const k = Math.min(1, t / I.footDropSeconds);
  const eased = 1 - Math.pow(1 - k, 3);      // швидко зрушує, мʼяко гальмує
  return -(1 - eased) * GAME.height * I.footDropFrom;
}

// Мʼяке проявлення на початку кроку і згасання в кінці
function stepAlpha(t, len) {
  const f = T.intro.fadeSeconds;
  if (f <= 0) return 1;
  return Math.max(0, Math.min(1, Math.min(t / f, (len - t) / f)));
}

function finishRound() {
  ensureWarp();
  const boot = boots[game.round];
  game.lastMatch = overlapPercent(footGrid(), roundTarget);
  game.lastPassed = game.lastMatch >= boot.pass;
  game.lastPoints = game.lastPassed
    ? Math.round(game.lastMatch * T.round.pointsPerPercent) : 0;
  game.score += game.lastPoints;

  game.phase = 'result';
  game.resultT0 = performance.now();
  game.canEdit = false;
  notify();
}

// Що робити після показу результату. Кнопок немає — гра вирішує сама.
//
// Влучив: очки й наступний чобіт. Чоботи скінчились — перемога.
// Не влучив: мінус життя. Нога на пʼєдесталі блідне й червоніє,
// далі повноекранна заставка, і на її місце стає наступна нога.
// Життя скінчились — вікно програшу.
function afterResult() {
  if (game.lastPassed) return nextBootOrWin();

  game.lives = Math.max(0, game.lives - 1);
  game.lastLife = game.lives <= 0;
  game.dieT0 = performance.now();
  game.phase = 'dying';
  notify();
}

// Куди йти, коли поточний чобіт позаду
function nextBootOrWin() {
  if (game.round + 1 < boots.length) return beginRound(game.round + 1);
  game.phase = 'done';
  notify();
}

// Скільки триває блідніння з червоним
function dyingTotal() {
  const L = T.lives || {};
  return (L.fadeSeconds ?? 0.6) + (L.holdSeconds ?? 1.2);
}

// Наскільки зараз «мертва» нога: 0 — звичайна, 1 — повністю бліда й червона
function deathMix() {
  if (game.phase === 'dying') {
    const f = Math.max(0.001, T.lives?.fadeSeconds ?? 0.6);
    return Math.min(1, ((performance.now() - game.dieT0) / 1000) / f);
  }
  return (game.phase === 'anim' || game.phase === 'lost') ? 1 : 0;
}

// Заставка догралась: або наступне життя, або вікно програшу
function afterAnim() {
  if (game.lastLife) {
    game.phase = 'lost';
    notify();
    return;
  }
  // Наступна нога. Якщо картинок менше, ніж життів, лишається остання.
  game.lifeIndex = Math.min(footImages.length - 1, game.lifeIndex + 1);
  setupFoot(footImages[game.lifeIndex]);
  nextBootOrWin();
}

// Повернутись до стану «стоїмо на порожній сцені й чекаємо».
// Потрібно кнопці «Нова гра» в меню: обнуляє очки, раунд і стопу.
export function reset() {
  // Викликається щоразу при вході на екран гри («Нова гра» і повернення
  // з меню). Саме тут відлік анімації дівчинки починається спочатку,
  // щоб гравець завжди бачив її з першого кадру, а не з середини циклу.
  girlT0 = performance.now();
  if (girlEls.length) {
    try {
      girlCur = 0; girlNext = -1;
      girlEls.forEach((e, i) => { e.pause(); e.currentTime = 0; });
      girlEls[0].play();
    } catch (e) {}
  }

  if (game.phase === 'loading') return;   // картинки ще їдуть, чіпати нічого
  game.score = 0;
  game.round = 0;
  game.lastMatch = 0;
  game.lastPassed = false;
  game.lastPoints = 0;
  game.canEdit = false;
  game.paused = false;
  game.lives = Math.max(1, T.lives?.count ?? 2);
  game.lastLife = false;

  // Повертаємо першу ногу, якщо грали другою
  if (footImages.length && game.lifeIndex !== 0) {
    game.lifeIndex = 0;
    setupFoot(footImages[0]);
  }
  if (dispX) { dispX.fill(0); dispY.fill(0); }
  undoStack.length = 0;
  needsWarp = true;
  beginRound(0);          // кнопки «Почати» немає — раунд іде одразу
}

function updateTimers(now) {
  // На паузі час не йде взагалі: ні вступ, ні раунд, ні показ
  // результату. Мить паузи запамʼятовуємо, щоб потім зсунути
  // початок відліку рівно на стільки, скільки простояли.
  if (game.paused) { game.canEdit = false; return; }

  if (game.phase === 'intro') {
    game.canEdit = false;
    game.introT = (now - game.t0) / 1000;
    if (game.introT >= introTotal()) {
      game.phase = 'play';
      game.t0 = now;                  // робочий час стартує тільки тепер
    }
    return;
  }
  if (game.phase === 'result') {
    game.canEdit = false;
    if ((now - game.resultT0) / 1000 >= (T.round.resultSeconds ?? 3.5)) afterResult();
    return;
  }
  // Нога блідне й червоніє
  if (game.phase === 'dying') {
    game.canEdit = false;
    if ((now - game.dieT0) / 1000 >= dyingTotal()) {
      game.phase = 'anim';
      game.dieT0 = now;
      notify();
    }
    return;
  }
  // Повноекранна заставка
  if (game.phase === 'anim') {
    game.canEdit = false;
    if ((now - game.dieT0) / 1000 >= (T.lives?.animSeconds ?? 2.5)) afterAnim();
    return;
  }
  if (game.phase !== 'play') { game.canEdit = false; return; }
  const R = T.round;
  const el = (now - game.t0) / 1000;

  if (R.timerStartsAfterPreview) {
    game.previewLeft = Math.max(0, R.previewSeconds - el);
    game.canEdit = game.previewLeft <= 0;
    game.timeLeft = game.canEdit
      ? Math.max(0, R.totalSeconds - (el - R.previewSeconds))
      : R.totalSeconds;
  } else {
    game.previewLeft = Math.max(0, R.previewSeconds - el);
    game.canEdit = true;
    game.timeLeft = Math.max(0, R.totalSeconds - el);
  }

  if (game.canEdit && game.timeLeft <= 0) finishRound();
}

// Пауза для вікна «вийти в меню?». Поки воно відкрите, час стоїть,
// а стопу рухати не можна.
let pauseT0 = 0;

export function setPaused(on) {
  if (!!on === game.paused) return;
  if (on) {
    pauseT0 = performance.now();
    game.paused = true;
  } else {
    const stood = performance.now() - pauseT0;
    game.t0 += stood;              // вступ і робочий час
    game.resultT0 += stood;        // і показ результату
    game.paused = false;
  }
  notify();
}

export function isPaused() { return game.paused; }

function notify() { hooks.onUpdate?.(getState()); }

export function getState() {
  return {
    phase: game.phase,
    round: game.round,
    total: boots.length,
    bootName: boots[game.round]?.name || '',
    timeLeft: game.timeLeft,
    previewLeft: game.previewLeft,
    introT: game.introT,
    bootVisible: game.phase === 'play' && game.previewLeft > 0,
    match: game.lastMatch,
    passed: game.lastPassed,
    points: game.lastPoints,
    score: game.score,
    canEdit: game.canEdit,
    lives: game.lives,
    livesMax: Math.max(1, T.lives?.count ?? 2),
    lifeIndex: game.lifeIndex,
    showAnim: game.phase === 'anim',
    pass: boots[game.round]?.pass ?? T.round.passPercent,
    brush: brushIndex,
    paused: game.paused,
    brushSizes: BRUSH_SIZES,
    introTotal: introTotal(),
  };
}

// ══════════════════════════════════════════════════════════════
//  МАЛЮВАННЯ
// ══════════════════════════════════════════════════════════════

function frame(now) {
  requestAnimationFrame(frame);
  const wasEdit = game.canEdit, wasPhase = game.phase;
  updateTimers(now || performance.now());
  if (wasEdit !== game.canEdit || wasPhase !== game.phase) notify();

  // Порядок шарів: фон, дівчинка, пʼєдестал, і вже потім стопа з чоботами.
  // Пʼєдестал іде поверх дівчинки саме для того, щоб її сукня не лізла на камінь.
  ctx.fillStyle = T.colors.stage;
  ctx.fillRect(0, 0, GAME.width, GAME.height);
  if (bgImage) ctx.drawImage(bgImage, 0, 0, GAME.width, GAME.height);
  drawGirl(now || performance.now());
  if (pedImage) ctx.drawImage(pedImage, 0, 0, GAME.width, GAME.height);

  if (failed) return drawFail();
  if (game.phase === 'loading') return drawCentered('Завантаження…', T.colors.dim, 30);

  ensureWarp();

  const drop = footDrop();
  if (drop !== null) {
    drawDropShadow(drop);
    drawShadow(drop);
    drawFoot(drop);
  }

  if (T.compare.showCutLine && (game.phase === 'play' || game.phase === 'result')) drawCutLine();
  if (game.phase === 'intro') drawIntro();
  if (game.phase === 'play' && game.previewLeft > 0) drawBootPreview();
  if (game.phase === 'result') drawResult();
  if (game.canEdit && pointerInside) drawBrush();
  if (game.phase === 'anim') drawLifeAnim();
}

// Нога на пʼєдесталі. При втраті життя вона блідне й заливається
// червоним — обидва числа в блоці `lives` у tuning.js.
function drawFoot(offsetY) {
  const w = srcW * imgScale, h = srcH * imgScale;
  const mix = deathMix();

  if (mix <= 0.001) {
    ctx.drawImage(buf, imgX, imgY + offsetY, w, h);
    return;
  }

  const L = T.lives || {};
  const alpha = 1 - (1 - (L.footAlpha ?? 0.5)) * mix;
  const red = (L.footRed ?? 0.3) * mix;

  // Червоне змішуємо на ОКРЕМОМУ полотні розміром із саму ногу.
  // Якщо робити це прямо на сцені, source-atop лягає на все, що
  // вже намальовано — і червоніє не нога, а весь кадр разом
  // із пʼєдесталом і дівчинкою.
  const tc = tintCtx();
  if (tc && red > 0.002) {
    tc.clearRect(0, 0, srcW, srcH);
    tc.globalCompositeOperation = 'source-over';
    tc.globalAlpha = 1;
    tc.drawImage(buf, 0, 0);
    tc.globalCompositeOperation = 'source-atop';   // тільки по непрозорому
    tc.globalAlpha = red;
    tc.fillStyle = T.colors.dying || '#c02020';
    tc.fillRect(0, 0, srcW, srcH);
    tc.globalCompositeOperation = 'source-over';
    tc.globalAlpha = 1;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(tc && red > 0.002 ? tintBuf : buf, imgX, imgY + offsetY, w, h);
  ctx.restore();
}

// Полотно для підфарбовування ноги. Створюється раз і живе далі.
function tintCtx() {
  if (!srcW || !srcH) return null;
  if (!tintBuf || tintBuf.width !== srcW || tintBuf.height !== srcH) {
    tintBuf = document.createElement('canvas');
    tintBuf.width = srcW; tintBuf.height = srcH;
    tintCtxCache = tintBuf.getContext('2d');
  }
  return tintCtxCache;
}

// Повноекранна заставка при втраті життя. Відео підставляє
// сторінка, тут малюємо картинку.
function drawLifeAnim() {
  const L = T.lives || {};
  const t = (performance.now() - game.dieT0) / 1000;
  const total = Math.max(0.2, L.animSeconds ?? 2.5);
  const fade = Math.min(0.35, total / 4);
  const a = Math.max(0, Math.min(1, Math.min(t / fade, (total - t) / fade)));

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, GAME.width, GAME.height);
  if (animImage) {
    // вписуємо цілком, не спотворюючи пропорції
    const k = Math.min(GAME.width / animImage.width, GAME.height / animImage.height);
    const w = animImage.width * k, h = animImage.height * k;
    ctx.drawImage(animImage, (GAME.width - w) / 2, (GAME.height - h) / 2, w, h);
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════
//  ДІВЧИНКА
// ══════════════════════════════════════════════════════════════
//
//  Основний варіант — відео webm із прозорістю. Воно вдвічі детальніше
//  за спрайтшит і при цьому легше, бо стискається як відео, а не як
//  вісімдесят окремих картинок. Малюємо його на канвас як звичайну
//  картинку — це браузери роблять надійно, на відміну від анімованого
//  webp, який на канвасі застигає першим кадром.
//
//  Але прозорість у webm розуміє не кожен браузер. Тому після запуску
//  ми перевіряємо це на ділі: беремо піксель у кутку, який зобовʼязаний
//  бути прозорим. Якщо він раптом непрозорий — браузер альфу не тягне,
//  і замість дівчинки був би чорний прямокутник. У такому разі тихо
//  переходимо на спрайтшит.

//  ЯК ЦЕ ПРАЦЮЄ
//
//  Роликів кілька, і вони йдуть по колу: перший, другий, знову перший.
//  На кожен заведено окремий <video>. Той, що не грає, стоїть на паузі
//  рівно на нульовому кадрі — розкодований і готовий стартувати миттєво.
//
//  Чому не вбудований loop у браузера: він робить справжнє перемотування,
//  зупиняє відтворення й запускає наново. Виміряно — пауза 136-249 мс,
//  до двох з половиною кадрів застигання. Око читає це як ривок.
//
//  Чому перехід розчиненням, а не встик: ролики намальовані окремо,
//  і поза в кінці одного не збігається з позою на початку іншого.
//  Виміряно — різниця вчетверо більша за звичайний крок між кадрами.
//  Розчинення за півсекунди розмазує цю відмінність так, що її не видно.

function loadGirl() {
  const G = T.girl;
  const all = (G.clips && G.clips.length) ? G.clips : [{ video: G.video }];

  // Вимкнені ролики (on: false) просто не беремо.
  let list = all.filter((c) => c && c.on !== false && c.video);
  if (!list.length) return;          // усі вимкнені — дівчинки на сцені немає

  // Якщо лишився один ролик, робимо з нього ДВІ копії й крутимо їх
  // по черзі. Це не примха: вбудований loop у браузера перемотує
  // відео по-справжньому й застигає на 136-249 мс — око читає це як
  // ривок. Дві копії міняються миттєво, бо друга вже розкодована.
  // Розчинення при цьому майже нульове: ролик стикується сам із
  // собою кадр-у-кадр, розмазувати нічого не треба.
  const single = list.length === 1;
  if (single) list = [list[0], list[0]];
  girlCross = single ? 0.06 : Math.max(0.05, G.crossSeconds ?? 0.5);

  let ready = 0, failed = false;

  const els = list.map((cfg) => {
    const v = document.createElement('video');
    v.muted = true; v.loop = false; v.playsInline = true;
    v.preload = 'auto';
    v.playbackRate = G.speed || 1;
    v._cfg = cfg;
    v.addEventListener('error', () => {
      if (failed) return;
      failed = true;
      console.warn('Відео дівчинки не пішло, беру спрайтшит');
      useGirlSheet();
    });
    v.addEventListener('loadeddata', () => {
      if (++ready < list.length || failed) return;
      if (!checkAlpha(els[0])) {
        failed = true;
        console.warn('Браузер не тягне прозорість у webm — беру спрайтшит');
        useGirlSheet();
        return;
      }
      girlEls = els;
      girlCur = 0; girlNext = -1;
      // Ручка для перевірки в консолі: __girl() покаже, який ролик грає
      try { window.__girlEls = girlEls; window.__girl = () => ({ cur: girlCur, next: girlNext,
        els: girlEls.map((e) => ({ src: e.src.split('/').pop(),
          t: +e.currentTime.toFixed(2), dur: +(e.duration || 0).toFixed(2),
          paused: e.paused })) }); } catch (e) {}
      els.forEach((e, i) => { try { e.currentTime = 0; if (i) e.pause(); } catch (err) {} });
      els[0].play().catch(() => {});
    });
    v.src = cfg.video;
    return v;
  });
}

// Слідкуємо за тим, коли пора починати перехід і коли міняти основний ролик
function girlTick() {
  if (!girlEls.length) return;
  // якщо ролик один — просто заводимо його наново, коли догрався
  if (girlEls.length === 1) {
    const only = girlEls[0];
    if (only && only.ended) { try { only.currentTime = 0; } catch (e) {} only.play().catch(() => {}); }
    return;
  }
  const cur = girlEls[girlCur];
  if (!cur || !cur.duration) return;

  const cross = girlCross;
  const left = cur.duration - cur.currentTime;

  // пора підключати наступний і починати розчинення
  if (girlNext < 0 && (left <= cross || cur.ended)) {
    girlNext = (girlCur + 1) % girlEls.length;
    const nx = girlEls[girlNext];
    try { nx.currentTime = 0; } catch (e) {}
    nx.play().catch(() => {});
  }

  // поточний догрався — він стає запасним, наступний основним
  if (girlNext >= 0 && (cur.ended || left <= 0.01)) {
    try { cur.pause(); cur.currentTime = 0; } catch (e) {}
    girlCur = girlNext;
    girlNext = -1;
  }
}

// Чи справді видно прозорість: кут кадру має бути порожнім
function checkAlpha(v) {
  try {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 32, 32);
    g.drawImage(v, 0, 0, 32, 32);
    return g.getImageData(1, 1, 1, 1).data[3] < 128;
  } catch (e) {
    return false;   // не змогли перевірити — вважаємо, що ні
  }
}

function useGirlSheet() {
  girlEls = [];
  if (girlSheet) return;
  loadImage(T.girl.sheet)
    .then((im) => { girlSheet = im; girlT0 = performance.now(); })
    .catch((e) => console.warn('Дівчинка не завантажилась зовсім:', e.message));
}

// Куди класти конкретний ролик. У кожного своє місце, бо аніматор
// рендерить їх у різних кадрах — інакше дівчинка стрибала б на переході.
function girlBox(cfg, aspect) {
  const G = T.girl;
  const hp = cfg?.heightPercent ?? G.heightPercent;
  const cx = cfg?.centerX ?? G.centerX;
  const by = cfg?.bottomY ?? G.bottomY;
  const h = GAME.height * hp;
  const w = h * (aspect || 0.6846);
  return { x: GAME.width * cx - w / 2, y: GAME.height * by - h, w, h };
}

// Запасний шлях: усі кадри лежать поруч в одній картинці, показуємо
// потрібний прямокутник. Кадр рахується від часу, тому швидкість не
// залежить від того, наскільки потужний компʼютер.
//
// Цикл замикається сам собою: після останнього кадру лічильник
// повертається на нульовий.
function drawGirl(now) {
  const G = T.girl;
  if (!G || !G.show) return;

  if (girlEls.length) {
    girlTick();
    const cur = girlEls[girlCur];
    if (cur && cur.readyState >= 2) {
      if (girlNext >= 0) {
        // розчинення: старий згасає, новий проявляється
        const nx = girlEls[girlNext];
        const t = Math.max(0, Math.min(1, nx.currentTime / girlCross));
        drawClip(cur, 1 - t);
        if (nx.readyState >= 2) drawClip(nx, t);
      } else {
        drawClip(cur, 1);
      }
      return;
    }
  }

  // запасний шлях: кадри зі спрайтшита
  if (!girlSheet) return;
  const cols = Math.max(1, G.cols);
  const rows = Math.ceil(G.frames / cols);
  const fw = girlSheet.width / cols;
  const fh = girlSheet.height / rows;

  const elapsed = Math.max(0, now - girlT0);
  const i = Math.floor(elapsed / 1000 * G.fps) % G.frames;
  const b = girlBox(null, fw / fh);
  ctx.drawImage(girlSheet, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh,
                b.x, b.y, b.w, b.h);
}

function drawClip(v, alpha) {
  if (alpha <= 0.004) return;
  const b = girlBox(v._cfg, v.videoWidth / v.videoHeight);
  if (alpha >= 0.999) { ctx.drawImage(v, b.x, b.y, b.w, b.h); return; }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(v, b.x, b.y, b.w, b.h);
  ctx.restore();
}

// Тінь від ноги, що падає. Лежить НЕ під ногою, а там, куди нога
// стане: на пʼєдесталі. Поки нога високо, тінь широка й бліда;
// ближче до землі — вужча й темніша. Без цього нога не падає,
// а просто проявляється в повітрі.
function drawDropShadow(offsetY) {
  const D = T.intro && T.intro.dropShadow;
  if (!D || D.on === false || !footBB || !offsetY) return;

  // offsetY відʼємний, поки нога вгорі, і 0 у мить приземлення
  const from = Math.max(1, GAME.height * (T.intro.footDropFrom || 0.85));
  const high = Math.max(0, Math.min(1, -offsetY / from));   // 1 вгорі, 0 внизу
  if (high <= 0.001) return;

  const cx = imgX + footBB.cx * imgScale;
  const cy = imgY + (footBB.y1 + 1) * imgScale;
  const grow = 1 + ((D.spread ?? 2.4) - 1) * high;
  const rx = footBB.w * imgScale * (D.width ?? 0.62) * grow;
  const ry = footBB.h * imgScale * (D.height ?? 0.055) * grow;
  const a = (D.alpha ?? 0.55) * (1 - high * 0.75);

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(0, 0, 0, ' + a.toFixed(3) + ')');
  g.addColorStop(0.6, 'rgba(0, 0, 0, ' + (a * 0.45).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(rx, ry));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Мʼяка тінь під підошвою: без неї стопа наче висить над каменем
function drawShadow(offsetY) {
  const I = T.image;
  if (!I.shadow || !footBB) return;
  const cx = imgX + footBB.cx * imgScale;
  const cy = imgY + (offsetY || 0) + (footBB.y1 + 1) * imgScale;
  const rx = footBB.w * imgScale * I.shadowWidth;
  const ry = footBB.h * imgScale * I.shadowHeight;

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(rx, ry));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Текст поверх фону читається гірше, тому даємо йому темну підкладку
function textShade(y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(8, 7, 12, 0.75)');
  g.addColorStop(1, 'rgba(8, 7, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, GAME.width, h);
}

function text(str, x, y, color, size, align, weight) {
  ctx.fillStyle = color;
  ctx.font = (weight || '') + ' ' + size + 'px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCentered(str, color, size) {
  text(str, GAME.width / 2, GAME.height / 2, color, size, 'center');
}

function drawFail() {
  text('Щось пішло не так', GAME.width / 2, GAME.height / 2 - 50, T.colors.bad, 46, 'center', 'bold');
  text(errorText, GAME.width / 2, GAME.height / 2 + 20, T.colors.ink, 30, 'center');
  text('Подробиці: F12 → вкладка Console', GAME.width / 2, GAME.height / 2 + 80, T.colors.dim, 24, 'center');
}

// Тонка лінія, щоб гравець бачив, звідки площа вже не рахується
function drawCutLine() {
  if (!roundCutY) return;
  const y = imgY + roundCutY * imgScale;
  ctx.save();
  ctx.strokeStyle = T.compare.cutLineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(GAME.width, y);
  ctx.stroke();
  ctx.restore();
  text('вище не рахується', GAME.width - 40, y - 18, T.compare.cutLineColor, 20, 'right');
}

// Чи вміє цей браузер розмивати на полотні. Перевіряємо один раз:
// у Safari до 17-ї версії ctx.filter просто немає.
let blurOk = null;
function canBlur() {
  if (blurOk === null) {
    try {
      ctx.filter = 'blur(2px)';
      blurOk = ctx.filter === 'blur(2px)';
      ctx.filter = 'none';
    } catch (e) { blurOk = false; }
    if (!blurOk) console.warn('Браузер не вміє розмиття на полотні — чобіт зʼявиться без нього');
  }
  return blurOk;
}

// Кладемо чобіт просто на стопу: обидві форми вписані в один квадрат,
// рівно так само, як їх потім порівнює підрахунок.
function drawBootOnFoot(picture, frame, alpha, blurPx) {
  if (!picture || !frame || alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  // Розмиття підтримують не всі браузери. Якщо ні — просто малюємо
  // різко: перехід лишиться, тільки без розфокусу.
  if (blurPx > 0.4 && canBlur()) ctx.filter = 'blur(' + blurPx.toFixed(1) + 'px)';
  ctx.drawImage(picture,
    imgX + frame.dx * imgScale, imgY + frame.dy * imgScale,
    picture.width * frame.k * imgScale, picture.height * frame.k * imgScale);
  ctx.restore();
}

function drawIntro() {
  const I = T.intro, boot = boots[game.round], t = game.introT;

  // Контур лежить на місці від початку, але спочатку прозорий.
  // Він набирає щільність рівно тоді, коли чобіт її втрачає —
  // виходить перетікання одного в інше, а не дві окремі появи.
  const fade = Math.max(0.001, I.fadeSeconds);
  const from = Math.max(0, I.bootSeconds - fade);   // мить, коли чобіт починає гаснути
  let outlineA = t < from ? 0 : Math.min(1, (t - from) / fade);
  outlineA = Math.min(outlineA, (introTotal() - t) / fade);  // і гасне в кінці вступу
  outlineA = clamp01(outlineA) * I.outlineAlpha;
  if (boot.outline) drawBootOnFoot(boot.outline, roundOutline, outlineA);
  else drawBootOnFoot(boot.shape, roundFrame, outlineA * 0.7);

  // Сам чобіт зверху, поки не розтане
  if (t < I.bootSeconds) {
    drawBootOnFoot(boot.img, roundFrame, stepAlpha(t, I.bootSeconds) * I.bootAlpha);
  }

  drawCountdown(t);
}

// Зворотний відлік у центрі контуру: 3, 2, 1. Показує, скільки
// лишилось дивитись, перш ніж контур зникне й піде робочий час.
function drawCountdown(t) {
  const I = T.intro, C = I.countdown;
  if (!C || C.on === false) return;

  const left = introTotal() - t;              // скільки лишилось вступу
  if (left <= 0 || t < I.bootSeconds) return; // під час показу чобота мовчимо
  const n = Math.ceil(left);
  if (n <= 0) return;

  // Центр беремо по рамці контуру — цифра стоїть саме в чоботі,
  // а не десь посеред екрана.
  const boot = boots[game.round];
  const bb = boot.outline ? boot.outlineBBox : boot.bbox;
  const fr = boot.outline ? roundOutline : roundFrame;
  if (!bb || !fr) return;
  const cx = imgX + (fr.dx + bb.cx * fr.k) * imgScale;
  const cy = imgY + (fr.dy + (bb.bottom - bb.h / 2) * fr.k) * imgScale;

  // Кожна цифра трохи наростає й тане — так видно, що це відлік,
  // а не просто число, яке стрибає.
  const frac = left - Math.floor(left);        // 1 на початку секунди, 0 у кінці
  const size = (C.size || 180) * (0.86 + 0.14 * frac);
  const a = Math.min(1, frac * 4);

  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = 'bold ' + Math.round(size) + 'px Cinzel, Georgia, ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.06);
  ctx.strokeStyle = C.dim || 'rgba(0,0,0,0.85)';
  ctx.strokeText(String(n), cx, cy);
  ctx.fillStyle = C.color || '#f4eee2';
  ctx.fillText(String(n), cx, cy);
  ctx.restore();
}

function drawBootPreview() {
  const P = T.preview, R = T.round;
  const shown = R.previewSeconds - game.previewLeft;   // скільки вже показуємо

  // Плавно проявляємо на початку і так само плавно гасимо в кінці
  let a = 1;
  if (P.fadeInSeconds > 0) a = Math.min(a, shown / P.fadeInSeconds);
  if (P.fadeOutSeconds > 0) a = Math.min(a, game.previewLeft / P.fadeOutSeconds);
  a = Math.max(0, Math.min(1, a)) * P.alpha;

  drawBootOnFoot(boots[game.round].img, roundFrame, a);
}

// Чобіт лягає поверх стопи: обидва вписані в один квадрат
function drawResult() {
  const boot = boots[game.round];
  const R = T.reveal || {};
  const t = (performance.now() - game.resultT0) / 1000;

  const hold = R.outlineSeconds ?? 1.3;
  const blur = Math.max(0.05, R.blurSeconds ?? 0.7);
  const k = Math.max(0, Math.min(1, (t - hold) / blur));   // 0 контур, 1 чобіт

  const outline = boot.outline || boot.shape;
  const frame = boot.outline ? roundOutline : roundFrame;

  // Контур тане і водночас розмивається — наче розфокусовується,
  // а не просто зникає.
  if (k < 1) {
    const px = (R.blurMax ?? 28) * k * imgScale;
    drawBootOnFoot(outline, frame, T.preview.resultAlpha * (1 - k), px);
  }
  // Справжній чобіт проявляється на його місці
  if (k > 0) {
    drawBootOnFoot(boot.img, roundFrame, (R.bootAlpha ?? 0.85) * k,
                   (R.blurMax ?? 28) * (1 - k) * 0.5 * imgScale);
  }

  // Панель із відсотком — по центру внизу, щоб не лізла на стопу
  // й не перекривала дівчинку праворуч.
  const x = GAME.width / 2, y = GAME.height * 0.715;
  const col = game.lastPassed ? T.colors.good : T.colors.bad;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 7, 12, 0.72)';
  ctx.fillRect(x - 330, y - 92, 660, 184);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 330, y - 92, 660, 184);
  ctx.restore();

  text(Math.round(game.lastMatch) + '%', x, y - 30, col, 76, 'center', 'bold');
  text(game.lastPassed ? T.texts.passed : T.texts.failed, x, y + 28, col, 28, 'center', 'bold');

  const line = game.lastPoints
    ? T.texts.points.replace('{n}', game.lastPoints)
    : T.texts.need.replace('{pass}', boot.pass);
  text(line, x, y + 66, T.colors.dim, 24, 'center');
}

function drawBrush() {
  const r = brushSize() / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = T.colors.brushShadow;
  ctx.beginPath(); ctx.arc(pointerX, pointerY, r + 1, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = T.colors.brushRing;
  ctx.beginPath(); ctx.arc(pointerX, pointerY, r, 0, Math.PI * 2); ctx.stroke();

  // Всередині кола — картинка вибраного інструмента. Раніше там
  // була просто крапка, і по ній не було видно, чим саме мнеш.
  const icon = toolIcons[brushIndex];
  if (!icon || !icon.width) {
    ctx.fillStyle = T.colors.brushRing;
    ctx.beginPath(); ctx.arc(pointerX, pointerY, 2, 0, Math.PI * 2); ctx.fill();
    return;
  }

  // Висота іконки міряється від діаметра пензля: більший пензель —
  // більший інструмент у руці. iconScale у tuning.js це масштабує.
  const k = (TOOLS[brushIndex].iconScale ?? T.brush.iconScale ?? 1);
  const h = brushSize() * k;
  const w = h * (icon.width / icon.height);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.drawImage(icon, pointerX - w / 2, pointerY - h / 2, w, h);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════
//  КНОПКИ
// ══════════════════════════════════════════════════════════════

function pushUndo() {
  const n = srcW * srcH;
  const snap = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    snap[i] = Math.max(-32000, Math.min(32000, Math.round(dispX[i] * 16)));
    snap[n + i] = Math.max(-32000, Math.min(32000, Math.round(dispY[i] * 16)));
  }
  undoStack.push(snap);
  if (undoStack.length > T.undoSteps) undoStack.shift();
}

export function undo() {
  if (!game.canEdit || !undoStack.length) return false;
  const snap = undoStack.pop();
  const n = srcW * srcH;
  for (let i = 0; i < n; i++) { dispX[i] = snap[i] / 16; dispY[i] = snap[n + i] / 16; }
  needsWarp = true;
  return true;
}
