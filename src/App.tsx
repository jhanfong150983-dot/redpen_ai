import { useState, useEffect, useCallback } from 'react'
import { Users, BookOpen, Sparkles, FileImage, ClipboardCheck } from 'lucide-react'
import ClassroomManagement from '@/pages/ClassroomManagement'
import AssignmentSetup from '@/pages/AssignmentSetup'
import AssignmentList from '@/pages/AssignmentList'
import GradingPage from '@/pages/GradingPage'
import AssignmentImport from '@/pages/AssignmentImport'
import AssignmentImportSelect from '@/pages/AssignmentImportSelect'
import AssignmentScanImport from '@/pages/AssignmentScanImport'
import CorrectionSelect from '@/pages/CorrectionSelect'
import CorrectionManagement from '@/pages/CorrectionManagement'
import Gradebook from '@/pages/Gradebook'
import { SyncIndicator } from '@/components'
import { checkWebPSupport } from '@/lib/webpSupport'
import '@/lib/debug-sync'

type Page =
  | 'home'
  | 'classroom-management'
  | 'assignment-setup'
  | 'assignment-import-select'
  | 'assignment-scan'
  | 'grading-list'
  | 'grading'
  | 'gradebook'
  | 'assignment-import'
  | 'correction-select'
  | 'correction'

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated'; error?: string }
  | {
      status: 'authenticated'
      user: {
        id: string
        email: string
        name?: string
        avatarUrl?: string
      }
    }

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('')

  const fetchAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (!response.ok) {
        setAuth({ status: 'unauthenticated' })
        return
      }

      const data = await response.json()
      if (!data?.user?.id) {
        setAuth({ status: 'unauthenticated' })
        return
      }

      setAuth({
        status: 'authenticated',
        user: data.user
      })
    } catch (error) {
      console.error('驗證登入狀態失敗', error)
      setAuth({ status: 'unauthenticated', error: '無法連線到伺服器' })
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('登出失敗', error)
    } finally {
      setAuth({ status: 'unauthenticated' })
      setCurrentPage('home')
      setSelectedAssignmentId('')
    }
  }, [])

  useEffect(() => {
    void fetchAuth()
  }, [fetchAuth])

  useEffect(() => {
    const handleFocus = () => {
      void fetchAuth()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchAuth])

  // 應用啟動時檢測 WebP 支持（用於平板Chrome兼容性）
  useEffect(() => {
    checkWebPSupport().then((supported) => {
      console.log('📱 設備信息:')
      console.log(`  User Agent: ${navigator.userAgent}`)
      console.log(`  🎨 WebP 編碼支持: ${supported ? '是 ✅' : '否 ❌ (將使用 JPEG fallback)'}`)
      console.log(`  螢幕尺寸: ${window.innerWidth}x${window.innerHeight}`)
      console.log(
        `  設備類型: ${window.innerWidth < 768 ? '手機/平板' : '桌面'}`
      )
    })
  }, [])

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">驗證登入狀態...</p>
        </div>
      </div>
    )
  }

  if (auth.status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <img
            src="/logo.png"
            alt="RedPen AI logo"
            className="w-20 h-20 mx-auto object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900">RedPen AI</h1>
          <p className="text-sm text-gray-600">
            請先登入 Google 帳號才能使用完整功能。
          </p>
          {auth.error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {auth.error}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/auth/google'
            }}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            使用 Google 登入
          </button>
        </div>
      </div>
    )
  }

  // 班級管理
  if (currentPage === 'classroom-management') {
    return <ClassroomManagement onBack={() => setCurrentPage('home')} />
  }

  // 作業管理
  if (currentPage === 'assignment-setup') {
    return <AssignmentSetup onBack={() => setCurrentPage('home')} />
  }

  // 作業匯入：選擇作業並決定匯入方式
  if (currentPage === 'assignment-import-select') {
    return (
      <AssignmentImportSelect
        onBack={() => setCurrentPage('home')}
        onSelectScanImport={(assignmentId) => {
          setSelectedAssignmentId(assignmentId)
          setCurrentPage('assignment-scan')
        }}
        onSelectBatchImport={(assignmentId) => {
          setSelectedAssignmentId(assignmentId)
          setCurrentPage('assignment-import')
        }}
      />
    )
  }

  // 掃描匯入
  if (currentPage === 'assignment-scan' && selectedAssignmentId) {
    return (
      <AssignmentScanImport
        assignmentId={selectedAssignmentId}
        onBack={() => setCurrentPage('assignment-import-select')}
        onUploadComplete={() => setCurrentPage('home')}
      />
    )
  }

  // AI 批改：作業列表
  if (currentPage === 'grading-list') {
    return (
      <AssignmentList
        onBack={() => setCurrentPage('home')}
        onSelectAssignment={(assignmentId) => {
          setSelectedAssignmentId(assignmentId)
          setCurrentPage('grading')
        }}
      />
    )
  }

  // 成績簿
  if (currentPage === 'gradebook') {
    return <Gradebook onBack={() => setCurrentPage('home')} />
  }

  // AI 批改：單一作業批改介面
  if (currentPage === 'grading' && selectedAssignmentId) {
    return (
      <GradingPage
        assignmentId={selectedAssignmentId}
        onBack={() => setCurrentPage('grading-list')}
      />
    )
  }

  // 批次匯入（PDF／檔案）
  if (currentPage === 'assignment-import' && selectedAssignmentId) {
    return (
      <AssignmentImport
        assignmentId={selectedAssignmentId}
        onBack={() => setCurrentPage('assignment-import-select')}
      />
    )
  }

  // 訂正管理：選擇作業
  if (currentPage === 'correction-select') {
    return (
      <CorrectionSelect
        onBack={() => setCurrentPage('home')}
        onSelectAssignment={(id) => {
          setSelectedAssignmentId(id)
          setCurrentPage('correction')
        }}
      />
    )
  }

  // 訂正管理：看板
  if (currentPage === 'correction' && selectedAssignmentId) {
    return (
      <CorrectionManagement
        assignmentId={selectedAssignmentId}
        onBack={() => setCurrentPage('correction-select')}
      />
    )
  }

  // 首頁
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="RedPen AI logo"
              className="w-[100px] h-[100px] object-contain"
            />
            <h1 className="text-3xl font-bold text-gray-900">RedPen AI</h1>
          </div>
          <div className="flex items-center gap-3 justify-between md:justify-end">
            <div className="text-right">
              <p className="text-xs text-gray-500">已登入</p>
              <p className="text-sm font-semibold text-gray-800">
                {auth.user.name || auth.user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
            >
              登出
            </button>
          </div>
        </div>

        <div className="mb-6">
          <SyncIndicator />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* 區塊A：作業流程 */}
          <div className="p-6 rounded-2xl border border-gray-200 bg-gray-50/80">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              作業流程
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => setCurrentPage('classroom-management')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-blue-400 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800 font-medium">
                  <Users className="w-5 h-5 text-blue-600" />
                  班級管理
                </span>
                <span className="text-xs text-gray-500">建立班級與學生</span>
              </button>
              <button
                onClick={() => setCurrentPage('assignment-setup')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-green-400 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800 font-medium">
                  <BookOpen className="w-5 h-5 text-green-600" />
                  作業管理
                </span>
                <span className="text-xs text-gray-500">建立作業題目與答案</span>
              </button>
              <button
                onClick={() => setCurrentPage('assignment-import-select')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-indigo-400 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800 font-medium">
                  <FileImage className="w-5 h-5 text-indigo-600" />
                  作業匯入
                </span>
                <span className="text-xs text-gray-500">掃描或批次匯入</span>
              </button>
              <button
                onClick={() => setCurrentPage('grading-list')}
                className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-colors"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Sparkles className="w-5 h-5" />
                  AI 批改
                </span>
                <span className="text-xs text-white/80">執行批改並調整分數</span>
              </button>
            </div>
          </div>

          {/* 區塊B：後續追蹤 */}
          <div className="p-6 rounded-2xl border border-gray-200 bg-gray-50/80">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
              後續追蹤
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => setCurrentPage('correction-select')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-orange-400 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800 font-medium">
                  <ClipboardCheck className="w-5 h-5 text-orange-600" />
                  訂正管理
                </span>
                <span className="text-xs text-gray-500">發訂正單 / 列印 / 模板批改</span>
              </button>
              <button
                onClick={() => setCurrentPage('gradebook')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-emerald-400 transition-colors"
              >
                <span className="flex items-center gap-2 text-gray-800 font-medium">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  成績管理
                </span>
                <span className="text-xs text-gray-500">查詢成績與匯出</span>
              </button>
            </div>
          </div>
        </div>

        {/* 使用說明 */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-semibold mb-2">基本使用流程</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>班級管理：建立班級與學生</li>
            <li>作業管理：建立作業題目與答案</li>
            <li>作業匯入：掃描或批次匯入學生作業</li>
            <li>AI 批改：執行批改並視需要調整分數</li>
            <li>訂正管理：管控訂正進度與列印表單</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default App
