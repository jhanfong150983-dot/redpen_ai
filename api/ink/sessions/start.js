import { getAuthUser } from '../../../server/_auth.js'
import { getSupabaseAdmin } from '../../../server/_supabase.js'
import { settleInkSession } from '../../../server/ink-session.js'

const SESSION_TTL_MINUTES = 120

function parseJsonBody(req, res) {
  const body = req.body
  if (!body) return {}
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const payload = parseJsonBody(req, res)
  if (payload === null) return

  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('ink_balance')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    res.status(500).json({ error: '讀取使用者點數失敗' })
    return
  }

  const currentBalance =
    typeof profile?.ink_balance === 'number' ? profile.ink_balance : 0

  if (currentBalance < 0) {
    res.status(402).json({ error: '墨水不足，請先補充墨水' })
    return
  }

  const { data: activeSessions, error: activeError } = await supabaseAdmin
    .from('ink_sessions')
    .select('id, expires_at, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)

  if (activeError) {
    res.status(500).json({ error: '讀取批改會話失敗' })
    return
  }

  if (activeSessions && activeSessions.length > 0) {
    const existing = activeSessions[0]
    const expiresAtMs = existing.expires_at ? Date.parse(existing.expires_at) : NaN

    if (!Number.isFinite(expiresAtMs) || expiresAtMs > now.getTime()) {
      await supabaseAdmin
        .from('ink_sessions')
        .update({ last_activity_at: nowIso })
        .eq('id', existing.id)
        .eq('user_id', user.id)

      res.status(200).json({
        sessionId: existing.id,
        expiresAt: existing.expires_at
      })
      return
    }

    try {
      await settleInkSession({
        supabaseAdmin,
        userId: user.id,
        sessionId: existing.id
      })
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '批改會話結算失敗'
      })
      return
    }

    await supabaseAdmin
      .from('ink_sessions')
      .update({
        status: 'expired',
        closed_at: nowIso
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
  }

  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_MINUTES * 60 * 1000
  ).toISOString()

  const { data: session, error: insertError } = await supabaseAdmin
    .from('ink_sessions')
    .insert({
      user_id: user.id,
      status: 'active',
      started_at: nowIso,
      last_activity_at: nowIso,
      expires_at: expiresAt
    })
    .select('id, expires_at')
    .single()

  if (insertError) {
    res.status(500).json({ error: '建立批改會話失敗' })
    return
  }

  res.status(200).json({
    sessionId: session.id,
    expiresAt: session.expires_at
  })
}
