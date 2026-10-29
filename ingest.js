/**
 * Chunk movies.txt, embed each chunk, and store the vectors in Supabase.
 *
 *   npm run ingest
 *
 * Requires supabase/schema.sql to have been run in the Supabase dashboard
 * first — without it there is no `documents` table to write to.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { chunkMovies } from './chunk.js'

const here = dirname(fileURLToPath(import.meta.url))

const {
  OPENAI_API_KEY,
  EMBED_MODEL = 'openai/text-embedding-3-small',
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
} = process.env

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is missing — run this via `npm run ingest` so .env is loaded.')
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing from .env.')
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/** Never let a stalled request hang the script silently. */
function withTimeout(promise, label, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s.`)), ms).unref()
    ),
  ])
}

const chunks = chunkMovies(readFileSync(join(here, 'movies.txt'), 'utf8'))
console.log(`Chunked movies.txt into ${chunks.length} documents.`)

// Check the table is there before spending an embedding call on it.
const { error: tableError } = await withTimeout(
  supabase.from('documents').select('id').limit(1),
  'Supabase connection'
)
if (tableError) {
  throw new Error(
    `Cannot reach the documents table: ${tableError.message}\n\n` +
      'Run supabase/schema.sql in the Supabase dashboard first:\n' +
      '  SQL Editor → New query → paste the file → Run'
  )
}

const { data } = await openai.embeddings.create({
  model: EMBED_MODEL,
  input: chunks.map(c => c.text),
})
console.log(`Embedded ${data.length} chunks (${data[0].embedding.length} dimensions).`)

// Replace rather than append, so re-running after editing movies.txt doesn't
// leave stale chunks behind to be retrieved.
const { error: deleteError } = await withTimeout(
  supabase.from('documents').delete().gte('id', 0),
  'Clearing old documents'
)
if (deleteError) throw new Error(`Could not clear the documents table: ${deleteError.message}`)

const { error: insertError } = await withTimeout(
  supabase.from('documents').insert(
    chunks.map((chunk, i) => ({ content: chunk.text, embedding: data[i].embedding }))
  ),
  'Insert'
)
if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

console.log(`Stored ${chunks.length} documents in Supabase. PopChoice will now use hosted vector search.`)
