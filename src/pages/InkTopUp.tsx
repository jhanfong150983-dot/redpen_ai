import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Droplet,
  RefreshCw,
  Loader,
  CheckCircle,
  Clock,
  XCircle,
  CreditCard
} from 'lucide-react'
import { dispatchInkBalance } from '@/lib/ink-events'

interface InkTopUpProps {
  onBack?: () => void
  currentBalance?: number
}

interface InkOrder {
  id: number
  drops: number
  amount_twd: number
  status: string
  provider: string
  provider_txn_id?: string | null
  created_at?: string
  updated_at?: string
}

const PACKAGE_OPTIONS = [
  { drops: 30, label: '輕量補充', description: '適合試用或小量需求' },
  { drops: 50, label: '標準補充', description: '常用老師日常需求' },
  { drops: 100, label: '進階補充', description: '批改量較大時使用' },
  { drops: 300, label: '大量補充', description: '適合大量班級或期末' }
]

function formatOrderStatus(status: string) {
  switch (status) {
    case 'paid':
      return { label: '已完成', color: 'text-emerald-600 bg-emerald-50' }
    case 'cancelled':
    case 'canceled':
      return { label: '已取消', color: 'text-gray-500 bg-gray-100' }
    default:
      return { label: '待付款', color: 'text-amber-700 bg-amber-50' }
  }
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
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [selectedDrops, setSelectedDrops] = useState<number | null>(
    PACKAGE_OPTIONS[1]?.drops ?? null
  )
  const [customDrops, setCustomDrops] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEcpaySubmitting, setIsEcpaySubmitting] = useState(false)

  const effectiveDrops = useMemo(() => {
    const customValue = Number.parseInt(customDrops, 10)
    if (Number.isFinite(customValue) && customValue > 0) {
      return customValue
    }
    return selectedDrops ?? null
  }, [customDrops, selectedDrops])

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

  const refreshBalance = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      const balance = Number(data?.user?.inkBalance)
      if (Number.isFinite(balance)) {
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
              setMessage(`${orderLabel}已取消。`)
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
                setMessage(`${orderLabel}尚未完成付款，請稍後重新整理。`)
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

  const handleSelectPackage = (drops: number) => {
    setSelectedDrops(drops)
    setCustomDrops('')
    setMessage(null)
  }

  const handleCustomChange = (value: string) => {
    setCustomDrops(value)
    if (value.trim()) {
      setSelectedDrops(null)
    }
    setMessage(null)
  }

  const handleCreateOrder = async () => {
    if (!effectiveDrops || effectiveDrops <= 0) {
      setError('請選擇或輸入補充滴數')
      return
    }
    setError(null)
    setMessage(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/ink/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          drops: effectiveDrops,
          provider: 'manual'
        })
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || '建立訂單失敗')
      }

      setMessage('訂單已建立，待完成付款後會自動加點。')
      await loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立訂單失敗')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEcpayCheckout = async () => {
    if (!effectiveDrops || effectiveDrops <= 0) {
      setError('請選擇或輸入補充滴數')
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
        body: JSON.stringify({ drops: effectiveDrops })
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
                  1 滴 = 1 元，建立訂單後等待付款完成
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">目前墨水</p>
              <p className="text-lg font-semibold text-gray-900">
                {currentBalance} 滴
              </p>
            </div>
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            {PACKAGE_OPTIONS.map((item) => {
              const isSelected = selectedDrops === item.drops && !customDrops
              return (
                <button
                  key={item.drops}
                  type="button"
                  onClick={() => handleSelectPackage(item.drops)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-sky-400 bg-sky-50'
                      : 'border-gray-200 bg-white hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.label}
                    </span>
                    <span className="text-sm text-sky-600 font-semibold">
                      {item.drops} 滴
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{item.description}</p>
                </button>
              )
            })}
          </div>

          <div className="mt-5 grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                自訂滴數
              </label>
              <input
                type="number"
                value={customDrops}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="輸入欲購買的滴數"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                min={1}
                disabled={isSubmitting}
              />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">本次金額</p>
              <p className="text-lg font-semibold text-gray-900">
                {effectiveDrops ?? 0} 元
              </p>
            </div>
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

          <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-xs text-gray-500">
              付款完成後，系統會自動加點，若未更新可重新整理。
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleEcpayCheckout}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isEcpaySubmitting || !effectiveDrops}
              >
                {isEcpaySubmitting ? (
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
              <button
                type="button"
                onClick={handleCreateOrder}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
                disabled={isSubmitting || !effectiveDrops}
              >
                {isSubmitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    建立中...
                  </>
                ) : (
                  '先建立訂單'
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
                return (
                  <div
                    key={order.id}
                    className="border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {order.drops} 滴 / {order.amount_twd} 元
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
                      {order.status === 'paid' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : order.status === 'cancelled' || order.status === 'canceled' ? (
                        <XCircle className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-500" />
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
