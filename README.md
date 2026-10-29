# Marquee

*what we're watching tonight*

Four questions, three picks, done. Marquee is a decision-ender for the moment a
group is twenty minutes into scrolling and still hasn't started a film. Everyone
answers in turn, their answers are matched against a catalogue by meaning rather
than keyword, and a model picks three films that suit the whole room.

## Running it

```
npm install
npm start
```

Create a `.env` next to `package.json` — `.env.example` lists every variable:

```
OPENAI_API_KEY=sk-or-v1-...                  # an OpenRouter key
OPENAI_MODEL=openai/gpt-4o-mini              # must return plain text, not reasoning-only
EMBED_MODEL=openai/text-embedding-3-small    # optional, this is the default
OMDB_API=...                                 # optional, poster art

NEXT_PUBLIC_SUPABASE_URL=...                 # optional, see below
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`OPENAI_MODEL` has to be a model that replies with ordinary message content.
OpenRouter's `openrouter/free` auto-router is a bad choice: it often lands on a
reasoning model that returns an empty `content`, leaving nothing to parse.

## How a recommendation is made

1. **Chunk.** `movies.txt` is split one film per block. Each block is small and
   self-contained, so a block is the chunk — splitting finer would cut a plot
   summary in half and blur the embedding.
2. **Embed.** Every chunk becomes a 1536-dimension vector, once.
3. **Retrieve.** The group's answers are embedded as a single query and the
   closest chunks come back. This is semantic, not keyword — *"scary robot
   doll"* finds M3GAN, *"clever whodunnit"* finds Glass Onion.
4. **Recommend.** Only those chunks reach the model, which may recommend
   nothing outside them. That keeps the picks inside the catalogue and the
   prompt small.

Search runs against Supabase's pgvector index when the `documents` table is
reachable, and scores the same chunks in the browser when it isn't — so a fresh
clone works with no database at all.

## The database (optional)

```
supabase link --project-ref <your-ref>
supabase db push     # applies supabase/migrations/
npm run ingest       # chunks movies.txt, embeds it, stores the vectors
```

No database password is needed; the CLI provisions a temporary role. Without
the CLI, paste the migration from `supabase/migrations/` into the dashboard SQL
editor, then run `npm run ingest`. Re-run the ingest after editing
`movies.txt` — it replaces the stored chunks rather than adding to them.

The migration's row-level security is deliberately wide open: the browser reads
the table with the publishable key, and a public film catalogue holds nothing
private. Don't carry that pattern to a table that does.

## Design

The look is built on one idea — **lights down**. The house lights drop and the
screen becomes the only light source in the room.

- **Dark, and warm.** Projection black has warmth in it, so the greys are warm
  near-blacks rather than blue-blacks. It's also simply correct for a thing used
  on a sofa at night; there is no light theme.
- **One accent.** Projector amber, and nothing else. A saturated green or blue
  competes with poster art; amber sits with it.
- **The poster is the light source.** It carries a soft amber halo so it reads
  as lit from behind rather than pasted onto a card, and it is the only
  saturated thing on screen.
- **Type.** Fraunces, a warm editorial serif, for the wordmark and film titles;
  Inter for everything you read and tap. Small wide-tracked caps borrowed from
  credit blocks carry the step — `NOW SHOWING`, `PERSON 2 OF 4`.
- **Texture.** Fine film grain and a soft vignette. Motion is restrained and
  respects `prefers-reduced-motion`.

Tokens live at the top of `index.css`.

## Layout

| | |
|---|---|
| `App.jsx` | every screen and the recommendation flow |
| `index.css` | the design system |
| `chunk.js` | splits `movies.txt`; no imports, so browser and Node share it |
| `movies.js` | the chunks, for the browser |
| `retrieval.js` | embedding, pgvector search, in-browser fallback |
| `ingest.js` | one-off: chunk, embed, store in Supabase |
| `config.js` | OpenRouter and Supabase clients |

One wrinkle worth knowing: `ingest.js` deliberately avoids the `openai` SDK.
Importing it polyfills the global `Headers`/`Request` classes, after which
`supabase-js` builds requests that native fetch never completes and every query
hangs. The browser has real globals, so `config.js` still uses the SDK.

Built on the [Scrimba AI Engineer Path](https://scrimba.com/ai-engineer-path-c02v).
