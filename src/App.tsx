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
import { debugLog } from '@/lib/logger'

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
  const [isAiDisclaimerOpen, setIsAiDisclaimerOpen] = useState(false)
  const [isIpDisclaimerOpen, setIsIpDisclaimerOpen] = useState(false)

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
      debugLog('📱 設備信息:')
      debugLog(`  User Agent: ${navigator.userAgent}`)
      debugLog(`  🎨 WebP 編碼支持: ${supported ? '是 ✅' : '否 ❌ (將使用 JPEG fallback)'}`)
      debugLog(`  螢幕尺寸: ${window.innerWidth}x${window.innerHeight}`)
      debugLog(
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

        {/* AI 免責聲明 */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-semibold mb-2">AI 使用免責聲明</p>
          <p>
            使用本網站即表示您已閱讀、理解並同意本網站之{' '}
            <button
              type="button"
              onClick={() => setIsAiDisclaimerOpen(true)}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              AI 使用免責聲明與 AI 生成內容著作權聲明
            </button>{' '}
            以及{' '}
            <button
              type="button"
              onClick={() => setIsIpDisclaimerOpen(true)}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              網站智慧財產權聲明
            </button>
            。
          </p>
          <p className="mt-2 text-gray-500">
            如需使用授權或合作洽談，請聯絡 jhanfong150983@gmail.com。
          </p>
        </div>
      </div>

      {isAiDisclaimerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                免責聲明及 AI 生成內容著作權聲明
              </h2>
              <button
                type="button"
                onClick={() => setIsAiDisclaimerOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="關閉"
              >
                X
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 space-y-3 overflow-y-auto max-h-[75vh] leading-relaxed">
              <p>
                <span className="font-semibold">一、免責聲明</span>
                <br />
                本網站部分內容與功能由生成式人工智慧（Generative AI）技術自動生成。雖本網站致力提供正確且有價值之資訊，惟 AI 生成內容可能不完整、不準確或非最新資訊，僅供參考。使用者應自行核實並審慎使用，並對使用結果負責。本網站及其運營方對於使用或信賴 AI 生成內容所生之任何爭議、損失或損害，不承擔任何法律責任。
              </p>
              <p>
                生成式 AI 之回應或內容不構成專業建議、法律意見或權威性答案，使用者應依實際情況另行取得獨立之法律意見或其他專業意見。
              </p>
              <p>
                生成式 AI 具有技術限制，可能產生不妥適或不符合需求之結果，本網站無法保證其完整性、適用性或一致性。
              </p>
              <p>
                <span className="font-semibold">二、AI 生成內容著作權聲明</span>
                <br />
                本網站所使用之生成式 AI 係基於公共訓練資料與開放技術開發，AI 生成內容具自動產出特性，本網站無法對其內容進行完整之第三方智慧財產權檢查或控管，亦無法保證使用者得對該等內容主張著作權或其他智慧財產權利。
              </p>
              <p>
                AI 生成內容可能無意間模仿或引用既有資料或作品。若發現可能侵害第三方著作權或其他權利之情形，請立即通知本網站，本網站將儘速處理並移除相關內容。
              </p>
              <p>
                <span className="font-semibold">三、使用者責任</span>
                <br />
                使用者在本網站所創建或傳輸之任何內容，應遵守相關法律法規並不得侵害他人權利。
              </p>
              <p>
                使用者使用 AI 生成內容進行轉載、分享或商業使用時，應自行取得必要授權或許可；因違反法令或不當使用所致之任何損害，本網站不負任何責任。
              </p>
              <p>
                <span className="font-semibold">四、條款修訂</span>
                <br />
                本網站保留隨時修改本聲明之權利，使用者應定期查閱以了解最新內容。
              </p>
            </div>
          </div>
        </div>
      )}

      {isIpDisclaimerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                網站智慧財產權聲明
              </h2>
              <button
                type="button"
                onClick={() => setIsIpDisclaimerOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="關閉"
              >
                X
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 space-y-3 overflow-y-auto max-h-[75vh] leading-relaxed">
              <p>
                除另有標示外，本網站之商標、標誌、介面設計、文字、圖像、影音、程式碼、資料庫及其他內容之智慧財產權，均屬本網站或其權利人所有。
              </p>
              <p>
                未經事前書面同意，任何人不得以任何形式重製、改作、散布、公開傳輸、展示、出版或作商業使用；僅限於合法且必要之個人瀏覽或學習用途之合理使用，不構成授權。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
