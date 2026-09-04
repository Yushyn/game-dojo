// Лідерборд. Живе окремо від усього іншого: якщо база недоступна —
// сторінка все одно працює, просто в панелі буде напис про це.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.1/+esm';
const LOAD_TIMEOUT_MS = 6000;

let supabase = null;
export let dbReady = false;

// Підключення винесене в окрему функцію і НЕ виконується саме собою.
// Раніше воно стояло вгорі файлу — і якщо CDN недоступний (корпоративна
// мережа, збій jsdelivr), падав увесь сайт, включно з картинкою.
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
  } catch (e) {
    console.warn('Лідерборд недоступний:', e?.message || e);
    dbReady = false;
  }
  return dbReady;
}

export async function topScores(limit = 10) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('scores')
      .select('player, score, created_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) { console.error('Помилка лідерборду:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('Помилка лідерборду:', e);
    return [];
  }
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
