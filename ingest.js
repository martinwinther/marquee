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
import { createClient } from '@supabase/supabase-js'
import { chunkMovies } from './chunk.js'

/**
 * Embeddings go over plain fetch rather than the `openai` SDK on purpose.
 * openai@4.12.3 polyfills the global Headers/Request classes on import, and
 * supabase-js then builds requests the native fetch won't complete — every
 * query hangs until it times out. One POST isn't worth the clash. (The browser
 * has real globals, so config.js can keep using the SDK.)
 */
async function embed(input, { apiKey, model }) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  })
  if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`)
  const { data } = await res.json()
  return data.map(d => d.embedding)
}

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Guard against a stalled request — and keep the process alive meanwhile.
 * supabase-js's fetch doesn't hold Node's event loop open on its own, so
 * without a referenced timer here Node exits before the reply arrives and
 * reports an "unsettled top-level await" instead of the result.
 */
function withTimeout(promise, label, ms = 20000) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s.`)), ms)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
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

const vectors = await embed(chunks.map(c => c.text), {
  apiKey: OPENAI_API_KEY,
  model: EMBED_MODEL,
})
console.log(`Embedded ${vectors.length} chunks (${vectors[0].length} dimensions).`)

// Replace rather than append, so re-running after editing movies.txt doesn't
// leave stale chunks behind to be retrieved.
const { error: deleteError } = await withTimeout(
  supabase.from('documents').delete().gte('id', 0),
  'Clearing old documents'
)
if (deleteError) throw new Error(`Could not clear the documents table: ${deleteError.message}`)

const { error: insertError } = await withTimeout(
  supabase.from('documents').insert(
    chunks.map((chunk, i) => ({ content: chunk.text, embedding: vectors[i] }))
  ),
  'Insert'
)
if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

console.log(`Stored ${chunks.length} documents in Supabase. Marquee will now use hosted vector search.`)
