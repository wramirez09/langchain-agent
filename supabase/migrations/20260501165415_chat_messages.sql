-- Persisted chat history. Survives mobile app backgrounding and durable
-- across sessions. Each row is one message; conversations are grouped by
-- thread_id.

create table public.chat_messages (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  thread_id           uuid not null,
  role                text not null check (role in ('user', 'assistant')),
  content             text not null,
  status              text not null default 'complete'
                        check (status in ('streaming', 'complete', 'partial', 'error')),
  is_thread_starter   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index chat_messages_thread_idx
  on public.chat_messages (user_id, thread_id, created_at);

create index chat_messages_user_recent_idx
  on public.chat_messages (user_id, created_at desc);

-- Partial index for the future "previous queries" feature: only thread
-- starters that are user messages, ordered by recency.
create index chat_messages_starters_idx
  on public.chat_messages (user_id, created_at desc)
  where is_thread_starter = true and role = 'user';

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger chat_messages_set_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

alter table public.chat_messages enable row level security;

create policy "users read own messages" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "users insert own messages" on public.chat_messages
  for insert with check (auth.uid() = user_id);
create policy "users update own messages" on public.chat_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own messages" on public.chat_messages
  for delete using (auth.uid() = user_id);

comment on table public.chat_messages is
  'Persisted chat history. Survives mobile app backgrounding and durable across sessions.';
comment on column public.chat_messages.thread_id is
  'Groups messages in a single conversation. Generated client-side as a uuid.';
comment on column public.chat_messages.status is
  'streaming = assistant row being written; complete = final; partial = stream interrupted server-side; error = agent failed.';
comment on column public.chat_messages.is_thread_starter is
  'True for the first user message of each thread. Powers "previous queries" history view via partial index.';
