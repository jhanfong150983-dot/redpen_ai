import { createClient } from '@supabase/supabase-js'

let cachedClient = null

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are missing')
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false
      }
    })
  }

  return cachedClient
}

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || ''
}
