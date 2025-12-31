// api/proxy.js
// 這段程式碼在 Vercel 的伺服器上執行，前端看不到
import { getAuthUser } from '../server/_auth.js'
import { getSupabaseAdmin } from '../server/_supabase.js'

const INK_EXCHANGE_RATE = 33
const INPUT_USD_PER_MILLION = 0.5
const OUTPUT_USD_PER_MILLION = 3
const PLATFORM_FEE_TWD = 1

function computeInkPoints(usageMetadata) {
  const inputTokens = Number(usageMetadata?.promptTokenCount) || 0
  const outputTokens = Number(usageMetadata?.candidatesTokenCount) || 0
  const totalTokens = Number(usageMetadata?.totalTokenCount) || inputTokens + outputTokens

  const baseUsd =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION
  const baseTwd = baseUsd * INK_EXCHANGE_RATE
  const baseTwdRounded = Math.ceil(baseTwd)
  const platformFee = baseTwd >= 1 ? PLATFORM_FEE_TWD : 0
  const points = baseTwdRounded + platformFee

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    baseUsd,
    baseTwd,
    baseTwdRounded,
    platformFee,
    points
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  let user = null
  try {
    const result = await getAuthUser(req, res)
    user = result.user
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' })
    return
  }

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const apiKey = process.env.SECRET_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server API Key missing' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  }

  const { model, contents, ...payload } = body || {}
  if (!model || !Array.isArray(contents)) {
    res.status(400).json({ error: 'Missing model or contents' })
    return
  }

  const modelPath = String(model).startsWith('models/')
    ? String(model)
    : `models/${model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`

  let supabaseAdmin = null
  let currentBalance = 0
  try {
    supabaseAdmin = getSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('ink_balance')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      res.status(500).json({ error: '讀取使用者點數失敗' })
      return
    }

    currentBalance =
      typeof profile?.ink_balance === 'number' ? profile.ink_balance : 0

    if (currentBalance <= 0) {
      res.status(402).json({ error: '墨水不足，請先補充墨水' })
      return
    }
  } catch (error) {
    res.status(500).json({ error: '點數檢查失敗' })
    return
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...payload })
    })

    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    if (response.ok && data?.usageMetadata) {
      try {
        const cost = computeInkPoints(data.usageMetadata)
        let inkSummary = null
        if (cost.points > 0) {
          const nextBalance = currentBalance - cost.points
          const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({
              ink_balance: nextBalance,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

          if (updateError) {
            console.warn('Ink balance update failed:', updateError)
            inkSummary = {
              chargedPoints: cost.points,
              balanceBefore: currentBalance,
              balanceAfter: currentBalance,
              applied: false
            }
          } else {
            inkSummary = {
              chargedPoints: cost.points,
              balanceBefore: currentBalance,
              balanceAfter: nextBalance,
              applied: true
            }
          }

          const { error: ledgerError } = await supabaseAdmin.from('ink_ledger').insert({
            user_id: user.id,
            delta: -cost.points,
            reason: 'gemini_generate_content',
            metadata: {
              model: model,
              usage: data.usageMetadata,
              cost
            }
          })

          if (ledgerError) {
            console.warn('Ink ledger insert failed:', ledgerError)
          }
        } else {
          inkSummary = {
            chargedPoints: 0,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance,
            applied: true
          }
        }

        if (inkSummary && data && typeof data === 'object') {
          data.ink = inkSummary
        }
      } catch (error) {
        console.warn('Ink billing failed:', error)
      }
    }

    res.status(response.ok ? 200 : response.status).json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Gemini API' })
  }
}
