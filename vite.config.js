import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load all .env vars regardless of VITE_ prefix
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      // OpenRouter / OpenAI
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.OPENAI_MODEL':   JSON.stringify(env.OPENAI_MODEL),
      // Supabase (NEXT_PUBLIC_ names mapped to what config.js expects)
      'process.env.SUPABASE_URL':     JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.SUPABASE_API_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      // OMDB
      'process.env.OMDB_API': JSON.stringify(env.OMDB_API),
    },
  }
})
