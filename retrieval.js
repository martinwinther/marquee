import { openai, supabase } from './config.js'
import { chunks } from './movies.js'

const EMBED_MODEL = process.env.EMBED_MODEL || 'openai/text-embedding-3-small'

/** Embed one or more strings. The API takes a batch, so 12 chunks cost 1 call. */
export async function embed(input) {
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input })
  return res.data.map(d => d.embedding)
}

/**
 * Chunk vectors are identical for every search, so embed them once per page
 * load. Caching the promise (not the result) means concurrent callers share
 * the same in-flight request instead of each firing their own.
 */
let chunkVectors = null
function getChunkVectors() {
  if (!chunkVectors) {
    chunkVectors = embed(chunks.map(c => c.text)).catch(err => {
      chunkVectors = null // let a later attempt retry rather than cache the failure
      throw err
    })
  }
  return chunkVectors
}

function cosine(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom ? dot / denom : 0
}

/**
 * Hosted vector search. Returns null — rather than throwing — whenever the
 * Supabase side isn't usable, so retrieve() can fall back silently. The schema
 * lives in supabase/schema.sql; until that has been run there is no
 * match_documents function and every call lands here as null.
 */
let supabaseUsable = true

async function searchSupabase(queryVector, k) {
  if (!supabase || !supabaseUsable) return null
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryVector,
      match_threshold: 0.2,
      match_count: k,
    })
    if (error || !Array.isArray(data) || data.length === 0) {
      // Missing schema or empty table won't fix itself mid-session; stop
      // retrying so we don't log a 404 on every single search.
      supabaseUsable = false
      return null
    }
    return data.map(row => row.content).filter(Boolean)
  } catch {
    supabaseUsable = false
    return null
  }
}

/**
 * Find the movie chunks closest to the group's taste. Prefers the Supabase
 * pgvector index; falls back to scoring the same chunks in the browser, which
 * keeps the app working before the schema has been provisioned.
 */
export async function retrieve(query, k = 5) {
  const [queryVector] = await embed([query])

  const hosted = await searchSupabase(queryVector, k)
  if (hosted) return { source: 'supabase', passages: hosted }

  const vectors = await getChunkVectors()
  const passages = chunks
    .map((chunk, i) => ({ chunk, score: cosine(queryVector, vectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(hit => hit.chunk.text)

  return { source: 'local', passages }
}
