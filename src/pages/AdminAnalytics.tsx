import { useEffect, useState } from 'react'
import { ArrowLeft, TrendingUp, Users, ShoppingCart, Droplet, Activity } from 'lucide-react'
import './AdminAnalytics.css'

type AnalyticsData = {
  overview: {
    totalUsers: number
    activeUsers: number
    totalOrders: number
    totalRevenue: number
    totalInkDistributed: number
    totalInkBalance: number
    avgInkBalance: number
  }
  recentUsers: Array<{
    id: string
    email: string
    name: string
    avatar_url: string | null
    created_at: string
  }>
  topUsers: Array<{
    id: string
    email: string
    name: string
    avatar_url: string | null
    ink_balance: number
    ink_used: number
  }>
  orders: {
    byStatus: {
      paid: number
      pending: number
      cancelled: number
    }
    recentRevenue: number
    dailyTrend: Array<{
      date: string
      count: number
      revenue: number
    }>
  }
  topPackages: Array<{
    package_id: number
    package_label: string
    drops: number
    bonus_drops: number | null
    sales_count: number
  }>
  recentInkLedger: Array<{
    id: number
    user_id: string
    delta: number
    reason: string
    metadata: any
    created_at: string
    profiles: {
      email: string
      name: string
    } | null
  }>
  userGrowth: Array<{
    date: string
    count: number
  }>
}

type Props = {
  onBack: () => void
}

export default function AdminAnalytics({ onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/analytics?action=analytics', {
        credentials: 'include'
      })
      if (!res.ok) {
        throw new Error('取得統計資料失敗')
      }
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || '發生錯誤')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(isoString: string) {
    return new Date(isoString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatCurrency(amount: number) {
    return `NT$ ${amount.toLocaleString()}`
  }

  function getReasonText(reason: string) {
    const map: Record<string, string> = {
      admin_adjustment: '管理員調整',
      admin_set_balance: '管理員設定',
      order_paid: '訂單購買',
      initial_bonus: '註冊贈送',
      correction_usage: '批改使用'
    }
    return map[reason] || reason
  }

  if (loading) {
    return (
      <div className="admin-analytics">
        <header className="analytics-header">
          <button onClick={onBack} className="back-btn">
            <ArrowLeft />
            返回
          </button>
          <h1>使用情形儀表板</h1>
        </header>
        <div className="loading-state">載入中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-analytics">
        <header className="analytics-header">
          <button onClick={onBack} className="back-btn">
            <ArrowLeft />
            返回
          </button>
          <h1>使用情形儀表板</h1>
        </header>
        <div className="error-state">{error}</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="admin-analytics">
      <header className="analytics-header">
        <button onClick={onBack} className="back-btn">
          <ArrowLeft />
          返回
        </button>
        <h1>使用情形儀表板</h1>
        <button onClick={fetchAnalytics} className="refresh-btn">
          重新整理
        </button>
      </header>

      <div className="analytics-content">
        {/* 系統概覽 */}
        <section className="overview-section">
          <h2>系統概覽</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon users-icon">
                <Users />
              </div>
              <div className="stat-info">
                <div className="stat-label">總用戶數</div>
                <div className="stat-value">{data.overview.totalUsers.toLocaleString()}</div>
                <div className="stat-sub">活躍: {data.overview.activeUsers.toLocaleString()}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orders-icon">
                <ShoppingCart />
              </div>
              <div className="stat-info">
                <div className="stat-label">總訂單數</div>
                <div className="stat-value">{data.overview.totalOrders.toLocaleString()}</div>
                <div className="stat-sub">已完成訂單</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon revenue-icon">
                <TrendingUp />
              </div>
              <div className="stat-info">
                <div className="stat-label">總收入</div>
                <div className="stat-value">{formatCurrency(data.overview.totalRevenue)}</div>
                <div className="stat-sub">累計至今</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon ink-icon">
                <Droplet />
              </div>
              <div className="stat-info">
                <div className="stat-label">墨水點數</div>
                <div className="stat-value">{data.overview.totalInkDistributed.toLocaleString()}</div>
                <div className="stat-sub">已發放 / 餘額: {data.overview.totalInkBalance.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </section>

        {/* 用戶成長趨勢 */}
        <section className="chart-section">
          <h2>用戶成長趨勢 (最近30天)</h2>
          <div className="simple-chart">
            {data.userGrowth.length === 0 ? (
              <div className="no-data">無資料</div>
            ) : (
              <div className="chart-bars">
                {data.userGrowth.map((item) => (
                  <div key={item.date} className="chart-bar-group">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.max(20, (item.count / Math.max(...data.userGrowth.map(d => d.count))) * 150)}px`
                      }}
                      title={`${item.date}: ${item.count} 位新用戶`}
                    />
                    <div className="chart-label">{item.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 訂單趨勢 */}
        <section className="chart-section">
          <h2>訂單與收入趨勢 (最近30天)</h2>
          <div className="orders-summary">
            <div className="order-status-item">
              <span className="status-label paid">已完成:</span>
              <span className="status-count">{data.orders.byStatus.paid}</span>
            </div>
            <div className="order-status-item">
              <span className="status-label pending">待處理:</span>
              <span className="status-count">{data.orders.byStatus.pending}</span>
            </div>
            <div className="order-status-item">
              <span className="status-label cancelled">已取消:</span>
              <span className="status-count">{data.orders.byStatus.cancelled}</span>
            </div>
            <div className="order-status-item">
              <span className="status-label revenue">近期收入:</span>
              <span className="status-count">{formatCurrency(data.orders.recentRevenue)}</span>
            </div>
          </div>
          <div className="simple-chart">
            {data.orders.dailyTrend.length === 0 ? (
              <div className="no-data">無訂單資料</div>
            ) : (
              <div className="chart-bars">
                {data.orders.dailyTrend.map((item) => (
                  <div key={item.date} className="chart-bar-group">
                    <div
                      className="chart-bar revenue-bar"
                      style={{
                        height: `${Math.max(20, (item.revenue / Math.max(...data.orders.dailyTrend.map(d => d.revenue))) * 150)}px`
                      }}
                      title={`${item.date}: ${item.count} 筆訂單, ${formatCurrency(item.revenue)}`}
                    />
                    <div className="chart-label">{item.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 兩欄佈局 */}
        <div className="two-column-layout">
          {/* 最活躍用戶 */}
          <section className="list-section">
            <h2>
              <Activity />
              最活躍用戶 (30天墨水使用量)
            </h2>
            <div className="user-list">
              {data.topUsers.length === 0 ? (
                <div className="no-data">無資料</div>
              ) : (
                data.topUsers.map((user) => (
                  <div key={user.id} className="user-item">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.name} className="user-avatar" />
                    ) : (
                      <div className="user-avatar-placeholder">{user.name?.[0] || '?'}</div>
                    )}
                    <div className="user-info">
                      <div className="user-name">{user.name}</div>
                      <div className="user-email">{user.email}</div>
                    </div>
                    <div className="user-stats">
                      <div className="ink-used">使用: {user.ink_used}</div>
                      <div className="ink-balance">餘額: {user.ink_balance}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 最近註冊用戶 */}
          <section className="list-section">
            <h2>
              <Users />
              最近註冊用戶 (30天內)
            </h2>
            <div className="user-list">
              {data.recentUsers.length === 0 ? (
                <div className="no-data">無新用戶</div>
              ) : (
                data.recentUsers.map((user) => (
                  <div key={user.id} className="user-item">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.name} className="user-avatar" />
                    ) : (
                      <div className="user-avatar-placeholder">{user.name?.[0] || '?'}</div>
                    )}
                    <div className="user-info">
                      <div className="user-name">{user.name}</div>
                      <div className="user-email">{user.email}</div>
                    </div>
                    <div className="user-created">
                      {formatDate(user.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 熱門購買方案 */}
        <section className="list-section">
          <h2>
            <ShoppingCart />
            熱門購買方案
          </h2>
          <div className="package-list">
            {data.topPackages.length === 0 ? (
              <div className="no-data">無方案銷售資料</div>
            ) : (
              <table className="package-table">
                <thead>
                  <tr>
                    <th>方案名稱</th>
                    <th>滴數</th>
                    <th>贈送</th>
                    <th>總計</th>
                    <th>銷售次數</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPackages.map((pkg) => (
                    <tr key={pkg.package_id}>
                      <td className="package-name">{pkg.package_label}</td>
                      <td>{pkg.drops}</td>
                      <td>{pkg.bonus_drops || 0}</td>
                      <td className="package-total">{pkg.drops + (pkg.bonus_drops || 0)}</td>
                      <td className="sales-count">{pkg.sales_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* 最近墨水點數變動 */}
        <section className="list-section">
          <h2>
            <Droplet />
            最近墨水點數變動記錄 (50筆)
          </h2>
          <div className="ledger-list">
            {data.recentInkLedger.length === 0 ? (
              <div className="no-data">無變動記錄</div>
            ) : (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>用戶</th>
                    <th>變動量</th>
                    <th>原因</th>
                    <th>詳細資訊</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInkLedger.map((record) => (
                    <tr key={record.id}>
                      <td className="ledger-time">{formatDate(record.created_at)}</td>
                      <td className="ledger-user">
                        <div>{record.profiles?.name || '未知'}</div>
                        <div className="user-email-small">{record.profiles?.email || ''}</div>
                      </td>
                      <td className={`ledger-delta ${record.delta > 0 ? 'positive' : 'negative'}`}>
                        {record.delta > 0 ? '+' : ''}{record.delta}
                      </td>
                      <td className="ledger-reason">{getReasonText(record.reason)}</td>
                      <td className="ledger-metadata">
                        {record.metadata ? (
                          <span>
                            {record.metadata.before !== undefined && `前: ${record.metadata.before} `}
                            {record.metadata.after !== undefined && `後: ${record.metadata.after}`}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
