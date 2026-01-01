import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Droplet,
  RefreshCw,
  Loader,
  CheckCircle,
  XCircle,
  CreditCard
} from 'lucide-react'
import { dispatchInkBalance } from '@/lib/ink-events'
import { dispatchLegalModal } from '@/lib/legal-events'
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  REFUND_FEE_RATE
} from '@/lib/legal'

interface InkTopUpProps {
  onBack?: () => void
  currentBalance?: number
}

interface InkOrder {
  id: number
  drops: number
  bonus_drops?: number | null
  package_id?: number | null
  package_label?: string | null
  package_description?: string | null
  amount_twd: number
  status: string
  provider: string
  provider_txn_id?: string | null
  created_at?: string
  updated_at?: string
}

interface InkPackage {
  id: number
  drops: number
  label: string
  description?: string | null
  bonus_drops?: number | null
  starts_at?: string | null
  ends_at?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

function normalizeOrderStatus(status: string) {
  return status
}

function formatOrderStatus(status: string) {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'paid') {
    return { label: '已完成', color: 'text-emerald-600 bg-emerald-50' }
  }
  if (normalized === 'pending') {
    return { label: '金流確認中', color: 'text-amber-600 bg-amber-50' }
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return { label: '付款失敗', color: 'text-red-600 bg-red-50' }
  }
  return { label: '付款失敗', color: 'text-red-600 bg-red-50' }
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

export default function InkTopUp({ onBack, currentBalance = 0 }: InkTopUpProps) {
  const [orders, setOrders] = useState<InkOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPackages, setIsLoadingPackages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [packageError, setPackageError] = useState<string | null>(null)

  const [packageOptions, setPackageOptions] = useState<InkPackage[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null)
  const [isEcpaySubmitting, setIsEcpaySubmitting] = useState(false)
  const [hasAgreed, setHasAgreed] = useState(false)

  const selectedPackage =
    packageOptions.find((option) => option.id === selectedPackageId) ?? null
  const effectiveDrops = selectedPackage?.drops ?? null
  const bonusDrops =
    typeof selectedPackage?.bonus_drops === 'number' && selectedPackage.bonus_drops > 0
      ? selectedPackage.bonus_drops
      : 0
  const totalDrops = effectiveDrops ? effectiveDrops + bonusDrops : 0
  const refundFeePercent = Math.round(REFUND_FEE_RATE * 1000) / 10
  const isCheckoutLocked = true // TODO: 綠界付款恢復後改成 false
  const pendingOrders = orders.filter((order) => order.status === 'pending')
  const pendingBaseDrops = pendingOrders.reduce(
    (sum, order) => sum + (Number(order.drops) || 0),
    0
  )
  const pendingBonusDrops = pendingOrders.reduce(
    (sum, order) =>
      sum + (typeof order.bonus_drops === 'number' ? order.bonus_drops : 0),
    0
  )
  const pendingTotalDrops = pendingBaseDrops + pendingBonusDrops
  const pendingAmountTwd = pendingOrders.reduce(
    (sum, order) => sum + (Number(order.amount_twd) || 0),
    0
  )

  const fetchOrders = async (): Promise<InkOrder[]> => {
    const response = await fetch('/api/ink/orders', {
      credentials: 'include'
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data?.error || '讀取訂單失敗')
    }
    const data = await response.json()
    return Array.isArray(data?.orders) ? (data.orders as InkOrder[]) : []
  }

  const loadOrders = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const list = await fetchOrders()
      setOrders(list)
      return list
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取訂單失敗')
      return []
    } finally {
      setIsLoading(false)
    }
  }

  const loadPackages = async () => {
    setIsLoadingPackages(true)
    setPackageError(null)
    try {
      const response = await fetch('/api/ink/orders?action=packages', {
        credentials: 'include'
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setPackageError(data?.error || '讀取方案失敗')
        setPackageOptions([])
        return
      }
      const data = await response.json()
      const list = Array.isArray(data?.packages) ? data.packages : []
      setPackageOptions(list as InkPackage[])
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : '讀取方案失敗')
      setPackageOptions([])
    } finally {
      setIsLoadingPackages(false)
    }
  }

  const refreshBalance = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      const balance = data?.user?.inkBalance
      if (typeof balance === 'number' && Number.isFinite(balance)) {
        dispatchInkBalance(balance)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let pollTimer: number | null = null
    let isActive = true

    void loadOrders()
    void loadPackages()

    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    const orderIdParam = params.get('orderId')
    const targetOrderId = orderIdParam ? Number.parseInt(orderIdParam, 10) : null

    if (payment === 'ecpay') {
      const orderLabel = orderIdParam ? `訂單 #${orderIdParam} ` : ''
      setMessage(`${orderLabel}已送出付款，系統將自動更新點數。`)

      if (!targetOrderId) {
        void loadOrders()
        void refreshBalance()
      } else {
        const pollOnce = async () => {
          try {
            const list = await fetchOrders()
            if (!isActive) return false
            setOrders(list)

            const matched = list.find((order) => order.id === targetOrderId)
            if (matched?.status === 'paid') {
              setMessage(`${orderLabel}付款完成，已加點。`)
              await refreshBalance()
              return true
            }
            if (matched?.status === 'cancelled' || matched?.status === 'canceled') {
              setMessage(`${orderLabel}付款失敗。`)
              return true
            }
          } catch {
            // ignore
          }
          return false
        }

        let attempts = 0
        const maxAttempts = 24
        const intervalMs = 5000

        const startPolling = async () => {
          const done = await pollOnce()
          if (done || !isActive) return

          pollTimer = window.setInterval(async () => {
            attempts += 1
            const finished = await pollOnce()
            if (finished || attempts >= maxAttempts) {
              if (attempts >= maxAttempts) {
                setMessage(`${orderLabel}付款未完成，請重新下單。`)
              }
              if (pollTimer !== null) {
                clearInterval(pollTimer)
              }
            }
          }, intervalMs)
        }

        void startPolling()
      }

    }

    if (params.has('payment') || params.has('orderId')) {
      params.delete('payment')
      params.delete('orderId')
      const query = params.toString()
      const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
      window.history.replaceState({}, '', url)
    }

    return () => {
      isActive = false
      if (pollTimer !== null) {
        clearInterval(pollTimer)
      }
    }
  }, [])

  useEffect(() => {
    if (packageOptions.length === 0) {
      if (selectedPackageId !== null) {
        setSelectedPackageId(null)
      }
      return
    }
    const hasSelected = packageOptions.some(
      (option) => option.id === selectedPackageId
    )
    if (!hasSelected) {
      setSelectedPackageId(packageOptions[0]?.id ?? null)
    }
  }, [packageOptions, selectedPackageId])

  const handleSelectPackage = (packageId: number) => {
    setSelectedPackageId(packageId)
    setMessage(null)
  }

  const handleEcpayCheckout = async () => {
    if (!selectedPackage || !selectedPackage.id) {
      setError('請選擇補充方案')
      return
    }
    if (!hasAgreed) {
      setError('請先閱讀並同意條款與放棄七天鑑賞期')
      return
    }

    setError(null)
    setMessage(null)
    setIsEcpaySubmitting(true)

    try {
      const response = await fetch('/api/ink/ecpay?action=checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          packageId: selectedPackage.id,
          consent: true,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || '建立付款失敗')
      }

      const data = await response.json()
      if (!data?.action || !data?.fields) {
        throw new Error('付款資料不完整')
      }

      const form = document.createElement('form')
      form.method = 'POST'
      form.action = data.action

      Object.entries(data.fields).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = String(value)
        form.appendChild(input)
      })

      document.body.appendChild(form)
      form.submit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立付款失敗')
      setIsEcpaySubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-5xl mx-auto pt-8">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回首頁
          </button>
        )}

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-sky-100 rounded-xl">
                <Droplet className="w-7 h-7 text-sky-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">補充墨水</h1>
                <p className="text-sm text-gray-600">
                  僅支援綠界付款，依方案設定加贈免費額度
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">可用墨水</p>
              <p className="text-lg font-semibold text-gray-900">
                {currentBalance} 滴
              </p>
              {pendingTotalDrops > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  待入帳 {pendingTotalDrops} 滴（{pendingAmountTwd} 元）
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            {packageError && (
              <div className="col-span-full p-3 bg-red-50 border border-red-200 text-xs text-red-700 rounded-xl">
                {packageError}
              </div>
            )}
            {packageOptions.map((item) => {
              const isSelected = selectedPackageId === item.id
              const itemBonus =
                typeof item.bonus_drops === 'number' && item.bonus_drops > 0
                  ? item.bonus_drops
                  : 0
              const itemTotal = item.drops + itemBonus
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPackage(item.id)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-sky-400 bg-sky-50'
                      : 'border-gray-200 bg-white hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-sm text-sky-600 font-semibold">
                        {item.drops} 滴
                      </span>
                      {itemBonus > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">
                          +{itemBonus} 贈送
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{item.description}</p>
                  {itemBonus > 0 && (
                    <p className="mt-1 text-xs text-emerald-600">
                      實際獲得 {itemTotal} 滴
                    </p>
                  )}
                </button>
              )
            })}
            {isLoadingPackages && (
              <div className="col-span-full flex items-center gap-2 text-xs text-gray-500">
                <Loader className="w-3.5 h-3.5 animate-spin" />
                載入方案中...
              </div>
            )}
            {!isLoadingPackages && packageOptions.length === 0 && (
              <div className="col-span-full text-xs text-gray-500">
                尚未設定補充方案，請聯繫管理者。
              </div>
            )}
          </div>

          <div className="mt-5 grid md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">本次金額</p>
              <p className="text-lg font-semibold text-gray-900">
                {effectiveDrops ?? 0} 元
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs text-emerald-700">加贈墨水</p>
              <p className="text-lg font-semibold text-emerald-700">
                {bonusDrops} 滴
              </p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-xs text-sky-700">實際獲得</p>
              <p className="text-lg font-semibold text-sky-700">
                {totalDrops} 滴
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700 space-y-2">
            <p>
              本服務為數位內容／線上服務，一經購買或使用即視為開始提供，依法排除七天鑑賞期。
            </p>
            <p>
              已使用點數不退；未使用點數可退，需扣除 {refundFeePercent}% 手續費。
              贈送點數不具退款價值，退款以購買點數為準。
              退款請來電聯係處理，將以匯款方式退回(匯款手續費由買方負擔)。
            </p>
            <label className="flex items-start gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={hasAgreed}
                onChange={(e) => {
                  setHasAgreed(e.target.checked)
                  setError(null)
                }}
                className="mt-0.5 w-4 h-4 text-emerald-600 border-gray-300 rounded"
              />
              <span>
                我已閱讀說明並同意
                <button
                  type="button"
                  onClick={() => dispatchLegalModal('terms')}
                  className="text-emerald-700 underline underline-offset-2 mx-1"
                >
                  服務條款
                </button>
                與
                <button
                  type="button"
                  onClick={() => dispatchLegalModal('privacy')}
                  className="text-emerald-700 underline underline-offset-2 mx-1"
                >
                  隱私權政策
                </button>
                ，並同意放棄七天鑑賞期。
              </span>
            </label>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
              {error}
            </div>
          )}
          {message && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 rounded-xl">
              {message}
            </div>
          )}
          {pendingTotalDrops > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-700 rounded-xl">
              有待入帳訂單正在金流確認中，完成後會自動入帳；若未完成則視為付款失敗。
            </div>
          )}

          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-xs text-gray-500">
              付款完成後，系統會自動加點，若未更新可重新整理。
            </p>
            <div className="flex flex-wrap gap-2">
              {isCheckoutLocked && (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  目前暫停開放付款，請稍後再試。
                </div>
              )}
              <button
                type="button"
                onClick={handleEcpayCheckout}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isCheckoutLocked || isEcpaySubmitting || !selectedPackage || !hasAgreed}
              >
                {isCheckoutLocked ? (
                  '暫停付款'
                ) : isEcpaySubmitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    轉接中...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    綠界付款
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">訂單紀錄</h2>
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader className="w-4 h-4 animate-spin" />
              載入中...
            </div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-gray-500">尚無訂單紀錄</div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const status = formatOrderStatus(order.status)
                const normalizedStatus = normalizeOrderStatus(order.status)
                const orderBonus =
                  typeof order.bonus_drops === 'number' && order.bonus_drops > 0
                    ? order.bonus_drops
                    : 0
                const orderTotal = order.drops + orderBonus
                const orderLabel = order.package_label || `${order.drops} 滴`
                return (
                  <div
                    key={order.id}
                    className="border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {orderLabel} / {order.amount_twd} 元
                        {orderBonus > 0 ? `（加贈 ${orderBonus}，共 ${orderTotal} 滴）` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        建立時間：{formatDate(order.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                      {normalizedStatus === 'paid' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : normalizedStatus === 'pending' ? (
                        <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
