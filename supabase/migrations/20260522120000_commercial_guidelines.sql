-- Commercial guideline corpus moves out of app/api/data/*.md and into a
-- Postgres-backed hybrid search index: tsvector for lexical, pgvector
-- (HNSW, cosine) for semantic, GIN on text[] for exact code matches.
-- A single RPC returns a ranked list combining all three signals.

create extension if not exists vector;

create table public.commercial_guidelines (
  id                  text primary key,                 -- slug derived from file path
  title               text not null,
  domain              text,                             -- cardio | imaging | oncology | ...
  treatment           text,
  body                text not null,
  cpt_codes           text[] not null default '{}',
  icd10_codes         text[] not null default '{}',
  specialty           text[] not null default '{}',
  procedures          text[] not null default '{}',
  aliases             text[] not null default '{}',
  related_conditions  text[] not null default '{}',
  payer_notes         jsonb,
  priority            text,                             -- high | medium | low
  source_path         text,                             -- debug-only; never returned to LLM
  -- tsv is maintained by a trigger (not GENERATED) because to_tsvector with
  -- a named config is technically not IMMUTABLE in Postgres, which the
  -- generated-column machinery rejects.
  tsv                 tsvector,
  embedding           extensions.vector(1536),                     -- text-embedding-3-small
  updated_at          timestamptz not null default now()
);

-- Build the weighted tsvector on every insert/update.
create or replace function public.commercial_guidelines_refresh_tsv()
returns trigger language plpgsql as $$
begin
  new.tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.treatment, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(new.procedures, ' ')), 'B') ||
    setweight(to_tsvector('english', array_to_string(new.aliases, ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(new.specialty, ' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'D');
  return new;
end;
$$;

create trigger commercial_guidelines_refresh_tsv
  before insert or update of title, treatment, procedures, aliases, specialty, body
  on public.commercial_guidelines
  for each row execute function public.commercial_guidelines_refresh_tsv();

-- Lexical
create index commercial_guidelines_tsv_idx
  on public.commercial_guidelines using gin (tsv);

-- Code-array exact-match (drives &&, @>, <@ operators)
create index commercial_guidelines_cpt_idx
  on public.commercial_guidelines using gin (cpt_codes array_ops);
create index commercial_guidelines_icd_idx
  on public.commercial_guidelines using gin (icd10_codes array_ops);

-- Domain pre-filter (partial — most rows have a domain set)
create index commercial_guidelines_domain_idx
  on public.commercial_guidelines (domain) where domain is not null;

-- ANN over embeddings. Operator class MUST match the <=> operator in the
-- search RPC; mismatched ops silently skip the index.
create index commercial_guidelines_embedding_idx
  on public.commercial_guidelines using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Touch updated_at on row write
create or replace function public.commercial_guidelines_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger commercial_guidelines_set_updated_at
  before update on public.commercial_guidelines
  for each row execute function public.commercial_guidelines_set_updated_at();

-- This is a read-only catalog ingested from a developer script using the
-- service role. Lock down direct anon/authenticated access; the agent
-- tools call the RPC below (which is `security definer`).
alter table public.commercial_guidelines enable row level security;
-- No policies = no access for anon/authenticated. Service role bypasses RLS.

-- ---------- Search RPC ----------
--
-- Hybrid score:
--   score = 4 * lex                                       -- ts_rank_cd
--         + 6 * sem                                       -- 1 - cosine distance
--         + 10 (if any input CPT matches via &&)
--         + 10 (if any input ICD-10 matches via &&)
--         +  2 (if domain matches)
--
-- The (lex, sem, cpt, icd) signals are returned as jsonb so callers can
-- debug ranking decisions without re-running the query.
create or replace function public.search_commercial_guidelines(
  q_text       text,
  q_embedding  extensions.vector(1536),
  q_cpt        text[] default '{}',
  q_icd10      text[] default '{}',
  q_domain     text   default null,
  max_results  int    default 8
)
returns table (
  id           text,
  title        text,
  domain       text,
  treatment    text,
  cpt_codes    text[],
  icd10_codes  text[],
  excerpt      text,
  body         text,
  score        double precision,
  signals      jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scored as (
    select
      g.id,
      g.title,
      g.domain,
      g.treatment,
      g.cpt_codes,
      g.icd10_codes,
      g.body,
      ts_rank_cd(g.tsv, websearch_to_tsquery('english', coalesce(q_text, '')))                     as lex,
      case when q_embedding is null then 0
           else 1 - (g.embedding <=> q_embedding) end                                               as sem,
      case when cardinality(q_cpt)   > 0 and g.cpt_codes   && q_cpt   then 10.0 else 0 end          as cpt_boost,
      case when cardinality(q_icd10) > 0 and g.icd10_codes && q_icd10 then 10.0 else 0 end          as icd_boost,
      case when q_domain is not null and g.domain = q_domain then 2.0 else 0 end                    as dom_boost
    from public.commercial_guidelines g
    where (q_domain is null or g.domain = q_domain)
      and g.embedding is not null
  )
  select
    id,
    title,
    domain,
    treatment,
    cpt_codes,
    icd10_codes,
    left(body, 500) as excerpt,
    body,
    (lex * 4 + sem * 6 + cpt_boost + icd_boost + dom_boost)::double precision as score,
    jsonb_build_object(
      'lex', lex,
      'sem', sem,
      'cpt', cpt_boost,
      'icd', icd_boost,
      'dom', dom_boost
    ) as signals
  from scored
  where lex > 0 or sem > 0.55 or (cpt_boost + icd_boost) > 0
  order by score desc
  limit greatest(coalesce(max_results, 8), 1);
$$;

-- The RPC is `security definer`, so anon/authenticated can call it even
-- though the underlying table is locked down.
revoke all on function public.search_commercial_guidelines(text, extensions.vector, text[], text[], text, int) from public;
grant execute on function public.search_commercial_guidelines(text, extensions.vector, text[], text[], text, int)
  to anon, authenticated, service_role;
