import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useOnlineStatus } from './useOnlineStatus'
import { SYNC_EVENT_NAME } from '@/lib/sync-events'
import { clearDeleteQueue, readDeleteQueue } from '@/lib/sync-delete-queue'
import type { Assignment, Classroom, Student, Submission } from '@/lib/db'

interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: number | null
  pendingCount: number
  error: string | null
}

interface UseSyncOptions {
  autoSync?: boolean
  syncInterval?: number // 保留參數以相容舊呼叫
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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

  /**
   * 更新待同步數量
   */
  const updatePendingCount = useCallback(async () => {
    const count = await db.submissions
      .where('status')
      .equals('scanned')
      .count()

    setStatus((prev) => ({ ...prev, pendingCount: count }))
    return count
  }, [])

  /**
   * 同步單個提交紀錄
   */
  const syncSubmission = async (submission: any) => {
    try {
      console.log(`開始同步提交 ${submission.id}`)

      let imageBase64: string

      // 優先使用 imageBase64（如果已經有）
      if (submission.imageBase64) {
        console.log('✅ 使用現有的 Base64 數據')
        imageBase64 = submission.imageBase64
      } else if (submission.imageBlob) {
        // 從 Blob 轉換
        console.log('🔄 從 Blob 轉換為 Base64')
        imageBase64 = await blobToBase64(submission.imageBlob)
      } else {
        throw new Error('缺少圖片資料（無 Blob 也無 Base64）')
      }

      // 確定 content type
      let contentType = 'image/webp'
      if (submission.imageBlob?.type) {
        contentType = submission.imageBlob.type
      } else if (submission.imageBase64) {
        // 從 Base64 data URL 中提取 MIME type
        const mimeMatch = submission.imageBase64.match(/data:([^;]+);/)
        if (mimeMatch) {
          contentType = mimeMatch[1]
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

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = data?.error || '同步失敗'
        throw new Error(message)
      }

      console.log('圖片與資料同步成功')

      // 同步成功後，更新狀態但保留本地圖片數據
      console.log('📝 更新本地狀態為 synced，保留圖片數據...')

      // 先檢查當前數據
      const beforeUpdate = await db.submissions.get(submission.id)
      console.log('更新前:', {
        hasBlob: !!beforeUpdate?.imageBlob,
        blobSize: beforeUpdate?.imageBlob?.size,
        hasBase64: !!beforeUpdate?.imageBase64,
        base64Length: beforeUpdate?.imageBase64?.length
      })

      await db.submissions.update(submission.id, {
        status: 'synced',
        imageUrl: `submissions/${submission.id}.webp`
        // 注意：不更新 imageBlob 和 imageBase64，保留原有數據
      })

      // 驗證更新後數據
      const afterUpdate = await db.submissions.get(submission.id)
      console.log('更新後:', {
        status: afterUpdate?.status,
        hasBlob: !!afterUpdate?.imageBlob,
        blobSize: afterUpdate?.imageBlob?.size,
        hasBase64: !!afterUpdate?.imageBase64,
        base64Length: afterUpdate?.imageBase64?.length,
        imageUrl: afterUpdate?.imageUrl
      })

      if (beforeUpdate?.imageBlob && !afterUpdate?.imageBlob) {
        console.error('⚠️ 警告：更新後 Blob 丟失！')
      }
      if (beforeUpdate?.imageBase64 && !afterUpdate?.imageBase64) {
        console.error('⚠️ 警告：更新後 Base64 丟失！')
      }

      console.log('✅ 本地狀態更新成功')

      return true
    } catch (error) {
      console.error(`同步失敗 ${submission.id}:`, error)
      throw error
    }
  }

  /**
   * 上傳本機資料到雲端
   */
  const pushMetadata = useCallback(async () => {
    const [classrooms, students, assignments, submissions, deleteQueue] =
      await Promise.all([
        db.classrooms.toArray(),
        db.students.toArray(),
        db.assignments.toArray(),
        db.submissions.toArray(),
        readDeleteQueue()
      ])

    const deleteQueueIds = deleteQueue
      .map((item) => item.id)
      .filter((id): id is number => typeof id === 'number')

    const deletedPayload: Record<string, Array<{ id: string; deletedAt: number }>> = {
      classrooms: [],
      students: [],
      assignments: [],
      submissions: []
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
        updatedAt: c.updatedAt
      }))

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
        answerKey: a.answerKey,
        updatedAt: a.updatedAt
      }))

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

    const response = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        classrooms: classroomPayload,
        students: studentPayload,
        assignments: assignmentPayload,
        submissions: submissionPayload,
        deleted: deletedPayload
      })
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || '同步失敗')
    }

    if (deleteQueueIds.length > 0) {
      await clearDeleteQueue(deleteQueueIds)
    }
  }, [])

  /**
   * 從雲端拉回資料
   */
  const pullMetadata = useCallback(async () => {
    const response = await fetch('/api/data/sync', {
      method: 'GET',
      credentials: 'include'
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || '載入雲端資料失敗')
    }

    const classrooms = Array.isArray(data.classrooms) ? data.classrooms : []
    const students = Array.isArray(data.students) ? data.students : []
    const assignments = Array.isArray(data.assignments) ? data.assignments : []
    const submissions = Array.isArray(data.submissions) ? data.submissions : []
    const deleted = data?.deleted && typeof data.deleted === 'object' ? data.deleted : {}

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

    const deletedClassroomSet = new Set(deletedClassroomIds)
    const deletedStudentSet = new Set(deletedStudentIds)
    const deletedAssignmentSet = new Set(deletedAssignmentIds)
    const deletedSubmissionSet = new Set(deletedSubmissionIds)

    const existingSubmissions = await db.submissions.toArray()

    console.log(`📦 pullMetadata: 從雲端拉取 ${submissions.length} 筆 submissions`)
    console.log(`📦 pullMetadata: 本地現有 ${existingSubmissions.length} 筆 submissions`)

    // 保留本地圖片數據（Blob 和 Base64）
    const imageDataMap = new Map(
      existingSubmissions.map((sub) => [
        sub.id,
        {
          imageBlob: sub.imageBlob,
          imageBase64: sub.imageBase64
        }
      ])
    )

    console.log(`📦 imageDataMap 建立完成，包含 ${imageDataMap.size} 筆圖片數據`)

    // 統計有多少本地圖片數據
    let blobCount = 0
    let base64Count = 0
    imageDataMap.forEach((data) => {
      if (data.imageBlob) blobCount++
      if (data.imageBase64) base64Count++
    })
    console.log(`📊 本地圖片統計: ${blobCount} 個 Blob, ${base64Count} 個 Base64`)

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

        // 從本地恢復圖片數據
        const localImageData = imageDataMap.get(sub.id)

        if (localImageData && (localImageData.imageBlob || localImageData.imageBase64)) {
          console.log(`🔄 恢復圖片數據: ${sub.id}`, {
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
          imageBlob: localImageData?.imageBlob,       // 保留本地 Blob
          imageBase64: localImageData?.imageBase64,   // 保留本地 Base64
          updatedAt: toMillis(sub.updatedAt ?? (sub as { updated_at?: unknown }).updated_at)
        }
      })

    console.log(`✅ 合併完成，準備寫入 ${mergedSubmissions.length} 筆 submissions`)

    // 統計合併後的圖片數據
    let mergedBlobCount = 0
    let mergedBase64Count = 0
    mergedSubmissions.forEach((sub) => {
      if (sub.imageBlob) mergedBlobCount++
      if (sub.imageBase64) mergedBase64Count++
    })
    console.log(`📊 合併後圖片統計: ${mergedBlobCount} 個 Blob, ${mergedBase64Count} 個 Base64`)

    const normalizedClassrooms: Classroom[] = classrooms
      .filter((c: Classroom) => c?.id && !deletedClassroomSet.has(c.id))
      .map((c: Classroom) => ({
        id: c.id,
        name: c.name,
        updatedAt: toMillis(
          (c as Classroom & { updatedAt?: unknown }).updatedAt ??
            (c as { updated_at?: unknown }).updated_at
        )
      }))

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

    const normalizedAssignments: Assignment[] = assignments
      .filter(
        (a: Assignment) => a?.id && a?.classroomId && !deletedAssignmentSet.has(a.id)
      )
      .map((a: Assignment) => ({
        id: a.id,
        classroomId: a.classroomId,
        title: a.title,
        totalPages: a.totalPages,
        domain: a.domain ?? undefined,
        answerKey: a.answerKey ?? undefined,
        updatedAt: toMillis(
          (a as Assignment & { updatedAt?: unknown }).updatedAt ??
            (a as { updated_at?: unknown }).updated_at
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

    await db.classrooms.bulkPut(normalizedClassrooms)
    await db.students.bulkPut(normalizedStudents)
    await db.assignments.bulkPut(normalizedAssignments)
    await db.submissions.bulkPut(mergedSubmissions)
  }, [])

  /**
   * 執行同步
   */
  const performSync = useCallback(async () => {
    if (!isOnline) {
      console.log('離線狀態，跳過同步')
      void updatePendingCount()
      return
    }

    if (isSyncingRef.current) {
      console.log('目前正在同步中，跳過本次')
      syncQueuedRef.current = true
      return
    }

    try {
      isSyncingRef.current = true
      setStatus((prev) => ({ ...prev, isSyncing: true, error: null }))

      const pendingSubmissions = await db.submissions
        .where('status')
        .equals('scanned')
        .toArray()

      console.log(`找到 ${pendingSubmissions.length} 條待同步紀錄`)

      let successCount = 0
      let failCount = 0

      for (const submission of pendingSubmissions) {
        try {
          await syncSubmission(submission)
          successCount++
        } catch (error) {
          failCount++
          console.error('同步失敗:', error)
        }
      }

      if (pendingSubmissions.length > 0) {
        console.log(`同步完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`)
      }

      await pushMetadata()
      await pullMetadata()

      const remainingCount = await updatePendingCount()

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingCount: remainingCount,
        error: failCount > 0 ? `${failCount} 條記錄同步失敗` : null
      }))
    } catch (error) {
      console.error('同步過程發生錯誤:', error)
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : '同步失敗'
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
  }, [isOnline, updatePendingCount, pushMetadata, pullMetadata])

  /**
   * 提供給外部手動觸發同步
   */
  const triggerSync = useCallback(() => {
    console.log('手動觸發同步')
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
      console.log('網路恢復，觸發同步')
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
    triggerSync,
    updatePendingCount
  }
}

