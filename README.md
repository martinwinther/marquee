# PopChoice

Answer a few questions and get a movie recommendation the whole group can agree on.

## Getting Started
Install the dependencies and run the project
```
npm install
npm start
```

Create a `.env` alongside `package.json`:

```
OPENAI_API_KEY=sk-or-v1-...                  # an OpenRouter key
OPENAI_MODEL=openai/gpt-4o-mini              # must return plain text, not reasoning-only
EMBED_MODEL=openai/text-embedding-3-small    # optional, this is the default
OMDB_API=...                                 # optional, used for poster art

NEXT_PUBLIC_SUPABASE_URL=...                 # optional, see below
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`OPENAI_MODEL` must be a model that replies with ordinary message content.
OpenRouter's `openrouter/free` auto-router is a bad choice here: it often picks
a reasoning model that returns an empty `content`.

## How recommendations work

`movies.txt` is split into one chunk per film, each chunk is embedded, and the
group's answers are embedded too. The closest chunks are the only candidates
the model is allowed to recommend from.

The search runs against Supabase's pgvector index when the `documents` table is
reachable, and falls back to scoring the same chunks in the browser when it
isn't — so a fresh clone works with no database at all.

To set the database up on another project:

```
supabase link --project-ref <your-ref>
supabase db push     # applies supabase/migrations/
npm run ingest       # chunks movies.txt, embeds it, stores the vectors
```

No database password is needed; the CLI provisions a temporary role. Without
the CLI, paste the migration in `supabase/migrations/` into the dashboard SQL
editor and then run `npm run ingest`.

Re-run `npm run ingest` after editing `movies.txt` — it replaces the stored
chunks rather than adding to them.

Head over to https://vitejs.dev/ to learn more about configuring vite
## About Scrimba

At Scrimba our goal is to create the best possible coding school at the cost of a gym membership! 💜
If we succeed with this, it will give anyone who wants to become a software developer a realistic shot at succeeding, regardless of where they live and the size of their wallets 🎉
The Fullstack Developer Path aims to teach you everything you need to become a Junior Developer, or you could go further with one of our advanced courses 🚀

- [Our courses](https://scrimba.com/courses)
- [The Frontend Career Path](https://scrimba.com/fullstack-path-c0fullstack)
- [Become a Scrimba Pro member](https://scrimba.com/pricing)

Happy Coding!