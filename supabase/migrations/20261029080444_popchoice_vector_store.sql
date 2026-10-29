-- PopChoice vector store.
-- Applied with: supabase db push   (or paste into the dashboard SQL editor)
-- Populate it afterwards with: npm run ingest

create extension if not exists vector;

create table if not exists documents (
  id        bigserial primary key,
  content   text not null,
  embedding vector(1536)   -- matches openai/text-embedding-3-small
);

-- Similarity search over the chunks. Returns the closest rows first.
-- `<=>` is pgvector's cosine distance, so 1 - distance is cosine similarity.
create or replace function match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (id bigint, content text, similarity float)
language sql stable
as $$
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;

-- movies.txt is a dozen rows, so Postgres scans them exactly in well under a
-- millisecond. An ivfflat/hnsw index would only start paying off in the
-- thousands of rows, and on a set this small it actually hurts recall.

-- The browser talks to this table with the publishable (anon) key, so RLS has
-- to allow anon access. The data is a public movie catalogue and nothing here
-- is user-specific, so wide-open policies are acceptable. Do not copy this
-- pattern onto a table that holds anything private.
alter table documents enable row level security;

drop policy if exists "popchoice read"   on documents;
drop policy if exists "popchoice insert" on documents;
drop policy if exists "popchoice delete" on documents;

create policy "popchoice read"   on documents for select to anon, authenticated using (true);
create policy "popchoice insert" on documents for insert to anon, authenticated with check (true);
create policy "popchoice delete" on documents for delete to anon, authenticated using (true);
