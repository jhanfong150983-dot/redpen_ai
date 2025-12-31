import { getSupabaseAdmin } from '../_supabase.js'
import {
  getEcpayConfig,
  assertEcpayConfig,
  buildCheckMacValue,
  parseEcpayPayload
} from '../_ecpay.js'

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
