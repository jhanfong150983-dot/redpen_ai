import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'

function resolveAction(req) {
  const actionParam = req.query?.action
  if (Array.isArray(actionParam)) {
    return actionParam[0] || ''
  }
  if (typeof actionParam === 'string') return actionParam
  const pathname = req.url ? req.url.split('?')[0] : ''
  const segments = pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function parseDateValue(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function isPackageActive(pkg, now) {
  const startsAt = parseDateValue(pkg.starts_at)
  if (startsAt && startsAt > now) return false
  const endsAt = parseDateValue(pkg.ends_at)
  if (endsAt && endsAt <= now) return false
  return true
}

export default async function handler(req, res) {
  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()
  const action = resolveAction(req)

  if (action === 'packages') {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('ink_packages')
      .select(
        'id, drops, label, description, bonus_drops, starts_at, ends_at, sort_order, is_active'
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('drops', { ascending: true })

    if (error) {
      res.status(500).json({ error: '讀取方案失敗' })
      return
    }

    const now = new Date()
    const packages = (data ?? []).filter((pkg) => isPackageActive(pkg, now))
    res.status(200).json({ packages })
    return
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .select(
        'id, drops, bonus_drops, amount_twd, status, provider, provider_txn_id, package_id, package_label, package_description, created_at, updated_at'
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
    res.status(405).json({ error: '目前僅支援綠界付款' })
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}
