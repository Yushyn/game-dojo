// Лідерборд. Живе окремо від усього іншого: якщо база недоступна —
// сторінка все одно працює, просто в панелі буде напис про це.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { TUNING } from './tuning.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.1/+esm';
const LOAD_TIMEOUT_MS = 6000;

let supabase = null;
export let dbReady = false;

// Підключення винесене в окрему функцію і НЕ виконується саме собою.
// Раніше воно стояло вгорі файлу — і якщо CDN недоступний (корпоративна
// мережа, збій jsdelivr), падав увесь сайт, включно з грою.
// Тепер найгірше, що станеться, — не буде лідерборду.
export async function initDb() {
  try {
    const mod = await Promise.race([
      import(CDN),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)),
    ]);
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    dbReady = true;
    printResetHint();
  } catch (e) {
    console.warn('Лідерборд недоступний:', e?.message || e);
    dbReady = false;
  }
  return dbReady;
}

// ── Скидання лідерборду ───────────────────────────────────────
// Стара межа з tuning.js у вигляді, зрозумілому базі.
// Результати, старіші за неї, у список не потрапляють.
function cutoff() {
  const raw = String(TUNING.leaderboard?.resetBefore || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    console.warn('Лідерборд: не зрозумів дату «' + raw +
      '» у resetBefore. Потрібен формат РРРР-ММ-ДДТГГ:ХХ, наприклад 2026-09-05T14:30');
    return null;
  }
  return d.toISOString();
}

// Підказка геймдизайнеру: готовий рядок із поточним часом
function printResetHint() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
              `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const c = cutoff();
  console.log(
    'Лідерборд: ' + (c ? 'показує результати з ' + new Date(c).toLocaleString() : 'показує всі результати') +
    '\nЩоб скинути його зараз, встав у tuning.js:  resetBefore: \'' + now + '\','
  );
}

export async function topScores(limit) {
  if (!supabase) return [];
  try {
    let q = supabase
      .from('scores')
      .select('player, score, created_at')
      .order('score', { ascending: false })
      .limit(limit || TUNING.leaderboard?.limit || 10);

    const c = cutoff();
    if (c) q = q.gte('created_at', c);

    const { data, error } = await q;
    if (error) { console.error('Помилка лідерборду:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('Помилка лідерборду:', e);
    return [];
  }
}

// Чи потрапляє результат у таблицю. Дивимось на стільки місць,
// скільки їх узагалі показує лідерборд: якщо місць ще менше, ніж
// треба, потрапляє будь-хто; якщо всі зайняті — треба обійти
// останнього.
//
// Коли база недоступна, кажемо «так»: краще дати вписати імʼя
// й чесно показати помилку збереження, ніж мовчки не показати
// поле людині, яка, можливо, і справді в топі.
export async function qualifies(score) {
  const places = Math.max(1, TUNING.leaderboard?.limit || 20);
  if (!supabase) return { ok: true, unknown: true, places };
  const rows = await topScores(places);
  if (!rows.length) return { ok: true, places, last: null };
  if (rows.length < places) return { ok: true, places, last: rows[rows.length - 1].score };
  const last = rows[rows.length - 1].score;
  return { ok: Math.floor(score) > last, places, last };
}

export async function submitScore(player, score) {
  if (!supabase) return { ok: false, reason: 'база недоступна' };
  try {
    const name = String(player).trim().slice(0, 24) || 'anon';
    const { error } = await supabase
      .from('scores')
      .insert([{ player: name, score: Math.max(0, Math.floor(score)) }]);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
