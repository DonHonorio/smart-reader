-- Migración base: retrato del esquema `public` tal y como existe en
-- desarrollo y en producción cuando se creó este fichero.
--
-- No introduce cambios: es idempotente de principio a fin. Sirve para poder
-- levantar un entorno nuevo desde cero, porque el esquema se construyó a mano
-- antes de que el proyecto usara migraciones.
--
-- En los entornos que ya existen se marca como aplicada, no se ejecuta:
--   npx supabase migration repair --status applied 00000000000000 --db-url <URL>

-- Extensiones
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Tablas
create table if not exists public.anki_exports (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  file_path text,
  items_count integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.book_translations (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  book_id uuid not null,
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
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.books (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  author text,
  language_from text default 'en'::text,
  language_to text default 'es'::text,
  file_path text,
  cover_path text,
  status text default 'uploaded'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.credit_transactions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text not null,
  amount integer not null,
  reason text not null,
  book_id uuid,
  stripe_session_id text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.reading_progress (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  book_id uuid not null,
  current_location text,
  progress_percentage numeric(5,2) default 0,
  updated_at timestamp with time zone default now() not null,
  chapter_href text,
  save_reason text,
  last_stable_at timestamp with time zone
);

create table if not exists public.user_credits (
  user_id uuid not null,
  balance integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.user_onboarding (
  user_id uuid not null,
  status text default 'pending'::text not null,
  current_step integer default 1 not null,
  completed_at timestamp with time zone,
  skipped_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.vocabulary_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  book_id uuid not null,
  term text not null,
  translation text,
  context_sentence text not null,
  note text,
  status text default 'saved'::text not null,
  created_at timestamp with time zone default now() not null,
  selected_text text,
  canonical_unit text,
  unit_type text,
  confidence text,
  book_translation_id uuid
);

-- Claves, unicidad y comprobaciones
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'anki_exports_pkey' and conrelid = 'public.anki_exports'::regclass) then
    alter table public.anki_exports add constraint anki_exports_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'anki_exports_user_id_fkey' and conrelid = 'public.anki_exports'::regclass) then
    alter table public.anki_exports add constraint anki_exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_pkey' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_book_id_fkey' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_book_id_fkey FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_user_id_fkey' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_cfi_range_not_empty' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_cfi_range_not_empty CHECK ((length(btrim(cfi_range)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_selected_text_not_empty' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_selected_text_not_empty CHECK ((length(btrim(selected_text)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_source_language_not_empty' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_source_language_not_empty CHECK ((length(btrim(source_language)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_target_language_not_empty' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_target_language_not_empty CHECK ((length(btrim(target_language)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'book_translations_translation_not_empty' and conrelid = 'public.book_translations'::regclass) then
    alter table public.book_translations add constraint book_translations_translation_not_empty CHECK ((length(btrim(translation)) > 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'books_pkey' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'books_user_id_fkey' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'credit_transactions_pkey' and conrelid = 'public.credit_transactions'::regclass) then
    alter table public.credit_transactions add constraint credit_transactions_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'credit_transactions_book_id_fkey' and conrelid = 'public.credit_transactions'::regclass) then
    alter table public.credit_transactions add constraint credit_transactions_book_id_fkey FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'credit_transactions_user_id_fkey' and conrelid = 'public.credit_transactions'::regclass) then
    alter table public.credit_transactions add constraint credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'reading_progress_user_id_book_id_key' and conrelid = 'public.reading_progress'::regclass) then
    alter table public.reading_progress add constraint reading_progress_user_id_book_id_key UNIQUE (user_id, book_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'reading_progress_pkey' and conrelid = 'public.reading_progress'::regclass) then
    alter table public.reading_progress add constraint reading_progress_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'reading_progress_book_id_fkey' and conrelid = 'public.reading_progress'::regclass) then
    alter table public.reading_progress add constraint reading_progress_book_id_fkey FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'reading_progress_user_id_fkey' and conrelid = 'public.reading_progress'::regclass) then
    alter table public.reading_progress add constraint reading_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'user_credits_pkey' and conrelid = 'public.user_credits'::regclass) then
    alter table public.user_credits add constraint user_credits_pkey PRIMARY KEY (user_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'user_credits_user_id_fkey' and conrelid = 'public.user_credits'::regclass) then
    alter table public.user_credits add constraint user_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'user_credits_balance_check' and conrelid = 'public.user_credits'::regclass) then
    alter table public.user_credits add constraint user_credits_balance_check CHECK ((balance >= 0));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'user_onboarding_pkey' and conrelid = 'public.user_onboarding'::regclass) then
    alter table public.user_onboarding add constraint user_onboarding_pkey PRIMARY KEY (user_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'user_onboarding_user_id_fkey' and conrelid = 'public.user_onboarding'::regclass) then
    alter table public.user_onboarding add constraint user_onboarding_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'vocabulary_items_pkey' and conrelid = 'public.vocabulary_items'::regclass) then
    alter table public.vocabulary_items add constraint vocabulary_items_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'vocabulary_items_book_id_fkey' and conrelid = 'public.vocabulary_items'::regclass) then
    alter table public.vocabulary_items add constraint vocabulary_items_book_id_fkey FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'vocabulary_items_book_translation_id_fkey' and conrelid = 'public.vocabulary_items'::regclass) then
    alter table public.vocabulary_items add constraint vocabulary_items_book_translation_id_fkey FOREIGN KEY (book_translation_id) REFERENCES book_translations(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'vocabulary_items_user_id_fkey' and conrelid = 'public.vocabulary_items'::regclass) then
    alter table public.vocabulary_items add constraint vocabulary_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

-- Índices no asociados a restricciones
create unique index if not exists book_translations_position_unique_idx ON public.book_translations USING btree (user_id, book_id, cfi_range, target_language);
create index if not exists book_translations_user_book_chapter_idx ON public.book_translations USING btree (user_id, book_id, chapter_href);
create index if not exists book_translations_user_book_idx ON public.book_translations USING btree (user_id, book_id);
create unique index if not exists credit_transactions_stripe_session_id_unique ON public.credit_transactions USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);
create unique index if not exists vocabulary_items_book_translation_unique_idx ON public.vocabulary_items USING btree (user_id, book_translation_id) WHERE (book_translation_id IS NOT NULL);

-- Funciones
create or replace FUNCTION public.book_translations_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

create or replace FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;


-- Triggers
drop trigger if exists book_translations_set_updated_at on public.book_translations;
CREATE TRIGGER book_translations_set_updated_at BEFORE UPDATE ON public.book_translations FOR EACH ROW EXECUTE FUNCTION book_translations_set_updated_at();

-- Row Level Security
alter table public.anki_exports enable row level security;
alter table public.book_translations enable row level security;
alter table public.books enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.reading_progress enable row level security;
alter table public.user_credits enable row level security;
alter table public.user_onboarding enable row level security;
alter table public.vocabulary_items enable row level security;

-- Policies
drop policy if exists "anki_exports_delete_own" on public.anki_exports;
create policy "anki_exports_delete_own"
  on public.anki_exports
  for delete
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "anki_exports_insert_own" on public.anki_exports;
create policy "anki_exports_insert_own"
  on public.anki_exports
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "anki_exports_select_own" on public.anki_exports;
create policy "anki_exports_select_own"
  on public.anki_exports
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "book_translations_delete_own" on public.book_translations;
create policy "book_translations_delete_own"
  on public.book_translations
  for delete
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "book_translations_insert_own" on public.book_translations;
create policy "book_translations_insert_own"
  on public.book_translations
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "book_translations_select_own" on public.book_translations;
create policy "book_translations_select_own"
  on public.book_translations
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "book_translations_update_own" on public.book_translations;
create policy "book_translations_update_own"
  on public.book_translations
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own"
  on public.books
  for delete
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own"
  on public.books
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "books_select_own" on public.books;
create policy "books_select_own"
  on public.books
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "books_update_own" on public.books;
create policy "books_update_own"
  on public.books
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
drop policy if exists "credit_transactions_insert_own" on public.credit_transactions;
create policy "credit_transactions_insert_own"
  on public.credit_transactions
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own"
  on public.credit_transactions
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "reading_progress_delete_own" on public.reading_progress;
create policy "reading_progress_delete_own"
  on public.reading_progress
  for delete
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "reading_progress_insert_own" on public.reading_progress;
create policy "reading_progress_insert_own"
  on public.reading_progress
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "reading_progress_select_own" on public.reading_progress;
create policy "reading_progress_select_own"
  on public.reading_progress
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "reading_progress_update_own" on public.reading_progress;
create policy "reading_progress_update_own"
  on public.reading_progress
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
drop policy if exists "user_credits_insert_own" on public.user_credits;
create policy "user_credits_insert_own"
  on public.user_credits
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "user_credits_update_own" on public.user_credits;
create policy "user_credits_update_own"
  on public.user_credits
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
drop policy if exists "user_onboarding_insert_own" on public.user_onboarding;
create policy "user_onboarding_insert_own"
  on public.user_onboarding
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "user_onboarding_select_own" on public.user_onboarding;
create policy "user_onboarding_select_own"
  on public.user_onboarding
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "user_onboarding_update_own" on public.user_onboarding;
create policy "user_onboarding_update_own"
  on public.user_onboarding
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
drop policy if exists "vocabulary_items_delete_own" on public.vocabulary_items;
create policy "vocabulary_items_delete_own"
  on public.vocabulary_items
  for delete
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "vocabulary_items_insert_own" on public.vocabulary_items;
create policy "vocabulary_items_insert_own"
  on public.vocabulary_items
  for insert
  to authenticated
  with check ((auth.uid() = user_id));
drop policy if exists "vocabulary_items_select_own" on public.vocabulary_items;
create policy "vocabulary_items_select_own"
  on public.vocabulary_items
  for select
  to authenticated
  using ((auth.uid() = user_id));
drop policy if exists "vocabulary_items_update_own" on public.vocabulary_items;
create policy "vocabulary_items_update_own"
  on public.vocabulary_items
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

-- Permisos por rol
grant delete, insert, references, select, trigger, truncate on public.anki_exports to authenticated;
grant references, trigger, truncate on public.anki_exports to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.book_translations to authenticated;
grant references, trigger, truncate on public.book_translations to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.books to authenticated;
grant references, trigger, truncate on public.books to service_role;
grant insert, references, select, trigger, truncate on public.credit_transactions to authenticated;
grant insert, references, select, trigger, truncate on public.credit_transactions to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.reading_progress to authenticated;
grant references, trigger, truncate on public.reading_progress to service_role;
grant insert, references, select, trigger, truncate, update on public.user_credits to authenticated;
grant insert, references, select, trigger, truncate, update on public.user_credits to service_role;
grant insert, references, select, trigger, truncate, update on public.user_onboarding to authenticated;
grant references, trigger, truncate on public.user_onboarding to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.vocabulary_items to authenticated;
grant references, trigger, truncate on public.vocabulary_items to service_role;
