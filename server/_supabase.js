import '../api/_suppress-warnings.js'
import { createClient } from '@supabase/supabase-js'

let cachedClient = null

function decodeJwtPayload(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '==='.slice((normalized.length + 3) % 4)
  try {
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function isServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const payload = decodeJwtPayload(serviceRoleKey)
  return payload?.role === 'service_role'
}

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

export function getSupabaseUserClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server credentials are missing')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  })
}

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || ''
}
