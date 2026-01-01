import { getAuthUser } from '../../../server/_auth.js'
import { getSupabaseAdmin } from '../../../server/_supabase.js'
import { settleInkSession } from '../../../server/ink-session.js'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const payload = parseJsonBody(req, res)
  if (!payload) return

  const sessionId =
    typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId' })
    return
  }

  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('ink_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (sessionError) {
    res.status(500).json({ error: '讀取批改會話失敗' })
    return
  }

  if (!session) {
    res.status(404).json({ error: '批改會話不存在' })
    return
  }

  if (session.status !== 'active') {
    res.status(200).json({ ok: true, alreadyClosed: true })
    return
  }

  let inkSummary = {
    chargedPoints: 0,
    balanceBefore: null,
    balanceAfter: null,
    applied: true
  }

  try {
    const settlement = await settleInkSession({
      supabaseAdmin,
      userId: user.id,
      sessionId
    })
    inkSummary = settlement.inkSummary
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : '批改會話結算失敗'
    })
    return
  }

  const { error: closeError } = await supabaseAdmin
    .from('ink_sessions')
    .update({
      status: 'closed',
      closed_at: nowIso
    })
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (closeError) {
    res.status(500).json({ error: '關閉批改會話失敗' })
    return
  }

  res.status(200).json({ ok: true, ink: inkSummary })
}
