import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Loader } from 'lucide-react'
import { db } from '@/lib/db'
import type { Assignment, Classroom } from '@/lib/db'

interface CorrectionSelectProps {
  onBack?: () => void
  onSelectAssignment?: (assignmentId: string) => void
}

type AssignmentWithClassroom = Assignment & { classroom?: Classroom }

export default function CorrectionSelect({
  onBack,
  onSelectAssignment
}: CorrectionSelectProps) {
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
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-orange-100 rounded-xl">
              <BookOpen className="w-7 h-7 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">訂正管理</h1>
              <p className="text-sm text-gray-600">
                選擇一次作業，進入訂正管理儀表板。
              </p>
            </div>
          </div>
        </div>

        {assignments.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              尚未建立任何作業
            </h3>
            <p className="text-gray-600">
              請先到「作業管理」建立作業，再回到這裡管理訂正。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAssignment?.(a.id)}
                className="w-full bg-white rounded-xl shadow-md p-5 text-left hover:shadow-lg transition-all group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-orange-600 transition-colors">
                      {a.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {a.classroom?.name || '未知班級'} · 共 {a.totalPages} 頁
                    </p>
                    {!a.answerKey && (
                      <p className="text-xs text-red-500 mt-1">
                        尚未設定標準答案，AI 判讀資訊可能不足。
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full">
                    管理訂正
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
