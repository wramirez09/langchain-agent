-- `match_documents` read the wrong table.
--
-- Both retrieval routes construct a SupabaseVectorStore with
-- `tableName: "documents", queryName: "match_documents"`, but the deployed
-- function selected FROM public.evolent_pdfs_prod and ignored its `filter`
-- argument entirely. So the ingest write path and the retrieval read path were
-- disconnected -- uploads went into a write-only void, which is why
-- `documents` was empty when the tenant column was added -- and retrieval
-- returned vendor guideline PDFs regardless of what was asked or by whom.
--
-- It now reads the embeddings in public.documents and REQUIRES an owner. The
-- server talks to Postgres with the service-role key and bypasses RLS, so the
-- policies on the table are not what protects this: refusing to run without
-- `filter.user_id` is. A caller that forgets gets an error, not everyone's rows.
--
-- `search_path` names `extensions` as well as `public`. Pinning it to `public`
-- alone satisfies the function_search_path_mutable lint but hides pgvector's
-- `<=>` operator, and every call fails with
-- "operator does not exist: extensions.vector <=> extensions.vector".

create or replace function public.match_documents(
  filter jsonb,
  match_count integer,
  query_embedding vector default null
)
returns table (
  id text,
  content text,
  metadata jsonb,
  similarity double precision
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  owner uuid;
  rest jsonb;
begin
  owner := nullif(filter ->> 'user_id', '')::uuid;
  if owner is null then
    raise exception 'match_documents requires filter.user_id'
      using hint = 'Pass the caller''s user id so results stay scoped to them.';
  end if;

  if query_embedding is null then
    raise exception 'match_documents requires query_embedding';
  end if;

  -- Any remaining keys keep LangChain's metadata-containment semantics.
  rest := filter - 'user_id';

  return query
    select
      d.id::text,
      d.content,
      d.metadata,
      1 - (d.embedding <=> query_embedding) as similarity
    from public.documents d
    where d.user_id = owner
      and (rest = '{}'::jsonb or d.metadata @> rest)
    order by d.embedding <=> query_embedding
    limit match_count;
end;
$$;
