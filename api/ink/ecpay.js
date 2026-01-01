import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'
import {
  getEcpayConfig,
  assertEcpayConfig,
  buildCheckMacValue,
  formatMerchantTradeDate,
  createMerchantTradeNo,
  parseEcpayPayload
} from '../../server/_ecpay.js'

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

async function createOrderWithTradeNo(supabaseAdmin, userId, drops, amountTwd) {
  let attempts = 0
  let lastError = null

  while (attempts < 3) {
    attempts += 1
    const tradeNo = createMerchantTradeNo()
    const { data, error } = await supabaseAdmin
      .from('ink_orders')
      .insert({
        user_id: userId,
        drops,
        amount_twd: amountTwd,
        status: 'pending',
        provider: 'ecpay',
        provider_txn_id: tradeNo
      })
      .select(
        'id, drops, amount_twd, status, provider, provider_txn_id, created_at, updated_at'
      )
      .single()

    if (!error) {
      return { order: data, tradeNo }
    }

    lastError = error
    if (error.code !== '23505') {
      break
    }
  }

  throw new Error(lastError?.message || '建立訂單失敗')
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

async function handleCheckout(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const payload = parseJsonBody(req, res)
  if (!payload) return

  const drops = parsePositiveInt(payload.drops)
  if (!drops) {
    res.status(400).json({ error: '請輸入有效的墨水滴數' })
    return
  }

  const config = getEcpayConfig()
  try {
    assertEcpayConfig(config)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'ECPay 設定缺失' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()
  const amountTwd = drops

  try {
    const { order, tradeNo } = await createOrderWithTradeNo(
      supabaseAdmin,
      user.id,
      drops,
      amountTwd
    )

    const clientBackUrl = `${config.siteUrl}/?page=ink-topup&payment=ecpay&orderId=${order.id}`
    const fields = {
      MerchantID: config.merchantId,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: formatMerchantTradeDate(),
      PaymentType: 'aio',
      TotalAmount: String(amountTwd),
      TradeDesc: config.tradeDesc,
      ItemName: `墨水 ${drops} 滴`,
      ReturnURL: `${config.siteUrl}/api/ink/ecpay?action=notify`,
      ClientBackURL: clientBackUrl,
      ChoosePayment: config.choosePayment,
      EncryptType: '1',
      CustomField1: String(order.id)
    }

    const checkMacValue = buildCheckMacValue(fields, config.hashKey, config.hashIv)

    res.status(200).json({
      action: config.baseUrl,
      fields: {
        ...fields,
        CheckMacValue: checkMacValue
      },
      orderId: order.id
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '建立訂單失敗' })
  }
}

async function handleNotify(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('0|Method Not Allowed')
    return
  }

  const config = getEcpayConfig()
  try {
    assertEcpayConfig(config)
  } catch (error) {
    res.status(500).send('0|Missing config')
    return
  }

  const payload = parseEcpayPayload(req.body)
  const receivedCheckMac = String(payload.CheckMacValue || '')

  if (!receivedCheckMac) {
    res.status(400).send('0|Missing CheckMacValue')
    return
  }

  const { CheckMacValue: _omit, ...payloadForCheck } = payload
  const expectedCheckMac = buildCheckMacValue(
    payloadForCheck,
    config.hashKey,
    config.hashIv
  )

  if (expectedCheckMac !== receivedCheckMac.toUpperCase()) {
    res.status(400).send('0|CheckMacValue Error')
    return
  }

  const rtnCode = String(payload.RtnCode || '')
  if (rtnCode !== '1') {
    res.status(200).send('1|OK')
    return
  }

  const merchantTradeNo = String(payload.MerchantTradeNo || '')
  const tradeAmount = Number.parseInt(String(payload.TradeAmt || ''), 10)

  if (!merchantTradeNo) {
    res.status(400).send('0|Missing MerchantTradeNo')
    return
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: order, error: orderError } = await supabaseAdmin
    .from('ink_orders')
    .select('id, user_id, drops, amount_twd, status, provider_txn_id, provider')
    .eq('provider', 'ecpay')
    .eq('provider_txn_id', merchantTradeNo)
    .maybeSingle()

  if (orderError) {
    res.status(500).send('0|Order lookup failed')
    return
  }

  if (!order) {
    res.status(404).send('0|Order not found')
    return
  }

  if (Number.isFinite(tradeAmount) && tradeAmount !== order.amount_twd) {
    res.status(400).send('0|Amount mismatch')
    return
  }

  if (order.status === 'paid') {
    res.status(200).send('1|OK')
    return
  }

  try {
    const hasLedger = await hasOrderLedger(supabaseAdmin, order.user_id, order.id)

    if (!hasLedger) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('ink_balance')
        .eq('id', order.user_id)
        .maybeSingle()

      if (profileError) {
        res.status(500).send('0|Profile lookup failed')
        return
      }

      const currentBalance =
        typeof profile?.ink_balance === 'number' ? profile.ink_balance : 0
      const balanceAfter = currentBalance + order.drops

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          ink_balance: balanceAfter,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.user_id)

      if (updateError) {
        res.status(500).send('0|Balance update failed')
        return
      }

      const { error: ledgerError } = await supabaseAdmin.from('ink_ledger').insert({
        user_id: order.user_id,
        delta: order.drops,
        reason: 'order_paid',
        metadata: {
          orderId: order.id,
          provider: order.provider,
          tradeNo: payload.TradeNo,
          merchantTradeNo,
          amountTwd: order.amount_twd,
          drops: order.drops,
          balanceBefore: currentBalance,
          balanceAfter
        }
      })

      if (ledgerError) {
        res.status(500).send('0|Ledger insert failed')
        return
      }
    }

    const { error: updateOrderError } = await supabaseAdmin
      .from('ink_orders')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', order.id)

    if (updateOrderError) {
      res.status(500).send('0|Order update failed')
      return
    }

    res.status(200).send('1|OK')
  } catch (error) {
    res.status(500).send('0|Server Error')
  }
}

export default async function handler(req, res) {
  const action = resolveAction(req)
  if (action === 'checkout') {
    await handleCheckout(req, res)
    return
  }
  if (action === 'notify') {
    await handleNotify(req, res)
    return
  }
  res.status(404).json({ error: 'Not Found' })
}
