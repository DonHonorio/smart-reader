-- Fase 35 — Persistent book translations anchored to EPUB CFI ranges.
--
-- book_translations stores every translation the reader has produced inside a book,
-- anchored to the exact EPUB CFI range of the selected text. vocabulary_items keeps
-- its own meaning: only what the user explicitly saved for study/Anki export.

create extension if not exists pgcrypto;

create table if not exists public.book_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,

  cfi_range text not null,
  chapter_href text,

  selected_text text not null,
  context_sentence text,

  detected_expression text,
  base_form text,
  translation text not null,
  unit_type text,
  confidence double precision,

  source_language text not null,
  target_language text not null,

  provider text,
  requested_model text,
  actual_model text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint book_translations_cfi_range_not_empty check (length(btrim(cfi_range)) > 0),
  constraint book_translations_selected_text_not_empty check (length(btrim(selected_text)) > 0),
  constraint book_translations_translation_not_empty check (length(btrim(translation)) > 0),
  constraint book_translations_source_language_not_empty check (length(btrim(source_language)) > 0),
  constraint book_translations_target_language_not_empty check (length(btrim(target_language)) > 0)
);

-- One stored translation per user + book + position + target language.
-- This is the final protection against concurrent duplicate inserts.
create unique index if not exists book_translations_position_unique_idx
  on public.book_translations (user_id, book_id, cfi_range, target_language);

create index if not exists book_translations_user_book_idx
  on public.book_translations (user_id, book_id);

create index if not exists book_translations_user_book_chapter_idx
  on public.book_translations (user_id, book_id, chapter_href);

create or replace function public.book_translations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists book_translations_set_updated_at on public.book_translations;

create trigger book_translations_set_updated_at
  before update on public.book_translations
  for each row
  execute function public.book_translations_set_updated_at();

alter table public.book_translations enable row level security;

drop policy if exists "book_translations_select_own" on public.book_translations;
drop policy if exists "book_translations_insert_own" on public.book_translations;
drop policy if exists "book_translations_update_own" on public.book_translations;
drop policy if exists "book_translations_delete_own" on public.book_translations;

create policy "book_translations_select_own"
  on public.book_translations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "book_translations_insert_own"
  on public.book_translations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "book_translations_update_own"
  on public.book_translations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "book_translations_delete_own"
  on public.book_translations
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.book_translations to authenticated;
revoke all on public.book_translations from anon;

-- Link saved vocabulary back to the persistent translation it came from.
alter table public.vocabulary_items
  add column if not exists book_translation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vocabulary_items_book_translation_id_fkey'
  ) then
    alter table public.vocabulary_items
      add constraint vocabulary_items_book_translation_id_fkey
      foreign key (book_translation_id)
      references public.book_translations (id)
      on delete set null;
  end if;
end;
$$;

-- A translation can produce at most one vocabulary item per user.
create unique index if not exists vocabulary_items_book_translation_unique_idx
  on public.vocabulary_items (user_id, book_translation_id)
  where book_translation_id is not null;
