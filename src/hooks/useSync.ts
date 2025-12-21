import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { useOnlineStatus } from './useOnlineStatus'
import { SYNC_EVENT_NAME } from '@/lib/sync-events'

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
        status: 'synced'
      })
      console.log('本地狀態更新成功，保留 Blob 供預覽')

      return true
    } catch (error) {
      console.error(`同步失敗 ${submission.id}:`, error)
      throw error
    }
  }

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
      return
    }

    try {
      setStatus((prev) => ({ ...prev, isSyncing: true, error: null }))

      const pendingSubmissions = await db.submissions
        .where('status')
        .equals('scanned')
        .toArray()

      console.log(`找到 ${pendingSubmissions.length} 條待同步紀錄`)

      if (pendingSubmissions.length === 0) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncTime: Date.now(),
          pendingCount: 0
        }))
        return
      }

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

      console.log(`同步完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`)

      const remainingCount = await db.submissions
        .where('status')
        .equals('scanned')
        .count()

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
    }
  }, [isOnline, status.isSyncing, updatePendingCount])

  /**
   * 提供給外部手動觸發同步
   */
  const triggerSync = useCallback(() => {
    console.log('手動觸發同步')
    void performSync()
  }, [performSync])

  useEffect(() => {
    if (!autoSync) return

    void (async () => {
      const count = await updatePendingCount()
      if (isOnline && count > 0) {
        void performSync()
      }
    })()
  }, [autoSync, isOnline, performSync, updatePendingCount])

  useEffect(() => {
    if (isOnline && autoSync) {
      console.log('網路恢復，觸發同步')
      void (async () => {
        const count = await updatePendingCount()
        if (count > 0) {
          void performSync()
        }
      })()
    }
  }, [isOnline, autoSync, performSync, updatePendingCount])

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

