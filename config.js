import OpenAI from 'openai';
import { createClient } from "@supabase/supabase-js";

/** OpenRouter config (OpenAI-compatible) */
if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key is missing or invalid.");
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  dangerouslyAllowBrowser: true
});

/** Supabase config (optional — only created when both vars are present) */
const supabaseKey = process.env.SUPABASE_API_KEY
const supabaseUrl = process.env.SUPABASE_URL
export const supabase =
  supabaseKey && supabaseUrl ? createClient(supabaseUrl, supabaseKey) : null