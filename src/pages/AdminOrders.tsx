import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Receipt,
  Search,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  Loader
} from 'lucide-react'

interface AdminOrdersProps {
  onBack?: () => void
}

interface OrderUser {
  id: string
  email?: string
  name?: string
  ink_balance?: number
}

interface AdminOrder {
  id: number
  user_id: string
  drops: number
  amount_twd: number
  status: string
  provider: string
  provider_txn_id?: string | null
  created_at?: string
  updated_at?: string
  user?: OrderUser | null
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'cancelled'

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-TW')
}

function statusMeta(status: string) {
  if (status === 'paid') {
    return { label: '已完成', color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle }
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { label: '已取消', color: 'text-gray-500 bg-gray-100', icon: XCircle }
  }
  return { label: '待付款', color: 'text-amber-700 bg-amber-50', icon: Clock }
}

export default function AdminOrders({ onBack }: AdminOrdersProps) {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const loadOrders = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/ink-orders', {
        credentials: 'include'
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || '讀取訂單失敗')
      }
      const data = await response.json()
      setOrders(Array.isArray(data?.orders) ? data.orders : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取訂單失敗')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false
      }
      if (!keyword) return true
      const user = order.user
      const haystack = [
        String(order.id),
        order.user_id,
        user?.email,
        user?.name,
        order.status,
        order.provider
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [orders, query, statusFilter])

  const updateOrderStatus = async (orderId: number, status: 'paid' | 'cancelled') => {
    const confirmText =
      status === 'paid'
        ? '標記已付款後會立即加點，確定要繼續嗎？'
        : '確定要取消此訂單嗎？'
    if (!window.confirm(confirmText)) return

    setIsUpdating(orderId)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/ink-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId, status })
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || '更新訂單失敗')
      }
      setMessage(status === 'paid' ? '已完成加點' : '訂單已取消')
      await loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新訂單失敗')
    } finally {
      setIsUpdating(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-8">
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
                <Receipt className="w-7 h-7 text-sky-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">訂單管理</h1>
                <p className="text-sm text-gray-600">
                  審核訂單並手動加點（待綠界串接）
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>

          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋訂單 ID / Email / 使用者"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['all', 'pending', 'paid', 'cancelled'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-full border ${
                    statusFilter === status
                      ? 'border-sky-400 bg-sky-50 text-sky-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {status === 'all'
                    ? '全部'
                    : status === 'pending'
                      ? '待付款'
                      : status === 'paid'
                        ? '已完成'
                        : '已取消'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 rounded-xl">
            {message}
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-3 text-sm text-gray-600">
            <Loader className="w-4 h-4 animate-spin" />
            載入中...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-6 text-sm text-gray-500">
            尚無訂單資料
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const meta = statusMeta(order.status)
              const StatusIcon = meta.icon
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl shadow p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      訂單 #{order.id} · {order.drops} 滴 / {order.amount_twd} 元
                    </p>
                    <p className="text-xs text-gray-500">
                      使用者：{order.user?.name || '—'}（{order.user?.email || order.user_id}）
                    </p>
                    <p className="text-xs text-gray-400">
                      建立時間：{formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                    <StatusIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'paid')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      disabled={order.status === 'paid' || isUpdating === order.id}
                    >
                      {isUpdating === order.id && order.status !== 'paid' ? '處理中...' : '標記已付款'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={order.status !== 'pending' || isUpdating === order.id}
                    >
                      取消訂單
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
