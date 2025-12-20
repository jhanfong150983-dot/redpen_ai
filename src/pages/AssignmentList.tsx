import { useEffect, useState } from 'react'
import { BookOpen, ArrowLeft, Loader, X, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import type { AnswerKey, Assignment, Classroom } from '@/lib/db'

interface AssignmentListProps {
  onBack?: () => void
  onSelectAssignment?: (assignmentId: string) => void
}

type AssignmentWithMeta = Assignment & {
  classroom?: Classroom
  submissionCount?: number
}

export default function AssignmentList({
  onBack,
  onSelectAssignment
}: AssignmentListProps) {
  const [assignments, setAssignments] = useState<AssignmentWithMeta[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [editingAssignment, setEditingAssignment] =
    useState<AssignmentWithMeta | null>(null)
  const [editingAnswerKey, setEditingAnswerKey] = useState<AnswerKey | null>(
    null
  )
  const [isSavingAnswerKey, setIsSavingAnswerKey] = useState(false)
  const [answerKeyError, setAnswerKeyError] = useState<string | null>(null)

  useEffect(() => {
    const loadAssignments = async () => {
      setIsLoading(true)
      try {
        const assignmentsData = await db.assignments.toArray()

        const assignmentsWithClassroom: AssignmentWithMeta[] =
          await Promise.all(
            assignmentsData.map(async (assignment) => {
              const classroom = await db.classrooms.get(assignment.classroomId)
              const submissionCount = await db.submissions
                .where('assignmentId')
                .equals(assignment.id)
                .count()
              return { ...assignment, classroom, submissionCount }
            })
          )

        setAssignments(assignmentsWithClassroom)
      } catch (error) {
        console.error('載入作業列表失敗:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadAssignments()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-600 mx-auto mb-4 animate-spin" />
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
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-purple-100 rounded-xl">
              <BookOpen className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI 批改</h1>
              <p className="text-sm text-gray-600">
                選擇一份作業進入批改頁面，檢視與調整 AI 批改結果。
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
            <p className="text-gray-600 mb-6">
              請先到「作業設定」建立作業與標準答案，再回到這裡進行 AI 批改。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                onClick={() => {
                  onSelectAssignment?.(assignment.id)
                }}
                className="w-full bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
                      {assignment.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {assignment.classroom?.name || '未知班級'} · 共{' '}
                      {assignment.totalPages} 頁
                    </p>
                    {assignment.submissionCount !== undefined &&
                      assignment.submissionCount > 0 && (
                        <p className="text-xs text-purple-600 font-medium mt-1">
                          已有 {assignment.submissionCount} 份作答
                        </p>
                      )}
                    {!assignment.answerKey && (
                      <p className="text-xs text-red-500 mt-1">
                        尚未設定標準答案，AI 批改將無法使用。
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingAssignment(assignment)
                        setEditingAnswerKey(
                          assignment.answerKey || {
                            questions: [],
                            totalScore: 0
                          }
                        )
                        setAnswerKeyError(null)
                      }}
                      className="px-3 py-1 rounded-full text-[11px] bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                    >
                      編輯標準答案
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 編輯標準答案對話框 */}
      {editingAssignment && editingAnswerKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setEditingAssignment(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  編輯標準答案
                </h2>
                <p className="text-xs text-gray-500">
                  {editingAssignment.classroom?.name || '未知班級'} ·{' '}
                  {editingAssignment.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  總分
                </span>
                <input
                  type="number"
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-right"
                  value={editingAnswerKey.totalScore}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value || '0', 10) || 0
                    setEditingAnswerKey({ ...editingAnswerKey, totalScore: v })
                  }}
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-auto">
                {editingAnswerKey.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[auto,1fr,auto] gap-2 items-center text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-200"
                  >
                    <input
                      className="w-14 px-1 py-1 border border-gray-300 rounded"
                      value={q.id}
                      onChange={(e) => {
                        const next: AnswerKey = {
                          ...editingAnswerKey,
                          questions: [...editingAnswerKey.questions]
                        }
                        next.questions[idx] = {
                          ...next.questions[idx],
                          id: e.target.value
                        }
                        setEditingAnswerKey(next)
                      }}
                    />
                    <input
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                      value={q.answer}
                      onChange={(e) => {
                        const next: AnswerKey = {
                          ...editingAnswerKey,
                          questions: [...editingAnswerKey.questions]
                        }
                        next.questions[idx] = {
                          ...next.questions[idx],
                          answer: e.target.value
                        }
                        setEditingAnswerKey(next)
                      }}
                    />
                    <input
                      type="number"
                      className="w-16 px-1 py-1 border border-gray-300 rounded text-right"
                      value={q.maxScore}
                      onChange={(e) => {
                        const next: AnswerKey = {
                          ...editingAnswerKey,
                          questions: [...editingAnswerKey.questions]
                        }
                        next.questions[idx] = {
                          ...next.questions[idx],
                          maxScore:
                            Number.parseInt(e.target.value || '0', 10) || 0
                        }
                        next.totalScore = next.questions.reduce(
                          (sum, qq) => sum + (qq.maxScore || 0),
                          0
                        )
                        setEditingAnswerKey(next)
                      }}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next: AnswerKey = {
                    ...editingAnswerKey,
                    questions: [
                      ...editingAnswerKey.questions,
                      {
                        id: `q${editingAnswerKey.questions.length + 1}`,
                        answer: '',
                        maxScore: 1
                      }
                    ]
                  }
                  next.totalScore = next.questions.reduce(
                    (sum, qq) => sum + (qq.maxScore || 0),
                    0
                  )
                  setEditingAnswerKey(next)
                }}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <Plus className="w-3 h-3" />
                新增題目
              </button>

              {answerKeyError && (
                <p className="text-xs text-red-600">{answerKeyError}</p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="px-3 py-1.5 rounded-lg text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSavingAnswerKey}
                onClick={async () => {
                  if (!editingAssignment || !editingAnswerKey) return
                  try {
                    setIsSavingAnswerKey(true)
                    await db.assignments.update(editingAssignment.id, {
                      answerKey: editingAnswerKey
                    })
                    setEditingAssignment(null)
                    setAssignments((prev) =>
                      prev.map((a) =>
                        a.id === editingAssignment.id
                          ? { ...a, answerKey: editingAnswerKey || undefined }
                          : a
                      )
                    )
                  } catch (e) {
                    console.error('儲存標準答案失敗:', e)
                    setAnswerKeyError('儲存失敗，請稍後再試。')
                  } finally {
                    setIsSavingAnswerKey(false)
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSavingAnswerKey ? '儲存中…' : '儲存標準答案'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

