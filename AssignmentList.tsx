import { useEffect, useState } from 'react'
import { BookOpen, ArrowLeft, Loader, X, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import type {
  AnswerKey,
  Assignment,
  Classroom,
  QuestionType,
  Rubric
} from '@/lib/db'

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

  const questionTypeOptions: Array<{ value: QuestionType; label: string }> = [
    { value: 'truefalse', label: '是非' },
    { value: 'choice', label: '選擇' },
    { value: 'fill', label: '填空' },
    { value: 'calc', label: '計算' },
    { value: 'qa', label: '問答' },
    { value: 'short', label: '簡答' },
    { value: 'short_sentence', label: '短句' },
    { value: 'long', label: '長句' },
    { value: 'essay', label: '作文' }
  ]
  const rubricLabels: Rubric['levels'][number]['label'][] = [
    '優秀',
    '良好',
    '尚可',
    '待努力'
  ]
  const subjectiveTypes = new Set<QuestionType>([
    'calc',
    'qa',
    'short',
    'short_sentence',
    'long',
    'essay'
  ])
  const isSubjectiveType = (type?: QuestionType) =>
    type ? subjectiveTypes.has(type) : false

  const [editingAssignment, setEditingAssignment] =
    useState<AssignmentWithMeta | null>(null)
  const [editingAnswerKey, setEditingAnswerKey] = useState<AnswerKey | null>(
    null
  )
  const [isSavingAnswerKey, setIsSavingAnswerKey] = useState(false)
  const [answerKeyError, setAnswerKeyError] = useState<string | null>(null)

  const buildRubricRanges = (maxScore: number) => {
    const safeMax = Math.max(1, Math.round(maxScore))
    const excellentMin = Math.max(1, Math.ceil(safeMax * 0.9))
    const goodMin = Math.max(1, Math.ceil(safeMax * 0.7))
    const okMin = Math.max(1, Math.ceil(safeMax * 0.5))

    const excellent = { min: excellentMin, max: safeMax }
    const good = { min: goodMin, max: Math.max(goodMin, excellentMin - 1) }
    const ok = { min: okMin, max: Math.max(okMin, goodMin - 1) }
    const needs = { min: 1, max: Math.max(1, okMin - 1) }

    return [excellent, good, ok, needs]
  }

  const normalizeRubric = (rubric: Rubric | undefined, maxScore: number): Rubric => {
    const ranges = buildRubricRanges(maxScore)
    const existing = new Map(
      (rubric?.levels ?? []).map((level) => [level.label, level])
    )
    const levels = rubricLabels.map((label, index) => {
      const current = existing.get(label)
      const range = ranges[index]
      return {
        label,
        min: current?.min ?? range.min,
        max: current?.max ?? range.max,
        criteria: current?.criteria ?? ''
      }
    })
    return { levels }
  }

  const buildDefaultRubric = (maxScore: number): Rubric => {
    return normalizeRubric(undefined, maxScore)
  }

  const sanitizeQuestionId = (value: string | undefined, fallback: string) => {
    const base = (value ?? '').trim() || fallback
    return base.replace(/^[qQ](?=\d)/, '')
  }

  const normalizeAnswerKey = (ak: AnswerKey): AnswerKey => {
    const questions = (ak.questions ?? []).map((q, idx) => {
      const maxScore =
        typeof q.maxScore === 'number' && Number.isFinite(q.maxScore)
          ? q.maxScore
          : 0
      const type = (q.type ?? 'fill') as QuestionType

      if (isSubjectiveType(type)) {
        return {
          id: sanitizeQuestionId(q.id, `${idx + 1}`),
          type,
          maxScore,
          referenceAnswer: q.referenceAnswer ?? '',
          rubric: normalizeRubric(q.rubric, maxScore),
          answer: q.answer ?? ''
        }
      }

      return {
        id: sanitizeQuestionId(q.id, `${idx + 1}`),
        type,
        maxScore,
        answer: q.answer ?? ''
      }
    })
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    return { questions, totalScore }
  }

  const updateQuestionField = (
    index: number,
    field: 'id' | 'answer' | 'referenceAnswer' | 'type' | 'maxScore',
    value: string
  ) => {
    if (!editingAnswerKey) return
    const questions = [...editingAnswerKey.questions]
    const item = { ...questions[index] }

    if (field === 'maxScore') {
      const num = Number.parseInt(value || '0', 10) || 0
      item.maxScore = num
      if (isSubjectiveType(item.type)) {
        item.rubric = normalizeRubric(item.rubric, num)
      }
    } else if (field === 'type') {
      const nextType = (value || 'fill') as QuestionType
      item.type = nextType
      if (isSubjectiveType(nextType)) {
        if (!item.referenceAnswer) item.referenceAnswer = ''
        item.rubric = normalizeRubric(item.rubric, item.maxScore || 0)
      } else {
        item.rubric = undefined
        item.referenceAnswer = undefined
      }
    } else if (field === 'referenceAnswer') {
      item.referenceAnswer = value
    } else if (field === 'answer') {
      item.answer = value
    } else {
      item.id = sanitizeQuestionId(value, item.id || `${index + 1}`)
    }

    questions[index] = item
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setEditingAnswerKey({ questions, totalScore })
  }

  const updateRubricLevel = (
    questionIndex: number,
    levelIndex: number,
    field: 'min' | 'max' | 'criteria',
    value: string
  ) => {
    if (!editingAnswerKey) return
    const questions = [...editingAnswerKey.questions]
    const item = { ...questions[questionIndex] }
    const rubric = normalizeRubric(item.rubric, item.maxScore || 0)
    const levels = [...rubric.levels]
    const level = { ...levels[levelIndex] }

    if (field === 'criteria') {
      level.criteria = value
    } else {
      const num = Number.parseInt(value || '0', 10) || 0
      level[field] = num
    }

    levels[levelIndex] = level
    item.rubric = { levels }
    questions[questionIndex] = item
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setEditingAnswerKey({ questions, totalScore })
  }

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
                          normalizeAnswerKey(
                            assignment.answerKey || {
                              questions: [],
                              totalScore: 0
                            }
                          )
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
                <span className="text-xs font-semibold text-gray-900">
                  {editingAnswerKey.totalScore}
                </span>
              </div>

              <div className="space-y-3 max-h-64 overflow-auto">
                {editingAnswerKey.questions.map((q, idx) => {
                  const type = (q.type ?? 'fill') as QuestionType
                  const isSubjective = isSubjectiveType(type)
                  const rubric = q.rubric ?? buildDefaultRubric(q.maxScore || 0)

                  return (
                    <div
                      key={idx}
                      className="text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 space-y-2"
                    >
                      <div className="grid grid-cols-[auto,auto,auto] gap-2 items-center">
                        <input
                          className="w-14 px-1 py-1 border border-gray-300 rounded"
                          value={q.id}
                          onChange={(e) =>
                            updateQuestionField(idx, 'id', e.target.value)
                          }
                        />
                        <select
                          className="px-2 py-1 border border-gray-300 rounded"
                          value={type}
                          onChange={(e) =>
                            updateQuestionField(idx, 'type', e.target.value)
                          }
                        >
                          {questionTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-right"
                          value={q.maxScore}
                          onChange={(e) =>
                            updateQuestionField(idx, 'maxScore', e.target.value)
                          }
                        />
                      </div>

                      {isSubjective ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-[11px] text-gray-500 mb-1">
                              範例答案
                            </div>
                            <textarea
                              className="w-full px-2 py-1 border border-gray-300 rounded min-h-[60px]"
                              value={q.referenceAnswer ?? ''}
                              onChange={(e) =>
                                updateQuestionField(
                                  idx,
                                  'referenceAnswer',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            {rubric.levels.map((level, levelIndex) => (
                              <div
                                key={`${level.label}-${levelIndex}`}
                                className="grid grid-cols-[auto,auto,auto,1fr] gap-2 items-center"
                              >
                                <span className="text-[11px] text-gray-600">
                                  {level.label}
                                </span>
                                <input
                                  type="number"
                                  className="w-14 px-1 py-1 border border-gray-300 rounded text-right"
                                  value={level.min}
                                  onChange={(e) =>
                                    updateRubricLevel(
                                      idx,
                                      levelIndex,
                                      'min',
                                      e.target.value
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  className="w-14 px-1 py-1 border border-gray-300 rounded text-right"
                                  value={level.max}
                                  onChange={(e) =>
                                    updateRubricLevel(
                                      idx,
                                      levelIndex,
                                      'max',
                                      e.target.value
                                    )
                                  }
                                />
                                <input
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  value={level.criteria}
                                  onChange={(e) =>
                                    updateRubricLevel(
                                      idx,
                                      levelIndex,
                                      'criteria',
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] text-gray-500 mb-1">
                            標準答案
                          </div>
                          <input
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            value={q.answer ?? ''}
                            onChange={(e) =>
                              updateQuestionField(idx, 'answer', e.target.value)
                            }
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next: AnswerKey = {
                    ...editingAnswerKey,
                    questions: [
                      ...editingAnswerKey.questions,
                      {
                        id: `${editingAnswerKey.questions.length + 1}`,
                        type: 'fill',
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
                    requestSync()
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
