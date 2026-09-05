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

// ── Інструмент ────────────────────────────────────────────────
export const tool = { name: 'push' };

// Опора. Значення беруться з tuning.js, але в режимі підбору
// їх можна посунути мишкою просто в грі.
const anchor = { x: T.anchor.x, y: T.anchor.y, radius: T.anchor.radius };
let anchorHint = '';

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
let girlSheet = null;    // спрайтшит дівчинки: усі кадри в одній картинці
let girlT0 = 0;          // мить, коли її анімація почалась — від неї рахуємо кадр
let pedImage = null;     // окремий шар пʼєдестала поверх неї
let baseBB = null;       // рамка НЕЗІМʼЯТОЇ стопи — за нею рахуємо розмір і місце

// ── Хід гри ───────────────────────────────────────────────────
const game = {
  phase: 'loading',   // loading | idle | play | result | done
  round: 0,
  score: 0,
  t0: 0,
  timeLeft: 0,
  previewLeft: 0,
  introT: 0,
  canEdit: false,
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
  if (T.girl?.show) {
    loadImage(T.girl.sheet)
      .then((im) => { girlSheet = im; })
      .catch((e) => console.warn('Дівчинка не завантажилась:', e.message));
  }
  if (T.pedestal?.show) {
    loadImage(T.pedestal.src)
      .then((im) => { pedImage = im; })
      .catch((e) => console.warn('Пʼєдестал не завантажився:', e.message));
  }

  const list = [T.image.src].concat(T.boots.map((b) => b.src));
  Promise.all(list.map(loadImage))
    .then((imgs) => {
      setupFoot(imgs[0]);
      boots = T.boots.map((def, i) => prepBoot(def, imgs[i + 1]));
      reportBaselines();
      game.phase = 'idle';
      notify();

      // Контури не критичні: якщо якогось немає, крок вступу
      // просто покаже кольоровий силует замість малюнка.
      T.boots.forEach((def, i) => {
        if (!def.outline) return;
        loadImage(def.outline)
          .then((im) => {
            boots[i].outline = im;
            boots[i].outlineBBox = bboxOfImage(im);
          })
          .catch((e) => console.warn('Контур не завантажився:', e.message));
      });
    })
    .catch((e) => fail(e.message));
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
    return `  ${b.name}: без жодного руху ${v.toFixed(1)}%, поріг ${b.pass}%`;
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

function frameFor(boot, bbox) {
  const bb = bbox || boot.bbox;
  if (!footBB || !bb) return null;

  // Прикладаємо по ДОВЖИНІ стопи, а підошву чобота ставимо на ту саму
  // землю, що й підошву стопи. Раніше рівняли по більшій стороні — і чобіт
  // роздувався на всю ногу, бо стопа з гомілкою висока, а чобіт широкий.
  const k = (footBB.w / bb.w) * boot.scale;
  return {
    k,
    dx: footBB.cx - bb.cx * k + boot.offsetX * footBB.w,
    dy: (footBB.y1 + 1) - bb.bottom * k + boot.offsetY * footBB.h,
  };
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
    if (T.anchor.pickWithAlt && e.altKey) { moveAnchor(e); return; }
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

  canvas.addEventListener('wheel', (e) => {
    if (!T.anchor.pickWithAlt || !e.altKey) return;
    e.preventDefault();
    anchor.radius = Math.max(0.01, Math.min(0.6,
      anchor.radius * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    printAnchor();
  }, { passive: false });
}

// Режим підбору опори: показуємо готовий рядок для tuning.js
function moveAnchor(e) {
  const b = toImage(toCanvas(e));
  anchor.x = Math.max(0, Math.min(1, b.x / srcW));
  anchor.y = Math.max(0, Math.min(1, b.y / srcH));
  printAnchor();
}

function printAnchor() {
  const r = (v) => v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  anchorHint = `anchor: { x: ${r(anchor.x)}, y: ${r(anchor.y)}, radius: ${r(anchor.radius)} }`;
  console.log('Опора — скопіюй у tuning.js:  ' + anchorHint);
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

function radiusInImage() { return (T.brush.size / 2) / imgScale; }

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
  const heal = T.brush.restoreRate * s;
  const isRestore = tool.name === 'restore';

  // Опорна точка: чим ближче до неї, тим слабший пензель, у центрі — нуль
  const ax = anchor.x * srcW, ay = anchor.y * srcH;
  const ar = anchor.radius * Math.max(srcW, srcH);
  const ar2 = ar * ar;

  for (let y = y0; y <= y1; y++) {
    const vy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const vx = x - cx;
      const r2 = vx * vx + vy * vy;
      if (r2 >= R2) continue;

      let w = Math.pow(1 - r2 / R2, expo);

      const adx = x - ax, ady = y - ay;
      const ad2 = adx * adx + ady * ady;
      if (ad2 < ar2) {
        const k = Math.sqrt(ad2) / ar;       // 0 у центрі опори, 1 на її краю
        w *= k * k * (3 - 2 * k);            // плавний перехід
      }
      if (w < 0.0008) continue;

      const i = y * srcW + x;

      if (isRestore) {
        const keep = 1 - heal * w;
        dispX[i] = prevX[i] * keep;
        dispY[i] = prevY[i] * keep;
        continue;
      }

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
  dispX.fill(0); dispY.fill(0);
  undoStack.length = 0;
  needsWarp = true;
  ensureWarp();                       // щоб рамка стопи була від НЕЗІМʼЯТОЇ стопи
  const boot = boots[i];
  roundFrame = frameFor(boot);
  roundOutline = boot.outlineBBox ? frameFor(boot, boot.outlineBBox) : roundFrame;
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
  if (game.phase === 'idle') return null;
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
  game.canEdit = false;
  notify();
}

// Одна кнопка на всі випадки — робить те, що доречно зараз
export function action() {
  if (game.phase === 'idle') return beginRound(0);
  if (game.phase === 'done') { game.score = 0; return beginRound(0); }
  if (game.phase !== 'result') return;

  if (!game.lastPassed) return beginRound(game.round);       // той самий чобіт
  if (game.round + 1 < boots.length) return beginRound(game.round + 1);
  game.phase = 'done';
  notify();
}

// Повернутись до стану «стоїмо на порожній сцені й чекаємо».
// Потрібно кнопці «Нова гра» в меню: обнуляє очки, раунд і стопу.
export function reset() {
  // Викликається щоразу при вході на екран гри («Нова гра» і повернення
  // з меню). Саме тут відлік анімації дівчинки починається спочатку,
  // щоб гравець завжди бачив її з першого кадру, а не з середини циклу.
  girlT0 = performance.now();

  if (game.phase === 'loading') return;   // картинки ще їдуть, чіпати нічого
  game.score = 0;
  game.round = 0;
  game.lastMatch = 0;
  game.lastPassed = false;
  game.lastPoints = 0;
  game.canEdit = false;
  game.phase = 'idle';
  if (dispX) { dispX.fill(0); dispY.fill(0); }
  undoStack.length = 0;
  needsWarp = true;
  notify();
}

function updateTimers(now) {
  if (game.phase === 'intro') {
    game.canEdit = false;
    game.introT = (now - game.t0) / 1000;
    if (game.introT >= introTotal()) {
      game.phase = 'play';
      game.t0 = now;                  // робочий час стартує тільки тепер
    }
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
    drawShadow(drop);
    ctx.drawImage(buf, imgX, imgY + drop, srcW * imgScale, srcH * imgScale);
  }

  if (T.compare.showCutLine && (game.phase === 'play' || game.phase === 'result')) drawCutLine();
  if (T.anchor.show && (game.phase === 'play' || game.phase === 'result')) drawAnchor();
  if (game.phase === 'intro') drawIntro();
  if (game.phase === 'play' && game.previewLeft > 0) drawBootPreview();
  if (game.phase === 'result') drawResult();
  if (game.phase === 'idle') drawIdle();
  if (game.phase === 'done') drawDone();
  if (game.phase === 'play') drawPlayHud();
  if (game.canEdit && pointerInside) drawBrush();

  if (T.anchor.pickWithAlt) {
    text(anchorHint || 'Alt + клік — пересунути опору, Alt + колесо — радіус',
         40, GAME.height - 34, anchorHint ? T.colors.good : T.colors.dim, 22);
  }
}

// Дівчинка. Її анімація — не вигадана кодом, а справжня: усі кадри
// лежать поруч в одній картинці (спрайтшит), і ми просто показуємо
// потрібний прямокутник. Кадр рахується від часу, тому швидкість не
// залежить від того, наскільки потужний компʼютер.
//
// Цикл замикається сам собою: після останнього кадру лічильник
// повертається на нульовий.
function drawGirl(now) {
  const G = T.girl;
  if (!G || !G.show || !girlSheet) return;

  const cols = Math.max(1, G.cols);
  const rows = Math.ceil(G.frames / cols);
  const fw = girlSheet.width / cols;      // розмір одного кадру в спрайтшиті
  const fh = girlSheet.height / rows;

  const elapsed = Math.max(0, now - girlT0);
  const i = Math.floor(elapsed / 1000 * G.fps) % G.frames;
  const sx = (i % cols) * fw;
  const sy = Math.floor(i / cols) * fh;

  const h = GAME.height * G.heightPercent;
  const w = h * (fw / fh);
  const x = GAME.width * G.centerX - w / 2;
  const y = GAME.height * G.bottomY - h;

  ctx.drawImage(girlSheet, sx, sy, fw, fh, x, y, w, h);
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

function drawAnchor() {
  const x = imgX + anchor.x * srcW * imgScale;
  const y = imgY + anchor.y * srcH * imgScale;
  const r = anchor.radius * Math.max(srcW, srcH) * imgScale;

  ctx.save();
  ctx.strokeStyle = T.anchor.color;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = T.anchor.color;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  text('опора', x, y - 26, T.anchor.color, 20, 'center');
}

// Кладемо чобіт просто на стопу: обидві форми вписані в один квадрат,
// рівно так само, як їх потім порівнює підрахунок.
function drawBootOnFoot(picture, frame, alpha) {
  if (!picture || !frame || alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(picture,
    imgX + frame.dx * imgScale, imgY + frame.dy * imgScale,
    picture.width * frame.k * imgScale, picture.height * frame.k * imgScale);
  ctx.restore();
}

// Місце праворуч, де пишемо результат раунду
function sideX() { return GAME.width * 0.84; }

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

  textShade(0, 150);
  text('Раунд ' + (game.round + 1) + ' / ' + boots.length, 40, 44, T.colors.dim, 24);
  text(boot.name, 40, 78, T.colors.dim, 22);
  text(t < I.bootSeconds ? T.texts.introBoot : T.texts.introOutline,
       GAME.width / 2, 56, T.colors.ink, 30, 'center', 'bold');
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

function drawPlayHud() {
  textShade(0, 150);
  const boot = boots[game.round];
  text('Раунд ' + (game.round + 1) + ' / ' + boots.length, 40, 44, T.colors.dim, 24);
  text(boot.name, 40, 78, T.colors.dim, 22);

  const left = Math.ceil(game.timeLeft);
  text(left + ' с', GAME.width / 2, 52, left <= 10 ? T.colors.bad : T.colors.ink, 44, 'center', 'bold');

  if (game.previewLeft > 0) {
    const p = Math.ceil(game.previewLeft);
    text(T.texts.memorize + ' ' + p + ' с', GAME.width / 2, 100,
         p <= 5 ? T.colors.bad : T.colors.dim, 24, 'center');
  } else {
    text(T.texts.fromMemory, GAME.width / 2, 100, T.colors.dim, 24, 'center');
  }
}

function drawIdle() {
  textShade(0, 140);
  text(T.texts.idleTitle, GAME.width / 2, 56, T.colors.ink, 34, 'center', 'bold');
  text(T.texts.idleHint, GAME.width / 2, 100, T.colors.dim, 24, 'center');
}

function drawDone() {
  text(T.texts.finished, GAME.width / 2, GAME.height * 0.16, T.colors.good, 44, 'center', 'bold');
  text('Очки: ' + game.score, GAME.width / 2, GAME.height * 0.16 + 56, T.colors.ink, 30, 'center');
}

// Чобіт лягає поверх стопи: обидва вписані в один квадрат
function drawResult() {
  const boot = boots[game.round];
  // У кінці кладемо той самий контур, що показували у вступі.
  // Синій силует лишається запасним варіантом для чобіт без контуру.
  if (boot.outline) drawBootOnFoot(boot.outline, roundOutline, T.preview.resultAlpha);
  else drawBootOnFoot(boot.shape, roundFrame, T.preview.resultAlpha);

  const x = sideX(), y = GAME.height * 0.30;
  const col = game.lastPassed ? T.colors.good : T.colors.bad;
  text(Math.round(game.lastMatch) + '%', x, y, col, 96, 'center', 'bold');
  text(game.lastPassed ? T.texts.passed : T.texts.failed, x, y + 76, col, 30, 'center', 'bold');
  text('потрібно ' + boot.pass + '%', x, y + 118, T.colors.dim, 24, 'center');
  if (game.lastPoints) {
    text('+' + game.lastPoints + ' очок', x, y + 168, T.colors.ink, 28, 'center', 'bold');
  }
}

function drawBrush() {
  const r = T.brush.size / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = T.colors.brushShadow;
  ctx.beginPath(); ctx.arc(pointerX, pointerY, r + 1, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = T.colors.brushRing;
  ctx.beginPath(); ctx.arc(pointerX, pointerY, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = T.colors.brushRing;
  ctx.beginPath(); ctx.arc(pointerX, pointerY, 2, 0, Math.PI * 2); ctx.fill();
}

// ══════════════════════════════════════════════════════════════
//  КНОПКИ
// ══════════════════════════════════════════════════════════════

export function setTool(name) { tool.name = name; }

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
