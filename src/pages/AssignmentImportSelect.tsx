import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, FileImage, Camera, Loader } from 'lucide-react'
import { db } from '@/lib/db'
import type { Assignment, Classroom } from '@/lib/db'

interface AssignmentImportSelectProps {
  onBack?: () => void
  onSelectScanImport?: (assignmentId: string) => void
  onSelectBatchImport?: (assignmentId: string) => void
}

interface AssignmentWithClassroom extends Assignment {
  classroom?: Classroom
}

export default function AssignmentImportSelect({
  onBack,
  onSelectScanImport,
  onSelectBatchImport
}: AssignmentImportSelectProps) {
  const [assignments, setAssignments] = useState<AssignmentWithClassroom[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const data = await db.assignments.toArray()
        const withClassroom: AssignmentWithClassroom[] = await Promise.all(
          data.map(async (a) => {
            const classroom = await db.classrooms.get(a.classroomId)
            return { ...a, classroom: classroom || undefined }
          })
        )
        setAssignments(withClassroom)
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入作業列表中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        {/* 返回 */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回首頁
          </button>
        )}

        {/* 標題卡片 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <FileImage className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">作業匯入</h1>
              <p className="text-sm text-gray-600 mt-1">
                請先選擇要匯入的作業，再依需求選擇「拍攝作業匯入」或「批次作業匯入（PDF／圖片）」。
              </p>
            </div>
          </div>
        </div>

        {/* 作業列表 */}
        {assignments.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              尚未建立任何作業
            </h3>
            <p className="text-gray-600 mb-4">
              請先到「作業設定」建立作業與標準答案，再回到這裡匯入作業。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="w-full bg-white rounded-xl shadow-md p-5 text-left hover:shadow-lg transition-all group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                      {assignment.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {assignment.classroom?.name || '未知班級'} · 共{' '}
                      {assignment.totalPages} 頁
                    </p>
                    {!assignment.answerKey && (
                      <p className="text-xs text-red-500 mt-1">
                        尚未設定標準答案，AI 批改將無法使用。
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      type="button"
                      onClick={() => onSelectScanImport?.(assignment.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
                    >
                      <Camera className="w-3 h-3" />
                      拍攝作業匯入
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectBatchImport?.(assignment.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                    >
                      <FileImage className="w-3 h-3" />
                      批次作業匯入（PDF）
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

