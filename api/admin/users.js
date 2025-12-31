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

function normalizePermissionTier(value) {
  if (value === 'basic' || value === 'advanced') return value
  return null
}

function normalizeRole(value) {
  if (value === 'admin' || value === 'user') return value
  return null
}

export default async function handler(req, res) {
  const adminContext = await requireAdmin(req, res)
  if (!adminContext) return

  const { supabaseAdmin } = adminContext

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, avatar_url, role, permission_tier, ink_balance, admin_note, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: '讀取使用者清單失敗' })
      return
    }

    res.status(200).json({ users: data ?? [] })
    return
  }

  if (req.method === 'PATCH') {
    const payload = parseJsonBody(req, res)
    if (!payload) return

    const {
      userId,
      role,
      permission_tier: permissionTier,
      ink_balance: inkBalance,
      ink_balance_delta: inkBalanceDelta,
      admin_note: adminNote
    } = payload

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' })
      return
    }

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('ink_balance')
      .eq('id', userId)
      .maybeSingle()

    if (fetchError) {
      res.status(500).json({ error: '讀取使用者資料失敗' })
      return
    }

    if (!profile) {
      res.status(404).json({ error: '使用者不存在' })
      return
    }

    const updates = { updated_at: new Date().toISOString() }
    const nextRole = normalizeRole(role)
    const nextTier = normalizePermissionTier(permissionTier)

    if (nextRole) updates.role = nextRole
    if (nextTier) updates.permission_tier = nextTier
    if (typeof adminNote === 'string') updates.admin_note = adminNote

    let ledgerEntry = null
    const currentBalance = typeof profile.ink_balance === 'number' ? profile.ink_balance : 0

    if (typeof inkBalanceDelta === 'number' && Number.isFinite(inkBalanceDelta)) {
      const nextBalance = Math.max(0, currentBalance + inkBalanceDelta)
      updates.ink_balance = nextBalance
      ledgerEntry = {
        user_id: userId,
        delta: nextBalance - currentBalance,
        reason: 'admin_adjustment',
        metadata: { before: currentBalance, after: nextBalance }
      }
    } else if (typeof inkBalance === 'number' && Number.isFinite(inkBalance)) {
      const nextBalance = Math.max(0, Math.floor(inkBalance))
      updates.ink_balance = nextBalance
      ledgerEntry = {
        user_id: userId,
        delta: nextBalance - currentBalance,
        reason: 'admin_set_balance',
        metadata: { before: currentBalance, after: nextBalance }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (updateError) {
      res.status(500).json({ error: '更新使用者資料失敗' })
      return
    }

    if (ledgerEntry && ledgerEntry.delta !== 0) {
      const { error: ledgerError } = await supabaseAdmin
        .from('ink_ledger')
        .insert(ledgerEntry)
      if (ledgerError) {
        res.status(500).json({ error: '寫入點數紀錄失敗' })
        return
      }
    }

    res.status(200).json({ success: true })
    return
  }

  if (req.method === 'DELETE') {
    const payload = parseJsonBody(req, res)
    if (!payload) return

    const { userId } = payload
    if (!userId) {
      res.status(400).json({ error: 'Missing userId' })
      return
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      res.status(500).json({ error: error.message || '刪除使用者失敗' })
      return
    }

    res.status(200).json({ success: true })
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}
