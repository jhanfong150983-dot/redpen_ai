
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  Loader,
  Sparkles,
  XCircle,
  ImageIcon,
  FileQuestion,
  Download,
  RefreshCw,
  RotateCcw,
  X,
  Pencil,
  AlertTriangle
} from 'lucide-react'
import { db, type Assignment, type Student, type Submission, type Classroom } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import {
  gradeMultipleSubmissions,
  gradeSubmission,
  isGeminiAvailable
} from '@/lib/gemini'
import { downloadImageFromSupabase } from '@/lib/supabase-download'
import { getSubmissionImageUrl } from '@/lib/utils'

interface GradingPageProps {
  assignmentId: string
  onBack?: () => void
}

export default function GradingPage({ assignmentId, onBack }: GradingPageProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [gradingProgress, setGradingProgress] = useState({ current: 0, total: 0 })
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const [selectedSubmission, setSelectedSubmission] = useState<{
    submission: Submission
    student: Student
  } | null>(null)
  const reviewTimeoutRef = useRef<number | null>(null)

  // 題目詳情（可編輯）
  const [editableDetails, setEditableDetails] = useState<any[]>([])
  const [editingReasonIndex, setEditingReasonIndex] = useState<number | null>(null)
  const [answerExtractionFlags, setAnswerExtractionFlags] = useState<
    Map<string, Set<string>>
  >(new Map())
  const [regradeAttempts, setRegradeAttempts] = useState<Map<string, Map<string, number>>>(
    new Map()
  )
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const assignmentData = await db.assignments.get(assignmentId)
      if (!assignmentData) throw new Error('找不到作業')
      setAssignment(assignmentData)

      const classroomData = await db.classrooms.get(assignmentData.classroomId)
      if (!classroomData) throw new Error('找不到班級')
      setClassroom(classroomData)

      const studentsData = await db.students
        .where('classroomId')
        .equals(assignmentData.classroomId)
        .sortBy('seatNumber')
      setStudents(studentsData)

      const submissionsData = await db.submissions.where('assignmentId').equals(assignmentId).toArray()
      const map = new Map<string, Submission>()
      submissionsData.forEach((sub) => map.set(sub.studentId, sub))
      setSubmissions(map)
    } catch (err) {
      console.error('載入失敗', err)
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setIsLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 將 AI 題目詳情映射到可編輯狀態
  useEffect(() => {
    if (selectedSubmission?.submission?.gradingResult?.details) {
      const details = selectedSubmission.submission.gradingResult.details
      if (Array.isArray(details)) {
        console.log('[grading] details with confidence:', details)
        setEditableDetails(
          details.map((d: any, index: number) => ({
            questionId: d.questionId ?? `#${index + 1}`,
            studentAnswer: d.studentAnswer ?? '',
            reason: d.reason ?? d.comment ?? '',
            comment: d.comment ?? d.reason ?? '',
            confidence:
              typeof d.confidence === 'number' && Number.isFinite(d.confidence)
                ? d.confidence
                : undefined,
            score:
              typeof d.score === 'number' && Number.isFinite(d.score)
                ? d.score
                : 0,
            maxScore:
              typeof d.maxScore === 'number' && Number.isFinite(d.maxScore)
                ? d.maxScore
                : 0,
            isCorrect:
              typeof d.isCorrect === 'boolean'
                ? d.isCorrect
                : d.maxScore
                  ? Number(d.score) >= Number(d.maxScore)
                  : false
          }))
        )
      } else {
        setEditableDetails([])
      }
    } else {
      setEditableDetails([])
    }
  }, [selectedSubmission])

  // 自動複核：若需複核，開啟卡片 5 秒後自動清除需複核標記
  useEffect(() => {
    if (reviewTimeoutRef.current) {
      clearTimeout(reviewTimeoutRef.current)
      reviewTimeoutRef.current = null
    }

    if (selectedSubmission?.submission.gradingResult?.needsReview) {
      reviewTimeoutRef.current = window.setTimeout(async () => {
        const id = selectedSubmission.submission.id
        const submission = await db.submissions.get(id)
        if (!submission?.gradingResult?.needsReview) return

        const newGradingResult = { ...submission.gradingResult, needsReview: false, reviewReasons: [] }
        await db.submissions.update(id, { gradingResult: newGradingResult })
        requestSync()

        const updated = await db.submissions.get(id)
        if (updated) {
          setSubmissions((prev) => new Map(prev).set(updated.studentId, updated))
          const student = students.find((s) => s.id === updated.studentId)
          if (student) setSelectedSubmission({ submission: updated, student })
        }
      }, 5000)
    }

    return () => {
      if (reviewTimeoutRef.current) {
        clearTimeout(reviewTimeoutRef.current)
        reviewTimeoutRef.current = null
      }
    }
  }, [selectedSubmission, students])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }, [loadData])

  const handleCloseModal = () => {
    setSelectedSubmission(null)
    setEditableDetails([])
  }

  const applyForcedUnrecognizable = useCallback(
    async (submissionId: string, questionId: string) => {
      const submission = await db.submissions.get(submissionId)
      if (!submission?.gradingResult?.details) return

      const updatedDetails = submission.gradingResult.details.map((detail: any, index: number) => {
        const detailId = detail?.questionId ?? `#${index + 1}`
        if (detailId === questionId) {
          if (detail?.studentAnswer === 'AI無法辨識') return detail
          return { ...detail, studentAnswer: 'AI無法辨識' }
        }
        return detail
      })

      await db.submissions.update(submissionId, {
        gradingResult: { ...submission.gradingResult, details: updatedDetails }
      })
      requestSync()

      const updated = await db.submissions.get(submissionId)
      if (updated) {
        setSubmissions((prev) => new Map(prev).set(updated.studentId, updated))
        if (selectedSubmission?.submission.id === submissionId) {
          const student = students.find((s) => s.id === updated.studentId)
          if (student) setSelectedSubmission({ submission: updated, student })
        }
      }

      setEditableDetails((prev) =>
        prev.map((detail) =>
          detail.questionId === questionId
            ? { ...detail, studentAnswer: 'AI無法辨識' }
            : detail
        )
      )
    },
    [selectedSubmission, students]
  )

  const toggleAnswerExtractionFlag = (submissionId: string, questionId: string) => {
    const isCurrentlyFlagged =
      answerExtractionFlags.get(submissionId)?.has(questionId) ?? false
    const attempts = regradeAttempts.get(submissionId)?.get(questionId) ?? 0
    if (!isCurrentlyFlagged && attempts > 0) {
      void applyForcedUnrecognizable(submissionId, questionId)
    }

    setAnswerExtractionFlags((prev) => {
      const next = new Map(prev)
      const existing = new Set(next.get(submissionId) ?? [])
      if (existing.has(questionId)) {
        existing.delete(questionId)
      } else {
        existing.add(questionId)
      }
      if (existing.size === 0) {
        next.delete(submissionId)
      } else {
        next.set(submissionId, existing)
      }
      return next
    })
  }
  const handleRegradeSingle = async (submission: Submission) => {
    if (!isGeminiAvailable) {
      alert('Gemini 服務未設定')
      return
    }

    if (!submission.imageBlob) {
      try {
        const blob = await downloadImageFromSupabase(submission.id)
        submission.imageBlob = blob
        await db.submissions.update(submission.id, { imageBlob: blob })
      } catch {
        alert('下載影像失敗，無法重評')
        return
      }
    }

    setIsGrading(true)
    try {
      const result = await gradeSubmission(submission.imageBlob!, null, assignment?.answerKey, { strict: true, domain: assignment?.domain })

      await db.submissions.update(submission.id, {
        status: 'graded',
        score: result.totalScore,
        feedback: '',
        gradingResult: result,
        gradedAt: Date.now(),
        imageBlob: submission.imageBlob  // 保留圖片
      })
      requestSync()

      const updatedSub = await db.submissions.get(submission.id)
      if (updatedSub) {
        setSubmissions((prev) => new Map(prev).set(updatedSub.studentId, updatedSub))

        if (selectedSubmission?.submission.id === submission.id) {
          const student = students.find((s) => s.id === submission.studentId)
          if (student) setSelectedSubmission({ submission: updatedSub, student })
        }
      }
    } catch (err) {
      console.error(err)
      alert('重評失敗')
    } finally {
      setIsGrading(false)
    }
  }

  const handleRegradeFlagged = async (submission: Submission) => {
    if (!isGeminiAvailable) {
      alert('Gemini 服務未設定')
      return
    }

    const flaggedIds = Array.from(
      answerExtractionFlags.get(submission.id) ?? []
    ).filter((id) => id)
    if (flaggedIds.length === 0) return

    if (!submission.imageBlob) {
      try {
        const blob = await downloadImageFromSupabase(submission.id)
        submission.imageBlob = blob
        await db.submissions.update(submission.id, { imageBlob: blob })
      } catch {
        alert('下載影像失敗，無法重評')
        return
      }
    }

    setIsGrading(true)
    try {
      const existingDetails = submission.gradingResult?.details ?? []
      const forcedUnrecognizableQuestionIds = flaggedIds.filter((questionId) =>
        existingDetails.some(
          (detail: any, index: number) =>
            (detail?.questionId ?? `#${index + 1}`) === questionId &&
            detail?.studentAnswer === 'AI無法辨識'
        )
      )
      const result = await gradeSubmission(submission.imageBlob!, null, assignment?.answerKey, {
        strict: true,
        domain: assignment?.domain,
        regrade: {
          questionIds: flaggedIds,
          previousDetails: existingDetails,
          forceUnrecognizableQuestionIds: forcedUnrecognizableQuestionIds
        }
      })

      const updatedDetails = Array.isArray(result.details) ? result.details : []
      const updatedById = new Map(
        updatedDetails
          .filter((detail: any) => detail?.questionId)
          .map((detail: any) => [detail.questionId, detail])
      )
      const existingIdSet = new Set(
        existingDetails
          .filter((detail: any) => detail?.questionId)
          .map((detail: any) => detail.questionId)
      )

      const mergedDetails = existingDetails.map((detail: any) => {
        const questionId = detail?.questionId
        if (questionId && updatedById.has(questionId)) {
          return { ...detail, ...updatedById.get(questionId) }
        }
        return detail
      })

      updatedDetails.forEach((detail: any) => {
        if (detail?.questionId && !existingIdSet.has(detail.questionId)) {
          mergedDetails.push(detail)
        }
      })

      const newTotal = mergedDetails.reduce((sum: number, detail: any) => {
        const value = Number(detail?.score)
        return Number.isFinite(value) ? sum + value : sum
      }, 0)

      const newGradingResult: any = submission.gradingResult
        ? { ...submission.gradingResult }
        : { mistakes: [], weaknesses: [], suggestions: [] }

      newGradingResult.details = mergedDetails
      newGradingResult.totalScore = newTotal
      newGradingResult.mistakes = Array.isArray(result.mistakes)
        ? result.mistakes
        : newGradingResult.mistakes ?? []
      newGradingResult.weaknesses = Array.isArray(result.weaknesses)
        ? result.weaknesses
        : newGradingResult.weaknesses ?? []
      newGradingResult.suggestions = Array.isArray(result.suggestions)
        ? result.suggestions
        : newGradingResult.suggestions ?? []
      newGradingResult.feedback = result.feedback ?? newGradingResult.feedback
      newGradingResult.needsReview = false
      newGradingResult.reviewReasons = []

      await db.submissions.update(submission.id, {
        status: 'graded',
        score: newTotal,
        feedback: '',
        gradingResult: newGradingResult,
        gradedAt: Date.now(),
        imageBlob: submission.imageBlob  // 保留圖片
      })
      requestSync()

      const updatedSub = await db.submissions.get(submission.id)
      if (updatedSub) {
        setSubmissions((prev) => new Map(prev).set(updatedSub.studentId, updatedSub))

        if (selectedSubmission?.submission.id === submission.id) {
          const student = students.find((s) => s.id === submission.studentId)
          if (student) setSelectedSubmission({ submission: updatedSub, student })
        }
      }

      setAnswerExtractionFlags((prev) => {
        const next = new Map(prev)
        next.delete(submission.id)
        return next
      })

      setRegradeAttempts((prev) => {
        const next = new Map(prev)
        const existing = new Map(next.get(submission.id) ?? [])
        flaggedIds.forEach((questionId) => {
          existing.set(questionId, (existing.get(questionId) ?? 0) + 1)
        })
        next.set(submission.id, existing)
        return next
      })
    } catch (err) {
      console.error(err)
      alert('重評失敗')
    } finally {
      setIsGrading(false)
    }
  }

  const handleGradeAll = async () => {
    if (!isGeminiAvailable) {
      alert('Gemini 服務未設定')
      return
    }

    const allSubs = Array.from(submissions.values())
    let candidates = allSubs.filter((s) => s.status === 'scanned' || s.status === 'synced')

    if (candidates.length === 0) {
      const graded = allSubs.filter((s) => s.status === 'graded')
      if (graded.length === 0) {
        alert('沒有可批改的作業')
        return
      }
      if (!window.confirm(`偵測到 ${graded.length} 份已批改作業，確定要全部重評嗎？`)) return
      candidates = graded
    } else {
      if (!window.confirm(`將批改 ${candidates.length} 份新作業，確定要開始嗎？`)) return
    }

    setIsGrading(true)
    setError(null)

    try {
      const needDownload = candidates.filter(
        (s) => !s.imageBlob && (s.status === 'synced' || s.status === 'graded')
      )
      const downloadErrors: string[] = []

      if (needDownload.length > 0) {
        setIsDownloading(true)
        for (let i = 0; i < needDownload.length; i++) {
          const sub = needDownload[i]
          setDownloadProgress({ current: i + 1, total: needDownload.length })
          try {
            const blob = await downloadImageFromSupabase(sub.id)
            await db.submissions.update(sub.id, { imageBlob: blob })
            sub.imageBlob = blob
          } catch (err) {
            console.error('下載失敗', err)
            const student = students.find(s => s.id === sub.studentId)
            const studentInfo = student ? `${student.seatNumber}號 ${student.name}` : `ID: ${sub.studentId}`
            downloadErrors.push(studentInfo)
          }
        }
        setIsDownloading(false)

        // 如果有下載失敗，詢問是否繼續
        if (downloadErrors.length > 0) {
          const errorMsg = `以下 ${downloadErrors.length} 份作業下載失敗，將無法批改：\n${downloadErrors.join('\n')}\n\n是否繼續批改其他作業？`
          if (!window.confirm(errorMsg)) {
            setIsGrading(false)
            return
          }
        }
      }

      const toGrade = candidates.filter((s) => s.imageBlob)
      if (toGrade.length === 0) {
        alert('沒有可批改的影像')
        setIsGrading(false)
        return
      }

      // 顯示將要批改的數量
      if (toGrade.length < candidates.length) {
        const skipCount = candidates.length - toGrade.length
        console.warn(`將跳過 ${skipCount} 份沒有影像的作業`)
      }

      const results = await gradeMultipleSubmissions(
        toGrade,
        null,
        (current, total) => setGradingProgress({ current, total }),
        assignment?.answerKey, { domain: assignment?.domain })

      const successCount =
        results && typeof results === 'object' && 'successCount' in results
          ? (results as any).successCount
          : toGrade.length

      await loadData()
      requestSync()
      alert(`批改完成！成功批改 ${successCount} 份`)
    } catch (err) {
      console.error('批改失敗', err)
      setError(err instanceof Error ? err.message : '批改失敗')
    } finally {
      setIsGrading(false)
      setIsDownloading(false)
      setGradingProgress({ current: 0, total: 0 })
      setDownloadProgress({ current: 0, total: 0 })
    }
  }

  // 單題得分即時更新（自動重算總分並儲存）
  const handleDetailScoreChange = async (index: number, scoreValue: number) => {
    if (!selectedSubmission) return

    const updatedDetails = editableDetails.map((d: any, i: number) =>
      i === index ? { ...d, score: scoreValue } : d
    )
    setEditableDetails(updatedDetails)

    const id = selectedSubmission.submission.id
    const submission = await db.submissions.get(id)
    if (!submission) return

    const cleanedDetails = updatedDetails.map((d: any) => {
      const score = Number.isFinite(Number(d.score)) ? Number(d.score) : 0
      const maxScore = Number.isFinite(Number(d.maxScore)) ? Number(d.maxScore) : 0
      const isCorrect = maxScore > 0 ? score >= maxScore : false

      return {
        ...d,
        score,
        maxScore,
        isCorrect,
        reason: d.reason ?? d.comment ?? '',
        comment: d.comment ?? d.reason ?? ''
      }
    })

    const newTotal = cleanedDetails.reduce(
      (sum: number, d: any) => sum + (Number.isFinite(d.score) ? Number(d.score) : 0),
      0
    )

    const newGradingResult: any = submission.gradingResult
      ? { ...submission.gradingResult }
      : { mistakes: [], weaknesses: [], suggestions: [] }

    newGradingResult.details = cleanedDetails
    newGradingResult.totalScore = newTotal
    newGradingResult.needsReview = false
    newGradingResult.reviewReasons = []

    await db.submissions.update(id, {
      score: newTotal,
      gradingResult: newGradingResult
    })
    requestSync()

    const updated = await db.submissions.get(id)
    if (updated) {
      setSubmissions((prev) => new Map(prev).set(updated.studentId, updated))
      const student = students.find((s) => s.id === updated.studentId)
      if (student) setSelectedSubmission({ submission: updated, student })
    }
  }

  // 理由即時更新
  const handleDetailReasonChange = async (index: number, reasonValue: string) => {
    if (!selectedSubmission) return

    const updatedDetails = editableDetails.map((d: any, i: number) =>
      i === index ? { ...d, reason: reasonValue, comment: reasonValue } : d
    )
    setEditableDetails(updatedDetails)

    const id = selectedSubmission.submission.id
    const submission = await db.submissions.get(id)
    if (!submission) return

    const cleanedDetails = updatedDetails.map((d: any) => {
      const score = Number.isFinite(Number(d.score)) ? Number(d.score) : 0
      const maxScore = Number.isFinite(Number(d.maxScore)) ? Number(d.maxScore) : 0
      const isCorrect =
        typeof d.isCorrect === 'boolean'
          ? d.isCorrect
          : maxScore > 0
            ? score >= maxScore
            : false

      return {
        ...d,
        score,
        maxScore,
        isCorrect,
        reason: d.reason ?? d.comment ?? '',
        comment: d.comment ?? d.reason ?? ''
      }
    })

    const newTotal = cleanedDetails.reduce(
      (sum: number, d: any) => sum + (Number.isFinite(d.score) ? Number(d.score) : 0),
      0
    )

    const newGradingResult: any = submission.gradingResult
      ? { ...submission.gradingResult }
      : { mistakes: [], weaknesses: [], suggestions: [] }

    newGradingResult.details = cleanedDetails
    newGradingResult.totalScore = newTotal
    newGradingResult.needsReview = false
    newGradingResult.reviewReasons = []

    await db.submissions.update(id, {
      score: newTotal,
      gradingResult: newGradingResult
    })
    requestSync()

    const updated = await db.submissions.get(id)
    if (updated) {
      setSubmissions((prev) => new Map(prev).set(updated.studentId, updated))
      const student = students.find((s) => s.id === updated.studentId)
      if (student) setSelectedSubmission({ submission: updated, student })
    }
  }

  const getSubmissionMaxScore = (result?: Submission['gradingResult']) => {
    const answerKeyTotal = assignment?.answerKey?.totalScore
    if (typeof answerKeyTotal === 'number' && answerKeyTotal > 0) return answerKeyTotal

    if (result?.details && Array.isArray(result.details)) {
      const sum = result.details.reduce((acc: number, d: any) => {
        const value = Number(d?.maxScore)
        return Number.isFinite(value) ? acc + value : acc
      }, 0)
      return sum > 0 ? sum : null
    }

    return null
  }

  const getSubmissionConfidenceAverage = (result?: Submission['gradingResult']) => {
    if (!result?.details || !Array.isArray(result.details)) return null

    const values = result.details
      .map((detail: any) => {
        const value = Number(detail?.confidence)
        return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null
      })
      .filter((value: number | null): value is number => value !== null)

    if (values.length === 0) return null
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  }

  // 錯誤類型 -> 標籤
  const classifyMistakeToTag = (reason: string): string => {
  const text = (reason || '').toLowerCase().trim()
  const rules: Array<{ label: string; keywords: string[] }> = [
    { label: '未作答', keywords: ['未作答', '未填寫'] },
    { label: '未依題目指示', keywords: ['未依題目指示', '未依題目要求'] },
    { label: '題目看不懂', keywords: ['審題不清', '未依題意', '未根據題意', '未能根據'] },
    { label: '答案不完整', keywords: ['答案不完整', '不完整', '未寫出', '空白'] },
    { label: '用字錯誤', keywords: ['用字錯誤'] },
    { label: '計算失誤', keywords: ['計算', '算錯', '算式', '符號'] },
    {
      label: '概念不清',
      keywords: ['概念不清', '不夠精確', '不清楚', '不夠清楚', '弄反', '未能辨識', '無法辨識', '未能正確辨識', '不理解', '不熟悉', '不夠熟悉', '未能精準', '不夠精準', '混淆', '搞混', '不準確', '不精確', '判斷錯誤', '誤認為', '未能正確識別', '認知錯誤', '無法正確']
    },
    { label: '答案錯誤', keywords: ['誤答', '誤把', '誤將', '答錯', '判錯', '誤判', '誤認', '誤寫', '誤以'] }
  ]

  for (const rule of rules) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) return rule.label
  }
  return '其他'
}


  const getFeedbackTags = (submission: Submission) => {
    const mistakes = submission.gradingResult?.mistakes
    if (mistakes && mistakes.length > 0) {
      const tags = new Set<string>()
      mistakes.forEach((m) => tags.add(classifyMistakeToTag(m.reason)))
      return Array.from(tags)
    }

    if (typeof submission.feedback === 'string') {
      return submission.feedback.split('; ').filter((s) => s.trim() !== '')
    }
    if (Array.isArray(submission.feedback)) return submission.feedback
    return []
  }

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    submissions.forEach((sub) => {
      if (sub.status !== 'graded') return
      const tags = getFeedbackTags(sub)
      tags.forEach((t) => {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      })
    })
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [submissions])

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const subA = submissions.get(a.id)
      const subB = submissions.get(b.id)
      const confA =
        subA?.gradingResult ? getSubmissionConfidenceAverage(subA.gradingResult) : null
      const confB =
        subB?.gradingResult ? getSubmissionConfidenceAverage(subB.gradingResult) : null
      const isLowA = typeof confA === 'number' && confA < 100
      const isLowB = typeof confB === 'number' && confB < 100
      const priorityA = isLowA ? 0 : 1
      const priorityB = isLowB ? 0 : 1

      if (priorityA !== priorityB) return priorityA - priorityB
      if (priorityA === 0 && priorityB === 0) {
        if (confA !== confB) {
          return (confA ?? 101) - (confB ?? 101)
        }
      }
      return a.seatNumber - b.seatNumber
    })
  }, [students, submissions])
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">載入失敗</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              返回
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto pt-8">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回
          </button>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{assignment?.title}</h1>
              <p className="text-gray-600">
                {classroom?.name} · {students.length} 位學生
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleGradeAll}
                disabled={isGrading || isDownloading || !isGeminiAvailable}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl font-medium"
              >
                {isDownloading ? (
                  <>
                    <Download className="w-5 h-5 animate-bounce" />
                    下載中 {downloadProgress.current}/{downloadProgress.total}
                  </>
                ) : isGrading ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-spin" />
                    AI 批改中 {gradingProgress.current}/{gradingProgress.total}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    AI 批改全部
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 標籤篩選 */}
        {tagCounts.length > 0 && (
          <div className="mb-4 bg-white rounded-xl shadow-md p-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600 mr-2">依標籤篩選：</span>
            {tagCounts.map(([tag, count]) => {
              const active = activeTag === tag
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(active ? null : tag)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {tag} · {count}
                </button>
              )
            })}
            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="ml-auto text-sm text-blue-600 hover:underline"
              >
                清除篩選
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedStudents.map((student) => {
            const submission = submissions.get(student.id)
            const status = submission?.status ?? 'missing'
            const tags = submission ? getFeedbackTags(submission) : []
            const gradingResult = submission?.gradingResult
            const maxScore = gradingResult ? getSubmissionMaxScore(gradingResult) : null
            const scoreValue = gradingResult?.totalScore ?? 0
            const isLowScore =
              typeof maxScore === 'number' && maxScore > 0
                ? scoreValue < maxScore * 0.8
                : scoreValue < 60
            const confidenceAverage = gradingResult
              ? getSubmissionConfidenceAverage(gradingResult)
              : null
            const isLowConfidence =
              typeof confidenceAverage === 'number' ? confidenceAverage < 100 : false
            const showConfidence =
              typeof confidenceAverage === 'number' ? confidenceAverage < 100 : false

            if (activeTag && !tags.includes(activeTag)) {
              return null
            }

            return (
              <div
                key={student.id}
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer group flex flex-col"
                onClick={() => {
                  if (!submission) return
                  setSelectedSubmission({ submission, student })
                }}
              >
                <div className="relative">
                  <div className="aspect-[4/3] bg-gray-100 rounded-t-xl overflow-hidden flex items-center justify-center relative">
                    {(() => {
                      const imageUrl = getSubmissionImageUrl(submission)
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt="作業縮圖"
                          className="w-full h-full object-cover"
                        />
                      ) : submission?.status === 'synced' ? (
                        <div className="flex flex-col items-center justify-center text-gray-500">
                          <ImageIcon className="w-10 h-10 text-blue-500" />
                          <p className="text-xs text-gray-500">已上傳雲端</p>
                        </div>
                      ) : (
                        <ImageIcon className="w-12 h-12 text-gray-400" />
                      )
                    })()}
                    {status === 'graded' && gradingResult && (
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-bold shadow ${
                            !isLowScore
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          {gradingResult.totalScore} 分
                        </div>
                        {showConfidence && (
                          <div
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shadow ${
                              isLowConfidence
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-red-100 text-red-700 border border-red-200'
                            }`}
                          >
                            信心 {confidenceAverage}%
                          </div>
                        )}
                      </div>
                    )}
                    {status === 'scanned' && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-blue-500 text-white rounded-full text-xs font-semibold shadow">
                        已掃描
                      </div>
                    )}
                    {status === 'synced' && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-purple-500 text-white rounded-full text-xs font-semibold shadow">
                        已上傳
                      </div>
                    )}

                    {(status === 'graded' || status === 'synced' || status === 'scanned') &&
                      submission && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleRegradeSingle(submission)
                          }}
                          className="absolute top-2 left-2 p-1.5 bg-white/90 text-gray-700 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50 hover:text-blue-600 z-10"
                          title="重新使用 AI 批改此學生"
                          disabled={isGrading}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                </div>

                <div className="p-3 flex-1 flex flex-col">
                  <p className="font-semibold text-gray-900 text-sm mb-1">
                    {student.seatNumber} 號 · {student.name}
                  </p>
                  {status === 'graded' && tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.slice(0, 2).map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {status === 'missing' && <p className="text-xs text-gray-500">尚未繳交</p>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Stats */}
        <div className="mt-6 bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-gray-900 mb-4">統計資訊</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {Array.from(submissions.values()).filter((s) => s.status === 'graded').length}
              </p>
              <p className="text-sm text-gray-600">已批改</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {Array.from(submissions.values()).filter(
                  (s) => s.status === 'scanned' || s.status === 'synced'
                ).length}
              </p>
              <p className="text-sm text-gray-600">待批改</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-400">{students.length - submissions.size}</p>
              <p className="text-sm text-gray-600">尚未繳交</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {submissions.size > 0
                  ? Math.round(
                      (Array.from(submissions.values()).filter((s) => s.status === 'graded').length /
                        submissions.size) *
                        100
                    )
                  : 0}
                %
              </p>
              <p className="text-sm text-gray-600">批改完成率</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-600">
                {Array.from(submissions.values()).filter((s) => s.gradingResult?.needsReview).length}
              </p>
              <p className="text-sm text-rose-600 font-semibold">需複核</p>
            </div>
          </div>
        </div>
      </div>
      {/* Modal */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 bg-gray-100 relative overflow-auto p-4">
              {(() => {
                const imageUrl = getSubmissionImageUrl(selectedSubmission.submission)
                return imageUrl ? (
                  <div className="min-w-full">
                    <p className="text-xs text-gray-500 mb-2">
                      可上下滑動查看完整作業
                    </p>
                    <img
                      src={imageUrl}
                      alt="作業大圖"
                      className="w-full h-auto shadow-lg"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                      <p>圖片不可用</p>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="w-full max-w-md border-l border-gray-200 flex flex-col bg-white">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {selectedSubmission.student.seatNumber} 號 · {selectedSubmission.student.name}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {classroom?.name} · {assignment?.title}
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        總分
                      </span>
                      <span className="text-2xl font-bold text-gray-900">
                        {selectedSubmission.submission.gradingResult?.totalScore ??
                          selectedSubmission.submission.score ??
                          '-'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">依各題得分自動加總</p>
                  </div>
                  {selectedSubmission.submission.status === 'graded' && (
                    <span className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200 font-semibold">
                      已批改
                    </span>
                  )}
                </div>

                {/* 題目詳情（可調整） */}
                {editableDetails.length > 0 ? (
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                      <FileQuestion className="w-4 h-4 text-blue-500" /> 題目詳情（可調整）
                    </h3>
                    <div className="space-y-3">
                      {editableDetails.map((d: any, i: number) => {
                        const safeScore = Number.isFinite(Number(d.score)) ? Number(d.score) : 0
                        const safeMax = Number.isFinite(Number(d.maxScore)) ? Number(d.maxScore) : 0
                        const isCorrect = safeMax > 0 ? safeScore >= safeMax : false
                        const confidenceValue = Number.isFinite(Number(d.confidence))
                          ? Math.min(100, Math.max(0, Number(d.confidence)))
                          : null
                        const showConfidence =
                          typeof confidenceValue === 'number' && confidenceValue < 100
                        const questionId = d.questionId || `#${i + 1}`
                        const isFlagged = selectedSubmission
                          ? answerExtractionFlags
                              .get(selectedSubmission.submission.id)
                              ?.has(questionId)
                          : false

                        return (
                          <div
                            key={questionId}
                            className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-xs space-y-2"
                          >
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-800">
                                  題目 {questionId}
                                </span>
                                {showConfidence && (
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      confidenceValue < 80
                                        ? 'bg-red-100 text-red-700 border border-red-200'
                                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    信心 {confidenceValue}%
                                  </span>
                                )}
                              </div>
                              <div
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                              >
                                <span>{isCorrect ? '正確' : '錯誤'}</span>
                                <input
                                  type="number"
                                  className="w-14 px-1 py-0.5 rounded border border-white/60 bg-white/70 text-gray-800 text-[10px]"
                                  value={d.score ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setEditableDetails((prev) => {
                                      const next = [...prev]
                                      next[i] = { ...next[i], score: v === '' ? '' : Number(v) }
                                      return next
                                    })
                                  }}
                                  onBlur={(e) => {
                                    const num = Number(e.target.value)
                                    void handleDetailScoreChange(i, Number.isFinite(num) ? num : 0)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      const num = Number((e.target as HTMLInputElement).value)
                                      void handleDetailScoreChange(i, Number.isFinite(num) ? num : 0)
                                    }
                                  }}
                                />
                                <span>/ {d.maxScore}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                              <span className="flex-1">學生答案：{d.studentAnswer || '—'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!selectedSubmission) return
                                  toggleAnswerExtractionFlag(
                                    selectedSubmission.submission.id,
                                    questionId
                                  )
                                }}
                                className={`p-1 rounded-full ${
                                  isFlagged
                                    ? 'text-red-600 bg-red-50 hover:bg-red-100'
                                    : 'text-gray-400 hover:bg-gray-100'
                                }`}
                                title={isFlagged ? '取消不一致' : '標記不一致'}
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="text-xs text-gray-700 flex items-start gap-2">
                              <span className="mt-0.5">理由：</span>
                              {editingReasonIndex === i ? (
                                <textarea
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded min-h-[48px]"
                                  value={d.reason ?? ''}
                                  autoFocus
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setEditableDetails((prev) => {
                                      const next = [...prev]
                                      next[i] = { ...next[i], reason: v, comment: v }
                                      return next
                                    })
                                  }}
                                  onBlur={(e) => {
                                    const v = e.target.value
                                    setEditingReasonIndex(null)
                                    void handleDetailReasonChange(i, v)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      const v = (e.target as HTMLTextAreaElement).value
                                      setEditingReasonIndex(null)
                                      void handleDetailReasonChange(i, v)
                                    }
                                  }}
                                />
                              ) : (
                                <div className="flex-1 flex items-start gap-2">
                                  <span className="text-gray-600 whitespace-pre-line">
                                    {d.reason || '—'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingReasonIndex(i)}
                                    className="text-gray-400 hover:text-blue-600"
                                    title="編輯理由"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-xs text-yellow-800">
                    暫無題目詳情可調整
                  </div>
                )}

                {/* 錯誤摘要 */}
                {selectedSubmission.submission.gradingResult?.mistakes &&
                selectedSubmission.submission.gradingResult!.mistakes.length > 0 ? (
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                      <XCircle className="w-4 h-4 text-red-500" /> 錯誤摘要
                    </h3>
                    <div className="space-y-3">
                      {selectedSubmission.submission.gradingResult!.mistakes.map((m, i) => (
                        <div
                          key={i}
                          className="bg-red-50/50 rounded-lg p-3 border border-red-100 text-sm"
                        >
                          <div className="flex justify-between font-semibold text-gray-800 mb-1">
                            <span>第 {m.id} 題</span>
                          </div>
                          <div className="text-gray-600 text-xs mb-1.5">{m.question}</div>
                          <div className="text-red-700 font-medium bg-white px-2 py-1 rounded border border-red-100 inline-block text-xs">
                            原因：{m.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                    <p className="text-green-700 font-bold">目前沒有錯誤摘要</p>
                  </div>
                )}

                {/* 弱項 */}
                {selectedSubmission.submission.gradingResult?.weaknesses &&
                  selectedSubmission.submission.gradingResult!.weaknesses.length > 0 && (
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Sparkles className="w-4 h-4 text-orange-500" /> 弱項
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubmission.submission.gradingResult!.weaknesses.map((w, i) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-100 rounded-md text-sm font-medium"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 建議 */}
                {selectedSubmission.submission.gradingResult?.suggestions &&
                  selectedSubmission.submission.gradingResult!.suggestions.length > 0 && (
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <RotateCcw className="w-4 h-4 text-blue-500" /> 補救建議
                      </h3>
                      <ul className="space-y-2">
                        {selectedSubmission.submission.gradingResult!.suggestions.map((s, i) => (
                          <li
                            key={i}
                            className="flex gap-3 text-sm text-gray-600 bg-blue-50/50 p-3 rounded-lg"
                          >
                            <span className="text-blue-500 font-bold mt-0.5">·</span>
                            <span className="leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {!selectedSubmission.submission.gradingResult?.mistakes &&
                  selectedSubmission.submission.feedback && (
                    <div className="text-gray-400 text-sm text-center italic py-4">
                      這是舊版批改紀錄，建議重新批改更新 AI 結果
                    </div>
                  )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => handleRegradeFlagged(selectedSubmission.submission)}
                  disabled={
                    isGrading ||
                    (answerExtractionFlags.get(selectedSubmission.submission.id)?.size ?? 0) === 0
                  }
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-300 shadow-sm rounded-lg hover:bg-blue-600 hover:text-white hover:border-blue-600 font-medium text-gray-700 transition-all"
                >
                  <RotateCcw className={`w-4 h-4 ${isGrading ? 'animate-spin' : ''}`} />
                  {isGrading ? 'AI 正在再次批改...' : '再次批改'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

