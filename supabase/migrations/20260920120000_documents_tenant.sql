-- Tenant column for the `documents` vector store.
--
-- `documents` was created out-of-band from the LangChain starter SQL and has
-- never had a migration in this repo, which is why it drifted: no tenant
-- column, and a `SELECT ... USING (true)` policy granted to `public`, so every
-- row was readable by every user.
--
-- It was empty when this ran (0 rows), which is the only reason `user_id` can
-- be added NOT NULL with no backfill and no purge. Worth knowing why it was
-- empty: `match_documents` -- the function both retrieval routes call -- reads
-- `public.evolent_pdfs_prod`, not this table, and ignores its `filter`
-- argument entirely. So the ingest write path and the retrieval read path are
-- disconnected, and uploads have been going into a write-only void. That is a
-- separate bug; this migration only makes the table safe to write to.
--
-- The server talks to Postgres with the service-role key and bypasses RLS, so
-- the policies below are defence in depth rather than the primary control. The
-- primary control is the NOT NULL column plus the trigger: an insert that
-- carries no owner fails outright instead of silently landing in a namespace
-- everyone can read.

alter table public.documents
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists documents_user_id_idx on public.documents (user_id);

-- `SupabaseVectorStore.addDocuments` only ever writes content/embedding/
-- metadata -- it has no concept of extra columns -- so the owner arrives as
-- `metadata.user_id` and is lifted into the real column here. Doing that in a
-- trigger rather than patching the insert path means a future caller that
-- forgets cannot create an untenanted row.
create or replace function public.documents_set_user_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := nullif(new.metadata ->> 'user_id', '')::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_set_user_id_trg on public.documents;
create trigger documents_set_user_id_trg
  before insert or update on public.documents
  for each row execute function public.documents_set_user_id();

alter table public.documents alter column user_id set not null;

drop policy if exists "Enable read access for all users" on public.documents;

create policy documents_select_own on public.documents
  for select to authenticated using (user_id = auth.uid());

create policy documents_insert_own on public.documents
  for insert to authenticated with check (user_id = auth.uid());

create policy documents_update_own on public.documents
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy documents_delete_own on public.documents
  for delete to authenticated using (user_id = auth.uid());
