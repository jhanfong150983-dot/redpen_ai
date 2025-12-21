import Dexie, { type EntityTable } from 'dexie'

/**
 * 標準答案資料結構
 */
export interface AnswerKey {
  questions: Array<{
    id: string // 例如 "q1", "q2"
    answer: string
    maxScore: number
  }>
  totalScore: number
}

/**
 * 班級
 */
export interface Classroom {
  id: string
  name: string
  updatedAt?: number
}

/**
 * 學生
 */
export interface Student {
  id: string
  classroomId: string
  seatNumber: number
  name: string
  updatedAt?: number
}

/**
 * 作業
 */
export interface Assignment {
  id: string
  classroomId: string
  title: string
  totalPages: number
  domain?: string // 國語、數學、社會、自然、英語、其他
  answerKey?: AnswerKey
  updatedAt?: number
}

export type SubmissionStatus = 'missing' | 'scanned' | 'synced' | 'graded'

/**
 * 每題批改細節
 */
export interface GradingDetail {
  questionId: string
  studentAnswer?: string
  score: number
  maxScore: number
  isCorrect?: boolean
  reason?: string
  comment?: string
  confidence?: number
}

/**
 * 批改結果
 */
export interface GradingResult {
  totalScore: number
  mistakes: {
    id: string
    question: string
    reason: string
  }[]
  weaknesses: string[]
  suggestions: string[]
  feedback?: string[]
  details?: GradingDetail[]
  needsReview?: boolean
  reviewReasons?: string[]
}

export interface AnswerExtractionCorrection {
  id?: number
  assignmentId: string
  studentId: string
  submissionId: string
  questionId: string
  aiStudentAnswer: string
  correctedStudentAnswer: string
  createdAt: number
  domain?: string
}

/**
 * 學生作答/交卷
 */
export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  status: SubmissionStatus
  imageBlob?: Blob
  imageUrl?: string
  createdAt: number
  updatedAt?: number

  // AI 批改欄位
  score?: number
  feedback?: string
  gradingResult?: GradingResult
  gradedAt?: number

  // 訂正管理：教師手動紀錄訂正次數
  correctionCount?: number
}

/**
 * 同步隊列（離線同步用）
 */
export interface SyncQueue {
  id?: number // auto-increment
  action: 'create' | 'update' | 'delete'
  tableName: string
  recordId: string
  data: unknown
  createdAt: number
  retryCount: number
}

/**
 * Dexie DB 定義
 */
class RedPenDatabase extends Dexie {
  classrooms!: EntityTable<Classroom, 'id'>
  students!: EntityTable<Student, 'id'>
  assignments!: EntityTable<Assignment, 'id'>
  submissions!: EntityTable<Submission, 'id'>
  syncQueue!: EntityTable<SyncQueue, 'id'>
  answerExtractionCorrections!: EntityTable<AnswerExtractionCorrection, 'id'>

  constructor() {
    super('RedPenDB')

    this.version(1).stores({
      classrooms: '&id, name',
      students: '&id, classroomId, seatNumber, name',
      assignments: '&id, classroomId, title',
      submissions:
        '&id, assignmentId, studentId, status, createdAt, [assignmentId+studentId]',
      syncQueue: '++id, tableName, recordId, createdAt'
    })

    this.version(2).stores({
      classrooms: '&id, name',
      students: '&id, classroomId, seatNumber, name',
      assignments: '&id, classroomId, title',
      submissions:
        '&id, assignmentId, studentId, status, createdAt, [assignmentId+studentId]',
      syncQueue: '++id, tableName, recordId, createdAt',
      answerExtractionCorrections:
        '++id, assignmentId, studentId, submissionId, questionId, createdAt'
    })

    const setUpdatedAt = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      return Date.now()
    }

    const applyUpdatedAtOnCreate = (obj: { updatedAt?: number }) => {
      if (obj.updatedAt === undefined) {
        obj.updatedAt = setUpdatedAt(obj.updatedAt)
      }
    }

    const applyUpdatedAtOnUpdate = (mods: Record<string, unknown> | object) => {
      const mutableMods = mods as Record<string, unknown>
      if (!('updatedAt' in mutableMods)) {
        mutableMods.updatedAt = Date.now()
      }
      return mutableMods
    }

    this.classrooms.hook('creating', (_, obj) => {
      applyUpdatedAtOnCreate(obj)
    })
    this.classrooms.hook('updating', (mods) => applyUpdatedAtOnUpdate(mods))

    this.students.hook('creating', (_, obj) => {
      applyUpdatedAtOnCreate(obj)
    })
    this.students.hook('updating', (mods) => applyUpdatedAtOnUpdate(mods))

    this.assignments.hook('creating', (_, obj) => {
      applyUpdatedAtOnCreate(obj)
    })
    this.assignments.hook('updating', (mods) => applyUpdatedAtOnUpdate(mods))

    this.submissions.hook('creating', (_, obj) => {
      if (obj.createdAt === undefined) {
        obj.createdAt = Date.now()
      }
      applyUpdatedAtOnCreate(obj)
    })
    this.submissions.hook('updating', (mods) => {
      const keys = Object.keys(mods)
      if (keys.length === 1 && keys[0] === 'imageBlob') {
        return mods
      }
      return applyUpdatedAtOnUpdate(mods)
    })
  }
}

export const db = new RedPenDatabase()

// 工具
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function getCurrentTimestamp(): number {
  return Date.now()
}
