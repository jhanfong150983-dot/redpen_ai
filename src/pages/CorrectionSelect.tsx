import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, BookOpen, Loader, Folder } from 'lucide-react'
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
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState('__uncategorized__')

  // 計算已使用的班級資料夾
  const usedFolders = useMemo(() => {
    const folders = classrooms
      .map((c) => c.folder)
      .filter((f): f is string => !!f && !!f.trim())
    return Array.from(new Set(folders)).sort()
  }, [classrooms])

  // 根據選擇的資料夾篩選作業
  const filteredAssignments = useMemo(() => {
    if (!selectedFolder) return assignments
    return assignments.filter((a) => {
      if (selectedFolder === '__uncategorized__') {
        return !a.classroom?.folder
      }
      return a.classroom?.folder === selectedFolder
    })
  }, [assignments, selectedFolder])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [assignmentData, classroomData] = await Promise.all([
          db.assignments.toArray(),
          db.classrooms.toArray()
        ])

        setClassrooms(classroomData)

        const withClassroom: AssignmentWithClassroom[] = await Promise.all(
          assignmentData.map(async (a) => {
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

          {/* 班級資料夾篩選 */}
          {usedFolders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Folder className="w-4 h-4 inline mr-1" />
                篩選班級資料夾
              </label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all bg-white"
              >
                <option value="__uncategorized__">
                  未分類 ({assignments.filter(a => !a.classroom?.folder).length})
                </option>
                {usedFolders.map((folder) => {
                  const count = assignments.filter(a => a.classroom?.folder === folder).length
                  return (
                    <option key={folder} value={folder}>
                      {folder} ({count})
                    </option>
                  )
                })}
              </select>
            </div>
          )}
        </div>

        {filteredAssignments.length === 0 && assignments.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              此資料夾中沒有作業
            </h3>
            <p className="text-gray-600">
              請選擇其他資料夾或清除篩選條件。
            </p>
          </div>
        ) : assignments.length === 0 ? (
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
            {filteredAssignments.map((a) => (
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
