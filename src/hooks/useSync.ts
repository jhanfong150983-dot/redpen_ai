import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useOnlineStatus } from './useOnlineStatus'
import { SYNC_EVENT_NAME } from '@/lib/sync-events'
import { clearDeleteQueue, readDeleteQueue } from '@/lib/sync-delete-queue'
import type { Assignment, Classroom, Student, Submission } from '@/lib/db'
import { blobToBase64 as blobToDataUrl, compressImage } from '@/lib/imageCompression'
import { downloadImageFromSupabase } from '@/lib/supabase-download'
import { fixCorruptedBase64 } from '@/lib/utils'
import { isIndexedDbBlobError, shouldAvoidIndexedDbBlob } from '@/lib/blob-storage'
import { debugLog, infoLog } from '@/lib/logger'
import { useAdminViewAs } from '@/lib/admin-view-as'

interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: number | null
  pendingCount: number
  error: string | null
}

interface UseSyncOptions {
  autoSync?: boolean
  syncInterval?: number // 靽??隞亦摰寡??澆
}

const normalizeBase64Payload = (
  rawBase64: string,
  fallbackMimeType?: string
): { data: string; mimeType?: string; dataUrl: string } => {
  const fixed = fixCorruptedBase64(rawBase64.trim())
  if (fixed.startsWith('data:')) {
    const commaIndex = fixed.indexOf(',')
    if (commaIndex > -1) {
      const meta = fixed.slice(5, commaIndex)
      const mimeType = meta.split(';')[0] || fallbackMimeType
      return {
        data: fixed.slice(commaIndex + 1),
        mimeType,
        dataUrl: fixed
      }
    }
  }

  const mimeType = fallbackMimeType || 'image/jpeg'
  return {
    data: fixed,
    mimeType,
    dataUrl: `data:${mimeType};base64,${fixed}`
  }
}

const MAX_SUBMISSION_BASE64_LENGTH = 2_700_000
const HARD_MAX_SUBMISSION_BASE64_LENGTH = 1_600_000

const shrinkBase64Payload = async (
  dataUrl: string,
  fallbackMimeType: string | undefined,
  targetLength: number
) => {
  let normalized = normalizeBase64Payload(dataUrl, fallbackMimeType)
  if (normalized.data.length <= targetLength) {
    return { ...normalized, updated: false }
  }

  const strategies = [
    { maxWidth: 1400, quality: 0.75 },
    { maxWidth: 1200, quality: 0.7 },
    { maxWidth: 1024, quality: 0.65 },
    { maxWidth: 900, quality: 0.6 },
    { maxWidth: 800, quality: 0.55 }
  ]

  let currentDataUrl = normalized.dataUrl

  for (const strategy of strategies) {
    try {
      const compressed = await compressImage(currentDataUrl, {
        maxWidth: strategy.maxWidth,
        quality: strategy.quality
      })
      const compressedDataUrl = await blobToDataUrl(compressed)
      normalized = normalizeBase64Payload(compressedDataUrl, compressed.type)

      if (normalized.data.length <= targetLength) {
        return { ...normalized, updated: true }
      }

      currentDataUrl = normalized.dataUrl
    } catch (error) {
      console.warn('?? ?郊??憯葬憭望?嚗?典???, error)
      return { ...normalized, updated: false }
    }
  }

  return { ...normalized, updated: true }
}

const toMillis = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function useSync(options: UseSyncOptions = {}) {
  const { autoSync = true } = options
  const { viewAs } = useAdminViewAs()
  const viewAsOwnerId = viewAs?.ownerId?.trim() || null
  const isReadOnly = Boolean(viewAsOwnerId)

  const isOnline = useOnlineStatus()
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    error: null
  })
  const isSyncingRef = useRef(false)
  const syncQueuedRef = useRef(false)
  const prevOnlineRef = useRef(isOnline)
  const lastFocusSyncRef = useRef(0)
  const avoidBlobStorage = shouldAvoidIndexedDbBlob()
  const syncBlockedReasonRef = useRef<string | null>(null)
  const viewAsRef = useRef<string | null>(viewAsOwnerId)
  const hasInitializedRef = useRef(false)

  const buildSyncUrl = useCallback(
    (extraParams?: URLSearchParams) => {
      const params = extraParams
        ? new URLSearchParams(extraParams)
        : new URLSearchParams()
      if (viewAsOwnerId) {
        params.set('ownerId', viewAsOwnerId)
      }
      const query = params.toString()
      return query ? `/api/data/sync?${query}` : '/api/data/sync'
    },
    [viewAsOwnerId]
  )

  const updateSubmissionImageCache = async (
    submissionId: string,
    blob: Blob | null,
    dataUrl: string | null
  ) => {
    const payload: Partial<Submission> = {}
    if (dataUrl) payload.imageBase64 = dataUrl
    if (!avoidBlobStorage && blob) payload.imageBlob = blob
    if (avoidBlobStorage) payload.imageBlob = undefined

    try {
      await db.submissions.update(submissionId, payload)
    } catch (error) {
      if (!avoidBlobStorage && blob && isIndexedDbBlobError(error)) {
        delete payload.imageBlob
        await db.submissions.update(submissionId, payload)
      } else {
        throw error
      }
    }
  }

  const isRlsError = (value: unknown) => {
    const message = value instanceof Error ? value.message : String(value)
    const lower = message.toLowerCase()
    return (
      lower.includes('row-level security') ||
      lower.includes('rls') ||
      lower.includes('permission denied') ||
      lower.includes('not authorized') ||
      lower.includes('not allowed')
    )
  }

  const markSyncBlocked = (reason: string) => {
    if (!syncBlockedReasonRef.current) {
      syncBlockedReasonRef.current = reason
    }
  }

  /**
   * ?湔敺?甇交??   */
  const updatePendingCount = useCallback(async () => {
    const count = await db.submissions
      .where('status')
      .equals('scanned')
      .count()

    setStatus((prev) => ({ ...prev, pendingCount: count }))
    return count
  }, [])

  /**
   * ?郊?桀?鈭斤???   */
  const syncSubmission = async (submission: any) => {
    try {
      debugLog(`???郊?漱 ${submission.id}`)

      let imageBase64: string
      let contentType: string | undefined
      let base64DataUrl: string | null = null

      // ?芸?雿輻 imageBase64嚗??歇蝬?嚗?      if (submission.imageBase64) {
        debugLog('??雿輻?暹???Base64 ?豢?')
        const normalized = normalizeBase64Payload(
          submission.imageBase64,
          submission.imageBlob?.type
        )
        imageBase64 = normalized.data
        contentType = normalized.mimeType
        base64DataUrl = normalized.dataUrl
      } else if (submission.imageBlob) {
        // 敺?Blob 頧?
        debugLog('?? 敺?Blob 頧???Base64')
        const dataUrl = await blobToDataUrl(submission.imageBlob)
        const normalized = normalizeBase64Payload(dataUrl, submission.imageBlob.type)
        imageBase64 = normalized.data
        contentType = normalized.mimeType || submission.imageBlob.type
        base64DataUrl = normalized.dataUrl
        if (avoidBlobStorage && base64DataUrl) {
          await updateSubmissionImageCache(submission.id, submission.imageBlob, base64DataUrl)
        }
      } else {
        console.warn('?? 蝻箏???鞈?嚗?閰血??脩垢銝?鋆?')
        try {
          const downloaded = await downloadImageFromSupabase(submission.id)
          const dataUrl = await blobToDataUrl(downloaded)
          const normalized = normalizeBase64Payload(dataUrl, downloaded.type)
          imageBase64 = normalized.data
          contentType = normalized.mimeType || downloaded.type
          base64DataUrl = normalized.dataUrl
          await updateSubmissionImageCache(submission.id, downloaded, base64DataUrl)
        } catch (downloadError) {
          console.warn('?? ?脩垢銝?憭望?嚗?閮?芰像鈭支誑?踹??岫', downloadError)
          await db.submissions.update(submission.id, { status: 'missing' })
          return true
        }
      }

      // 蝣箏? content type
      if (!contentType) {
        contentType = submission.imageBlob?.type || 'image/webp'
      }

      if (base64DataUrl) {
        const adjusted = await shrinkBase64Payload(
          base64DataUrl,
          contentType,
          MAX_SUBMISSION_BASE64_LENGTH
        )
        if (adjusted.updated) {
          imageBase64 = adjusted.data
          contentType = adjusted.mimeType || contentType
          base64DataUrl = adjusted.dataUrl
          await updateSubmissionImageCache(submission.id, null, base64DataUrl)
        }
      }

      const response = await fetch('/api/data/submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          submissionId: submission.id,
          assignmentId: submission.assignmentId,
          studentId: submission.studentId,
          createdAt: submission.createdAt,
          imageBase64,
          contentType
        })
      })

      let data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 413 && base64DataUrl) {
          console.warn('?? ?郊瑼??之嚗?閰行擃?蝮桀??岫')
          const adjusted = await shrinkBase64Payload(
            base64DataUrl,
            contentType,
            HARD_MAX_SUBMISSION_BASE64_LENGTH
          )
          if (adjusted.updated) {
            imageBase64 = adjusted.data
            contentType = adjusted.mimeType || contentType
            base64DataUrl = adjusted.dataUrl
            await updateSubmissionImageCache(submission.id, null, base64DataUrl)
          }

          const retryResponse = await fetch('/api/data/submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              submissionId: submission.id,
              assignmentId: submission.assignmentId,
              studentId: submission.studentId,
              createdAt: submission.createdAt,
              imageBase64,
              contentType
            })
          })

          data = await retryResponse.json().catch(() => ({}))
          if (!retryResponse.ok) {
            const message = data?.error || '?郊憭望?'
            if (isRlsError(message) || retryResponse.status === 401 || retryResponse.status === 403) {
              console.warn('?? ?郊?剖甈?? (RLS)嚗??甇?', message)
              markSyncBlocked(message)
              return false
            }
            throw new Error(message)
          }
        } else {
          const message = data?.error || '?郊憭望?'
          if (isRlsError(message) || response.status === 401 || response.status === 403) {
            console.warn('?? ?郊?剖甈?? (RLS)嚗??甇?', message)
            markSyncBlocked(message)
            return false
          }
          throw new Error(message)
        }
      }

      debugLog('??????甇交???)

      // ?郊??敺??湔???靽??砍???豢?
      debugLog('?? ?湔?砍?? synced嚗??????..')

      // ?炎?亦???      const beforeUpdate = await db.submissions.get(submission.id)
      debugLog('?湔??', {
        hasBlob: !!beforeUpdate?.imageBlob,
        blobSize: beforeUpdate?.imageBlob?.size,
        hasBase64: !!beforeUpdate?.imageBase64,
        base64Length: beforeUpdate?.imageBase64?.length
      })

      await db.submissions.update(submission.id, {
        status: 'synced',
        imageUrl: `submissions/${submission.id}.webp`
        // 瘜冽?嚗??湔 imageBlob ??imageBase64嚗??????      })

      // 撽??湔敺??      const afterUpdate = await db.submissions.get(submission.id)
      debugLog('?湔敺?', {
        status: afterUpdate?.status,
        hasBlob: !!afterUpdate?.imageBlob,
        blobSize: afterUpdate?.imageBlob?.size,
        hasBase64: !!afterUpdate?.imageBase64,
        base64Length: afterUpdate?.imageBase64?.length,
        imageUrl: afterUpdate?.imageUrl
      })

      if (beforeUpdate?.imageBlob && !afterUpdate?.imageBlob) {
        console.error('?? 霅血?嚗?啣? Blob 銝仃嚗?)
      }
      if (beforeUpdate?.imageBase64 && !afterUpdate?.imageBase64) {
        console.error('?? 霅血?嚗?啣? Base64 銝仃嚗?)
      }

      debugLog('???砍???唳???)

      return true
    } catch (error) {
      if (isRlsError(error)) {
        console.warn('?? ?郊?剖甈?? (RLS)嚗??甇?', error)
        markSyncBlocked(error instanceof Error ? error.message : String(error))
        return false
      }
      console.error(`?郊憭望? ${submission.id}:`, error)
      throw error
    }
  }

  /**
   * 銝?祆?鞈??圈蝡?   */
  const pushMetadata = useCallback(async () => {
    // ViewAs disabled
    debugLog('? pushMetadata ??')
    const [classrooms, students, assignments, submissions, folders, deleteQueue] =
      await Promise.all([
        db.classrooms.toArray(),
        db.students.toArray(),
        db.assignments.toArray(),
        db.submissions.toArray(),
        db.folders.toArray(),
        readDeleteQueue()
      ])

    debugLog('?? pushMetadata 霈?? folders:', folders)

    const deleteQueueIds = deleteQueue
      .map((item) => item.id)
      .filter((id): id is number => typeof id === 'number')

    const deletedPayload: Record<string, Array<{ id: string; deletedAt: number }>> = {
      classrooms: [],
      students: [],
      assignments: [],
      submissions: [],
      folders: []
    }

    const deleteMap = new Map<
      string,
      { tableName: string; recordId: string; deletedAt: number }
    >()

    for (const entry of deleteQueue) {
      if (!entry.tableName || !entry.recordId) continue
      const key = `${entry.tableName}:${entry.recordId}`
      const existing = deleteMap.get(key)
      if (!existing || entry.deletedAt > existing.deletedAt) {
        deleteMap.set(key, {
          tableName: entry.tableName,
          recordId: entry.recordId,
          deletedAt: entry.deletedAt
        })
      }
    }

    for (const entry of deleteMap.values()) {
      const bucket = deletedPayload[entry.tableName]
      if (bucket) {
        bucket.push({ id: entry.recordId, deletedAt: entry.deletedAt })
      }
    }

    const classroomPayload = classrooms
      .filter((c) => c?.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        folder: c.folder === undefined ? null : c.folder,
        updatedAt: c.updatedAt
      }))

    debugLog('? pushMetadata - 皞??潮? classrooms:', classroomPayload)

    const studentPayload = students
      .filter((s) => s?.id && s?.classroomId)
      .map((s) => ({
        id: s.id,
        classroomId: s.classroomId,
        seatNumber: s.seatNumber,
        name: s.name,
        updatedAt: s.updatedAt
      }))

    const assignmentPayload = assignments
      .filter((a) => a?.id && a?.classroomId)
      .map((a) => ({
        id: a.id,
        classroomId: a.classroomId,
        title: a.title,
        totalPages: a.totalPages,
        domain: a.domain,
        folder: a.folder === undefined ? null : a.folder,
        priorWeightTypes: a.priorWeightTypes,
        answerKey: a.answerKey,
        updatedAt: a.updatedAt
      }))
    
    console.log(`? [Sync Push] 皞?銝 ${assignmentPayload.length} ??璆?`, assignmentPayload.map(a => ({ id: a.id, title: a.title, hasAnswerKey: !!a.answerKey })))

    const submissionPayload = submissions
      .filter((sub) => sub.status !== 'scanned')
      .map(({ imageBlob, ...rest }) => ({
        id: rest.id,
        assignmentId: rest.assignmentId,
        studentId: rest.studentId,
        status: rest.status,
        createdAt: rest.createdAt,
        imageUrl: rest.imageUrl || `submissions/${rest.id}.webp`,
        score: rest.score,
        feedback: rest.feedback,
        gradingResult: rest.gradingResult,
        gradedAt: rest.gradedAt,
        correctionCount: rest.correctionCount,
        updatedAt: rest.updatedAt
      }))

    const foldersPayload = folders
      .filter((f) => f?.id && f?.name)
      .map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        updatedAt: f.updatedAt
      }))

    const response = await fetch(buildSyncUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        classrooms: classroomPayload,
        students: studentPayload,
        assignments: assignmentPayload,
        submissions: submissionPayload,
        folders: foldersPayload,
        deleted: deletedPayload
      })
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.error || '?郊憭望?'
      if (isRlsError(message) || response.status === 401 || response.status === 403) {
        console.warn('?? pushMetadata ?剖甈?? (RLS)嚗??甇?', message)
        markSyncBlocked(message)
        return
      }
      throw new Error(message)
    }

    debugLog('??pushMetadata 摰?')

    // pushMetadata 敺?瑼Ｘ銝甈?folders
    const afterPush = await db.folders.toArray()
    debugLog('?? pushMetadata 敺??folders:', afterPush)

    if (deleteQueueIds.length > 0) {
      await clearDeleteQueue(deleteQueueIds)
    }
  }, [isReadOnly, buildSyncUrl])

  /**
   * 敺蝡舀?????   */
  const pullMetadata = useCallback(async () => {
    debugLog('? pullMetadata ??')
    const response = await fetch(buildSyncUrl(), {
      method: 'GET',
      credentials: 'include'
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.error || '頛?脩垢鞈?憭望?'
      if (isRlsError(message) || response.status === 401 || response.status === 403) {
        console.warn('?? pullMetadata ?剖甈?? (RLS)嚗??甇?', message)
        markSyncBlocked(message)
        return
      }
      throw new Error(message)
    }

    const classrooms = Array.isArray(data.classrooms) ? data.classrooms : []
    const students = Array.isArray(data.students) ? data.students : []
    const assignments = Array.isArray(data.assignments) ? data.assignments : []
    const submissions = Array.isArray(data.submissions) ? data.submissions : []
    const folders = Array.isArray(data.folders) ? data.folders : []
    const deleted = data?.deleted && typeof data.deleted === 'object' ? data.deleted : {}
    
    console.log(`? [Sync Pull] 敺蝡舀???${assignments.length} ??璆?`, assignments.map((a: any) => ({ id: a.id, title: a.title, hasAnswerKey: !!a.answerKey })))

    const collectDeletedIds = (items: unknown) =>
      Array.isArray(items)
        ? items
            .map((item) => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && 'id' in item) {
                return (item as { id?: unknown }).id
              }
              return null
            })
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []

    const deletedClassroomIds = collectDeletedIds(deleted.classrooms)
    const deletedStudentIds = collectDeletedIds(deleted.students)
    const deletedAssignmentIds = collectDeletedIds(deleted.assignments)
    const deletedSubmissionIds = collectDeletedIds(deleted.submissions)
    const deletedFolderIds = collectDeletedIds(deleted.folders)

    debugLog('??儭?閬?斤? folders:', deletedFolderIds)

    // ??bulkDelete 銋?瑼Ｘ folders
    const beforeDelete = await db.folders.toArray()
    debugLog('?? bulkDelete 銋???folders:', beforeDelete)

    const deletedClassroomSet = new Set(deletedClassroomIds)
    const deletedStudentSet = new Set(deletedStudentIds)
    const deletedAssignmentSet = new Set(deletedAssignmentIds)
    const deletedSubmissionSet = new Set(deletedSubmissionIds)
    const deletedFolderSet = new Set(deletedFolderIds)

    const existingSubmissions = await db.submissions.toArray()

    debugLog(`? pullMetadata: 敺蝡舀???${submissions.length} 蝑?submissions`)
    debugLog(`? pullMetadata: ?砍?暹? ${existingSubmissions.length} 蝑?submissions`)

    // 靽??砍???豢?嚗lob ??Base64嚗?    const imageDataMap = new Map(
      existingSubmissions.map((sub) => [
        sub.id,
        {
          imageBlob: sub.imageBlob,
          imageBase64: sub.imageBase64
        }
      ])
    )

    debugLog(`? imageDataMap 撱箇?摰?嚗???${imageDataMap.size} 蝑???)

    // 蝯梯???撠?啣????    let blobCount = 0
    let base64Count = 0
    imageDataMap.forEach((data) => {
      if (data.imageBlob) blobCount++
      if (data.imageBase64) base64Count++
    })
    debugLog(`?? ?砍??蝯梯?: ${blobCount} ??Blob, ${base64Count} ??Base64`)

    const mergedSubmissions: Submission[] = submissions
      .filter(
        (sub: Submission) =>
          sub?.id &&
          sub?.assignmentId &&
          sub?.studentId &&
          !deletedSubmissionSet.has(sub.id)
      )
      .map((sub: Submission) => {
        const createdAt =
          typeof sub.createdAt === 'number' && Number.isFinite(sub.createdAt)
            ? sub.createdAt
            : Date.now()
        const gradedAt =
          typeof sub.gradedAt === 'number' && Number.isFinite(sub.gradedAt)
            ? sub.gradedAt
            : undefined

        // 敺?唳敺拙????        const localImageData = imageDataMap.get(sub.id)

        if (localImageData && (localImageData.imageBlob || localImageData.imageBase64)) {
          debugLog(`?? ?Ｗ儔???豢?: ${sub.id}`, {
            hasBlob: !!localImageData.imageBlob,
            hasBase64: !!localImageData.imageBase64,
            base64Length: localImageData.imageBase64?.length
          })
        }

        return {
          id: sub.id,
          assignmentId: sub.assignmentId,
          studentId: sub.studentId,
          status: sub.status || 'synced',
          createdAt,
          score: sub.score,
          feedback: sub.feedback,
          gradingResult: sub.gradingResult,
          gradedAt,
          correctionCount: sub.correctionCount,
          imageUrl: sub.imageUrl,
          imageBlob: localImageData?.imageBlob,       // 靽??砍 Blob
          imageBase64: localImageData?.imageBase64,   // 靽??砍 Base64
          updatedAt: toMillis(sub.updatedAt ?? (sub as { updated_at?: unknown }).updated_at)
        }
      })

    debugLog(`???蔥摰?嚗??神??${mergedSubmissions.length} 蝑?submissions`)

    // 蝯梯??蔥敺????豢?
    let mergedBlobCount = 0
    let mergedBase64Count = 0
    mergedSubmissions.forEach((sub) => {
      if (sub.imageBlob) mergedBlobCount++
      if (sub.imageBase64) mergedBase64Count++
    })
    debugLog(`?? ?蔥敺??絞閮? ${mergedBlobCount} ??Blob, ${mergedBase64Count} ??Base64`)

    debugLog('? pullMetadata - 敺蝡舀?啁??? classrooms:', classrooms)

    // 靽??砍??folder 鞈?嚗??箏?蝡臬?賡?銝??folder 甈?嚗?    const existingClassrooms = await db.classrooms.toArray()
    const localFolderMap = new Map(
      existingClassrooms.map((c) => [c.id, c.folder])
    )

    const normalizedClassrooms: Classroom[] = classrooms
      .filter((c: Classroom) => c?.id && !deletedClassroomSet.has(c.id))
      .map((c: Classroom) => {
        const cloudFolder = (c as Classroom & { folder?: string }).folder
        const localFolder = localFolderMap.get(c.id)

        // 憒??脩垢??folder嚗蝙?券蝡舐?嚗????啁?
        const finalFolder = cloudFolder !== undefined ? cloudFolder : localFolder

        return {
          id: c.id,
          name: c.name,
          folder: finalFolder,
          updatedAt: toMillis(
            (c as Classroom & { updatedAt?: unknown }).updatedAt ??
              (c as { updated_at?: unknown }).updated_at
          )
        }
      })

    debugLog('? pullMetadata - 甇??????classrooms:', normalizedClassrooms)

    const normalizedStudents: Student[] = students
      .filter((s: Student) => s?.id && s?.classroomId && !deletedStudentSet.has(s.id))
      .map((s: Student) => ({
        id: s.id,
        classroomId: s.classroomId,
        seatNumber: s.seatNumber,
        name: s.name,
        updatedAt: toMillis(
          (s as Student & { updatedAt?: unknown }).updatedAt ??
            (s as { updated_at?: unknown }).updated_at
        )
      }))

    // 靽??砍??assignment folder 鞈?嚗??箏?蝡臬?賡?銝??folder 甈?嚗?    const existingAssignments = await db.assignments.toArray()
    const localAssignmentFolderMap = new Map(
      existingAssignments.map((a) => [a.id, { folder: a.folder, priorWeightTypes: a.priorWeightTypes }])
    )

    const normalizedAssignments: Assignment[] = assignments
      .filter(
        (a: Assignment) => a?.id && a?.classroomId && !deletedAssignmentSet.has(a.id)
      )
      .map((a: Assignment) => {
        const cloudFolder = (a as Assignment & { folder?: string }).folder
        const cloudPriorWeightTypes = (a as Assignment & { priorWeightTypes?: any }).priorWeightTypes
        const localData = localAssignmentFolderMap.get(a.id)

        // 憒??脩垢????雿輻?脩垢???血?靽??砍??        const finalFolder = cloudFolder !== undefined ? cloudFolder : localData?.folder
        const finalPriorWeightTypes = cloudPriorWeightTypes !== undefined ? cloudPriorWeightTypes : localData?.priorWeightTypes

        return {
          id: a.id,
          classroomId: a.classroomId,
          title: a.title,
          totalPages: a.totalPages,
          domain: a.domain ?? undefined,
          folder: finalFolder,
          priorWeightTypes: finalPriorWeightTypes,
          answerKey: a.answerKey ?? undefined,
          updatedAt: toMillis(
            (a as Assignment & { updatedAt?: unknown }).updatedAt ??
              (a as { updated_at?: unknown }).updated_at
          )
        }
      })

    const normalizedFolders = folders
      .filter((f: any) => f?.id && f?.name && !deletedFolderSet.has(f.id))
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        updatedAt: toMillis(
          (f as { updatedAt?: unknown }).updatedAt ??
            (f as { updated_at?: unknown }).updated_at
        )
      }))

    if (deletedClassroomIds.length > 0) {
      await db.classrooms.bulkDelete(deletedClassroomIds)
    }
    if (deletedStudentIds.length > 0) {
      await db.students.bulkDelete(deletedStudentIds)
    }
    if (deletedAssignmentIds.length > 0) {
      await db.assignments.bulkDelete(deletedAssignmentIds)
    }
    if (deletedSubmissionIds.length > 0) {
      await db.submissions.bulkDelete(deletedSubmissionIds)
    }
    if (deletedFolderIds.length > 0) {
      debugLog('?? ?瑁??芷 folders:', deletedFolderIds)
      await db.folders.bulkDelete(deletedFolderIds)
    }

    // ?冽???bulkDelete 銋?瑼Ｘ folders
    const afterDelete = await db.folders.toArray()
    debugLog('?? bulkDelete 銋???folders:', afterDelete)

    // ?炎??folders ???    const beforePut = await db.folders.toArray()
    debugLog('?? bulkPut 銋???folders:', beforePut)

    await db.classrooms.bulkPut(normalizedClassrooms)

    // 瑼Ｘ撖怠敺? classrooms
    const afterPutClassrooms = await db.classrooms.toArray()
    debugLog('?? bulkPut classrooms 銋?????', afterPutClassrooms)

    await db.students.bulkPut(normalizedStudents)
    await db.assignments.bulkPut(normalizedAssignments)
    await db.submissions.bulkPut(mergedSubmissions)

    // ?炎??folders ???    const afterPut = await db.folders.toArray()
    debugLog('?? bulkPut 銋???folders:', afterPut)

    // ?芣??園蝡舀? folders 鞈????湔嚗????啗???
    if (folders.length > 0) {
      await db.folders.bulkPut(normalizedFolders)
      debugLog(`???郊鈭?${normalizedFolders.length} ???冗`)
    } else {
      debugLog('?? ?脩垢瘝? folders 鞈?嚗???啗??冗')

      // 撽??砍鞈?憭暹?衣?????      const localFolders = await db.folders.toArray()
      debugLog('?? pullMetadata 敺??folders:', localFolders)
    }
  }, [buildSyncUrl])

  // 雿輻 localStorage 餈質馱?砍鞈?撠???ownerId
  const SYNC_OWNER_KEY = 'sync_current_owner_id'

  useEffect(() => {
    // ???砍鞈??桀?撠???ownerId
    const storedOwnerId = localStorage.getItem(SYNC_OWNER_KEY)
    const currentOwnerId = viewAsOwnerId ?? '__self__'
    
    // 憒? ownerId 瘝?嚗歲??頛?    if (storedOwnerId === currentOwnerId && hasInitializedRef.current) {
      viewAsRef.current = viewAsOwnerId
      return
    }
    
    viewAsRef.current = viewAsOwnerId
    hasInitializedRef.current = true
    syncBlockedReasonRef.current = null

    const resetLocal = async () => {
      console.log('?? ViewAs 霈嚗??啗??亥???..', { from: storedOwnerId, to: currentOwnerId })
      isSyncingRef.current = false
      syncQueuedRef.current = false
      await Promise.all([
        db.classrooms.clear(),
        db.students.clear(),
        db.assignments.clear(),
        db.submissions.clear(),
        db.syncQueue.clear(),
        db.folders.clear(),
        db.answerExtractionCorrections.clear()
      ])
      
      // ?脣??嗅???ownerId
      localStorage.setItem(SYNC_OWNER_KEY, currentOwnerId)
      
      setStatus((prev) => ({
        ...prev,
        lastSyncTime: null,
        pendingCount: 0,
        error: null
      }))

      if (!isOnline) return

      await pullMetadata()
      if (!syncBlockedReasonRef.current) {
        const remainingCount = await updatePendingCount()
        setStatus((prev) => ({
          ...prev,
          lastSyncTime: Date.now(),
          pendingCount: remainingCount,
          error: null
        }))
      }
    }

    void resetLocal()
  }, [viewAsOwnerId, isOnline, pullMetadata, updatePendingCount])

  /**
   * ?瑁??郊
   */
  const performSync = useCallback(async () => {
    if (!isOnline) {
      debugLog('?Ｙ????頝喲??郊')
      void updatePendingCount()
      return
    }

    if (isSyncingRef.current) {
      debugLog('?桀?甇??郊銝哨?頝喲??祆活')
      syncQueuedRef.current = true
      return
    }

    if (syncBlockedReasonRef.current) {
      console.warn('?? 撌脣皜砍 RLS 甈??嚗??甇?', syncBlockedReasonRef.current)
      setStatus((prev) => ({ ...prev, isSyncing: false, error: null }))
      return
    }

    try {
      isSyncingRef.current = true
      setStatus((prev) => ({ ...prev, isSyncing: true, error: null }))

      // ViewAs disabled: if (isReadOnly) {
      // debugLog('?? 瑼Ｚ?璅∪?嚗????脩垢鞈?')
      // await pullMetadata()
      // if (syncBlockedReasonRef.current) {
      // setStatus((prev) => ({
      // ...prev,
      // isSyncing: false,
      // error: null
      // }))
      // return
      // }
      // const remainingCount = await updatePendingCount()
      // setStatus((prev) => ({
      // ...prev,
      // isSyncing: false,
      // lastSyncTime: Date.now(),
      // pendingCount: remainingCount,
      // error: null
      // }))
      // return
      }

      // 瑼Ｘ performSync ???? folders
      const performSyncStart = await db.folders.toArray()
      debugLog('? performSync ???? folders:', performSyncStart)

      const pendingSubmissions = await db.submissions
        .where('status')
        .equals('scanned')
        .toArray()

      debugLog(`?曉 ${pendingSubmissions.length} 璇??郊蝝?)

      let successCount = 0
      let failCount = 0

      for (const submission of pendingSubmissions) {
        try {
          const result = await syncSubmission(submission)
          if (result) {
            successCount++
          }
        } catch (error) {
          failCount++
          console.error('?郊憭望?:', error)
        }
      }

      if (pendingSubmissions.length > 0) {
        infoLog(`?郊摰?嚗???${successCount} 蝑?憭望? ${failCount} 蝑)
      }

      // 瑼Ｘ push ?? folders
      if (syncBlockedReasonRef.current) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          error: null
        }))
        return
      }

      const beforePush = await db.folders.toArray()
      debugLog('? pushMetadata ?? folders:', beforePush)

      await pushMetadata()
      if (syncBlockedReasonRef.current) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          error: null
        }))
        return
      }

      // 瑼Ｘ push 敺ull ?? folders
      const afterPushBeforePull = await db.folders.toArray()
      debugLog('? pushMetadata 敺ullMetadata ?? folders:', afterPushBeforePull)

      await pullMetadata()
      if (syncBlockedReasonRef.current) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          error: null
        }))
        return
      }

      const remainingCount = await updatePendingCount()

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingCount: remainingCount,
        error: syncBlockedReasonRef.current
          ? null
          : failCount > 0
            ? `${failCount} 璇???甇亙仃?
            : null
      }))
    } catch (error) {
      if (isRlsError(error)) {
        markSyncBlocked(error instanceof Error ? error.message : String(error))
        setStatus((prev) => ({ ...prev, isSyncing: false, error: null }))
        return
      }
      console.error('?郊???潛??航炊:', error)
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : '?郊憭望?'
      }))
    } finally {
      isSyncingRef.current = false
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false
        window.setTimeout(() => {
          void performSync()
        }, 0)
      }
    }
  }, [isOnline, isReadOnly, updatePendingCount, pushMetadata, pullMetadata])

  /**
   * ??蝯血??冽??孛?澆?甇?   */
  const triggerSync = useCallback(() => {
    debugLog('??閫貊?郊')
    void performSync()
  }, [performSync])

  useEffect(() => {
    if (!autoSync) return

    void updatePendingCount()
    if (isOnline) {
      void performSync()
    }
  }, [autoSync, isOnline, performSync, updatePendingCount])

  useEffect(() => {
    if (!autoSync) return
    const wasOnline = prevOnlineRef.current
    prevOnlineRef.current = isOnline
    if (!wasOnline && isOnline) {
      debugLog('蝬脰楝?Ｗ儔嚗孛?澆?甇?)
      void performSync()
    }
  }, [isOnline, autoSync, performSync])

  useEffect(() => {
    if (!autoSync) return

    const triggerIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastFocusSyncRef.current < 500) return
      lastFocusSyncRef.current = now
      void performSync()
    }

    const handleVisibility = () => {
      triggerIfVisible()
    }

    const handleFocus = () => {
      triggerIfVisible()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [autoSync, performSync])

  useEffect(() => {
    if (!autoSync) return

    const handleSyncRequest = () => {
      void performSync()
    }

    window.addEventListener(SYNC_EVENT_NAME, handleSyncRequest)
    return () => {
      window.removeEventListener(SYNC_EVENT_NAME, handleSyncRequest)
    }
  }, [autoSync, performSync])

  return {
    ...status,
    readOnly: isReadOnly,
    viewAsOwnerId: viewAsOwnerId ?? undefined,
    triggerSync,
    updatePendingCount
  }
}







