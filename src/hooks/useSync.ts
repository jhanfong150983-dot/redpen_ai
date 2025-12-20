import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { useOnlineStatus } from './useOnlineStatus'

interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: number | null
  pendingCount: number
  error: string | null
}

interface UseSyncOptions {
  autoSync?: boolean
  syncInterval?: number // 毫秒，預設 30 秒
}

export function useSync(options: UseSyncOptions = {}) {
  const { autoSync = true, syncInterval = 30000 } = options

  const isOnline = useOnlineStatus()
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    error: null
  })

  const syncIntervalRef = useRef<number | null>(null)

  /**
   * 上傳圖片到 Supabase Storage
   */
  const uploadImage = async (blob: Blob, submissionId: string): Promise<string> => {
    if (!supabase) {
      throw new Error('Supabase 未設定')
    }

    // 使用固定的檔案名稱（不包含時間戳），避免重複上傳
    const fileName = `${submissionId}.webp`
    const filePath = `submissions/${fileName}`

    // 使用 upsert: true 允許覆蓋已存在的檔案（避免重複上傳錯誤）
    const { error } = await supabase.storage
      .from('homework-images')
      .upload(filePath, blob, {
        contentType: 'image/webp',
        upsert: true
      })

    if (error) {
      throw new Error(`圖片上傳失敗: ${error.message}`)
    }

    // 取得公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from('homework-images')
      .getPublicUrl(filePath)

    return publicUrl
  }

  /**
   * 將提交資料寫入 Supabase 資料庫
   */
  const saveToDatabase = async (
    submissionId: string,
    assignmentId: string,
    studentId: string,
    imageUrl: string,
    createdAt: number
  ) => {
    if (!supabase) {
      throw new Error('Supabase 未設定')
    }

    // 使用 upsert 策略：如果紀錄已存在（相同 assignment_id + student_id），則更新
    // onConflict 指定複合唯一鍵的欄位
    const { error } = await supabase
      .from('submissions')
      .upsert(
        {
          id: submissionId,
          assignment_id: assignmentId,
          student_id: studentId,
          image_url: imageUrl,
          status: 'synced',
          created_at: new Date(createdAt).toISOString()
        },
        {
          onConflict: 'assignment_id,student_id',
          ignoreDuplicates: false
        }
      )

    if (error) {
      throw new Error(`資料庫寫入失敗: ${error.message}`)
    }
  }

  /**
   * 同步單個提交紀錄
   */
  const syncSubmission = async (submission: any) => {
    try {
      console.log(`🔄 開始同步提交 ${submission.id}`)

      // 1. 上傳圖片
      if (!submission.imageBlob) {
        throw new Error('缺少圖片資料')
      }

      const imageUrl = await uploadImage(submission.imageBlob, submission.id)
      console.log(`✅ 圖片上傳成功: ${imageUrl}`)

      // 2. 寫入資料庫
      await saveToDatabase(
        submission.id,
        submission.assignmentId,
        submission.studentId,
        imageUrl,
        submission.createdAt
      )
      console.log('✅ 資料寫入成功')

      // 3. 更新 Dexie 狀態為 'synced' 並刪除本地 blob
      await db.submissions.update(submission.id, {
        status: 'synced',
        imageBlob: undefined
      })
      console.log('✅ 本地狀態更新成功，Blob 已刪除')

      return true
    } catch (error) {
      console.error(`❌ 同步失敗 ${submission.id}:`, error)
      throw error
    }
  }

  /**
   * 執行同步
   */
  const performSync = useCallback(async () => {
    // 檢查是否在線
    if (!isOnline) {
      console.log('⚠️ 離線狀態，跳過同步')
      return
    }

    // 檢查 Supabase 是否可用
    if (!supabase) {
      console.log('⚠️ Supabase 未設定，跳過同步')
      return
    }

    // 避免重複同步
    if (status.isSyncing) {
      console.log('⚠️ 目前正在同步中，跳過本次')
      return
    }

    try {
      setStatus(prev => ({ ...prev, isSyncing: true, error: null }))

      // 取得所有待同步紀錄
      const pendingSubmissions = await db.submissions
        .where('status')
        .equals('scanned')
        .toArray()

      console.log(`🔍 找到 ${pendingSubmissions.length} 條待同步紀錄`)

      if (pendingSubmissions.length === 0) {
        setStatus(prev => ({
          ...prev,
          isSyncing: false,
          lastSyncTime: Date.now(),
          pendingCount: 0
        }))
        return
      }

      // 逐筆同步
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

      console.log(`✅ 同步完成：成功 ${successCount} 筆，失敗 ${failCount} 筆`)

      // 更新狀態
      const remainingCount = await db.submissions
        .where('status')
        .equals('scanned')
        .count()

      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingCount: remainingCount,
        error: failCount > 0 ? `${failCount} 條記錄同步失敗` : null
      }))
    } catch (error) {
      console.error('❌ 同步過程發生錯誤:', error)
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : '同步失敗'
      }))
    }
  }, [isOnline, status.isSyncing])

  /**
   * 提供給外部手動觸發同步
   */
  const triggerSync = useCallback(() => {
    console.log('🔄 手動觸發同步')
    void performSync()
  }, [performSync])

  /**
   * 更新待同步數量
   */
  const updatePendingCount = useCallback(async () => {
    const count = await db.submissions
      .where('status')
      .equals('scanned')
      .count()

    setStatus(prev => ({ ...prev, pendingCount: count }))
  }, [])

  // 自動同步邏輯
  useEffect(() => {
    if (!autoSync) return

    // 首先更新待同步數量
    void updatePendingCount()

    // 如果在線，立即執行一次同步
    if (isOnline) {
      void performSync()
    }

    // 設定定時同步
    syncIntervalRef.current = window.setInterval(() => {
      if (isOnline) {
        void performSync()
      }
    }, syncInterval)

    return () => {
      if (syncIntervalRef.current !== null) {
        clearInterval(syncIntervalRef.current)
      }
    }
  }, [autoSync, isOnline, syncInterval, performSync, updatePendingCount])

  // 當網路狀態變更為「在線」時，自動觸發一次同步
  useEffect(() => {
    if (isOnline && autoSync) {
      console.log('🌐 網路恢復，觸發同步')
      void performSync()
    }
  }, [isOnline, autoSync, performSync])

  return {
    ...status,
    triggerSync,
    updatePendingCount
  }
}

