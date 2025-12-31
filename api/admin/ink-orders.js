import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'

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

async function requireAdmin(req, res) {
  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    res.status(500).json({ error: '讀取使用者權限失敗' })
    return null
  }

  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }

  return { user, supabaseAdmin }
}

async function hasOrderLedger(supabaseAdmin, userId, orderId) {
  const { data, error } = await supabaseAdmin
    .from('ink_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'order_paid')
    .contains('metadata', { orderId })
    .limit(1)

  if (error) {
    throw new Error('讀取點數紀錄失敗')
  }

  return (data ?? []).length > 0
}

export default async function handler(req, res) {
  const adminContext = await requireAdmin(req, res)
  if (!adminContext) return

  const { supabaseAdmin, user: adminUser } = adminContext

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .select(
        'id, user_id, drops, amount_twd, status, provider, provider_txn_id, created_at, updated_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: '讀取訂單失敗' })
      return
    }

    const orders = data ?? []
    const userIds = Array.from(new Set(orders.map((order) => order.user_id))).filter(
      Boolean
    )

    const profilesMap = new Map()
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, name, ink_balance')
        .in('id', userIds)

      if (profileError) {
        res.status(500).json({ error: '讀取使用者資料失敗' })
        return
      }

      for (const profile of profiles || []) {
        profilesMap.set(profile.id, profile)
      }
    }

    const payload = orders.map((order) => ({
      ...order,
      user: profilesMap.get(order.user_id) || null
    }))

    res.status(200).json({ orders: payload })
    return
  }

  if (req.method === 'PATCH') {
    const payload = parseJsonBody(req, res)
    if (!payload) return

    const orderId = parsePositiveInt(payload.orderId)
    const status = typeof payload.status === 'string' ? payload.status : null

    if (!orderId) {
      res.status(400).json({ error: 'Missing orderId' })
      return
    }

    if (!status || !['paid', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' })
      return
    }

    const { data: order, error } = await supabaseAdmin
      .from('ink_orders')
      .select('id, user_id, drops, status, amount_twd, provider, provider_txn_id')
      .eq('id', orderId)
      .maybeSingle()

    if (error) {
      res.status(500).json({ error: '讀取訂單失敗' })
      return
    }

    if (!order) {
      res.status(404).json({ error: '訂單不存在' })
      return
    }

    const hasLedger = await hasOrderLedger(supabaseAdmin, order.user_id, order.id)

    if (status === 'cancelled') {
      if (hasLedger) {
        res.status(400).json({ error: '訂單已加點，不可取消' })
        return
      }

      if (order.status !== 'cancelled') {
        const { error: cancelError } = await supabaseAdmin
          .from('ink_orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', order.id)

        if (cancelError) {
          res.status(500).json({ error: '更新訂單狀態失敗' })
          return
        }
      }

      res.status(200).json({ success: true })
      return
    }

    let balanceAfter = null
    if (!hasLedger) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('ink_balance')
        .eq('id', order.user_id)
        .maybeSingle()

      if (profileError) {
        res.status(500).json({ error: '讀取使用者點數失敗' })
        return
      }

      const currentBalance =
        typeof profile?.ink_balance === 'number' ? profile.ink_balance : 0
      balanceAfter = currentBalance + order.drops

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          ink_balance: balanceAfter,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.user_id)

      if (updateError) {
        res.status(500).json({ error: '更新使用者點數失敗' })
        return
      }

      const { error: ledgerError } = await supabaseAdmin.from('ink_ledger').insert({
        user_id: order.user_id,
        delta: order.drops,
        reason: 'order_paid',
        metadata: {
          orderId: order.id,
          provider: order.provider,
          amountTwd: order.amount_twd,
          drops: order.drops,
          adminId: adminUser.id,
          balanceBefore: currentBalance,
          balanceAfter
        }
      })

      if (ledgerError) {
        res.status(500).json({ error: '寫入點數紀錄失敗' })
        return
      }
    }

    if (order.status !== 'paid') {
      const { error: paidError } = await supabaseAdmin
        .from('ink_orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', order.id)

      if (paidError) {
        res.status(500).json({ error: '更新訂單狀態失敗' })
        return
      }
    }

    res.status(200).json({ success: true, balanceAfter })
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}
