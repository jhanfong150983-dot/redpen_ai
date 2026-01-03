import { useEffect, useMemo, useState } from 'react'
import './AiReport.css'

type SyncAssignment = {
  id: string
  classroomId?: string
  title?: string
  domain?: string
  updatedAt?: number
}

type SyncStudent = {
  id: string
  classroomId?: string
  seatNumber?: number | null
  name?: string
}

type SyncClassroom = {
  id: string
  name?: string
}

type SyncSubmission = {
  id: string
  assignmentId?: string
  studentId?: string
  status?: string
  createdAt?: number
  updatedAt?: number
  gradedAt?: number
  score?: number | string | null
  gradingResult?: unknown
}

type SyncPayload = {
  classrooms: SyncClassroom[]
  students: SyncStudent[]
  assignments: SyncAssignment[]
  submissions: SyncSubmission[]
  assignmentTags?: AssignmentTagSummary[]
}

type GradingDetail = {
  score?: number
  maxScore?: number
  isCorrect?: boolean
  reason?: string
  studentAnswer?: string
}

type GradingMistake = {
  id?: string
  reason?: string
  question?: string
}

type GradingResult = {
  details?: GradingDetail[]
  mistakes?: GradingMistake[]
  weaknesses?: string[]
  suggestions?: string[]
  feedback?: string[]
  totalScore?: number
}

type PreparedSubmission = SyncSubmission & {
  grading?: GradingResult | null
  details: GradingDetail[]
  mistakes: GradingMistake[]
  weaknesses: string[]
  scoreValue: number | null
  totalScoreValue: number | null
  createdAtMs: number | null
}

type CategoryKey = 'concept' | 'reading' | 'expression'

type CategoryStats = Record<CategoryKey, number>

type StudentSummary = {
  id: string
  name: string
  seatNumber?: number | null
  submissions: PreparedSubmission[]
  latestSubmission?: PreparedSubmission
  avgRatio: number | null
  totalScore: number
  totalPossible: number
  categoryCounts: CategoryStats
  totalMistakes: number
  uniqueCategoryCount: number
  status: 'good' | 'warn' | 'risk'
  statusLabel: string
  statusHint: string
  trend: string
  topCategories: CategoryKey[]
}

type TagStat = {
  label: string
  count: number
  examples?: string[]
}

type AssignmentTagSummary = {
  assignmentId: string
  source?: 'ai' | 'rule'
  status?: 'ready' | 'pending' | 'insufficient_samples'
  sampleCount?: number
  lastEventAt?: number
  nextRunAt?: number
  lastGeneratedAt?: number
  tags?: TagStat[]
}

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  concept: '概念性錯誤',
  reading: '審題錯誤',
  expression: '表達錯誤'
}

const CATEGORY_HINTS: Record<CategoryKey, string> = {
  concept: '概念理解不足，易影響計算與推理。',
  reading: '題意條件遺漏，需強化審題流程。',
  expression: '答案格式與作答完整性不足。'
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatDate(value?: number | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function formatPercent(value: number, digits = 1) {
  const percent = Math.max(0, Math.min(100, value * 100))
  return `${percent.toFixed(digits)}%`
}

function normalizeDomain(domain?: string) {
  const value = domain?.trim()
  return value ? value : '未分類'
}

function getAssignmentTitle(assignment: SyncAssignment) {
  const title = assignment.title?.trim()
  if (title) return title
  const domain = assignment.domain?.trim()
  if (domain) return `${domain}作業`
  return '未命名作業'
}

function parseGradingResult(raw: unknown): GradingResult | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as GradingResult
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as GradingResult
  return null
}

function extractIssues(submission: PreparedSubmission) {
  if (submission.mistakes.length > 0) {
    return submission.mistakes
      .map((item) => [item.reason, item.question].filter(Boolean).join(' '))
      .filter((text) => text.trim().length > 0)
  }
  if (submission.weaknesses.length > 0) {
    return submission.weaknesses
  }
  return []
}

function tagFromIssue(issue: string) {
  const text = issue.trim()
  if (!text) return null
  if (/未作答|空白/.test(text)) return '未作答'
  if (/單位/.test(text)) return '單位漏寫'
  if (/小數點|位值/.test(text)) return '小數點位值'
  if (/半徑|直徑/.test(text)) return '半徑辨識'
  if (/弧長/.test(text)) return '弧長公式'
  if (/周長/.test(text)) return '周長加總'
  if (/比例尺/.test(text)) return '比例尺換算'
  if (/票價|敬老票|兒童票|成人票/.test(text)) return '票價條件'
  if (/審題|題意|條件/.test(text)) return '審題不清'
  if (/表達|答句|格式|敘述/.test(text)) return '作答表達'
  if (/計算|運算/.test(text)) return '計算錯誤'
  if (/公式/.test(text)) return '公式使用'
  if (/圖形|幾何/.test(text)) return '圖形概念'
  if (text.length > 12) return `${text.slice(0, 12)}…`
  return text
}

function classifyIssue(issue: string): CategoryKey {
  if (/審題|題意|條件|漏掉|忽略|未扣除/.test(issue)) return 'reading'
  if (/單位|答句|格式|表達|敘述|字跡|未作答|空白/.test(issue)) {
    return 'expression'
  }
  return 'concept'
}

function isBlankDetail(detail: GradingDetail) {
  const answer = detail.studentAnswer || ''
  const reason = detail.reason || ''
  return /未作答/.test(answer) || /未作答/.test(reason)
}

function isAiFailure(grading?: GradingResult | null) {
  if (!grading?.feedback) return false
  return grading.feedback.some((item) =>
    /系統錯誤|Unable to process|檔案總大小過大/i.test(item)
  )
}

function isGraded(submission: PreparedSubmission) {
  return Boolean(submission.grading) || submission.status === 'graded'
}

function isNeedsAttention(submission: PreparedSubmission) {
  if (isAiFailure(submission.grading)) return true
  const ratio =
    submission.totalScoreValue && submission.scoreValue
      ? submission.scoreValue / submission.totalScoreValue
      : null
  if (ratio !== null) return ratio < 0.7
  if (submission.scoreValue !== null) return submission.scoreValue < 60
  return submission.mistakes.length >= 2
}

function buildCategoryStats(): CategoryStats {
  return { concept: 0, reading: 0, expression: 0 }
}

function buildRadarPoints(values: Record<CategoryKey, number>) {
  const center = { x: 160, y: 160 }
  const axes = {
    concept: { x: 160, y: 50 },
    reading: { x: 260, y: 230 },
    expression: { x: 60, y: 230 }
  }

  const point = (key: CategoryKey) => {
    const ratio = Math.max(0, Math.min(1, values[key]))
    const axis = axes[key]
    const x = center.x + (axis.x - center.x) * ratio
    const y = center.y + (axis.y - center.y) * ratio
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }

  return `${point('concept')} ${point('reading')} ${point('expression')}`
}

type AiReportProps = {
  onBack: () => void
}

export default function AiReport({ onBack }: AiReportProps) {
  const [syncData, setSyncData] = useState<SyncPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')

  useEffect(() => {
    let isActive = true
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/data/sync?includeTags=1', {
          credentials: 'include'
        })
        if (!response.ok) {
          throw new Error('無法取得資料，請重新整理')
        }
        const data = (await response.json()) as SyncPayload
        if (isActive) {
          setSyncData(data)
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : '讀取資料失敗')
        }
      } finally {
        if (isActive) setLoading(false)
      }
    }

    void fetchData()
    return () => {
      isActive = false
    }
  }, [])

  const preparedSubmissions = useMemo<PreparedSubmission[]>(() => {
    if (!syncData) return []
    return syncData.submissions.map((submission) => {
      const grading = parseGradingResult(submission.gradingResult)
      const details = Array.isArray(grading?.details) ? grading?.details ?? [] : []
      const mistakes = Array.isArray(grading?.mistakes) ? grading?.mistakes ?? [] : []
      const weaknesses = Array.isArray(grading?.weaknesses)
        ? grading?.weaknesses ?? []
        : []
      const scoreValue = toNumber(submission.score)
      const totalScoreValue = toNumber(grading?.totalScore) ?? scoreValue
      const createdAtMs =
        toNumber(submission.createdAt) ??
        toNumber(submission.gradedAt) ??
        toNumber(submission.updatedAt)

      return {
        ...submission,
        grading,
        details,
        mistakes,
        weaknesses,
        scoreValue,
        totalScoreValue,
        createdAtMs
      }
    })
  }, [syncData])

  const assignmentMeta = useMemo(() => {
    if (!syncData) return []
    const items = syncData.assignments.map((assignment) => {
      const subs = preparedSubmissions.filter(
        (submission) => submission.assignmentId === assignment.id
      )
      const latestFromSubs = subs.reduce((latest, item) => {
        const value = item.createdAtMs ?? 0
        return value > latest ? value : latest
      }, 0)
      const lastActivity = Math.max(assignment.updatedAt ?? 0, latestFromSubs)
      return {
        assignment,
        submissions: subs,
        lastActivity,
        totalCount: subs.length,
        gradedCount: subs.filter((item) => isGraded(item)).length
      }
    })

    items.sort((a, b) => b.lastActivity - a.lastActivity)
    return items.map((item, index) => ({
      ...item,
      shortLabel: `作業 ${String.fromCharCode(65 + index)}`
    }))
  }, [syncData, preparedSubmissions])

  const domainOptions = useMemo(() => {
    const seen = new Map<string, string>()
    assignmentMeta.forEach((item) => {
      const domain = normalizeDomain(item.assignment.domain)
      if (!seen.has(domain)) seen.set(domain, domain)
    })
    return Array.from(seen.keys())
  }, [assignmentMeta])

  useEffect(() => {
    if (!domainOptions.length) return
    if (selectedDomain && domainOptions.includes(selectedDomain)) return
    setSelectedDomain(domainOptions[0])
  }, [domainOptions, selectedDomain])

  const filteredAssignmentMeta = useMemo(() => {
    if (!selectedDomain) return assignmentMeta
    return assignmentMeta.filter(
      (item) => normalizeDomain(item.assignment.domain) === selectedDomain
    )
  }, [assignmentMeta, selectedDomain])

  useEffect(() => {
    if (!filteredAssignmentMeta.length) return
    if (selectedAssignmentId) {
      const exists = filteredAssignmentMeta.some(
        (item) => item.assignment.id === selectedAssignmentId
      )
      if (exists) return
    }
    setSelectedAssignmentId(filteredAssignmentMeta[0].assignment.id)
  }, [filteredAssignmentMeta, selectedAssignmentId])

  const selectedAssignment = filteredAssignmentMeta.find(
    (item) => item.assignment.id === selectedAssignmentId
  )

  const activeSubmissions = selectedAssignment?.submissions ?? []

  const assignmentStudentCount = useMemo(() => {
    const ids = new Set(activeSubmissions.map((submission) => submission.studentId))
    ids.delete(undefined)
    return ids.size
  }, [activeSubmissions])

  const dailyStats = useMemo(() => {
    let totalItems = 0
    let blankItems = 0
    let aiFailures = 0
    let attentionCount = 0

    const tagMap = new Map<string, Set<string>>()

    activeSubmissions.forEach((submission) => {
      if (submission.details.length > 0) {
        totalItems += submission.details.length
        blankItems += submission.details.filter(isBlankDetail).length
      }

      if (isAiFailure(submission.grading)) aiFailures += 1

      if (isNeedsAttention(submission)) attentionCount += 1

      const issues = extractIssues(submission)
      if (!issues.length) return

      const uniqueIssues = new Set(
        issues.map((issue) => issue.trim()).filter((issue) => issue.length > 0)
      )

      const ownerId = submission.studentId ?? submission.id

      const uniqueTags = new Set(
        Array.from(uniqueIssues)
          .map(tagFromIssue)
          .filter((tag): tag is string => Boolean(tag))
      )

      uniqueTags.forEach((tag) => {
        if (!tagMap.has(tag)) tagMap.set(tag, new Set())
        const entry = tagMap.get(tag)
        if (entry && ownerId) entry.add(ownerId)
      })
    })

    const tagStats = Array.from(tagMap.entries())
      .map(([label, set]) => ({
        label,
        count: set.size
      }))
      .sort((a, b) => b.count - a.count)

    const total = activeSubmissions.length
    const graded = activeSubmissions.filter((submission) => isGraded(submission)).length

    return {
      total,
      graded,
      completionRate: total ? graded / total : 0,
      totalItems,
      blankItems,
      blankRate: totalItems ? blankItems / totalItems : 0,
      aiFailures,
      attentionCount,
      tagStats,
      highFrequencyCount: tagStats.filter((tag) => tag.count >= 2).length
    }
  }, [activeSubmissions])

  const assignmentTagInfo = useMemo(() => {
    if (!syncData || !selectedAssignmentId) return null
    return (
      syncData.assignmentTags?.find(
        (item) => item.assignmentId === selectedAssignmentId
      ) ?? null
    )
  }, [syncData, selectedAssignmentId])

  const backendTagStats =
    assignmentTagInfo?.status === 'ready' && Array.isArray(assignmentTagInfo.tags)
      ? assignmentTagInfo.tags
      : []

  const displayTagStats = backendTagStats.length
    ? backendTagStats
    : dailyStats.tagStats

  const displayHighFrequencyCount = displayTagStats.filter((tag) => tag.count >= 2).length

  const assignmentTitle = selectedAssignment
    ? getAssignmentTitle(selectedAssignment.assignment)
    : '未選擇作業'

  const assignmentDate = selectedAssignment
    ? formatDate(selectedAssignment.lastActivity)
    : '--'

  const teacherNote =
    displayTagStats.length > 0
      ? `作業「${assignmentTitle}」主要卡在「${displayTagStats[0].label}」，建議先帶全班釐清錯誤概念，再分組補強。`
      : '目前尚無可判讀的錯誤標籤。'

  const classStats = useMemo(() => {
    const categoryCounts = buildCategoryStats()
    const studentMap = new Map<string, StudentSummary>()

    if (!syncData) {
      return {
        categoryCounts,
        studentSummaries: [],
        dominantCategories: [] as CategoryKey[],
        primaryCategoryCounts: buildCategoryStats()
      }
    }

    syncData.students.forEach((student) => {
      studentMap.set(student.id, {
        id: student.id,
        name: student.name ?? '未命名學生',
        seatNumber: student.seatNumber ?? null,
        submissions: [],
        avgRatio: null,
        totalScore: 0,
        totalPossible: 0,
        categoryCounts: buildCategoryStats(),
        totalMistakes: 0,
        uniqueCategoryCount: 0,
        status: 'good',
        statusLabel: '穩定',
        statusHint: '作答穩定，未見明顯弱點。',
        trend: '穩定',
        topCategories: []
      })
    })

    preparedSubmissions.forEach((submission) => {
      if (!submission.studentId) return
      if (!studentMap.has(submission.studentId)) {
        studentMap.set(submission.studentId, {
          id: submission.studentId,
          name: '未命名學生',
          seatNumber: null,
          submissions: [],
          avgRatio: null,
          totalScore: 0,
          totalPossible: 0,
          categoryCounts: buildCategoryStats(),
          totalMistakes: 0,
          uniqueCategoryCount: 0,
          status: 'good',
          statusLabel: '穩定',
          statusHint: '作答穩定，未見明顯弱點。',
          trend: '穩定',
          topCategories: []
        })
      }
      const summary = studentMap.get(submission.studentId)
      if (!summary) return
      summary.submissions.push(submission)
    })

    studentMap.forEach((summary) => {
      const sorted = [...summary.submissions].sort(
        (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
      )
      summary.latestSubmission = sorted[0]

      summary.submissions.forEach((submission) => {
        const scoreValue = submission.scoreValue
        const totalScoreValue = submission.totalScoreValue
        if (scoreValue !== null && totalScoreValue !== null) {
          summary.totalScore += scoreValue
          summary.totalPossible += totalScoreValue
        }

        const issues = extractIssues(submission)
        summary.totalMistakes += issues.length

        issues.forEach((issue) => {
          const category = classifyIssue(issue)
          summary.categoryCounts[category] += 1
          categoryCounts[category] += 1
        })
      })

      summary.uniqueCategoryCount = (Object.keys(summary.categoryCounts) as CategoryKey[])
        .filter((key) => summary.categoryCounts[key] > 0)
        .length

      summary.avgRatio =
        summary.totalPossible > 0 ? summary.totalScore / summary.totalPossible : null

      const hasData = summary.submissions.length > 0
      if (!hasData) {
        summary.status = 'risk'
        summary.statusLabel = '資料不足'
        summary.statusHint = '尚未取得作業資料。'
        summary.trend = '資料不足'
      } else if (summary.avgRatio !== null && summary.avgRatio < 0.6) {
        summary.status = 'risk'
        summary.statusLabel = '需關注'
        summary.statusHint = '近期分數偏低，錯誤集中。'
        summary.trend = '固定死角'
      } else if (
        summary.avgRatio !== null &&
        (summary.avgRatio < 0.75 ||
          (summary.totalMistakes >= 3 && summary.uniqueCategoryCount >= 2))
      ) {
        summary.status = 'warn'
        summary.statusLabel = '留意'
        summary.statusHint = '錯誤類型較多，需追蹤。'
        summary.trend = summary.uniqueCategoryCount >= 3 ? '不穩定' : '改善中'
      } else {
        summary.status = 'good'
        summary.statusLabel = '穩定'
        summary.statusHint = '作答穩定，未見明顯弱點。'
        summary.trend = summary.totalMistakes >= 2 ? '改善中' : '穩定'
      }

      const topCategories = (Object.keys(summary.categoryCounts) as CategoryKey[])
        .filter((key) => summary.categoryCounts[key] > 0)
        .sort((a, b) => summary.categoryCounts[b] - summary.categoryCounts[a])

      summary.topCategories = topCategories.slice(0, 2)
    })

    const studentSummaries = Array.from(studentMap.values()).sort((a, b) => {
      if (a.seatNumber === null && b.seatNumber === null) return 0
      if (a.seatNumber === null) return 1
      if (b.seatNumber === null) return -1
      return a.seatNumber - b.seatNumber
    })

    const totalCategoryCount =
      categoryCounts.concept + categoryCounts.reading + categoryCounts.expression
    const dominantCategories = (Object.keys(categoryCounts) as CategoryKey[]).filter(
      (key) => totalCategoryCount > 0 && categoryCounts[key] / totalCategoryCount >= 0.3
    )

    const primaryCategoryCounts = buildCategoryStats()
    studentSummaries.forEach((summary) => {
      if (!summary.topCategories.length) return
      primaryCategoryCounts[summary.topCategories[0]] += 1
    })

    return {
      categoryCounts,
      studentSummaries,
      dominantCategories,
      primaryCategoryCounts
    }
  }, [syncData, preparedSubmissions])

  const { categoryCounts, studentSummaries, dominantCategories, primaryCategoryCounts } =
    classStats

  const categoryMax = Math.max(
    categoryCounts.concept,
    categoryCounts.reading,
    categoryCounts.expression,
    1
  )

  const categoryRatios: Record<CategoryKey, number> = {
    concept: categoryCounts.concept / categoryMax,
    reading: categoryCounts.reading / categoryMax,
    expression: categoryCounts.expression / categoryMax
  }

  const categoryPercents: Record<CategoryKey, number> = {
    concept: Math.round(categoryRatios.concept * 100),
    reading: Math.round(categoryRatios.reading * 100),
    expression: Math.round(categoryRatios.expression * 100)
  }

  const riskStudents = studentSummaries.filter(
    (summary) => summary.status === 'risk' || summary.status === 'warn'
  )

  const stabilityRows = studentSummaries
    .filter((summary) => summary.status !== 'good' || summary.trend !== '穩定')
    .slice(0, 5)

  const classHeader = useMemo(() => {
    if (!syncData) return { classroomName: '班級', domainLabel: '學情摘要' }
    const assignment = selectedAssignment?.assignment
    const classroomName = assignment?.classroomId
      ? syncData.classrooms.find((item) => item.id === assignment.classroomId)?.name ??
        '班級'
      : '班級'
    const domainLabel = assignment?.domain ? `${assignment.domain}學情摘要` : '學情摘要'
    return { classroomName, domainLabel }
  }, [syncData, selectedAssignment])

  const summaryRange = useMemo(() => {
    const dates = preparedSubmissions
      .map((submission) => submission.createdAtMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b)
    if (!dates.length) return '--'
    return `${formatDate(dates[0])}–${formatDate(dates[dates.length - 1])}`
  }, [preparedSubmissions])

  const topTags = displayTagStats.slice(0, 6)
  const severityTags = displayTagStats.slice(0, 8)
  const commonTags = severityTags.filter(
    (tag) => assignmentStudentCount > 0 && tag.count / assignmentStudentCount >= 0.3
  )
  const individualTags = severityTags.filter(
    (tag) => assignmentStudentCount === 0 || tag.count / assignmentStudentCount < 0.3
  )

  const totalAiFailures = useMemo(
    () => preparedSubmissions.filter((submission) => isAiFailure(submission.grading)).length,
    [preparedSubmissions]
  )

  if (loading) {
    return (
      <div className="ai-report">
        <main className="report">
          <header className="page-header">
            <div>
              <div className="eyebrow">AI學情報告</div>
              <h1>資料載入中</h1>
              <p className="subtitle">正在取得最新作業資料。</p>
            </div>
          </header>
          <section className="card">請稍候...</section>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ai-report">
        <main className="report">
          <header className="page-header">
            <div>
              <div className="eyebrow">AI學情報告</div>
              <h1>資料讀取失敗</h1>
              <p className="subtitle">{error}</p>
            </div>
            <div className="header-actions">
              <button className="btn" type="button" onClick={onBack}>
                返回首頁
              </button>
            </div>
          </header>
        </main>
      </div>
    )
  }

  return (
    <div className="ai-report">
      <main className="report">
        <header className="page-header">
          <div>
            <div className="eyebrow">AI學情報告</div>
            <h1>
              {classHeader.classroomName} · {classHeader.domainLabel}
            </h1>
            <p className="subtitle">
              資料區間：{summaryRange} · 作業 {assignmentMeta.length} 份 · 批改{' '}
              {preparedSubmissions.length} 份（含 {totalAiFailures} 筆系統錯誤）
            </p>
          </div>
          <div className="header-actions">
            <button className="btn" type="button" onClick={onBack}>
              返回首頁
            </button>
            <button className="btn" type="button">
              匯出 PDF
            </button>
          </div>
        </header>

        <div className="tab-shell">
          <input type="radio" name="report-tab" id="tab-class" defaultChecked />
          <input type="radio" name="report-tab" id="tab-student" />
          <div className="tab-controls">
            <label htmlFor="tab-class">作業診斷性快報</label>
            <label htmlFor="tab-student">班級診斷性快報</label>
          </div>
          <div className="tab-panels">
            <section className="tab-panel panel-class">
              <section className="hero">
                <div className="card summary-card">
                  <div className="summary-header">
                    <div>
                      <h3>作業診斷性快報</h3>
                      <p className="subtitle">錯誤現象聚類（無題目內容）</p>
                    </div>
                    <div className="summary-controls">
                      <label>
                        領域
                        <select
                          value={selectedDomain}
                          onChange={(event) => setSelectedDomain(event.target.value)}
                          disabled={!domainOptions.length}
                        >
                          {domainOptions.map((domain) => (
                            <option key={domain} value={domain}>
                              {domain}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        作業
                        <select
                          value={selectedAssignmentId}
                          onChange={(event) =>
                            setSelectedAssignmentId(event.target.value)
                          }
                          disabled={!filteredAssignmentMeta.length}
                        >
                          {filteredAssignmentMeta.map((item) => (
                            <option key={item.assignment.id} value={item.assignment.id}>
                              {getAssignmentTitle(item.assignment)} ·{' '}
                              {formatDate(item.lastActivity)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="summary-grid">
                    <div>作業名稱：{assignmentTitle}</div>
                    <div>作業日期：{assignmentDate}</div>
                    <div>
                      批改份數：{dailyStats.graded} / {dailyStats.total} 份
                    </div>
                    <div>主要錯誤：{topTags[0]?.label ?? '尚未累積錯誤標籤'}</div>
                    <div>AI 解析失敗：{dailyStats.aiFailures} 份</div>
                    <div>需關注學生：{dailyStats.attentionCount} 人</div>
                  </div>
                  <div className="summary-note">
                    <strong>老師看到什麼：</strong>
                    {teacherNote}
                  </div>
                </div>
              </section>

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">完成率</div>
                  <div className="stat-value">
                    {formatPercent(dailyStats.completionRate)}
                  </div>
                  <div className="stat-sub">
                    {dailyStats.graded} / {dailyStats.total} 份成功批改
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">空白率</div>
                  <div className="stat-value">{formatPercent(dailyStats.blankRate)}</div>
                  <div className="stat-sub">
                    {dailyStats.blankItems} / {dailyStats.totalItems} 題未作答
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">需關注學生</div>
                  <div className="stat-value">{dailyStats.attentionCount} 人</div>
                  <div className="stat-sub">錯誤集中或概念混淆</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">高頻錯誤標籤</div>
                  <div className="stat-value">{displayHighFrequencyCount} 組</div>
                  <div className="stat-sub">依錯誤現象聚類</div>
                </div>
              </section>

              <div className="section-title">
                <h2>AI 標籤雲與權重</h2>
                <span>
                  目前顯示：{assignmentTitle}（{assignmentDate}）
                </span>
              </div>

              <section className="card">
                <div className="tag-cloud">
                  {topTags.length === 0 && (
                    <span className="tag-pill weight-1">尚未累積錯誤標籤</span>
                  )}
                  {topTags.map((tag) => {
                    const weightClass =
                      tag.count >= 5
                        ? 'weight-3'
                        : tag.count >= 3
                          ? 'weight-2'
                          : 'weight-1'
                    return (
                      <span key={tag.label} className={`tag-pill ${weightClass}`}>
                        {tag.label} · {tag.count} 人
                      </span>
                    )
                  })}
                </div>
              </section>

              <div className="section-title">
                <h2>錯誤規模判斷</h2>
                <span>看同類錯誤在全班的出現比例</span>
              </div>

              <section className="severity-grid">
                <div className="card">
                  <h3>全班需處理（超過三成）</h3>
                  <ul className="severity-list">
                    {commonTags.length === 0 && (
                      <li>本次作業無超過三成的共通錯誤</li>
                    )}
                    {commonTags.map((tag) => (
                      <li key={tag.label}>
                        {tag.label}（{tag.count} 人）
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card">
                  <h3>個別留意（少於三成）</h3>
                  <ul className="severity-list">
                    {individualTags.length === 0 && <li>目前沒有明顯個別錯誤</li>}
                    {individualTags.map((tag) => (
                      <li key={tag.label}>
                        {tag.label}（{tag.count} 人）
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <div className="section-title">
                <h2>作業品質指標</h2>
                <span>從批改行為側觀察作業難度</span>
              </div>

              <section className="quality-grid">
                <div className="card">
                  <h3>空白率</h3>
                  <div className="stat-value">{formatPercent(dailyStats.blankRate)}</div>
                  <p>
                    {dailyStats.blankItems > 0
                      ? '有部分題目未作答，需注意作業難度。'
                      : '本次作業無空白作答。'}
                  </p>
                </div>
                <div className="card">
                  <h3>AI 解析失敗</h3>
                  <div className="stat-value">{dailyStats.aiFailures} 份</div>
                  <p>
                    {dailyStats.aiFailures > 0
                      ? '建議重新拍攝或補交。'
                      : '無解析失敗。'}
                  </p>
                </div>
              </section>
            </section>

            <section className="tab-panel panel-student">
              <section className="hero">
                <div className="card hero-card">
                  <h3>班級診斷性快報</h3>
                  <div className="hero-list">
                    <div>累積期間：{summaryRange} · 作業 {assignmentMeta.length} 份</div>
                    <div>
                      高風險類型：
                      {dominantCategories.length
                        ? dominantCategories.map((key) => CATEGORY_LABELS[key]).join('、')
                        : '目前錯誤集中在多種類型'}
                    </div>
                    <div>需關注學生：{riskStudents.length} 人</div>
                  </div>
                </div>
                <div className="card hero-card">
                  <h3>整體觀察重點</h3>
                  <div className="hero-list">
                    <div>概念性錯誤占比最高，建議加強核心概念。</div>
                    <div>審題錯誤集中於條件題型，需提醒審題流程。</div>
                    <div>表達錯誤以答案格式/單位為主。</div>
                  </div>
                </div>
              </section>

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">穩定學生</div>
                  <div className="stat-value">
                    {studentSummaries.filter((summary) => summary.status === 'good').length} 人
                  </div>
                  <div className="stat-sub">近期作業表現穩定</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">固定死角</div>
                  <div className="stat-value">
                    {studentSummaries.filter((summary) => summary.trend === '固定死角').length}{' '}
                    人
                  </div>
                  <div className="stat-sub">同類錯誤重複出現</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">不穩定學習</div>
                  <div className="stat-value">
                    {studentSummaries.filter((summary) => summary.trend === '不穩定').length} 人
                  </div>
                  <div className="stat-sub">錯誤類型變動大</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">補強重點</div>
                  <div className="stat-value">{dominantCategories.length} 組</div>
                  <div className="stat-sub">以高頻錯誤類型為主</div>
                </div>
              </section>

              <div className="section-title">
                <h2>錯誤類型分布</h2>
                <span>以更上位類型統整近期作業</span>
              </div>

              <section className="card trend-card">
                <h3>整體錯誤結構</h3>
                <div className="radar-wrap">
                  <div className="radar-stage">
                    <svg className="radar" viewBox="0 0 320 320" aria-label="錯誤類型雷達圖">
                      <g className="radar-grid">
                        <polygon points="160,50 260,230 60,230" />
                        <polygon points="160,94 220,202 100,202" />
                      </g>
                      <g>
                        <line className="radar-axis" x1="160" y1="160" x2="160" y2="50" />
                        <line className="radar-axis" x1="160" y1="160" x2="260" y2="230" />
                        <line className="radar-axis" x1="160" y1="160" x2="60" y2="230" />
                      </g>
                      <polygon
                        className="radar-area class"
                        points={buildRadarPoints(categoryRatios)}
                      />
                    </svg>
                    <div className="radar-label top">
                      {CATEGORY_LABELS.concept}
                      <br />
                      {categoryPercents.concept}%
                    </div>
                    <div className="radar-label br">
                      {CATEGORY_LABELS.reading}
                      <br />
                      {categoryPercents.reading}%
                    </div>
                    <div className="radar-label bl">
                      {CATEGORY_LABELS.expression}
                      <br />
                      {categoryPercents.expression}%
                    </div>
                  </div>
                  <div className="legend">
                    <span>
                      <i style={{ background: '#2563eb' }} />
                      錯誤分布（相對比例）
                    </span>
                  </div>
                </div>
                <div className="trend-note">最高類型以 100% 參照呈現。</div>
              </section>

              <div className="section-title">
                <h2>學生錯誤指紋分析</h2>
                <span>依長期錯誤型態分類</span>
              </div>

              <section className="fingerprint-grid">
                {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => (
                  <div key={key} className="card fingerprint-card">
                    <h3>{CATEGORY_LABELS[key]}</h3>
                    <div className="fingerprint-count">{primaryCategoryCounts[key]} 人</div>
                    <p>{CATEGORY_HINTS[key]}</p>
                  </div>
                ))}
              </section>

              <div className="section-title">
                <h2>預測性期中考警示</h2>
                <span>依近期高頻錯誤整理提醒</span>
              </div>

              <section className="card">
                <ul className="alert-list">
                  {dominantCategories.length === 0 && (
                    <li>目前錯誤類型分散，可持續觀察。</li>
                  )}
                  {dominantCategories.map((key) => (
                    <li key={key}>{CATEGORY_HINTS[key]}</li>
                  ))}
                </ul>
              </section>

              <div className="section-title">
                <h2>穩定性評估</h2>
                <span>標籤多樣性 vs 固定死角</span>
              </div>

              <section className="card">
                <table className="stability-table">
                  <thead>
                    <tr>
                      <th>學生</th>
                      <th>錯誤型態</th>
                      <th>趨勢</th>
                      <th>建議</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stabilityRows.length === 0 && (
                      <tr>
                        <td colSpan={4}>目前無明顯需追蹤對象。</td>
                      </tr>
                    )}
                    {stabilityRows.map((summary) => {
                      const topCategory = summary.topCategories[0]
                      return (
                        <tr key={summary.id}>
                          <td>{summary.name}</td>
                          <td>{topCategory ? CATEGORY_LABELS[topCategory] : '資料不足'}</td>
                          <td>{summary.trend}</td>
                          <td>
                            {topCategory ? CATEGORY_HINTS[topCategory] : '請重新上傳作業'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              <div className="section-title">
                <h2>學生清單</h2>
                <span>
                  共 {studentSummaries.length} 人 · 疑慮 {riskStudents.length} 人
                </span>
              </div>

              <section className="student-grid">
                {studentSummaries.map((summary) => {
                  const latest = summary.latestSubmission
                  const scoreText =
                    latest?.scoreValue !== null
                      ? Math.round(latest.scoreValue ?? 0).toString()
                      : '--'
                  const totalText =
                    latest?.totalScoreValue !== null
                      ? Math.round(latest.totalScoreValue ?? 0).toString()
                      : '--'
                  const cardClass =
                    summary.status === 'risk'
                      ? 'student-card is-risk'
                      : summary.status === 'warn'
                        ? 'student-card is-warn'
                        : 'student-card'

                  return (
                    <div key={summary.id} className={cardClass}>
                      <div className="student-top">
                        <div>
                          <div className="student-name">{summary.name}</div>
                          <div className="student-meta">
                            座號 {summary.seatNumber ?? '--'} · 最近作業
                          </div>
                        </div>
                        <div className="student-score">
                          {scoreText}
                          <span>/{totalText}</span>
                        </div>
                      </div>
                      <div className="student-tags">
                        {summary.topCategories.length === 0 && (
                          <span className="tag-chip good">表現穩定</span>
                        )}
                        {summary.topCategories.map((key) => {
                          const chipClass =
                            summary.status === 'risk'
                              ? 'tag-chip risk'
                              : summary.status === 'warn'
                                ? 'tag-chip warn'
                                : 'tag-chip good'
                          return (
                            <span key={key} className={chipClass}>
                              {CATEGORY_LABELS[key]}
                            </span>
                          )
                        })}
                      </div>
                      <div className="student-meta">{summary.statusHint}</div>
                      <div className="student-flag">
                        <span
                          className={`pill ${
                            summary.status === 'risk'
                              ? 'risk'
                              : summary.status === 'warn'
                                ? 'warn'
                                : 'good'
                          }`}
                        >
                          {summary.statusLabel}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </section>
            </section>
          </div>
        </div>

        <div className="footnote">
          以上分析僅依 AI 批改輸出進行聚合，未含題目內容。建議搭配教師觀察補充判斷。
        </div>
      </main>
    </div>
  )
}
