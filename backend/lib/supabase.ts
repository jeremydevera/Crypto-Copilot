import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL as string
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — auth disabled')
}

// Service-role client — bypasses RLS, use only on backend
export const supabaseAdmin = createClient(supabaseUrl ?? '', supabaseServiceKey ?? '')