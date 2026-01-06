import '../api/_suppress-warnings.js'
import { createClient } from '@supabase/supabase-js'

let cachedClient = null

/**
 * 獲取 Supabase Admin Client
 *
 * 後端始終使用 service_role key 來操作 Supabase，可以繞過 RLS。
 * 權限控制在後端 API 層面進行（透過 getAuthUser 認證 + owner_id 過濾）。
 *
 * 為什麼不需要 user client？
 * - 前端不直接連接 Supabase（安全）
 * - 後端已經有認證機制（getAuthUser）
 * - 後端使用 owner_id 來控制資料存取
 * - RLS 會干擾後端操作，造成不必要的錯誤
 */
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
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'X-Client-Info': 'redpen-ai-server'
        }
      }
    })
  }

  return cachedClient
}

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || ''
}
