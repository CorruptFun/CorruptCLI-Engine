import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const supabaseUrl = '{{SUPABASE_URL}}'
export const supabaseAnonKey = '{{SUPABASE_ANON_KEY}}'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
