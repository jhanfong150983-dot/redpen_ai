import { getAuthUser } from '../../../server/_auth.js'
import { getSupabaseAdmin } from '../../../server/_supabase.js'
import {
  getEcpayConfig,
  assertEcpayConfig,
  buildCheckMacValue,
  formatMerchantTradeDate,
  createMerchantTradeNo
} from '../../../server/_ecpay.js'

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

export default async function handler(req, res) {
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

    const fields = {
      MerchantID: config.merchantId,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: formatMerchantTradeDate(),
      PaymentType: 'aio',
      TotalAmount: String(amountTwd),
      TradeDesc: config.tradeDesc,
      ItemName: `墨水 ${drops} 滴`,
      ReturnURL: `${config.siteUrl}/api/ink/ecpay/notify`,
      ClientBackURL: `${config.siteUrl}/`,
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
