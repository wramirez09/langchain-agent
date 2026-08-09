-- Return `procedures` from search_commercial_guidelines.
--
-- The artifact code backfill (lib/priorAuth/backfillCodes.ts) fills empty
-- CPT / ICD-10 lists from the top-ranked document's code arrays. Those arrays
-- are every code the document MENTIONS — for a per-procedure policy that is a
-- tight family, but for a broad catalog it is a grab-bag spanning unrelated
-- procedures, and filling from one turns a visibly incomplete answer into a
-- confidently wrong one. So the backfill needs to tell the two apart.
--
-- Code count cannot do it. Measured on this table: "Permanent Pacemaker
-- Implantation" carries 39 CPT and is about exactly one procedure, while
-- "Musculoskeletal Surgery Guidelines" carries 32 and is a catalog of thirty.
-- No threshold separates them.
--
-- `procedures` does. A focused document's list is a synonym set for a single
-- procedure (Cervical Laminectomy: 7, all cervical decompression variants;
-- Permanent Pacemaker: 8, all pacemaker variants), while a catalog's is a list
-- of distinct ones (Spine Surgery: 16, Large Joint Surgery: 26, MSK Surgery
-- Guidelines: 30). It also lets the backfill check that the request names a
-- procedure the document actually covers, which the title alone cannot do.
--
-- The column is already read inside the function for `proc_boost`; this only
-- adds it to the result. Ranking, scoring and the argument list are unchanged.
--
-- The return table changes shape, so the function must be dropped and
-- recreated — `create or replace` cannot alter a RETURNS TABLE signature.

drop function if exists public.search_commercial_guidelines(
  text, extensions.vector, text[], text[], text, int
);

create function public.search_commercial_guidelines(
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
  procedures   text[],
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
set search_path to 'public', 'extensions'
as $function$
  with q as (
    select nullif((
      select string_agg(distinct t, ' | ')
      from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(q_text, ''), '[^a-zA-Z0-9]+', ' ', 'g')), '\s+')) as t
      where length(t) > 2
    ), '') as or_terms
  ),
  scored as (
    select
      g.id, g.title, g.domain, g.treatment, g.procedures, g.cpt_codes, g.icd10_codes, g.body,
      case when (select or_terms from q) is null then 0
           else ts_rank_cd(g.tsv, to_tsquery('english', (select or_terms from q)), 32) end as lex,
      case when q_embedding is null then 0 else 1 - (g.embedding <=> q_embedding) end as sem,
      case when cardinality(q_cpt) > 0 and g.cpt_codes && q_cpt then 10.0 else 0 end as cpt_boost,
      case when cardinality(q_icd10) > 0 and g.icd10_codes && q_icd10 then 10.0 else 0 end as icd_boost,
      case when q_domain is not null and g.domain = q_domain then 2.0 else 0 end as dom_boost,
      case when exists (
        select 1 from unnest(coalesce(g.procedures, '{}') || coalesce(g.aliases, '{}')) as p
        where length(p) > 3 and lower(coalesce(q_text, '')) like '%' || lower(p) || '%'
      ) then 5.0 else 0 end as proc_boost
    from public.commercial_guidelines g
    where (q_domain is null or g.domain = q_domain) and g.embedding is not null
  )
  select
    id, title, domain, treatment, procedures, cpt_codes, icd10_codes,
    left(body, 500) as excerpt,
    body,
    (lex * 4 + sem * 6 + cpt_boost + icd_boost + dom_boost + proc_boost)::double precision as score,
    jsonb_build_object('lex', lex, 'sem', sem, 'cpt', cpt_boost, 'icd', icd_boost, 'dom', dom_boost, 'proc', proc_boost) as signals
  from scored
  where lex > 0 or sem > 0.55 or (cpt_boost + icd_boost + proc_boost) > 0
  order by score desc
  limit greatest(coalesce(max_results, 8), 1);
$function$;

-- The dropped function carried an explicit ACL (anon / authenticated /
-- service_role); a freshly created one does not inherit it. `create function`
-- also grants EXECUTE to PUBLIC by default, which the original did NOT have —
-- revoke it so a SECURITY DEFINER function stays reachable only by the roles
-- that held it before.
revoke execute on function public.search_commercial_guidelines(
  text, extensions.vector, text[], text[], text, int
) from public;

grant execute on function public.search_commercial_guidelines(
  text, extensions.vector, text[], text[], text, int
) to anon, authenticated, service_role;
