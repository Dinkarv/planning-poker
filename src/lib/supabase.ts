import { createClient, SupabaseClient } from '@supabase/supabase-js'

/** Project URL only (e.g. https://xxx.supabase.co). Strips /rest/v1 if pasted by mistake. */
function normalizeSupabaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  while (u.endsWith('/rest/v1')) {
    u = u.slice(0, -'/rest/v1'.length).replace(/\/+$/, '')
  }
  return u
}

let client: SupabaseClient | null = null
let cachedUrl = ''
let cachedKey = ''

export function getSupabase(): SupabaseClient | null {
  const raw = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!raw || !key) return null
  const url = normalizeSupabaseUrl(raw)
  if (!client || cachedUrl !== url || cachedKey !== key) {
    client = createClient(url, key)
    cachedUrl = url
    cachedKey = key
  }
  return client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
}
