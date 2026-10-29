/**
 * movies.txt holds one movie per blank-line-separated block:
 *
 *   Oppenheimer: 2023 | R | 3h | 8.6 rating
 *   'Oppenheimer' is an epic biographical drama film about…
 *
 * Each block is small and self-contained, so a block is our chunk — splitting
 * finer would cut a plot summary in half and make the embeddings mushy.
 *
 * Kept free of imports so both the browser (movies.js) and the Node ingest
 * script can use it without either pulling in the other's dependencies.
 */

// Greedy `.*` so titles containing a colon ("Top Gun: Maverick") keep it.
const HEADER = /^(.*):\s*(\d{4})\s*\|\s*(.*)$/

export function chunkMovies(raw) {
  return raw
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const [header, ...body] = block.split('\n')
      const match = header.match(HEADER)
      return {
        id: index,
        title: match ? match[1].trim() : header.trim(),
        year: match ? match[2] : '',
        meta: match ? match[3].trim() : '',
        body: body.join(' ').trim(),
        text: block,
      }
    })
}
