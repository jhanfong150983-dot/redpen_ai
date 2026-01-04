import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  Shield,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Loader,
  Crown
} from 'lucide-react'
import { useAdminViewAs } from '@/lib/admin-view-as'

interface AdminUsersProps {
  onBack?: () => void
}

interface AdminUser {
  id: string
  email?: string
  name?: string
  avatar_url?: string
  role?: string
  permission_tier?: string
  ink_balance?: number
  admin_note?: string
  created_at?: string
  updated_at?: string
}

type BalanceMode = 'none' | 'set' | 'delta'

export default function AdminUsers({ onBack }: AdminUsersProps) {
  const { viewAs, setViewAs, clearViewAs } = useAdminViewAs()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [role, setRole] = useState('user')
  const [permissionTier, setPermissionTier] = useState('basic')
  const [adminNote, setAdminNote] = useState('')
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('none')
  const [balanceValue, setBalanceValue] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const viewAsLabel = viewAs
    ? viewAs.name || viewAs.email || viewAs.ownerId
    : ''

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/users?action=users', { credentials: 'include' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setUsers([])
        setError(data?.error || '讀取使用者清單失敗')
        return
      }

      const data = await response.json()
      setUsers(Array.isArray(data?.users) ? data.users : [])
    } catch (err) {
      setUsers([])
      setError(err instanceof Error ? err.message : '讀取使用者清單失敗')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return users
    return users.filter((user) => {
      const haystack = [
        user.email,
        user.name,
        user.id,
        user.role,
        user.permission_tier
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [users, query])

  const formatDate = (value?: string) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-TW')
  }

  const openEdit = (user: AdminUser) => {
    setEditingUser(user)
    setRole(user.role || 'user')
    setPermissionTier(user.permission_tier || 'basic')
    setAdminNote(user.admin_note || '')
    setBalanceMode('none')
    setBalanceValue('')
    setModalError(null)
  }

  const closeEdit = () => {
    if (isSaving) return
    setEditingUser(null)
    setModalError(null)
  }

  const handleSelectBalanceMode = (mode: BalanceMode) => {
    setBalanceMode(mode)
    if (mode === 'set') {
      setBalanceValue(String(editingUser?.ink_balance ?? 0))
      return
    }
    setBalanceValue('')
  }

  const handleSave = async () => {
    if (!editingUser) return
    setModalError(null)

    const payload: Record<string, unknown> = {
      userId: editingUser.id,
      role,
      permission_tier: permissionTier,
      admin_note: adminNote
    }

    if (balanceMode !== 'none') {
      const parsed = Number.parseInt(balanceValue, 10)
      if (!Number.isFinite(parsed)) {
        setModalError('請輸入有效的點數')
        return
      }
      if (balanceMode === 'set' && parsed < 0) {
        setModalError('設定點數不可小於 0')
        return
      }
      if (balanceMode === 'set') {
        payload.ink_balance = parsed
      } else {
        payload.ink_balance_delta = parsed
      }
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/users?action=users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setModalError(data?.error || '更新使用者失敗')
        return
      }

      await loadUsers()
      setEditingUser(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '更新使用者失敗')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editingUser) return
    const display = editingUser.email || editingUser.name || editingUser.id
    const ok = window.confirm(`確定要刪除使用者「${display}」嗎？`)
    if (!ok) return

    setIsSaving(true)
    setModalError(null)

    try {
      const response = await fetch('/api/admin/users?action=users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: editingUser.id })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setModalError(data?.error || '刪除使用者失敗')
        return
      }

      await loadUsers()
      setEditingUser(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '刪除使用者失敗')
    } finally {
      setIsSaving(false)
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
              <div className="p-3 bg-amber-100 rounded-xl">
                <Shield className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">管理者介面</h1>
                <p className="text-sm text-gray-600">
                  查看 / 編輯 / 刪除使用者點數與權限
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>

          {viewAs && (
            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div>
                目前檢視中：<span className="font-semibold">{viewAsLabel}</span>
              </div>
              <button
                type="button"
                onClick={clearViewAs}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-white"
              >
                退出檢視
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋姓名、Email、ID"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <div className="text-xs text-gray-500">
              共 {users.length} 位使用者
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-3 text-sm text-gray-600">
            <Loader className="w-4 h-4 animate-spin" />
            載入中...
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="bg-white rounded-2xl shadow p-6 text-sm text-gray-500">
                查無符合條件的使用者
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isViewing = viewAs?.ownerId === user.id
                return (
                  <div
                    key={user.id}
                    className="bg-white rounded-2xl shadow p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                  >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-semibold flex-shrink-0">
                      {(user.name || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user.name || '未命名使用者'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email || user.id}
                      </p>
                      <p className="text-xs text-gray-400">
                        建立：{formatDate(user.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                      角色：{user.role || 'user'}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                      <span>權限：</span>
                      {user.permission_tier === 'advanced' ? (
                        <>
                          <Crown className="w-3.5 h-3.5 text-amber-500" />
                          Pro
                        </>
                      ) : (
                        'Basic'
                      )}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                      墨水：{user.ink_balance ?? 0} 滴
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setViewAs({
                          ownerId: user.id,
                          name: user.name,
                          email: user.email
                        })
                      }
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        isViewing
                          ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                      disabled={isViewing}
                    >
                      {isViewing ? '檢視中' : '切換檢視'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(user)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit2 className="w-4 h-4" />
                      編輯
                    </button>
                  </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeEdit}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  編輯使用者
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {editingUser.email || editingUser.id}
                </p>
                <p className="text-xs text-gray-400">
                  目前墨水：{editingUser.ink_balance ?? 0} 滴
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                disabled={isSaving}
              >
                X
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {modalError && (
                <div className="p-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {modalError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    角色
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    disabled={isSaving}
                  >
                    <option value="user">一般使用者</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    權限
                  </label>
                  <select
                    value={permissionTier}
                    onChange={(e) => setPermissionTier(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    disabled={isSaving}
                  >
                    <option value="basic">Basic</option>
                    <option value="advanced">Pro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  點數調整
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['none', 'set', 'delta'] as BalanceMode[]).map((mode) => {
                    const label =
                      mode === 'none'
                        ? '不調整'
                        : mode === 'set'
                          ? '設定點數'
                          : '加減點數'
                    const active = balanceMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleSelectBalanceMode(mode)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          active
                            ? 'bg-amber-100 border-amber-400 text-amber-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        disabled={isSaving}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {balanceMode !== 'none' && (
                  <div className="mt-3">
                    <input
                      type="number"
                      value={balanceValue}
                      onChange={(e) => setBalanceValue(e.target.value)}
                      placeholder={balanceMode === 'set' ? '設定為指定點數' : '輸入增減數量'}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      min={balanceMode === 'set' ? 0 : undefined}
                      step={1}
                      disabled={isSaving}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {balanceMode === 'delta'
                        ? '可輸入負數（例如 -3）表示扣點'
                        : '設定後會直接覆寫目前點數'}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  管理者註記
                </label>
                <textarea
                  rows={4}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="可記錄付款方式、聯繫備註等"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                disabled={isSaving}
              >
                <Trash2 className="w-4 h-4" />
                刪除使用者
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                  disabled={isSaving}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      儲存中...
                    </>
                  ) : (
                    '儲存變更'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
