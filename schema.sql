-- Supabase → SQL Editor → New query → вставити все → Run

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  player     text not null check (char_length(player) between 1 and 24),
  score      integer not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);

-- Без цього рядка будь-хто з девтулзами робить із твоєю таблицею що завгодно.
alter table public.scores enable row level security;

-- Читати може будь-хто.
drop policy if exists "scores are public" on public.scores;
create policy "scores are public"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Дописувати може будь-хто, але тільки insert.
-- Update і delete не дозволені нікому — політик на них просто немає,
-- а RLS за замовчуванням забороняє все, що явно не дозволено.
drop policy if exists "anyone can submit a score" on public.scores;
create policy "anyone can submit a score"
  on public.scores for insert
  to anon, authenticated
  with check (char_length(player) between 1 and 24 and score >= 0);

-- ══════════════════════════════════════════════════════════════
--  ЯК СКИНУТИ ЛІДЕРБОРД
-- ══════════════════════════════════════════════════════════════
--
--  Звичайний спосіб — через tuning.js, блок leaderboard, поле
--  resetBefore. Впиши поточні дату й час, і старі результати
--  зникнуть зі списку. Рядки лишаться в базі, їх можна повернути.
--
--  Якщо треба видалити по-справжньому і назавжди — виконай тут,
--  у SQL Editor. З браузера це навмисно неможливо: щоб дозволити
--  видалення грі, довелось би відкрити доступ на delete всім, і
--  будь-який гравець стер би чужі результати з девтулзів.
--
--  Стерти все:
--      delete from public.scores;
--
--  Стерти лише старіше за певну дату:
--      delete from public.scores where created_at < '2026-09-05';
--
--  Стерти один запис за іменем:
--      delete from public.scores where player = 'тест';
