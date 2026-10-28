import { useState } from 'react'
import { openai } from './config.js'
import content from './content.js'

const SYSTEM_PROMPT = `You are PopChoice, a friendly movie recommendation assistant.
You have access to the following movies:

${content.map(m => m.content).join('\n\n')}

When a user tells you what they're in the mood for, recommend one or two movies from the list above that best match their mood or preferences. 
Keep your response conversational and brief — two to four sentences max. Mention the movie title(s) and why they're a good fit.
Only recommend movies from the list.`

export default function App() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!query.trim() || loading) return

    const userMessage = { role: 'user', content: query.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setQuery('')
    setLoading(true)

    try {
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...updatedMessages,
        ],
      })

      const assistantMessage = response.choices[0].message
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Something went wrong: ${err.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setMessages([])
    setQuery('')
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">🎬 PopChoice</h1>
        <p className="tagline">Tell us your mood — we'll find your next watch.</p>
      </header>

      <main className="main">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Try something like…</p>
            <ul>
              <li>"I want something action-packed but not too long"</li>
              <li>"I'm in the mood for a laugh"</li>
              <li>"Something intense and mind-bending"</li>
            </ul>
          </div>
        )}

        {messages.length > 0 && (
          <div className="messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message message--${msg.role}`}>
                <span className="message__label">
                  {msg.role === 'user' ? 'You' : 'PopChoice'}
                </span>
                <p className="message__text">{msg.content}</p>
              </div>
            ))}
            {loading && (
              <div className="message message--assistant">
                <span className="message__label">PopChoice</span>
                <p className="message__text loading-dots">Thinking</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <form className="form" onSubmit={handleSubmit}>
          <input
            className="input"
            type="text"
            placeholder="What are you in the mood for?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={loading}
          />
          <button className="btn btn--primary" type="submit" disabled={loading || !query.trim()}>
            {loading ? '…' : 'Ask'}
          </button>
          {messages.length > 0 && (
            <button className="btn btn--ghost" type="button" onClick={handleReset}>
              Reset
            </button>
          )}
        </form>
      </footer>
    </div>
  )
}
