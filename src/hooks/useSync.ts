import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useOnlineStatus } from './useOnlineStatus'
import { SYNC_EVENT_NAME } from '@/lib/sync-events'
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

export function useSync(options: UseSyncOptions = {}) {
  const { autoSync = true } = options

  const isOnline = useOnlineStatus()
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    error: null
  })
  const syncQueuedRef = useRef(false)

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

      if (!submission.imageBlob) {
        throw new Error('缺少圖片資料')
      }

      const imageBase64 = await blobToBase64(submission.imageBlob)

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
          contentType: submission.imageBlob.type || 'image/webp'
        })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = data?.error || '同步失敗'
        throw new Error(message)
      }

      console.log('圖片與資料同步成功')

      await db.submissions.update(submission.id, {
        status: 'synced',
        imageUrl: `submissions/${submission.id}.webp`
      })
      console.log('本地狀態更新成功，保留 Blob 供預覽')

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
    const [classrooms, students, assignments, submissions] = await Promise.all([
      db.classrooms.toArray(),
      db.students.toArray(),
      db.assignments.toArray(),
      db.submissions.toArray()
    ])

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
        correctionCount: rest.correctionCount
      }))

    const response = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        classrooms,
        students,
        assignments,
        submissions: submissionPayload
      })
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || '同步失敗')
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

    const existingSubmissions = await db.submissions.toArray()
    const imageMap = new Map(
      existingSubmissions
        .filter((sub) => sub.imageBlob)
        .map((sub) => [sub.id, sub.imageBlob as Blob])
    )

    const mergedSubmissions: Submission[] = submissions
      .filter((sub: Submission) => sub?.id && sub?.assignmentId && sub?.studentId)
      .map((sub: Submission) => {
        const createdAt =
          typeof sub.createdAt === 'number' && Number.isFinite(sub.createdAt)
            ? sub.createdAt
            : Date.now()
        const gradedAt =
          typeof sub.gradedAt === 'number' && Number.isFinite(sub.gradedAt)
            ? sub.gradedAt
            : undefined

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
          imageBlob: imageMap.get(sub.id)
        }
      })

    await db.classrooms.bulkPut(classrooms as Classroom[])
    await db.students.bulkPut(students as Student[])
    await db.assignments.bulkPut(assignments as Assignment[])
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

    if (status.isSyncing) {
      console.log('目前正在同步中，跳過本次')
      syncQueuedRef.current = true
      return
    }

    try {
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
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false
        window.setTimeout(() => {
          void performSync()
        }, 0)
      }
    }
  }, [isOnline, status.isSyncing, updatePendingCount, pushMetadata, pullMetadata])

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
    if (isOnline && autoSync) {
      console.log('網路恢復，觸發同步')
      void performSync()
    }
  }, [isOnline, autoSync, performSync])

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

