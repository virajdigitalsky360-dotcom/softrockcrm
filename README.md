# SOFTROCK CRM

Task management CRM (React + Vite + TypeScript + Supabase).

## Setup
1. `cp .env.example .env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Apply the SQL files in `supabase/migrations/` (in filename order) to your Supabase project.
3. `npm install` then `npm run dev`.

## Deploy (Netlify)
Build command `npm run build`, publish directory `dist` (see `netlify.toml`).
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify > Site configuration > Environment variables.

## Notes
- Never commit `.env`, API keys or service-role keys.
- Edge function secrets (service role key, email API key) are set in Supabase, not in this repo.
