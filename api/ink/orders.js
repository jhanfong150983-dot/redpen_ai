import { getAuthUser } from '../_auth.js'
import { getSupabaseAdmin } from '../_supabase.js'

function parseJsonBody(req, res) {
  const body = req.body
  if (!body) return null
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return null
    }
  }
  return body
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0) return null
  return parsed
}

export default async function handler(req, res) {
  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .select(
        'id, drops, amount_twd, status, provider, provider_txn_id, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: '讀取訂單失敗' })
      return
    }

    res.status(200).json({ orders: data ?? [] })
    return
  }

  if (req.method === 'POST') {
    const payload = parseJsonBody(req, res)
    if (!payload) return

    const drops = parsePositiveInt(payload.drops)
    if (!drops) {
      res.status(400).json({ error: '請輸入有效的墨水滴數' })
      return
    }

    const provider = typeof payload.provider === 'string' && payload.provider.trim()
      ? payload.provider.trim()
      : 'manual'

    const amountTwd = drops
    const status = 'pending'

    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .insert({
        user_id: user.id,
        drops,
        amount_twd: amountTwd,
        status,
        provider
      })
      .select(
        'id, drops, amount_twd, status, provider, provider_txn_id, created_at, updated_at'
      )
      .single()

    if (error) {
      res.status(500).json({ error: '建立訂單失敗' })
      return
    }

    res.status(200).json({ order: data })
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}
