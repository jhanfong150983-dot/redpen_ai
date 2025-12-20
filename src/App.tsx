import { useState } from 'react'
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
import { SyncStatus } from '@/components'
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

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('')

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
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/logo.png" alt="RedPen AI logo" className="w-[100px] h-[100px] object-contain" />
            <h1 className="text-3xl font-bold text-gray-900">RedPen AI</h1>
          </div>
        </div>

        {/* 同步狀態 */}
        <div className="mb-6">
          <SyncStatus autoSync={false} syncInterval={30000} />
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
