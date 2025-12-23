import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react'
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  ArrowLeft,
  AlertCircle,
  X,
  Loader,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { NumericInput } from '@/components/NumericInput'
import {
  db,
  generateId,
  type AnswerKey,
  type Assignment,
  type Classroom,
  type QuestionType,
  type QuestionCategoryType,
  type AnswerKeyQuestion,
  type Rubric,
  type RubricDimension
} from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import { queueDeleteMany } from '@/lib/sync-delete-queue'
import { extractAnswerKeyFromImage, reanalyzeQuestions } from '@/lib/gemini'
import { convertPdfToImage, getFileType, fileToBlob } from '@/lib/pdfToImage'
import { compressImageFile } from '@/lib/imageCompression'

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

  // Prior Weight：整份作業大部分題目屬性（優先級順序）
  const [priorWeightTypes, setPriorWeightTypes] = useState<QuestionCategoryType[]>([])

  const domainOptions = ['國語', '數學', '社會', '自然', '英語', '其他']

  const rubricLabels: Rubric['levels'][number]['label'][] = [
    '優秀',
    '良好',
    '尚可',
    '待努力'
  ]
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
  const [editingClassroomId, setEditingClassroomId] = useState('')
  const [editingDomain, setEditingDomain] = useState('')
  const [editingPriorWeightTypes, setEditingPriorWeightTypes] = useState<QuestionCategoryType[]>([])
  const [isSavingAnswerKey, setIsSavingAnswerKey] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [editAnswerKeyFile, setEditAnswerKeyFile] = useState<File | null>(null)
  const [editAnswerSheetImage, setEditAnswerSheetImage] = useState<Blob | null>(null)
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
    setPriorWeightTypes([])
    setAnswerKey(null)
    setAnswerKeyFile(null)
    setAnswerKeyError(null)
    setAnswerKeyNotice(null)
  }

  // Prior Weight 管理函數
  const togglePriorWeight = (type: QuestionCategoryType) => {
    setPriorWeightTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type)
      } else {
        return [...prev, type]
      }
    })
  }

  const removePriorWeight = (type: QuestionCategoryType) => {
    setPriorWeightTypes(prev => prev.filter(t => t !== type))
  }

  const toggleEditingPriorWeight = (type: QuestionCategoryType) => {
    setEditingPriorWeightTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type)
      } else {
        return [...prev, type]
      }
    })
  }

  const removeEditingPriorWeight = (type: QuestionCategoryType) => {
    setEditingPriorWeightTypes(prev => prev.filter(t => t !== type))
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

      // Convert old QuestionType to QuestionCategoryType if needed
      const questionType = typeof q.type === 'number'
        ? q.type
        : q.type === 'truefalse' || q.type === 'choice'
          ? 1
          : q.type === 'fill' || q.type === 'short' || q.type === 'short_sentence'
            ? 2
            : 3

      const baseQuestion: AnswerKeyQuestion = {
        id: sanitizeQuestionId(q.id, `${idx + 1}`),
        type: questionType as QuestionCategoryType,
        maxScore
      }

      // Add type-specific fields
      if (questionType === 1) {
        baseQuestion.answer = q.answer ?? ''
      } else if (questionType === 2) {
        baseQuestion.referenceAnswer = q.referenceAnswer ?? ''
        baseQuestion.acceptableAnswers = q.acceptableAnswers ?? []
      } else if (questionType === 3) {
        baseQuestion.referenceAnswer = q.referenceAnswer ?? ''
        if (q.rubricsDimensions) {
          baseQuestion.rubricsDimensions = q.rubricsDimensions
        } else {
          baseQuestion.rubric = normalizeRubric(q.rubric, maxScore)
        }
      }

      return baseQuestion
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
    domain?: string,
    priorWeights?: QuestionCategoryType[],
    onImageBlobReady?: (blob: Blob) => void
  ) => {
    console.log('📋 開始提取標準答案...', { fileName: file.name, domain, priorWeights })
    
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
        console.log('🖼️ 處理圖片檔案', { size: file.size, type: file.type })
        imageBlob = await fileToBlob(file)
        
        // 激進壓縮：確保最終大小 < 1.5MB（Base64編碼後 < 2MB）
        let compressionAttempts = 0
        let targetSize = 1.5 * 1024 * 1024  // 1.5MB
        
        while (imageBlob.size > targetSize && compressionAttempts < 3) {
          console.log(`⚠️ 第 ${compressionAttempts + 1} 次壓縮...`, { currentSize: imageBlob.size })
          
          const quality = 0.6 - (compressionAttempts * 0.15)  // 0.6, 0.45, 0.3
          const maxWidth = 1600 - (compressionAttempts * 400)  // 1600, 1200, 800
          
          imageBlob = await compressImageFile(imageBlob, {
            maxWidth,
            quality,
            format: 'image/webp'
          })
          
          compressionAttempts++
          console.log(`✅ 壓縮完成 (第 ${compressionAttempts} 次)`, { compressedSize: imageBlob.size, maxWidth, quality })
        }
        
        if (imageBlob.size > targetSize) {
          console.warn('⚠️ 圖片仍然過大，但已達壓縮上限', { finalSize: imageBlob.size })
        }
      } else {
        console.log('📄 處理 PDF 檔案', { size: file.size })
        imageBlob = await convertPdfToImage(file, {
          scale: 1,  // 進一步降低 scale
          format: 'image/webp',
          quality: 0.5  // 進一步降低品質
        })
        
        // PDF 也需要壓縮檢查
        if (imageBlob.size > 1.5 * 1024 * 1024) {
          console.log('⚠️ PDF 轉換後仍過大，進行壓縮...', { originalSize: imageBlob.size })
          imageBlob = await compressImageFile(imageBlob, {
            maxWidth: 1200,
            quality: 0.4,
            format: 'image/webp'
          })
          console.log('✅ PDF 壓縮完成', { compressedSize: imageBlob.size })
        }
        
        console.log('✅ PDF 轉換完成', { blobSize: imageBlob.size, blobType: imageBlob.type })
      }

      // Save image blob for re-analysis if callback provided
      if (onImageBlobReady) {
        onImageBlobReady(imageBlob)
      }

      console.log('🧠 呼叫 Gemini API 提取標準答案...')
      const extracted = await extractAnswerKeyFromImage(imageBlob, {
        domain,
        priorWeightTypes: priorWeights
      })
      console.log('✅ AI 提取完成', { questionCount: extracted.questions.length, totalScore: extracted.totalScore })
      
      const { merged, notice } = mergeAnswerKeys(currentKey, extracted)
      onSet(merged)
      setNotice(notice)
    } catch (err) {
      console.error('❌ AI 讀取標準答案失敗', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      setErr(`AI 讀取失敗：${errorMsg}`)
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
    if (priorWeightTypes.length === 0) {
      setError('請至少選擇一種題型屬性（Prior Weight）')
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
        priorWeightTypes,
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
      assignmentDomain,
      priorWeightTypes
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
      editingDomain,
      editingPriorWeightTypes,
      (blob) => setEditAnswerSheetImage(blob)
    )
  }

  const handleReanalyzeMarkedQuestions = async () => {
    if (!editingAnswerKey || !editAnswerSheetImage) return

    const markedQuestions = editingAnswerKey.questions.filter(q => q.needsReanalysis)
    if (markedQuestions.length === 0) return

    const confirmed = window.confirm(
      `確定要重新分析 ${markedQuestions.length} 題嗎？\n` +
      `題號：${markedQuestions.map(q => q.id).join(', ')}\n\n` +
      `重新分析後將覆蓋現有答案內容。`
    )

    if (!confirmed) return

    setIsReanalyzing(true)
    setEditAnswerKeyError(null)

    try {
      const reanalyzedQuestions = await reanalyzeQuestions(
        editAnswerSheetImage,
        markedQuestions,
        editingDomain,
        editingPriorWeightTypes
      )

      // Merge reanalyzed questions back into editingAnswerKey
      const updatedQuestions = editingAnswerKey.questions.map(q => {
        const reanalyzed = reanalyzedQuestions.find(rq => rq.id === q.id)
        if (reanalyzed) {
          // Clear needsReanalysis flag
          return { ...reanalyzed, needsReanalysis: false }
        }
        return q
      })

      const totalScore = updatedQuestions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
      setEditingAnswerKey({ questions: updatedQuestions, totalScore })
      setEditAnswerKeyNotice(`已重新分析 ${reanalyzedQuestions.length} 題`)
    } catch (err) {
      console.error('重新分析失敗', err)
      setEditAnswerKeyError(
        err instanceof Error ? `重新分析失敗：${err.message}` : '重新分析失敗，請稍後再試'
      )
    } finally {
      setIsReanalyzing(false)
    }
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
    setEditingClassroomId(assignment.classroomId)
    setEditingDomain(assignment.domain ?? '')
    setEditingPriorWeightTypes(assignment.priorWeightTypes ?? [])
    setEditAnswerKeyFile(null)
    setEditAnswerKeyError(null)
    setAnswerKeyModalOpen(true)
  }

  const closeAnswerKeyModal = () => {
    setAnswerKeyModalOpen(false)
    setEditingAnswerAssignment(null)
    setEditingAnswerKey(null)
    setEditingClassroomId('')
    setEditingDomain('')
    setEditingPriorWeightTypes([])
    setEditAnswerKeyFile(null)
    setEditAnswerKeyError(null)
    setEditAnswerKeyNotice(null)
    setIsExtractingAnswerKeyEdit(false)
    setIsSavingAnswerKey(false)
  }

  const saveAnswerKey = async () => {
    if (!editingAnswerAssignment || !editingAnswerKey) return
    if (!editingClassroomId) {
      setEditAnswerKeyError('請選擇班級')
      return
    }
    if (!editingDomain) {
      setEditAnswerKeyError('請選擇作業領域')
      return
    }
    if (editingPriorWeightTypes.length === 0) {
      setEditAnswerKeyError('請至少選擇一種題型屬性（Prior Weight）')
      return
    }
    try {
      setIsSavingAnswerKey(true)
      await db.assignments.update(editingAnswerAssignment.id, {
        answerKey: editingAnswerKey,
        domain: editingDomain,
        classroomId: editingClassroomId,
        priorWeightTypes: editingPriorWeightTypes
      })
      setAssignments((prev) => {
        if (selectedClassroomId && editingClassroomId !== selectedClassroomId) {
          return prev.filter((a) => a.id !== editingAnswerAssignment.id)
        }
        return prev.map((a) =>
          a.id === editingAnswerAssignment.id
            ? {
                ...a,
                answerKey: editingAnswerKey,
                domain: editingDomain,
                classroomId: editingClassroomId,
                priorWeightTypes: editingPriorWeightTypes.length > 0 ? editingPriorWeightTypes : undefined
              }
            : a
        )
      })
      setEditingAnswerAssignment({
        ...editingAnswerAssignment,
        classroomId: editingClassroomId,
        domain: editingDomain,
        priorWeightTypes: editingPriorWeightTypes.length > 0 ? editingPriorWeightTypes : undefined,
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
    const newQuestion: AnswerKeyQuestion = {
      id: `${base.questions.length + 1}`,
      type: 2, // Default to Type 2 (multi-answer acceptable)
      referenceAnswer: '',
      acceptableAnswers: [],
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

    // Support both old QuestionType and new QuestionCategoryType
    const currentType = typeof existing?.type === 'number'
      ? existing.type
      : existing?.type
        ? (existing.type === 'truefalse' || existing.type === 'choice' ? 1
          : existing.type === 'fill' || existing.type === 'short' || existing.type === 'short_sentence' ? 2
          : 3)
        : 2

    const item: AnswerKeyQuestion = {
      ...existing,
      id: existing?.id ?? '',
      type: currentType as QuestionCategoryType,
      maxScore: existing?.maxScore ?? 0
    }

    if (field === 'maxScore') {
      const num = Math.max(0, parseInt(value || '0', 10) || 0)
      item.maxScore = num
      if (item.type === 3 && item.rubric) {
        item.rubric = normalizeRubric(item.rubric, num)
      }
    } else if (field === 'type') {
      const nextType = parseInt(value, 10) as QuestionCategoryType
      const oldType = item.type

      // When teacher manually changes type, clear content and mark for re-analysis
      if (oldType !== nextType) {
        item.type = nextType
        item.needsReanalysis = true

        // Clear all answer-related fields
        item.answer = undefined
        item.referenceAnswer = undefined
        item.acceptableAnswers = undefined
        item.rubric = undefined
        item.rubricsDimensions = undefined

        // Set default values for new type
        if (nextType === 1) {
          // Type 1: standard answer
          item.answer = ''
        } else if (nextType === 2) {
          // Type 2: reference answer + acceptable answers
          item.referenceAnswer = ''
          item.acceptableAnswers = []
        } else if (nextType === 3) {
          // Type 3: reference answer + rubric (default to 4-level)
          item.referenceAnswer = ''
          if (item.maxScore <= 0) item.maxScore = 10
          item.rubric = buildDefaultRubric(item.maxScore)
        }
      }
    } else if (field === 'id') {
      item.id = sanitizeQuestionId(value, item.id || `${index + 1}`)
    } else if (field === 'answer') {
      item.answer = value
    } else if (field === 'referenceAnswer') {
      item.referenceAnswer = value
    }

    questions[index] = item
    const totalScore = questions.reduce((sum, q) => sum + (q.maxScore || 0), 0)
    setter({ questions, totalScore })
  }

  // Type 2: Acceptable Answers Management
  const addAcceptableAnswer = (target: 'create' | 'edit', index: number) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const acceptableAnswers = item.acceptableAnswers ?? []
    item.acceptableAnswers = [...acceptableAnswers, '']
    questions[index] = item
    setter({ ...current, questions })
  }

  const removeAcceptableAnswer = (
    target: 'create' | 'edit',
    index: number,
    ansIdx: number
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const acceptableAnswers = item.acceptableAnswers ?? []
    item.acceptableAnswers = acceptableAnswers.filter((_, i) => i !== ansIdx)
    questions[index] = item
    setter({ ...current, questions })
  }

  const updateAcceptableAnswer = (
    target: 'create' | 'edit',
    index: number,
    ansIdx: number,
    value: string
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const acceptableAnswers = [...(item.acceptableAnswers ?? [])]
    acceptableAnswers[ansIdx] = value
    item.acceptableAnswers = acceptableAnswers
    questions[index] = item
    setter({ ...current, questions })
  }

  // Type 3: Rubric Dimensions Management
  const addRubricDimension = (target: 'create' | 'edit', index: number) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const dimensions = item.rubricsDimensions ?? []
    item.rubricsDimensions = [
      ...dimensions,
      { name: '', maxScore: 0, criteria: '' }
    ]
    questions[index] = item
    setter({ ...current, questions })
  }

  const removeRubricDimension = (
    target: 'create' | 'edit',
    index: number,
    dimIdx: number
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const dimensions = item.rubricsDimensions ?? []
    item.rubricsDimensions = dimensions.filter((_, i) => i !== dimIdx)
    questions[index] = item
    setter({ ...current, questions })
  }

  const updateRubricDimension = (
    target: 'create' | 'edit',
    index: number,
    dimIdx: number,
    field: 'name' | 'maxScore' | 'criteria',
    value: string
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }
    const dimensions = [...(item.rubricsDimensions ?? [])]
    const dimension = { ...dimensions[dimIdx] }

    if (field === 'maxScore') {
      dimension.maxScore = Math.max(0, parseInt(value || '0', 10) || 0)
    } else {
      dimension[field] = value
    }

    dimensions[dimIdx] = dimension
    item.rubricsDimensions = dimensions
    questions[index] = item
    setter({ ...current, questions })
  }

  const switchRubricType = (
    target: 'create' | 'edit',
    index: number,
    toType: 'multi-dimension' | '4-level'
  ) => {
    const current = target === 'create' ? answerKey : editingAnswerKey
    const setter = target === 'create' ? setAnswerKey : setEditingAnswerKey
    if (!current) return

    const questions = [...current.questions]
    const item = { ...questions[index] }

    if (toType === 'multi-dimension') {
      item.rubric = undefined
      item.rubricsDimensions = item.rubricsDimensions ?? [
        { name: '', maxScore: 0, criteria: '' }
      ]
    } else {
      item.rubricsDimensions = undefined
      item.rubric = normalizeRubric(item.rubric, item.maxScore || 0)
    }

    questions[index] = item
    setter({ ...current, questions })
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    整份作業大部分題目屬性是？（可複選，必填）
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    請選擇這份作業主要的題型分類。可複選，先選的優先級較高。AI會根據您的選擇進行判斷，但遇到明顯證據時可能偏離並提醒您。
                  </p>

                  {/* 優先級順序顯示 */}
                  {priorWeightTypes.length > 0 && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-xs font-semibold text-blue-700 mb-2">
                        已選擇的優先級順序（先選優先級較高）：
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {priorWeightTypes.map((type, index) => {
                          const config = [
                            { type: 1, label: 'Type 1 - 唯一答案' },
                            { type: 2, label: 'Type 2 - 多答案可接受' },
                            { type: 3, label: 'Type 3 - 依表現給分' }
                          ].find(c => c.type === type)!

                          // 優先級顏色：#1深藍、#2中藍、#3淺藍
                          const colors = [
                            { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' },
                            { bg: 'bg-blue-400', text: 'text-white', border: 'border-blue-500' },
                            { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-300' }
                          ][index] || { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-300' }

                          return (
                            <div key={type} className={`flex items-center gap-2 px-3 py-1.5 ${colors.bg} ${colors.text} border-2 ${colors.border} rounded-lg`}>
                              <span className="text-xs font-bold">#{index + 1}</span>
                              <span className="text-sm font-semibold">{config.label}</span>
                              <button
                                type="button"
                                onClick={() => removePriorWeight(type)}
                                className="ml-1 hover:opacity-75"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Type 選擇按鈕 */}
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { type: 1 as const, label: 'Type 1 - 唯一答案（精確匹配）', description: '題目有唯一絕對正確的答案', examples: '是非題、選擇題、填空題（單一答案）', bgActive: 'bg-blue-500', textActive: 'text-white', borderActive: 'border-blue-600' },
                      { type: 2 as const, label: 'Type 2 - 多答案可接受（模糊匹配）', description: '核心答案唯一但允許不同表述方式', examples: '簡答題、短句題、名詞解釋', bgActive: 'bg-amber-500', textActive: 'text-white', borderActive: 'border-amber-600' },
                      { type: 3 as const, label: 'Type 3 - 依表現給分（評價標準）', description: '開放式題目，需要評分規準', examples: '申論題、作文、計算題（需看過程）', bgActive: 'bg-purple-500', textActive: 'text-white', borderActive: 'border-purple-600' }
                    ].map((config) => {
                      const isSelected = priorWeightTypes.includes(config.type)
                      const priority = isSelected ? priorWeightTypes.indexOf(config.type) + 1 : null

                      return (
                        <button
                          key={config.type}
                          type="button"
                          onClick={() => togglePriorWeight(config.type)}
                          className={`relative px-4 py-3 rounded-lg text-left transition-all ${
                            isSelected
                              ? `${config.bgActive} ${config.textActive} border-2 ${config.borderActive} shadow-md`
                              : `bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-100`
                          }`}
                          disabled={isSubmitting}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-semibold text-sm mb-1">{config.label}</div>
                              <div className="text-xs opacity-90">{config.description}</div>
                              <div className="text-xs mt-1 opacity-75">
                                範例：{config.examples}
                              </div>
                            </div>
                            {isSelected && (
                              <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-white ${config.type === 1 ? 'text-blue-600' : config.type === 2 ? 'text-amber-600' : 'text-purple-600'} font-bold text-sm`}>
                                {priority}
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="totalPages"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    拍照或批次分割頁數
                  </label>
                  <div className="relative">
                    <NumericInput
                      id="totalPages"
                      min={1}
                      max={100}
                      value={totalPages}
                      onChange={(v) => setTotalPages(typeof v === 'number' ? v : 1)}
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
                        const questionType = typeof q.type === 'number' ? q.type : 2
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
                              <div className="flex items-center gap-1">
                                <select
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded bg-white"
                                  value={questionType}
                                  onChange={(e) =>
                                    updateQuestionField(
                                      'create',
                                      idx,
                                      'type',
                                      e.target.value
                                    )
                                  }
                                >
                                  <option value={1}>Type 1 - 唯一答案</option>
                                  <option value={2}>Type 2 - 多答案可接受</option>
                                  <option value={3}>Type 3 - 依表現給分</option>
                                </select>
                                {q.aiDivergedFromPrior && (
                                  <div className="relative group">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                                      AI 判斷與 Prior Weight 不同
                                      {q.aiOriginalDetection && ` (AI判斷: Type ${q.aiOriginalDetection})`}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <NumericInput
                                className="w-16 px-1 py-1 border border-gray-300 rounded text-right"
                                value={q.maxScore}
                                onChange={(v) =>
                                  updateQuestionField(
                                    'create',
                                    idx,
                                    'maxScore',
                                    String(v)
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

                            {/* Type 1: Standard Answer */}
                            {questionType === 1 && (
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

                            {/* Type 2: Reference Answer + Acceptable Answers */}
                            {questionType === 2 && (
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
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] text-gray-500">可接受答案變體</span>
                                    <button
                                      type="button"
                                      onClick={() => addAcceptableAnswer('create', idx)}
                                      className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    >
                                      + 新增
                                    </button>
                                  </div>
                                  {(q.acceptableAnswers ?? []).map((ans, ansIdx) => (
                                    <div key={ansIdx} className="flex items-center gap-2 mb-1">
                                      <input
                                        className="flex-1 px-2 py-1 border border-gray-300 rounded"
                                        value={ans}
                                        onChange={(e) =>
                                          updateAcceptableAnswer('create', idx, ansIdx, e.target.value)
                                        }
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeAcceptableAnswer('create', idx, ansIdx)}
                                        className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Type 3: Reference Answer + Rubric */}
                            {questionType === 3 && (
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

                                {/* Rubric Type Toggle */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-gray-500">基規準類型：</span>
                                  <button
                                    type="button"
                                    onClick={() => switchRubricType('create', idx, 'multi-dimension')}
                                    className={`text-xs px-2 py-1 rounded ${
                                      q.rubricsDimensions ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                                    }`}
                                  >
                                    多維度評分
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => switchRubricType('create', idx, '4-level')}
                                    className={`text-xs px-2 py-1 rounded ${
                                      q.rubric ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                                    }`}
                                  >
                                    4級評價
                                  </button>
                                </div>

                                {/* Multi-dimension Rubric */}
                                {q.rubricsDimensions && (
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] text-gray-500">評分維度</span>
                                      <button
                                        type="button"
                                        onClick={() => addRubricDimension('create', idx)}
                                        className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                                      >
                                        + 新增維度
                                      </button>
                                    </div>
                                    {q.rubricsDimensions.map((dim, dimIdx) => (
                                      <div key={dimIdx} className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                                        <div className="flex items-center gap-2 mb-1">
                                          <input
                                            placeholder="維度名稱"
                                            className="flex-1 px-2 py-1 border border-gray-300 rounded"
                                            value={dim.name}
                                            onChange={(e) =>
                                              updateRubricDimension('create', idx, dimIdx, 'name', e.target.value)
                                            }
                                          />
                                          <NumericInput
                                            className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                                            value={dim.maxScore}
                                            onChange={(v) =>
                                              updateRubricDimension('create', idx, dimIdx, 'maxScore', String(v))
                                            }
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeRubricDimension('create', idx, dimIdx)}
                                            className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <textarea
                                          rows={2}
                                          placeholder="評分標準"
                                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                          value={dim.criteria}
                                          onChange={(e) =>
                                            updateRubricDimension('create', idx, dimIdx, 'criteria', e.target.value)
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* 4-Level Rubric */}
                                {q.rubric && (
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
                                          <NumericInput
                                            className="px-1 py-1 border border-gray-300 rounded text-right"
                                            value={level.min}
                                            onChange={(v) =>
                                              updateRubricLevel(
                                                'create',
                                                idx,
                                                levelIndex,
                                                'min',
                                                String(v)
                                              )
                                            }
                                          />
                                          <NumericInput
                                            className="px-1 py-1 border border-gray-300 rounded text-right"
                                            value={level.max}
                                            onChange={(v) =>
                                              updateRubricLevel(
                                                'create',
                                                idx,
                                                levelIndex,
                                                'max',
                                                String(v)
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
                                )}
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
                  {classrooms.find(
                    (c) =>
                      c.id === (editingClassroomId || editingAnswerAssignment.classroomId)
                  )?.name || '未知班級'}
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
                  所屬班級
                </label>
                <select
                  value={editingClassroomId}
                  onChange={(e) => setEditingClassroomId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all bg-white"
                  disabled={isSavingAnswerKey}
                >
                  <option value="">請選擇</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  整份作業大部分題目屬性是？（可複選，必填）
                  <span className="text-red-500 ml-1">*</span>
                </label>

                {/* Priority indicator with color depth */}
                {editingPriorWeightTypes.length > 0 && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex flex-wrap gap-2">
                      {editingPriorWeightTypes.map((type, index) => {
                        const config = [
                          { type: 1 as const, label: 'Type 1 - 唯一答案' },
                          { type: 2 as const, label: 'Type 2 - 多答案可接受' },
                          { type: 3 as const, label: 'Type 3 - 依表現給分' }
                        ].find(c => c.type === type)!

                        const colors = [
                          { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' },
                          { bg: 'bg-blue-400', text: 'text-white', border: 'border-blue-500' },
                          { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-300' }
                        ][index]

                        return (
                          <div
                            key={type}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${colors.bg} ${colors.text} border-2 ${colors.border}`}
                          >
                            <span className="text-xs font-bold">#{index + 1}</span>
                            <span className="text-xs font-medium">{config.label}</span>
                            <button
                              type="button"
                              onClick={() => removeEditingPriorWeight(type)}
                              className="ml-1 hover:opacity-70"
                              disabled={isSavingAnswerKey}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Type selection buttons */}
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      type: 1 as const,
                      label: 'Type 1 - 唯一答案（精確匹配）',
                      desc: '答案唯一且不可替換',
                      examples: '如：是非題、選擇題'
                    },
                    {
                      type: 2 as const,
                      label: 'Type 2 - 多答案可接受（模糊匹配）',
                      desc: '核心答案固定但允許不同表述',
                      examples: '如：填空題、簡答題'
                    },
                    {
                      type: 3 as const,
                      label: 'Type 3 - 依表現給分（評價標準）',
                      desc: '開放式或計算題，需評分規準',
                      examples: '如：計算題、申論題、作文'
                    }
                  ].map((config) => {
                    const isSelected = editingPriorWeightTypes.includes(config.type)
                    const priority = isSelected ? editingPriorWeightTypes.indexOf(config.type) + 1 : null

                    return (
                      <button
                        key={config.type}
                        type="button"
                        onClick={() => toggleEditingPriorWeight(config.type)}
                        disabled={isSavingAnswerKey}
                        className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 shadow-md'
                            : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                            {priority}
                          </div>
                        )}
                        <div className="text-sm font-semibold text-gray-900 mb-1">
                          {config.label}
                        </div>
                        <div className="text-xs text-gray-600 mb-1">{config.desc}</div>
                        <div className="text-xs text-gray-500">{config.examples}</div>
                      </button>
                    )
                  })}
                </div>
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
                  {editingAnswerKey && editingAnswerKey.questions.some(q => q.needsReanalysis) && (
                    <button
                      type="button"
                      onClick={handleReanalyzeMarkedQuestions}
                      disabled={isReanalyzing}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} />
                      {isReanalyzing
                        ? '重新分析中…'
                        : `重新分析 (${editingAnswerKey.questions.filter(q => q.needsReanalysis).length} 題)`}
                    </button>
                  )}
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
                    const questionType = typeof q.type === 'number' ? q.type : 2
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
                          <div className="flex items-center gap-1">
                            <select
                              className="flex-1 px-2 py-1 border border-gray-300 rounded bg-white"
                              value={questionType}
                              onChange={(e) =>
                                updateQuestionField('edit', idx, 'type', e.target.value)
                              }
                            >
                              <option value={1}>Type 1 - 唯一答案</option>
                              <option value={2}>Type 2 - 多答案可接受</option>
                              <option value={3}>Type 3 - 依表現給分</option>
                            </select>
                            {q.aiDivergedFromPrior && (
                              <div className="relative group">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                                  AI 判斷與 Prior Weight 不同
                                  {q.aiOriginalDetection && ` (AI判斷: Type ${q.aiOriginalDetection})`}
                                </div>
                              </div>
                            )}
                          </div>
                          <NumericInput
                            className="w-16 px-1 py-1 border border-gray-300 rounded text-right"
                            value={q.maxScore}
                            onChange={(v) =>
                              updateQuestionField(
                                'edit',
                                idx,
                                'maxScore',
                                String(v)
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

                        {/* Type 1: Standard Answer */}
                        {questionType === 1 && (
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

                        {/* Type 2: Reference Answer + Acceptable Answers */}
                        {questionType === 2 && (
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
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-gray-500">可接受答案變體</span>
                                <button
                                  type="button"
                                  onClick={() => addAcceptableAnswer('edit', idx)}
                                  className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                                >
                                  + 新增
                                </button>
                              </div>
                              {(q.acceptableAnswers ?? []).map((ans, ansIdx) => (
                                <div key={ansIdx} className="flex items-center gap-2 mb-1">
                                  <input
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded"
                                    value={ans}
                                    onChange={(e) =>
                                      updateAcceptableAnswer('edit', idx, ansIdx, e.target.value)
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeAcceptableAnswer('edit', idx, ansIdx)}
                                    className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Type 3: Reference Answer + Rubric */}
                        {questionType === 3 && (
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

                            {/* Rubric Type Toggle */}
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500">基規準類型：</span>
                              <button
                                type="button"
                                onClick={() => switchRubricType('edit', idx, 'multi-dimension')}
                                className={`text-xs px-2 py-1 rounded ${
                                  q.rubricsDimensions ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                多維度評分
                              </button>
                              <button
                                type="button"
                                onClick={() => switchRubricType('edit', idx, '4-level')}
                                className={`text-xs px-2 py-1 rounded ${
                                  q.rubric ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                4級評價
                              </button>
                            </div>

                            {/* Multi-dimension Rubric */}
                            {q.rubricsDimensions && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] text-gray-500">評分維度</span>
                                  <button
                                    type="button"
                                    onClick={() => addRubricDimension('edit', idx)}
                                    className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  >
                                    + 新增維度
                                  </button>
                                </div>
                                {q.rubricsDimensions.map((dim, dimIdx) => (
                                  <div key={dimIdx} className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                                    <div className="flex items-center gap-2 mb-1">
                                      <input
                                        placeholder="維度名稱"
                                        className="flex-1 px-2 py-1 border border-gray-300 rounded"
                                        value={dim.name}
                                        onChange={(e) =>
                                          updateRubricDimension('edit', idx, dimIdx, 'name', e.target.value)
                                        }
                                      />
                                      <NumericInput
                                        className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                                        value={dim.maxScore}
                                        onChange={(v) =>
                                          updateRubricDimension('edit', idx, dimIdx, 'maxScore', String(v))
                                        }
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeRubricDimension('edit', idx, dimIdx)}
                                        className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <textarea
                                      rows={2}
                                      placeholder="評分標準"
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                                      value={dim.criteria}
                                      onChange={(e) =>
                                        updateRubricDimension('edit', idx, dimIdx, 'criteria', e.target.value)
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 4-Level Rubric */}
                            {q.rubric && (
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
                                      <NumericInput
                                        className="px-1 py-1 border border-gray-300 rounded text-right"
                                        value={level.min}
                                        onChange={(v) =>
                                          updateRubricLevel(
                                            'edit',
                                            idx,
                                            levelIndex,
                                            'min',
                                            String(v)
                                          )
                                        }
                                      />
                                      <NumericInput
                                        className="px-1 py-1 border border-gray-300 rounded text-right"
                                        value={level.max}
                                        onChange={(v) =>
                                          updateRubricLevel(
                                            'edit',
                                            idx,
                                            levelIndex,
                                            'max',
                                            String(v)
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
                            )}
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
