import { useState } from 'react'
import { openai } from './config.js'
import content from './content.js'

const QUESTIONS = [
  {
    id: 'favorite',
    label: "What's your favorite movie and why?",
    placeholder:
      'The Shawshank Redemption\nBecause it taught me to never give up hope no matter how hard life gets',
  },
  {
    id: 'era',
    label: 'Are you in the mood for something new or a classic?',
    placeholder: 'I want to watch movies that were released after 1990',
  },
  {
    id: 'tone',
    label: 'Do you wanna have fun or do you want something serious?',
    placeholder: 'I want to watch something stupid and fun',
  },
]

function buildSystemPrompt() {
  const movieList = content
    .map(m => `- ${m.title} (${m.releaseYear}): ${m.content}`)
    .join('\n')

  return `You are PopChoice, a movie recommendation assistant.
Based on the user's answers, recommend 3 movies from the list below that best fit their taste.

Available movies:
${movieList}

Rules:
- Only recommend movies from the list above.
- Respond with ONLY a raw JSON array — no markdown, no code fences, no explanation.
- Format: [{"title":"Movie Title","year":"YYYY","description":"1–2 sentences on why this fits their preferences."},...]`
}

export default function App() {
  const [answers, setAnswers] = useState({ favorite: '', era: '', tone: '' })
  const [view, setView] = useState('form') // 'form' | 'loading' | 'results'
  const [recs, setRecs] = useState([])
  const [recIndex, setRecIndex] = useState(0)
  const [error, setError] = useState('')

  function update(id, val) {
    setAnswers(prev => ({ ...prev, [id]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setView('loading')

    const userPrompt = QUESTIONS.map(
      q => `${q.label}\n${answers[q.id] || '(no answer)'}`
    ).join('\n\n')

    try {
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
      })

      const raw = response.choices[0].message.content.trim()
      const parsed = JSON.parse(raw)
      setRecs(parsed)
      setRecIndex(0)
      setView('results')
    } catch (err) {
      setError(`Something went wrong: ${err.message}`)
      setView('form')
    }
  }

  function handleNext() {
    if (recIndex < recs.length - 1) {
      setRecIndex(i => i + 1)
    } else {
      // Cycled through all — go back to start
      setView('form')
      setRecs([])
      setRecIndex(0)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="app">
        <div className="loading">
          <span className="popcorn" aria-hidden="true">🍿</span>
          <p className="loading-text">Finding your perfect movie…</p>
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
        <div className="result">
          <h2 className="result-title">
            {movie.title}
            <span className="result-year"> ({movie.year})</span>
          </h2>
          <p className="result-desc">{movie.description}</p>
          <button className="btn-green" onClick={handleNext}>
            {isLast ? 'Start Over' : 'Next Movie'}
          </button>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="app-header">
        <span className="popcorn" aria-hidden="true">🍿</span>
        <h1 className="app-title">PopChoice</h1>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        {QUESTIONS.map(q => (
          <div key={q.id} className="field">
            <label className="field-label">{q.label}</label>
            <textarea
              className="field-input"
              placeholder={q.placeholder}
              value={answers[q.id]}
              onChange={e => update(q.id, e.target.value)}
              rows={3}
            />
          </div>
        ))}

        {error && <p className="error-msg">{error}</p>}

        <button className="btn-green" type="submit">
          Let's Go
        </button>
      </form>
    </div>
  )
}
