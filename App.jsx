import { useState } from 'react'
import { openai } from './config.js'
import { retrieve } from './retrieval.js'

const MODEL = process.env.OPENAI_MODEL || 'openai/gpt-4o-mini'
const MAX_PARTY = 6

const QUESTIONS = [
  {
    id: 'favorite',
    type: 'text',
    label: "What's your favorite movie and why?",
    placeholder:
      'The Shawshank Redemption\nBecause it taught me to never give up hope no matter how hard life gets',
  },
  {
    id: 'era',
    type: 'choice',
    label: 'Are you in the mood for something new or a classic?',
    options: ['New', 'Classic'],
  },
  {
    id: 'mood',
    type: 'choice',
    label: 'What are you in the mood for?',
    options: ['Fun', 'Serious', 'Inspiring', 'Scary'],
  },
  {
    id: 'companion',
    type: 'text',
    label:
      'Which famous film person would you love to be stranded on an island with and why?',
    placeholder:
      'Tom Hanks because he is really funny and can do the voice of Woody',
  },
]

const emptyAnswers = () => Object.fromEntries(QUESTIONS.map(q => [q.id, '']))

/** The sign out front: a lit board with bulbs along the bottom. */
function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="4" y="5" width="24" height="15" rx="3" />
        <path d="M10 11h12M13 15.5h6" />
      </g>
      <g fill="currentColor">
        <circle cx="8" cy="26" r="1.7" />
        <circle cx="16" cy="26" r="1.7" />
        <circle cx="24" cy="26" r="1.7" />
      </g>
    </svg>
  )
}

/** Decorative — the step is always stated in words right above it. */
function Progress({ total, index }) {
  if (total < 2) return null
  return (
    <div className="progress" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`progress-seg${i <= index ? ' on' : ''}`} />
      ))}
    </div>
  )
}

/** One string for the embedding search — every answer the group gave. */
function buildSearchQuery(party) {
  return party
    .flatMap(answers => QUESTIONS.map(q => answers[q.id]))
    .filter(Boolean)
    .join('. ')
}

function buildSystemPrompt(passages, partySize) {
  const audience =
    partySize > 1
      ? `A group of ${partySize} is picking one film to watch together. Recommend 3 movies
from the candidates below, best fit first, balancing everyone's answers — a pick
that delights one person and bores the rest is a bad pick.`
      : `Someone is picking a film to watch tonight. Recommend 3 movies from the
candidates below, best fit first.`

  return `You are Marquee, a movie recommendation assistant.

${audience}

Candidate movies:
${passages.join('\n\n')}

Rules:
- Only recommend movies from the candidates above.
- Address the viewers directly as "you". Never write "Person 1" or any other
  label from the answers — those numbers are bookkeeping, not names.
- Respond with ONLY a raw JSON array — no markdown, no code fences, no explanation.
- Format: [{"title":"Movie Title","year":"YYYY","description":"1–2 sentences on why this suits them."},...]`
}

function describeParty(party) {
  // Numbering a party of one makes the model write "Person 1's taste".
  if (party.length === 1) {
    return QUESTIONS.map(q => `${q.label}\n${party[0][q.id]}`).join('\n')
  }
  return party
    .map((answers, i) => {
      const lines = QUESTIONS.map(q => `${q.label}\n${answers[q.id]}`).join('\n')
      return `Person ${i + 1}:\n${lines}`
    })
    .join('\n\n')
}

/**
 * Models don't always honour "raw JSON only" — some wrap it in a markdown
 * fence, some add a sentence before it, and reasoning models can return a
 * null content with the answer in a separate field. Dig the array out.
 */
function parseRecommendations(message) {
  const raw = (message?.content ?? '').trim()
  if (!raw) throw new Error('the model returned an empty response')

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const sliced = candidate.slice(
    candidate.indexOf('['),
    candidate.lastIndexOf(']') + 1
  )

  let parsed
  try {
    parsed = JSON.parse(sliced || candidate)
  } catch {
    throw new Error("the model's reply wasn't valid JSON")
  }

  const list = Array.isArray(parsed) ? parsed : parsed.movies
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('the model returned no movies')
  }
  return list.filter(m => m && m.title)
}

async function fetchPoster(title, year) {
  const apiKey = process.env.OMDB_API
  if (!apiKey) return null
  try {
    const yearParam = year ? `&y=${encodeURIComponent(year)}` : ''
    const res = await fetch(
      `https://www.omdbapi.com/?t=${encodeURIComponent(title)}${yearParam}&apikey=${apiKey}`
    )
    const data = await res.json()
    return data.Poster && data.Poster !== 'N/A' ? data.Poster : null
  } catch {
    return null
  }
}

export default function App() {
  const [view, setView]         = useState('setup') // setup | questions | loading | results
  const [partySize, setPartySize] = useState(1)
  const [party, setParty]       = useState([emptyAnswers()])
  const [personIndex, setPersonIndex] = useState(0)
  const [recs, setRecs]         = useState([])
  const [recIndex, setRecIndex] = useState(0)
  const [poster, setPoster]     = useState(null)
  const [posterLoading, setPosterLoading] = useState(false)
  const [error, setError]       = useState('')

  function update(id, value) {
    setParty(prev =>
      prev.map((answers, i) =>
        i === personIndex ? { ...answers, [id]: value } : answers
      )
    )
  }

  function startQuestions() {
    setParty(Array.from({ length: partySize }, emptyAnswers))
    setPersonIndex(0)
    setError('')
    setView('questions')
  }

  function startOver() {
    setRecs([])
    setRecIndex(0)
    setPoster(null)
    setError('')
    setView('setup')
  }

  async function loadMovie(recsList, index) {
    setRecIndex(index)
    setPoster(null)
    setPosterLoading(true)
    const url = await fetchPoster(recsList[index].title, recsList[index].year)
    setPoster(url)
    setPosterLoading(false)
  }

  async function getRecommendations(finalParty) {
    setView('loading')
    try {
      const { passages } = await retrieve(buildSearchQuery(finalParty))
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(passages, finalParty.length) },
          { role: 'user', content: describeParty(finalParty) },
        ],
      })

      const parsed = parseRecommendations(response.choices?.[0]?.message)
      setRecs(parsed)
      setView('results')
      await loadMovie(parsed, 0)
    } catch (err) {
      setError(`Something went wrong: ${err.message}`)
      setView('questions')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Choice questions aren't native form controls, so `required` can't catch them.
    if (QUESTIONS.some(q => !party[personIndex][q.id])) {
      setError('Please answer all four questions.')
      return
    }
    setError('')

    if (personIndex < partySize - 1) {
      setPersonIndex(personIndex + 1)
      return
    }
    await getRecommendations(party)
  }

  async function handleNext() {
    if (recIndex < recs.length - 1) {
      await loadMovie(recs, recIndex + 1)
    } else {
      startOver()
    }
  }

  // ── Setup ────────────────────────────────────────────────────────────────
  if (view === 'setup') {
    return (
      <div className="app">
        <header className="brand">
          <Mark />
          <h1 className="wordmark">Marquee</h1>
          <p className="tagline">what we're watching tonight</p>
        </header>

        <div className="setup">
          <p className="setup-label">How many people are watching?</p>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setPartySize(n => Math.max(1, n - 1))}
              disabled={partySize <= 1}
              aria-label="Fewer people"
            >
              −
            </button>
            <span className="stepper-value">{partySize}</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setPartySize(n => Math.min(MAX_PARTY, n + 1))}
              disabled={partySize >= MAX_PARTY}
              aria-label="More people"
            >
              +
            </button>
          </div>
          <button className="btn" onClick={startQuestions}>
            Start
          </button>
        </div>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="app">
        <div className="loading" role="status">
          <span className="reel" aria-hidden="true" />
          <p className="loading-text">Finding your film…</p>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────────
  if (view === 'results') {
    const movie = recs[recIndex]
    const isLast = recIndex === recs.length - 1

    return (
      <div className="app">
        <div className="step-head">
          <p className="eyebrow">
            Now showing · {recIndex + 1} of {recs.length}
          </p>
          <Progress total={recs.length} index={recIndex} />
        </div>

        <div className="result">
          <h2 className="result-title">
            {movie.title}
            {movie.year && <span className="result-year"> ({movie.year})</span>}
          </h2>

          {posterLoading && <div className="poster-wrap shimmer" />}
          {!posterLoading && poster && (
            <div className="poster-wrap">
              <img className="poster" src={poster} alt={`${movie.title} poster`} />
            </div>
          )}
          {!posterLoading && !poster && <div className="poster-wrap poster-missing" />}

          <p className="result-desc">{movie.description}</p>

          <button className="btn" onClick={handleNext}>
            {isLast ? 'Start over' : 'Next film'}
          </button>
        </div>
      </div>
    )
  }

  // ── Questions ────────────────────────────────────────────────────────────
  const answers = party[personIndex]
  const isLastPerson = personIndex === partySize - 1

  return (
    <div className="app">
      <header className="step-head">
        <Mark />
        {partySize > 1 ? (
          <>
            <p className="eyebrow">
              Person {personIndex + 1} of {partySize}
            </p>
            <Progress total={partySize} index={personIndex} />
          </>
        ) : (
          <h1 className="wordmark">Marquee</h1>
        )}
      </header>

      <form className="form" onSubmit={handleSubmit}>
        {QUESTIONS.map(q => (
          <div key={q.id} className="field">
            <label className="field-label" htmlFor={q.type === 'text' ? q.id : undefined}>
              {q.label}
            </label>

            {q.type === 'text' ? (
              <textarea
                id={q.id}
                className="field-input"
                placeholder={q.placeholder}
                value={answers[q.id]}
                onChange={e => update(q.id, e.target.value)}
                rows={3}
                required
              />
            ) : (
              <div className="choices" role="group" aria-label={q.label}>
                {q.options.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={`choice${answers[q.id] === option ? ' selected' : ''}`}
                    onClick={() => update(q.id, option)}
                    aria-pressed={answers[q.id] === option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && <p className="error-msg">{error}</p>}

        <button className="btn" type="submit">
          {isLastPerson ? 'Find our film' : 'Next person'}
        </button>
      </form>
    </div>
  )
}
