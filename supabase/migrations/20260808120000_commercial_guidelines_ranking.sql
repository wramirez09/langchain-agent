-- Ranking repair for search_commercial_guidelines.
--
-- Two defects made a cervical-laminectomy request return "Lumbar Laminectomy"
-- as its top match:
--
-- 1. Lexical rank was always 0. `websearch_to_tsquery` ANDs every term, and the
--    caller concatenates query + treatment + diagnosis, so the tsquery was a
--    long conjunction no document could satisfy. With lex pinned at 0 the score
--    reduced to cosine similarity alone, which cannot tell cervical from lumbar
--    (the documents are near-identical in shape).
--
-- 2. Nothing rewarded an exact procedure match. CPT and ICD-10 had +10 boosts,
--    but `procedures` and `aliases` — the columns that carry "cervical
--    laminectomy", "laminoplasty", "posterior cervical decompression" — were
--    indexed into the tsvector and then never given a decisive signal.
--
-- Fixes: an OR-of-lexemes tsquery (normalized to [0,1) so lex and sem stay
-- comparable), and a +5 boost when the query names one of the document's
-- procedures or aliases. Signature and result columns are unchanged.

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
  with q as (
    select
      -- OR of the query's lexemes. Terms are stripped to [a-z0-9] before they
      -- reach to_tsquery, so no query text can inject tsquery operators.
      nullif(
        (
          select string_agg(distinct t, ' | ')
          from unnest(
            regexp_split_to_array(
              lower(regexp_replace(coalesce(q_text, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
              '\s+'
            )
          ) as t
          where length(t) > 2
        ),
        ''
      ) as or_terms
  ),
  scored as (
    select
      g.id,
      g.title,
      g.domain,
      g.treatment,
      g.cpt_codes,
      g.icd10_codes,
      g.body,
      -- Normalization flag 32 maps ts_rank_cd to rank/(rank+1), i.e. [0,1),
      -- so a lexical hit is on the same scale as cosine similarity and the
      -- weights below mean what they say.
      case
        when (select or_terms from q) is null then 0
        else ts_rank_cd(g.tsv, to_tsquery('english', (select or_terms from q)), 32)
      end                                                                                as lex,
      case when q_embedding is null then 0
           else 1 - (g.embedding <=> q_embedding) end                                     as sem,
      case when cardinality(q_cpt)   > 0 and g.cpt_codes   && q_cpt   then 10.0 else 0 end as cpt_boost,
      case when cardinality(q_icd10) > 0 and g.icd10_codes && q_icd10 then 10.0 else 0 end as icd_boost,
      case when q_domain is not null and g.domain = q_domain then 2.0 else 0 end           as dom_boost,
      -- The query naming one of this document's procedures or aliases is the
      -- strongest non-code signal there is: it is the document for that
      -- procedure. Ranked below an exact code match, above everything else.
      case when exists (
        select 1
        from unnest(coalesce(g.procedures, '{}') || coalesce(g.aliases, '{}')) as p
        where length(p) > 3
          and lower(coalesce(q_text, '')) like '%' || lower(p) || '%'
      ) then 5.0 else 0 end                                                               as proc_boost
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
    (lex * 4 + sem * 6 + cpt_boost + icd_boost + dom_boost + proc_boost)::double precision as score,
    jsonb_build_object(
      'lex', lex,
      'sem', sem,
      'cpt', cpt_boost,
      'icd', icd_boost,
      'dom', dom_boost,
      'proc', proc_boost
    ) as signals
  from scored
  where lex > 0 or sem > 0.55 or (cpt_boost + icd_boost + proc_boost) > 0
  order by score desc
  limit greatest(coalesce(max_results, 8), 1);
$$;

revoke all on function public.search_commercial_guidelines(text, extensions.vector, text[], text[], text, int) from public;
grant execute on function public.search_commercial_guidelines(text, extensions.vector, text[], text[], text, int)
  to anon, authenticated, service_role;
