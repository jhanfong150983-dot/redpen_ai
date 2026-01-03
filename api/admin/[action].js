import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'

const PENDING_TTL_MINUTES = 30
const TAG_QUIET_MINUTES = 5
const TAG_MAX_WAIT_MINUTES = 30
const TAG_MIN_SAMPLE_COUNT = 5
const TAG_TOP_ISSUES = 50
const TAG_LIMIT = 8
const TAG_MODEL = 'gemini-3-flash-preview'
const TAG_PROMPT_VERSION = 'v1.0'

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

function parseOptionalInt(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return null
  if (parsed < 0) return null
  return parsed
}

function parseOptionalDateTime(value) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

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

function getPendingCutoffIso() {
  return new Date(Date.now() - PENDING_TTL_MINUTES * 60 * 1000).toISOString()
}

function normalizePermissionTier(value) {
  if (value === 'basic' || value === 'advanced') return value
  return null
}

function normalizeRole(value) {
  if (value === 'admin' || value === 'user') return value
  return null
}

function normalizeTagLabel(label) {
  if (!label) return ''
  return String(label).replace(/\s+/g, '').trim().toLowerCase()
}

function normalizeIssueText(text) {
  if (!text) return ''
  return String(text).replace(/\s+/g, ' ').trim()
}

function addMinutesIso(date, minutes) {
  const base = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(base.getTime())) return null
  return new Date(base.getTime() + minutes * 60 * 1000).toISOString()
}

function extractJsonFromText(text) {
  const match = String(text).match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function parseGradingResult(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw
  return null
}

function extractIssuesFromGrading(grading) {
  if (!grading) return []
  const mistakes = Array.isArray(grading.mistakes) ? grading.mistakes : []
  if (mistakes.length > 0) {
    return mistakes
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const reason = item.reason || ''
        const question = item.question || ''
        return [reason, question].filter(Boolean).join(' ')
      })
      .map(normalizeIssueText)
      .filter((text) => text.length > 0)
  }
  const weaknesses = Array.isArray(grading.weaknesses) ? grading.weaknesses : []
  return weaknesses.map(normalizeIssueText).filter((text) => text.length > 0)
}

function buildIssueStats(submissions) {
  const issueMap = new Map()

  submissions.forEach((submission) => {
    const grading = parseGradingResult(submission.grading_result)
    const issues = extractIssuesFromGrading(grading)
    if (!issues.length) return

    const ownerKey = submission.student_id || submission.id
    const uniqueIssues = new Set(issues)
    uniqueIssues.forEach((issue) => {
      if (!issueMap.has(issue)) issueMap.set(issue, new Set())
      const bucket = issueMap.get(issue)
      if (bucket && ownerKey) bucket.add(ownerKey)
    })
  })

  return Array.from(issueMap.entries())
    .map(([issue, set]) => ({ issue, count: set.size }))
    .sort((a, b) => b.count - a.count)
}

function getSystemApiKey() {
  return process.env.SYSTEM_GEMINI_API_KEY || process.env.SECRET_API_KEY || ''
}

async function callGeminiText(prompt) {
  const apiKey = getSystemApiKey()
  if (!apiKey) {
    throw new Error('Server API Key missing')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TAG_MODEL}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  })

  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || 'Gemini request failed'
    throw new Error(message)
  }

  const output = (data?.candidates ?? [])
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!output) {
    throw new Error('Gemini response empty')
  }

  return output
}

function buildTagPrompt(issueStats, dictionaryLabels) {
  const issueLines = issueStats
    .map((item) => `- ${item.issue}｜${item.count}人`)
    .join('\n')
  const dictionaryText = dictionaryLabels.length
    ? dictionaryLabels.join('、')
    : '（尚無）'

  return `你是教學分析助理。請根據以下「錯誤現象清單」聚類成 4~8 個高階錯誤標籤，標籤需為繁體中文且 2~6 字，不要包含題目細節。
若與既有標籤相近，請沿用既有標籤字樣；若沒有適合者可新增。
請只輸出 JSON，格式如下：
{"tags":[{"label":"標籤","count":12,"examples":["示例1","示例2"]}]}

既有標籤：
${dictionaryText}

錯誤現象清單：
${issueLines}
`
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

async function requireAdminOrCron(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers['x-cron-secret']
  const authHeader = req.headers.authorization || req.headers.Authorization

  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : ''

  if (
    cronSecret &&
    ((headerSecret && headerSecret === cronSecret) ||
      (bearerToken && bearerToken === cronSecret))
  ) {
    return { user: null, supabaseAdmin: getSupabaseAdmin(), isCron: true }
  }

  return requireAdmin(req, res)
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

// ========== USERS ==========
async function handleUsers(req, res, supabaseAdmin) {
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

// ========== INK-ORDERS - PACKAGES ==========
async function handlePackages(req, res, supabaseAdmin) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('ink_packages')
      .select(
        'id, drops, label, description, bonus_drops, starts_at, ends_at, sort_order, is_active, created_at, updated_at'
      )
      .order('sort_order', { ascending: true })
      .order('drops', { ascending: true })

    if (error) {
      res.status(500).json({ error: '讀取方案失敗' })
      return
    }

    res.status(200).json({ packages: data ?? [] })
    return
  }

  const payload = parseJsonBody(req, res)
  if (!payload && req.method !== 'DELETE') return

  if (req.method === 'POST') {
    const drops = parsePositiveInt(payload.drops)
    const label =
      typeof payload.label === 'string' ? payload.label.trim() : ''
    const description =
      typeof payload.description === 'string' ? payload.description.trim() : null
    const sortOrder = parseOptionalInt(payload.sortOrder) ?? 0
    const bonusInput = payload.bonusDrops ?? ''
    const bonusDrops =
      bonusInput === '' || bonusInput === null ? 0 : parseNonNegativeInt(bonusInput)
    const startsAt = parseOptionalDateTime(payload.startsAt)
    const endsAt = parseOptionalDateTime(payload.endsAt)
    const isActive = parseBoolean(payload.isActive, true)

    if (!drops) {
      res.status(400).json({ error: '請輸入有效的滴數' })
      return
    }
    if (!label) {
      res.status(400).json({ error: '請輸入方案名稱' })
      return
    }
    if (bonusDrops === null) {
      res.status(400).json({ error: '請輸入有效的贈送滴數' })
      return
    }
    if (startsAt === undefined || endsAt === undefined) {
      res.status(400).json({ error: '請輸入有效的方案期間' })
      return
    }
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      res.status(400).json({ error: '開始時間不可晚於結束時間' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('ink_packages')
      .insert({
        drops,
        label,
        description,
        bonus_drops: bonusDrops,
        starts_at: startsAt,
        ends_at: endsAt,
        sort_order: sortOrder,
        is_active: isActive
      })
      .select(
        'id, drops, label, description, bonus_drops, starts_at, ends_at, sort_order, is_active, created_at, updated_at'
      )
      .single()

    if (error) {
      res.status(500).json({ error: '建立方案失敗' })
      return
    }

    res.status(200).json({ package: data })
    return
  }

  if (req.method === 'PATCH') {
    const id = parsePositiveInt(payload.id)
    if (!id) {
      res.status(400).json({ error: 'Missing package id' })
      return
    }

    const updates = {}
    if (payload.drops !== undefined) {
      const drops = parsePositiveInt(payload.drops)
      if (!drops) {
        res.status(400).json({ error: '請輸入有效的滴數' })
        return
      }
      updates.drops = drops
    }
    if (payload.label !== undefined) {
      const label = typeof payload.label === 'string' ? payload.label.trim() : ''
      if (!label) {
        res.status(400).json({ error: '請輸入方案名稱' })
        return
      }
      updates.label = label
    }
    if (payload.description !== undefined) {
      updates.description =
        typeof payload.description === 'string'
          ? payload.description.trim()
          : null
    }
    if (payload.bonusDrops !== undefined) {
      const bonusInput = payload.bonusDrops
      const bonusDrops =
        bonusInput === '' || bonusInput === null ? 0 : parseNonNegativeInt(bonusInput)
      if (bonusDrops === null) {
        res.status(400).json({ error: '請輸入有效的贈送滴數' })
        return
      }
      updates.bonus_drops = bonusDrops
    }
    if (payload.startsAt !== undefined) {
      const startsAt = parseOptionalDateTime(payload.startsAt)
      if (startsAt === undefined) {
        res.status(400).json({ error: '請輸入有效的開始時間' })
        return
      }
      updates.starts_at = startsAt
    }
    if (payload.endsAt !== undefined) {
      const endsAt = parseOptionalDateTime(payload.endsAt)
      if (endsAt === undefined) {
        res.status(400).json({ error: '請輸入有效的結束時間' })
        return
      }
      updates.ends_at = endsAt
    }
    if (payload.sortOrder !== undefined) {
      const sortOrder = parseOptionalInt(payload.sortOrder)
      if (sortOrder === null) {
        res.status(400).json({ error: '請輸入有效的排序' })
        return
      }
      updates.sort_order = sortOrder
    }
    if (payload.isActive !== undefined) {
      updates.is_active = parseBoolean(payload.isActive, true)
    }

    if (
      updates.starts_at !== undefined ||
      updates.ends_at !== undefined
    ) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from('ink_packages')
        .select('starts_at, ends_at')
        .eq('id', id)
        .maybeSingle()
      if (currentError) {
        res.status(500).json({ error: '讀取方案失敗' })
        return
      }
      const nextStartsAt =
        updates.starts_at !== undefined ? updates.starts_at : current?.starts_at
      const nextEndsAt =
        updates.ends_at !== undefined ? updates.ends_at : current?.ends_at
      if (nextStartsAt && nextEndsAt && new Date(nextStartsAt) >= new Date(nextEndsAt)) {
        res.status(400).json({ error: '開始時間不可晚於結束時間' })
        return
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '沒有可更新的欄位' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('ink_packages')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(
        'id, drops, label, description, bonus_drops, starts_at, ends_at, sort_order, is_active, created_at, updated_at'
      )
      .single()

    if (error) {
      res.status(500).json({ error: '更新方案失敗' })
      return
    }

    res.status(200).json({ package: data })
    return
  }

  if (req.method === 'DELETE') {
    const queryId = Array.isArray(req.query?.id) ? req.query?.id[0] : req.query?.id
    let targetId = parsePositiveInt(queryId)
    if (!targetId) {
      const body = parseJsonBody(req, res)
      targetId = parsePositiveInt(body?.id)
    }
    if (!targetId) {
      res.status(400).json({ error: 'Missing package id' })
      return
    }

    const { error } = await supabaseAdmin
      .from('ink_packages')
      .delete()
      .eq('id', targetId)

    if (error) {
      res.status(500).json({ error: '刪除方案失敗' })
      return
    }

    res.status(200).json({ success: true })
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}

// ========== INK-ORDERS ==========
async function handleInkOrders(req, res, supabaseAdmin, adminUser) {
  if (req.method === 'GET') {
    const cutoffIso = getPendingCutoffIso()
    const nowIso = new Date().toISOString()
    const { error: expireError } = await supabaseAdmin
      .from('ink_orders')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('status', 'pending')
      .lt('created_at', cutoffIso)

    if (expireError) {
      console.warn('Expire pending orders failed:', expireError)
    }

    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .select(
        'id, user_id, drops, bonus_drops, amount_twd, status, provider, provider_txn_id, package_id, package_label, package_description, created_at, updated_at'
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
      .select(
        'id, user_id, drops, bonus_drops, status, amount_twd, provider, provider_txn_id, package_id, package_label, package_description'
      )
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
        res.status(400).json({ error: '訂單已加點,不可取消' })
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
      const bonusDrops =
        typeof order.bonus_drops === 'number' && order.bonus_drops > 0
          ? order.bonus_drops
          : 0
      const totalDrops = order.drops + bonusDrops
      balanceAfter = currentBalance + totalDrops

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
        delta: totalDrops,
        reason: 'order_paid',
        metadata: {
          orderId: order.id,
          provider: order.provider,
          amountTwd: order.amount_twd,
          baseDrops: order.drops,
          bonusDrops,
          totalDrops,
          packageId: order.package_id,
          packageLabel: order.package_label,
          packageDescription: order.package_description,
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

// ========== ANALYTICS ==========
async function handleAnalytics(req, res, supabaseAdmin) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1. 系統概覽統計
    const [
      totalUsersResult,
      totalOrdersResult,
      totalRevenueResult,
      totalInkDistributedResult,
      activeUsersResult
    ] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true }),

      supabaseAdmin
        .from('ink_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid'),

      supabaseAdmin
        .from('ink_orders')
        .select('amount_twd')
        .eq('status', 'paid'),

      supabaseAdmin
        .from('ink_ledger')
        .select('delta')
        .gt('delta', 0),

      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    ])

    const totalRevenue = totalRevenueResult.data?.reduce((sum, order) => sum + (order.amount_twd || 0), 0) || 0
    const totalInkDistributed = totalInkDistributedResult.data?.reduce((sum, ledger) => sum + (ledger.delta || 0), 0) || 0

    // 2. 最近註冊的用戶
    const { data: recentUsers } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, avatar_url, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    // 3. 最活躍用戶
    const { data: inkUsageData } = await supabaseAdmin
      .from('ink_ledger')
      .select('user_id, delta')
      .lt('delta', 0)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    const userUsageMap = {}
    inkUsageData?.forEach(record => {
      if (!userUsageMap[record.user_id]) {
        userUsageMap[record.user_id] = 0
      }
      userUsageMap[record.user_id] += Math.abs(record.delta)
    })

    const topUserIds = Object.entries(userUsageMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId]) => userId)

    const { data: topUsers } = topUserIds.length > 0
      ? await supabaseAdmin
          .from('profiles')
          .select('id, email, name, avatar_url, ink_balance')
          .in('id', topUserIds)
      : { data: [] }

    const topUsersWithUsage = topUsers?.map(user => ({
      ...user,
      ink_used: userUsageMap[user.id] || 0
    })).sort((a, b) => b.ink_used - a.ink_used) || []

    // 4. 訂單統計
    const { data: recentOrders } = await supabaseAdmin
      .from('ink_orders')
      .select('id, status, amount_twd, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    const ordersByStatus = {
      paid: recentOrders?.filter(o => o.status === 'paid').length || 0,
      pending: recentOrders?.filter(o => o.status === 'pending').length || 0,
      cancelled: recentOrders?.filter(o => o.status === 'cancelled').length || 0
    }

    const recentRevenue = recentOrders?.filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.amount_twd || 0), 0) || 0

    // 5. 每日訂單趨勢
    const dailyOrders = {}
    recentOrders?.forEach(order => {
      if (order.status === 'paid') {
        const date = order.created_at.split('T')[0]
        if (!dailyOrders[date]) {
          dailyOrders[date] = { count: 0, revenue: 0 }
        }
        dailyOrders[date].count++
        dailyOrders[date].revenue += order.amount_twd || 0
      }
    })

    const dailyOrdersArray = Object.entries(dailyOrders)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 6. 熱門購買方案
    const { data: packageStats } = await supabaseAdmin
      .from('ink_orders')
      .select('package_id, package_label, drops, bonus_drops')
      .eq('status', 'paid')
      .not('package_id', 'is', null)

    const packageSalesMap = {}
    packageStats?.forEach(order => {
      const key = order.package_id
      if (!packageSalesMap[key]) {
        packageSalesMap[key] = {
          package_id: order.package_id,
          package_label: order.package_label,
          drops: order.drops,
          bonus_drops: order.bonus_drops,
          sales_count: 0
        }
      }
      packageSalesMap[key].sales_count++
    })

    const topPackages = Object.values(packageSalesMap)
      .sort((a, b) => b.sales_count - a.sales_count)
      .slice(0, 5)

    // 7. 墨水點數統計
    const { data: allProfiles } = await supabaseAdmin
      .from('profiles')
      .select('ink_balance')

    const totalInkBalance = allProfiles?.reduce((sum, p) => sum + (p.ink_balance || 0), 0) || 0
    const avgInkBalance = allProfiles?.length > 0 ? Math.round(totalInkBalance / allProfiles.length) : 0

    // 8. 最近墨水點數變動記錄
    const { data: recentInkLedger } = await supabaseAdmin
      .from('ink_ledger')
      .select(`
        id,
        user_id,
        delta,
        reason,
        metadata,
        created_at,
        profiles:user_id (
          email,
          name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    // 9. 用戶成長趨勢
    const { data: userGrowthData } = await supabaseAdmin
      .from('profiles')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    const dailyNewUsers = {}
    userGrowthData?.forEach(user => {
      const date = user.created_at.split('T')[0]
      dailyNewUsers[date] = (dailyNewUsers[date] || 0) + 1
    })

    const userGrowthArray = Object.entries(dailyNewUsers)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const analytics = {
      overview: {
        totalUsers: totalUsersResult.count || 0,
        activeUsers: activeUsersResult.count || 0,
        totalOrders: totalOrdersResult.count || 0,
        totalRevenue,
        totalInkDistributed,
        totalInkBalance,
        avgInkBalance
      },
      recentUsers: recentUsers || [],
      topUsers: topUsersWithUsage,
      orders: {
        byStatus: ordersByStatus,
        recentRevenue,
        dailyTrend: dailyOrdersArray
      },
      topPackages,
      recentInkLedger: recentInkLedger || [],
      userGrowth: userGrowthArray
    }

    return res.status(200).json(analytics)

  } catch (error) {
    console.error('Analytics error:', error)
    return res.status(500).json({ error: '取得統計資料失敗' })
  }
}

async function finalizeAssignmentTagState(
  supabaseAdmin,
  ownerId,
  assignmentId,
  nowIso,
  sampleCount,
  model,
  promptVersion
) {
  const { data: latest, error } = await supabaseAdmin
    .from('assignment_tag_state')
    .select('dirty, last_event_at')
    .eq('owner_id', ownerId)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const baseUpdate = {
    sample_count: sampleCount,
    last_generated_at: nowIso,
    model,
    prompt_version: promptVersion,
    updated_at: nowIso,
    dirty: false
  }

  if (latest?.dirty) {
    const lastEventAt = latest.last_event_at || nowIso
    const nextRunAt = addMinutesIso(lastEventAt, TAG_QUIET_MINUTES)
    const result = await supabaseAdmin
      .from('assignment_tag_state')
      .update({
        ...baseUpdate,
        status: 'pending',
        window_started_at: lastEventAt,
        next_run_at: nextRunAt ?? undefined
      })
      .eq('owner_id', ownerId)
      .eq('assignment_id', assignmentId)

    if (result.error) {
      throw new Error(result.error.message)
    }
    return
  }

  const result = await supabaseAdmin
    .from('assignment_tag_state')
    .update({
      ...baseUpdate,
      status: 'ready'
    })
    .eq('owner_id', ownerId)
    .eq('assignment_id', assignmentId)

  if (result.error) {
    throw new Error(result.error.message)
  }
}

async function aggregateAssignmentTags(supabaseAdmin, stateRow) {
  const ownerId = stateRow.owner_id
  const assignmentId = stateRow.assignment_id
  const nowIso = new Date().toISOString()

  const runningUpdate = await supabaseAdmin
    .from('assignment_tag_state')
    .update({ status: 'running', updated_at: nowIso })
    .eq('owner_id', ownerId)
    .eq('assignment_id', assignmentId)

  if (runningUpdate.error) {
    throw new Error(runningUpdate.error.message)
  }

  const { data: submissions, error: submissionsError } = await supabaseAdmin
    .from('submissions')
    .select('id, student_id, grading_result, status')
    .eq('owner_id', ownerId)
    .eq('assignment_id', assignmentId)

  if (submissionsError) {
    throw new Error(submissionsError.message)
  }

  const gradedSubmissions = (submissions || []).filter(
    (row) => row.grading_result !== null || row.status === 'graded'
  )

  const sampleCount = gradedSubmissions.length
  if (sampleCount < TAG_MIN_SAMPLE_COUNT) {
    const result = await supabaseAdmin
      .from('assignment_tag_state')
      .update({
        status: 'insufficient_samples',
        sample_count: sampleCount,
        updated_at: nowIso
      })
      .eq('owner_id', ownerId)
      .eq('assignment_id', assignmentId)

    if (result.error) {
      throw new Error(result.error.message)
    }
    return { assignmentId, status: 'insufficient_samples', sampleCount }
  }

  const issueStats = buildIssueStats(gradedSubmissions).slice(0, TAG_TOP_ISSUES)

  if (issueStats.length === 0) {
    await supabaseAdmin
      .from('assignment_tag_aggregates')
      .delete()
      .eq('owner_id', ownerId)
      .eq('assignment_id', assignmentId)

    await finalizeAssignmentTagState(
      supabaseAdmin,
      ownerId,
      assignmentId,
      nowIso,
      sampleCount,
      TAG_MODEL,
      TAG_PROMPT_VERSION
    )

    return { assignmentId, status: 'ready', sampleCount }
  }

  const { data: dictionaryRows, error: dictionaryError } = await supabaseAdmin
    .from('tag_dictionary')
    .select('id, label, normalized_label')
    .eq('owner_id', ownerId)
    .eq('status', 'active')

  if (dictionaryError) {
    throw new Error(dictionaryError.message)
  }

  const dictionaryMap = new Map()
  const dictionaryLabels = []
  for (const row of dictionaryRows || []) {
    const normalized = row.normalized_label || normalizeTagLabel(row.label)
    dictionaryMap.set(normalized, row)
    if (row.label) dictionaryLabels.push(row.label)
  }

  const prompt = buildTagPrompt(issueStats, dictionaryLabels)
  const responseText = await callGeminiText(prompt)
  const parsed = extractJsonFromText(responseText)
  const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : []

  const normalizedTags = rawTags
    .map((tag) => {
      const label =
        typeof tag?.label === 'string'
          ? tag.label.trim()
          : typeof tag?.tag === 'string'
            ? tag.tag.trim()
            : ''
      const count = parseInt(tag?.count, 10)
      if (!label || !Number.isFinite(count) || count <= 0) return null
      const examples = Array.isArray(tag?.examples)
        ? tag.examples
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0)
            .slice(0, 2)
        : undefined
      return {
        label,
        count: Math.min(count, sampleCount),
        examples
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, TAG_LIMIT)

  if (!normalizedTags.length) {
    throw new Error('Gemini tag output invalid')
  }

  const newDictionaryRows = []
  normalizedTags.forEach((tag) => {
    const normalizedLabel = normalizeTagLabel(tag.label)
    if (!dictionaryMap.has(normalizedLabel)) {
      newDictionaryRows.push({
        owner_id: ownerId,
        label: tag.label,
        normalized_label: normalizedLabel,
        status: 'active',
        created_at: nowIso,
        updated_at: nowIso
      })
    }
  })

  if (newDictionaryRows.length > 0) {
    const insertResult = await supabaseAdmin
      .from('tag_dictionary')
      .insert(newDictionaryRows)
      .select('id, label, normalized_label')

    if (insertResult.error) {
      throw new Error(insertResult.error.message)
    }
  }

  await supabaseAdmin
    .from('assignment_tag_aggregates')
    .delete()
    .eq('owner_id', ownerId)
    .eq('assignment_id', assignmentId)

  const aggregateRows = normalizedTags.map((tag) => ({
    owner_id: ownerId,
    assignment_id: assignmentId,
    tag_label: tag.label,
    tag_count: tag.count,
    examples: tag.examples ?? null,
    generated_at: nowIso,
    model: TAG_MODEL,
    prompt_version: TAG_PROMPT_VERSION,
    updated_at: nowIso
  }))

  const insertResult = await supabaseAdmin
    .from('assignment_tag_aggregates')
    .insert(aggregateRows)

  if (insertResult.error) {
    throw new Error(insertResult.error.message)
  }

  await finalizeAssignmentTagState(
    supabaseAdmin,
    ownerId,
    assignmentId,
    nowIso,
    sampleCount,
    TAG_MODEL,
    TAG_PROMPT_VERSION
  )

  return { assignmentId, status: 'ready', sampleCount }
}

async function handleAggregateTags(req, res, supabaseAdmin) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  let body = parseJsonBody(req, res)
  if (body === null) {
    if (res.headersSent) return
    body = {}
  }
  const ownerId = body.ownerId || req.query?.ownerId || null
  const assignmentId = body.assignmentId || req.query?.assignmentId || null

  const stateQuery = supabaseAdmin
    .from('assignment_tag_state')
    .select('*')
    .eq('status', 'pending')

  if (ownerId) stateQuery.eq('owner_id', ownerId)
  if (assignmentId) stateQuery.eq('assignment_id', assignmentId)

  const { data: states, error } = await stateQuery
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const nowMs = Date.now()
  const dueStates = (states || []).filter((row) => {
    const nextRunAtMs = row.next_run_at ? Date.parse(row.next_run_at) : NaN
    const windowStartMs = row.window_started_at
      ? Date.parse(row.window_started_at)
      : NaN
    const lastEventMs = row.last_event_at ? Date.parse(row.last_event_at) : NaN
    const quietDue =
      Number.isFinite(nextRunAtMs) && nowMs >= nextRunAtMs
        ? true
        : Number.isFinite(lastEventMs)
          ? nowMs - lastEventMs >= TAG_QUIET_MINUTES * 60 * 1000
          : false
    const maxWaitDue =
      Number.isFinite(windowStartMs) &&
      nowMs - windowStartMs >= TAG_MAX_WAIT_MINUTES * 60 * 1000
    return quietDue || maxWaitDue
  })

  const results = []
  for (const stateRow of dueStates) {
    try {
      const result = await aggregateAssignmentTags(supabaseAdmin, stateRow)
      results.push({ assignmentId: stateRow.assignment_id, ok: true, ...result })
    } catch (err) {
      await supabaseAdmin
        .from('assignment_tag_state')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('owner_id', stateRow.owner_id)
        .eq('assignment_id', stateRow.assignment_id)

      results.push({
        assignmentId: stateRow.assignment_id,
        ok: false,
        error: err instanceof Error ? err.message : 'aggregate failed'
      })
    }
  }

  res.status(200).json({
    success: true,
    processed: results.length,
    results
  })
}

// ========== MAIN HANDLER ==========
export default async function handler(req, res) {
  const action = resolveAction(req)

  if (action === 'aggregate-tags') {
    const context = await requireAdminOrCron(req, res)
    if (!context) return
    return await handleAggregateTags(req, res, context.supabaseAdmin)
  }

  const adminContext = await requireAdmin(req, res)
  if (!adminContext) return

  const { supabaseAdmin, user: adminUser } = adminContext

  // 路由到對應的處理函數
  if (action === 'users') {
    return await handleUsers(req, res, supabaseAdmin)
  }

  if (action === 'packages') {
    return await handlePackages(req, res, supabaseAdmin)
  }

  if (action === 'ink-orders') {
    return await handleInkOrders(req, res, supabaseAdmin, adminUser)
  }

  if (action === 'analytics') {
    return await handleAnalytics(req, res, supabaseAdmin)
  }

  res.status(404).json({ error: 'Unknown action' })
}
