import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const dbReady = true;

export async function topScores(limit = 10) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('scores')
      .select('player, score, created_at')
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Помилка лідерборду:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Не вдалось прочитати лідерборд:', e);
    return [];
  }
}

export async function submitScore(player, score) {
  if (!supabase) return { ok: false, reason: 'Supabase не налаштований' };

  try {
    const name = String(player).trim().slice(0, 24) || 'anon';
    const { error } = await supabase
      .from('scores')
      .insert([{ player: name, score: Math.floor(score) }]);

    if (error) {
      console.error('Помилка запису очок:', error.message);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('Критична помилка збереження:', e);
    return { ok: false, reason: e.message };
  }
}