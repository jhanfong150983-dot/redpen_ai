import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react'
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  ArrowLeft,
  AlertCircle,
  X,
  Loader
} from 'lucide-react'
import {
  db,
  generateId,
  type AnswerKey,
  type Assignment,
  type Classroom,
  type QuestionType,
  type Rubric
} from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import { queueDeleteMany } from '@/lib/sync-delete-queue'
import { extractAnswerKeyFromImage } from '@/lib/gemini'
import { convertPdfToImage, getFileType, fileToBlob } from '@/lib/pdfToImage'

interface AssignmentSetupProps {
  onBack?: () => void
}

export default function AssignmentSetup({ onBack }: AssignmentSetupProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClassroomId, setSelectedClassroomId] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [assignmentTitle, setAssignmentTitle] = useState('')
  const [totalPages, setTotalPages] = useState(1)
  const [assignmentDomain, setAssignmentDomain] = useState('')
  const domainOptions = ['國語', '數學', '社會', '自然', '英語', '其他']

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

  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null)
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null)
  const [isExtractingAnswerKey, setIsExtractingAnswerKey] = useState(false)
  const [answerKeyError, setAnswerKeyError] = useState<string | null>(null)
  const [answerKeyNotice, setAnswerKeyNotice] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false)
  const [editingAnswerAssignment, setEditingAnswerAssignment] =
    useState<Assignment | null>(null)
  const [editingAnswerKey, setEditingAnswerKey] = useState<AnswerKey | null>(
    null
  )
  const [editingDomain, setEditingDomain] = useState('')
  const [isSavingAnswerKey, setIsSavingAnswerKey] = useState(false)
  const [editAnswerKeyFile, setEditAnswerKeyFile] = useState<File | null>(null)
  const [isExtractingAnswerKeyEdit, setIsExtractingAnswerKeyEdit] =
    useState(false)
  const [editAnswerKeyError, setEditAnswerKeyError] = useState<string | null>(
    null
  )
  const [editAnswerKeyNotice, setEditAnswerKeyNotice] = useState<string | null>(
    null
  )

  useEffect(() => {
    const loadClassrooms = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await db.classrooms.toArray()
        setClassrooms(data)
      } catch (err) {
        console.error('載入班級列表失敗', err)
        setError('載入班級列表失敗，請稍後再試')
      } finally {
        setIsLoading(false)
      }
    }
    void loadClassrooms()
  }, [])

  useEffect(() => {
    if (classrooms.length > 0 && !selectedClassroomId) {
      setSelectedClassroomId(classrooms[0].id)
    }
  }, [classrooms, selectedClassroomId])

  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedClassroomId) {
        setAssignments([])
        return
      }
      setIsAssignmentsLoading(true)
      try {
        const data = await db.assignments
          .where('classroomId')
          .equals(selectedClassroomId)
          .toArray()
        setAssignments(data)
      } catch (err) {
        console.error('載入作業失敗', err)
        setError('載入作業失敗，請稍後再試')
      } finally {
        setIsAssignmentsLoading(false)
      }
    }
    void loadAssignments()
  }, [selectedClassroomId])

  const resetForm = () => {
    setAssignmentTitle('')
    setTotalPages(1)
    setAssignmentDomain('')
    setAnswerKey(null)
    setAnswerKeyFile(null)
    setAnswerKeyError(null)
    setAnswerKeyNotice(null)
  }

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

  const normalizeAnswerKey = (ak: AnswerKey): AnswerKey => {
    const questions = (ak.questions ?? []).map((q, idx) => {
      const maxScore =
        typeof q.maxScore === 'number' && Number.isFinite(q.maxScore)
          ? q.maxScore
          : 0
      const type = (q.type ?? 'fill') as QuestionType

      if (isSubjectiveType(type)) {
        return {
          id: q.id ?? `q${idx + 1}`,
          type,
          maxScore,
          referenceAnswer: q.referenceAnswer ?? '',
          rubric: normalizeRubric(q.rubric, maxScore),
          answer: q.answer ?? ''
        }
      }

      return {
        id: q.id ?? `q${idx + 1}`,
        type,
        maxScore,
        answer: q.answer ?? ''
      }
    })
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    return { questions, totalScore }
  }

  const mergeAnswerKeys = (current: AnswerKey | null, incoming: AnswerKey) => {
    const base = current ? normalizeAnswerKey(current) : { questions: [], totalScore: 0 }
    const normalizedIncoming = normalizeAnswerKey(incoming)
    const questions = [...base.questions]
    const usedIds = new Set(questions.map((q) => q.id))
    let hasDuplicate = false

    normalizedIncoming.questions.forEach((question) => {
      let nextId = question.id
      if (usedIds.has(nextId)) {
        hasDuplicate = true
        let suffix = 2
        while (usedIds.has(`${nextId}-${suffix}`)) {
          suffix += 1
        }
        nextId = `${nextId}-${suffix}`
      }
      usedIds.add(nextId)
      questions.push({ ...question, id: nextId })
    })

    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    const notice = hasDuplicate
      ? '偵測到重複題號，已自動加上後綴（-2、-3）。請確認題號是否對應試卷。'
      : null

    return { merged: { questions, totalScore }, notice }
  }

  const extractAndSetAnswerKey = async (
    file: File,
    currentKey: AnswerKey | null,
    onSet: (key: AnswerKey) => void,
    setBusy: (busy: boolean) => void,
    setErr: (msg: string | null) => void,
    setNotice: (msg: string | null) => void,
    domain?: string
  ) => {
    const fileType = getFileType(file)
    if (fileType !== 'image' && fileType !== 'pdf') {
      setErr('不支援的檔案格式，請改用圖片或 PDF')
      return
    }

    try {
      setBusy(true)
      setErr(null)

      let imageBlob: Blob
      if (fileType === 'image') {
        imageBlob = await fileToBlob(file)
      } else {
        imageBlob = await convertPdfToImage(file, {
          scale: 2,
          format: 'image/webp',
          quality: 0.8
        })
      }

      const extracted = await extractAnswerKeyFromImage(imageBlob, { domain })
      const { merged, notice } = mergeAnswerKeys(currentKey, extracted)
      onSet(merged)
      setNotice(notice)
    } catch (err) {
      console.error('AI 讀取標準答案失敗', err)
      setErr('AI 讀取失敗，請確認檔案或稍後再試')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedClassroomId) {
      setError('請選擇班級')
      return
    }
    if (!assignmentTitle.trim()) {
      setError('請輸入作業標題')
      return
    }
    if (!assignmentDomain) {
      setError('請選擇作業領域')
      return
    }
    if (totalPages < 1 || totalPages > 100) {
      setError('頁數需介於 1-100')
      return
    }

    setIsSubmitting(true)
    try {
      const assignment: Assignment = {
        id: generateId(),
        classroomId: selectedClassroomId,
        title: assignmentTitle.trim(),
        totalPages,
        domain: assignmentDomain,
        answerKey: answerKey || undefined
      }
      await db.assignments.add(assignment)
      setAssignments((prev) => [...prev, assignment])
      requestSync()
      resetForm()
      setIsCreateModalOpen(false)
    } catch (err) {
      console.error('建立作業失敗', err)
      setError('建立作業失敗，請稍後再試')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAnswerKeyFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setAnswerKeyFile(file)
    setAnswerKeyError(null)
    setAnswerKeyNotice(null)
  }

  const handleExtractAnswerKey = async () => {
    if (!answerKeyFile) {
      setAnswerKeyError('請選擇檔案，支援 PDF 或圖片')
      return
    }
    await extractAndSetAnswerKey(
      answerKeyFile,
      answerKey,
      (ak) => setAnswerKey(ak),
      setIsExtractingAnswerKey,
      setAnswerKeyError,
      setAnswerKeyNotice,
      assignmentDomain
    )
  }

  const handleExtractAnswerKeyForEdit = async () => {
    if (!editAnswerKeyFile) {
      setEditAnswerKeyError('請選擇檔案，支援 PDF 或圖片')
      return
    }
    await extractAndSetAnswerKey(
      editAnswerKeyFile,
      editingAnswerKey,
      (ak) => setEditingAnswerKey(ak),
      setIsExtractingAnswerKeyEdit,
      setEditAnswerKeyError,
      setEditAnswerKeyNotice,
      editingDomain
    )
  }

  const startEditTitle = (assignment: Assignment) => {
    setEditingId(assignment.id)
    setEditingTitle(assignment.title)
  }

  const saveEditTitle = async (id: string) => {
    const nextTitle = editingTitle.trim()
    if (!nextTitle) {
      setEditingId(null)
      setEditingTitle('')
      return
    }
    try {
      await db.assignments.update(id, { title: nextTitle })
      setAssignments((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title: nextTitle } : item))
      )
      requestSync()
    } catch (err) {
      console.error('更新作業標題失敗', err)
    } finally {
      setEditingId(null)
      setEditingTitle('')
    }
  }

  const handleDelete = async (id: string) => {
    const ok = window.confirm('確定要刪除這份作業嗎？相關學生繳交也會一併移除。')
    if (!ok) return
    try {
      const submissions = await db.submissions
        .where('assignmentId')
        .equals(id)
        .toArray()
      const submissionIds = submissions.map((s) => s.id)

      await queueDeleteMany('assignments', [id])
      await queueDeleteMany('submissions', submissionIds)

      await db.assignments.delete(id)
      await db.submissions.where('assignmentId').equals(id).delete()
      setAssignments((prev) => prev.filter((a) => a.id !== id))
      requestSync()
    } catch (err) {
      console.error('刪除作業失敗', err)
    }
  }

  const openAnswerKeyModal = (assignment: Assignment) => {
    const ak =
      assignment.answerKey || {
        questions: [],
        totalScore: 0
      }
    setEditingAnswerAssignment(assignment)
    setEditingAnswerKey(normalizeAnswerKey(ak))
    setEditingDomain(assignment.domain ?? '')
    setEditAnswerKeyFile(null)
    setEditAnswerKeyError(null)
    setAnswerKeyModalOpen(true)
  }

  const closeAnswerKeyModal = () => {
    setAnswerKeyModalOpen(false)
    setEditingAnswerAssignment(null)
    setEditingAnswerKey(null)
    setEditingDomain('')
    setEditAnswerKeyFile(null)
    setEditAnswerKeyError(null)
    setEditAnswerKeyNotice(null)
    setIsExtractingAnswerKeyEdit(false)
    setIsSavingAnswerKey(false)
  }

  const saveAnswerKey = async () => {
    if (!editingAnswerAssignment || !editingAnswerKey) return
    if (!editingDomain) {
      setEditAnswerKeyError('請選擇作業領域')
      return
    }
    try {
      setIsSavingAnswerKey(true)
      await db.assignments.update(editingAnswerAssignment.id, {
        answerKey: editingAnswerKey,
        domain: editingDomain
      })
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === editingAnswerAssignment.id
            ? { ...a, answerKey: editingAnswerKey, domain: editingDomain }
            : a
        )
      )
      setEditingAnswerAssignment({
        ...editingAnswerAssignment,
        domain: editingDomain,
        answerKey: editingAnswerKey
      })
      requestSync()
      closeAnswerKeyModal()
    } catch (err) {
      console.error('儲存標準答案失敗', err)
      setEditAnswerKeyError('儲存失敗，請稍後再試')
    } finally {
      setIsSavingAnswerKey(false)
    }
  }

  const addQuestionRow = (target: 'create' | 'edit') => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey

    const base = current ?? { questions: [], totalScore: 0 }
    const newQuestion = {
      id: `q${base.questions.length + 1}`,
      type: 'fill' as QuestionType,
      answer: '',
      maxScore: 0
    }
    const questions = [...base.questions, newQuestion]
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setter({ questions, totalScore })
  }

  const removeQuestionRow = (target: 'create' | 'edit', index: number) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey

    if (!current) return
    const questions = current.questions.filter((_, idx) => idx !== index)
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setter({ questions, totalScore })
  }

  const updateQuestionField = (
    target: 'create' | 'edit',
    index: number,
    field: 'id' | 'answer' | 'referenceAnswer' | 'type' | 'maxScore',
    value: string
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey

    const base = current ?? { questions: [], totalScore: 0 }
    const questions = [...base.questions]
    const existing = questions[index]
    const item = {
      ...existing,
      id: existing?.id ?? '',
      type: (existing?.type ?? 'fill') as QuestionType,
      answer: existing?.answer ?? '',
      maxScore: existing?.maxScore ?? 0
    }

    if (field === 'maxScore') {
      const num = Math.max(0, parseInt(value || '0', 10) || 0)
      item.maxScore = num
      if (isSubjectiveType(item.type)) {
        item.rubric = normalizeRubric(item.rubric, num)
      }
    } else if (field === 'type') {
      const nextType = value as QuestionType
      const wasSubjective = isSubjectiveType(item.type)
      const isSubjective = isSubjectiveType(nextType)
      item.type = nextType

      if (isSubjective) {
        if (!item.referenceAnswer) item.referenceAnswer = ''
        if (item.maxScore <= 0) item.maxScore = 10
        item.rubric = normalizeRubric(item.rubric, item.maxScore)
      } else if (wasSubjective) {
        item.rubric = undefined
        item.referenceAnswer = item.referenceAnswer ?? ''
      }
    } else if (field === 'id') {
      item.id = value
    } else if (field === 'answer') {
      item.answer = value
    } else if (field === 'referenceAnswer') {
      item.referenceAnswer = value
    }

    questions[index] = item
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setter({ questions, totalScore })
  }

  const updateRubricLevel = (
    target: 'create' | 'edit',
    questionIndex: number,
    levelIndex: number,
    field: 'min' | 'max' | 'criteria',
    value: string
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[questionIndex] }
    const rubric = normalizeRubric(item.rubric, item.maxScore || 0)
    const levels = [...rubric.levels]
    const level = { ...levels[levelIndex] }

    if (field === 'criteria') {
      level.criteria = value
    } else {
      const num = Math.max(0, parseInt(value || '0', 10) || 0)
      level[field] = num
    }

    levels[levelIndex] = level
    item.rubric = { levels }
    questions[questionIndex] = item
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setter({ questions, totalScore })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-5xl mx-auto pt-8">
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
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-xl">
                <BookOpen className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">作業設定</h1>
                <p className="text-sm text-gray-600">
                  檢視、編輯或刪除作業，並可建立新作業與標準答案。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm()
                setIsCreateModalOpen(true)
              }}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-600 text-white shadow hover:bg-green-700"
              title="新增作業"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {classrooms.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              尚未建立任何班級
            </h3>
            <p className="text-gray-600 mb-6">
              請先到「班級管理」建立班級後，再回來新增作業。
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                返回班級管理
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl flex flex-col md:flex-row overflow-hidden">
            <div className="md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200 p-4 md:p-6 max-h-[70vh] overflow-auto">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">
                    已建立的作業
                  </h2>
                  {isAssignmentsLoading && (
                    <Loader className="w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">班級</label>
                  <select
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {assignments.length === 0 && !isAssignmentsLoading && (
                <p className="text-sm text-gray-500">
                  此班級尚未新增作業，點擊右上角「＋」快速建立。
                </p>
              )}

              <div className="space-y-2">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {editingId === a.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => void saveEditTitle(a.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void saveEditTitle(a.id)
                              } else if (e.key === 'Escape') {
                                setEditingId(null)
                                setEditingTitle('')
                              }
                            }}
                            className="px-2 py-1 border border-green-300 rounded text-sm w-full max-w-[220px] focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            disabled={isSubmitting}
                          />
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {a.title}
                            </p>
                            <button
                              type="button"
                              onClick={() => startEditTitle(a)}
                              className="p-1 text-gray-400 hover:text-green-600"
                              title="修改標題"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        頁數 {a.totalPages} 頁 · {a.domain || '未設定領域'} ·{' '}
                        {a.answerKey ? '已設定標準答案' : '尚未設定標準答案'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openAnswerKeyModal(a)}
                        className="p-1.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                        title="編輯標準答案"
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(a.id)}
                        className="p-1.5 rounded-full bg-white border border-gray-200 text-red-600 hover:bg-red-50"
                        title="刪除作業"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:w-1/2 p-6 flex items-center justify-center">
              <div className="text-sm text-gray-500 space-y-2">
                <p className="font-semibold text-gray-700">小提醒</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>左側顯示目前班級的所有作業。</li>
                  <li>
                    點作業標題旁的
                    <span className="inline-flex items-center px-1">
                      <Edit2 className="w-3 h-3" />
                    </span>
                    可直接修改標題。
                  </li>
                  <li>
                    使用右側
                    <span className="inline-flex items-center px-1">
                      <BookOpen className="w-3 h-3" />
                    </span>
                    編輯標準答案，
                    <span className="inline-flex items-center px-1">
                      <Trash2 className="w-3 h-3" />
                    </span>
                    可刪除作業。
                  </li>
                  <li>點右上角「＋」可快速新增作業，並透過 AI 生成答案。</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">新增作業</h2>
                <p className="text-xs text-gray-500">
                  指派班級並建立作業，可同步設定標準答案。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  resetForm()
                }}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-4 py-4 space-y-6">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="classroom"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    指派班級
                  </label>
                  <select
                    id="classroom"
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all bg-white"
                    disabled={isSubmitting}
                  >
                    {classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="assignmentTitle"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    作業標題
                  </label>
                  <input
                    id="assignmentTitle"
                    type="text"
                    value={assignmentTitle}
                    onChange={(e) => setAssignmentTitle(e.target.value)}
                    placeholder="例：數學作業第 1 份"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label
                    htmlFor="assignmentDomain"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    作業領域
                  </label>
                  <select
                    id="assignmentDomain"
                    value={assignmentDomain}
                    onChange={(e) => setAssignmentDomain(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all bg-white"
                    disabled={isSubmitting}
                  >
                    <option value="">請選擇</option>
                    {domainOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="totalPages"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    總頁數
                  </label>
                  <div className="relative">
                    <input
                      id="totalPages"
                      type="number"
                      min="1"
                      max="100"
                      value={totalPages}
                      onChange={(e) =>
                        setTotalPages(parseInt(e.target.value || '1', 10) || 1)
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                      disabled={isSubmitting}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      頁
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">
                    標準答案（選填）
                  </h3>
                  <button
                    type="button"
                    onClick={() => addQuestionRow('create')}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    手動新增一題
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    上傳答案卷（可用 PDF 或圖片）
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleAnswerKeyFileChange}
                    disabled={isSubmitting || isExtractingAnswerKey}
                    className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    可多次上傳，題目會合併；重複題號會自動加上後綴。
                  </p>
                  <button
                    type="button"
                    onClick={handleExtractAnswerKey}
                    disabled={
                      !answerKeyFile || isSubmitting || isExtractingAnswerKey
                    }
                    className="mt-2 inline-flex items-center px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isExtractingAnswerKey
                      ? 'AI 解析中…'
                      : '使用 AI 解析並合併答案'}
                  </button>
                  {answerKeyError && (
                    <p className="text-sm text-red-600 mt-1">{answerKeyError}</p>
                  )}
                  {answerKeyNotice && (
                    <p className="text-xs text-amber-600 mt-1">{answerKeyNotice}</p>
                  )}
                </div>

                {answerKey && (
                  <div className="mt-2 border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">
                        預覽答案
                      </span>
                      <span className="text-xs text-gray-500">
                        總分：{answerKey.totalScore}
                      </span>
                    </div>
                    <div className="space-y-3 max-h-56 overflow-auto pr-1">
                      {answerKey.questions.map((q, idx) => {
                        const typeValue = (q.type ?? 'fill') as QuestionType
                        const isSubjective = isSubjectiveType(typeValue)
                        const rubric = q.rubric ?? buildDefaultRubric(q.maxScore || 0)

                        return (
                          <div
                            key={q.id || idx}
                            className="space-y-2 text-xs bg-white rounded-lg px-3 py-2 border border-gray-200"
                          >
                            <div className="grid grid-cols-[auto,1fr,auto,auto] gap-2 items-center">
                              <input
                                className="w-14 px-1 py-1 border border-gray-300 rounded"
                                value={q.id}
                                onChange={(e) =>
                                  updateQuestionField(
                                    'create',
                                    idx,
                                    'id',
                                    e.target.value
                                  )
                                }
                              />
                              <select
                                className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
                                value={typeValue}
                                onChange={(e) =>
                                  updateQuestionField(
                                    'create',
                                    idx,
                                    'type',
                                    e.target.value
                                  )
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
                                  updateQuestionField(
                                    'create',
                                    idx,
                                    'maxScore',
                                    e.target.value
                                  )
                                }
                              />
                              <button
                                type="button"
                                onClick={() => removeQuestionRow('create', idx)}
                                className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>

                            {!isSubjective && (
                              <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
                                <span className="text-[11px] text-gray-500">標準答案</span>
                                <input
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  value={q.answer ?? ''}
                                  onChange={(e) =>
                                    updateQuestionField(
                                      'create',
                                      idx,
                                      'answer',
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                            )}

                            {isSubjective && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-[70px_1fr] gap-2 items-start">
                                  <span className="text-[11px] text-gray-500">參考答案</span>
                                  <textarea
                                    rows={2}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                    value={q.referenceAnswer ?? ''}
                                    onChange={(e) =>
                                      updateQuestionField(
                                        'create',
                                        idx,
                                        'referenceAnswer',
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div>
                                  <div className="text-[11px] text-gray-500 mb-1">
                                    基規準（四級）
                                  </div>
                                  <div className="space-y-1">
                                    {rubric.levels.map((level, levelIndex) => (
                                      <div
                                        key={level.label}
                                        className="grid grid-cols-[56px_44px_44px_1fr] gap-2 items-center"
                                      >
                                        <span className="text-[11px] text-gray-600">
                                          {level.label}
                                        </span>
                                        <input
                                          type="number"
                                          className="px-1 py-1 border border-gray-300 rounded text-right"
                                          value={level.min}
                                          onChange={(e) =>
                                            updateRubricLevel(
                                              'create',
                                              idx,
                                              levelIndex,
                                              'min',
                                              e.target.value
                                            )
                                          }
                                        />
                                        <input
                                          type="number"
                                          className="px-1 py-1 border border-gray-300 rounded text-right"
                                          value={level.max}
                                          onChange={(e) =>
                                            updateRubricLevel(
                                              'create',
                                              idx,
                                              levelIndex,
                                              'max',
                                              e.target.value
                                            )
                                          }
                                        />
                                        <input
                                          className="px-2 py-1 border border-gray-300 rounded"
                                          value={level.criteria}
                                          onChange={(e) =>
                                            updateRubricLevel(
                                              'create',
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
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false)
                    resetForm()
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '建立中…' : '建立作業'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {answerKeyModalOpen && editingAnswerAssignment && editingAnswerKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={closeAnswerKeyModal}
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
                  {editingAnswerAssignment.title} ·{' '}
                  {classrooms.find((c) => c.id === editingAnswerAssignment.classroomId)?.name ||
                    '未知班級'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAnswerKeyModal}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  作業領域
                </label>
                <select
                  value={editingDomain}
                  onChange={(e) => setEditingDomain(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all bg-white"
                  disabled={isSavingAnswerKey}
                >
                  <option value="">請選擇</option>
                  {domainOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  重新上傳答案卷（可選 PDF 或圖片）
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    setEditAnswerKeyFile(e.target.files?.[0] || null)
                    setEditAnswerKeyError(null)
                    setEditAnswerKeyNotice(null)
                  }}
                  disabled={isExtractingAnswerKeyEdit}
                  className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  可多次上傳，題目會合併；重複題號會自動加上後綴。
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExtractAnswerKeyForEdit}
                    disabled={
                      !editAnswerKeyFile || isExtractingAnswerKeyEdit
                    }
                    className="inline-flex items-center px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isExtractingAnswerKeyEdit
                      ? 'AI 解析中…'
                      : '使用 AI 解析並合併答案'}
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestionRow('edit')}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    手動新增一題
                  </button>
                </div>
                {editAnswerKeyError && (
                  <p className="text-sm text-red-600 mt-1">
                    {editAnswerKeyError}
                  </p>
                )}
                {editAnswerKeyNotice && (
                  <p className="text-xs text-amber-600 mt-1">
                    {editAnswerKeyNotice}
                  </p>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">
                    標準答案
                  </span>
                  <span className="text-xs text-gray-500">
                    總分：{editingAnswerKey.totalScore}
                  </span>
                </div>
                <div className="space-y-3 max-h-56 overflow-auto pr-1">
                  {editingAnswerKey.questions.map((q, idx) => {
                    const typeValue = (q.type ?? 'fill') as QuestionType
                    const isSubjective = isSubjectiveType(typeValue)
                    const rubric = q.rubric ?? buildDefaultRubric(q.maxScore || 0)

                    return (
                      <div
                        key={q.id || idx}
                        className="space-y-2 text-xs bg-white rounded-lg px-3 py-2 border border-gray-200"
                      >
                        <div className="grid grid-cols-[auto,1fr,auto,auto] gap-2 items-center">
                          <input
                            className="w-14 px-1 py-1 border border-gray-300 rounded"
                            value={q.id}
                            onChange={(e) =>
                              updateQuestionField('edit', idx, 'id', e.target.value)
                            }
                          />
                          <select
                            className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
                            value={typeValue}
                            onChange={(e) =>
                              updateQuestionField('edit', idx, 'type', e.target.value)
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
                              updateQuestionField(
                                'edit',
                                idx,
                                'maxScore',
                                e.target.value
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeQuestionRow('edit', idx)}
                            className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        {!isSubjective && (
                          <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
                            <span className="text-[11px] text-gray-500">標準答案</span>
                            <input
                              className="w-full px-2 py-1 border border-gray-300 rounded"
                              value={q.answer ?? ''}
                              onChange={(e) =>
                                updateQuestionField(
                                  'edit',
                                  idx,
                                  'answer',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        )}

                        {isSubjective && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[70px_1fr] gap-2 items-start">
                              <span className="text-[11px] text-gray-500">參考答案</span>
                              <textarea
                                rows={2}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                value={q.referenceAnswer ?? ''}
                                onChange={(e) =>
                                  updateQuestionField(
                                    'edit',
                                    idx,
                                    'referenceAnswer',
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500 mb-1">
                                基規準（四級）
                              </div>
                              <div className="space-y-1">
                                {rubric.levels.map((level, levelIndex) => (
                                  <div
                                    key={level.label}
                                    className="grid grid-cols-[56px_44px_44px_1fr] gap-2 items-center"
                                  >
                                    <span className="text-[11px] text-gray-600">
                                      {level.label}
                                    </span>
                                    <input
                                      type="number"
                                      className="px-1 py-1 border border-gray-300 rounded text-right"
                                      value={level.min}
                                      onChange={(e) =>
                                        updateRubricLevel(
                                          'edit',
                                          idx,
                                          levelIndex,
                                          'min',
                                          e.target.value
                                        )
                                      }
                                    />
                                    <input
                                      type="number"
                                      className="px-1 py-1 border border-gray-300 rounded text-right"
                                      value={level.max}
                                      onChange={(e) =>
                                        updateRubricLevel(
                                          'edit',
                                          idx,
                                          levelIndex,
                                          'max',
                                          e.target.value
                                        )
                                      }
                                    />
                                    <input
                                      className="px-2 py-1 border border-gray-300 rounded"
                                      value={level.criteria}
                                      onChange={(e) =>
                                        updateRubricLevel(
                                          'edit',
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
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 bg-white rounded-b-2xl flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeAnswerKeyModal}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveAnswerKey}
                disabled={isSavingAnswerKey}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSavingAnswerKey ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
