/**
 * 調試同步問題的工具函數
 * 在瀏覽器 Console 中使用
 */

import { db } from './db'
import { supabase } from './supabase'

/**
 * 查看所有待同步的記錄
 */
export async function checkPendingSubmissions() {
  console.log('🔍 檢查待同步記錄...')

  const pending = await db.submissions
    .where('status')
    .equals('scanned')
    .toArray()

  console.log(`📊 找到 ${pending.length} 條待同步記錄:`)

  pending.forEach((submission, index) => {
    console.log(`\n記錄 ${index + 1}:`)
    console.log('  ID:', submission.id)
    console.log('  作業 ID:', submission.assignmentId)
    console.log('  學生 ID:', submission.studentId)
    console.log('  狀態:', submission.status)
    console.log('  有圖片:', !!submission.imageBlob)
    console.log('  圖片大小:', submission.imageBlob ? `${(submission.imageBlob.size / 1024).toFixed(2)} KB` : 'N/A')
    console.log('  創建時間:', new Date(submission.createdAt).toLocaleString())
  })

  return pending
}

/**
 * 查看已同步的記錄
 */
export async function checkSyncedSubmissions() {
  console.log('🔍 檢查已同步記錄...')

  const synced = await db.submissions
    .where('status')
    .equals('synced')
    .toArray()

  console.log(`📊 找到 ${synced.length} 條已同步記錄`)

  synced.forEach((submission, index) => {
    console.log(`\n記錄 ${index + 1}:`)
    console.log('  ID:', submission.id)
    console.log('  狀態:', submission.status)
    console.log('  有本地圖片:', !!submission.imageBlob)
    console.log('  創建時間:', new Date(submission.createdAt).toLocaleString())
  })

  return synced
}

/**
 * 測試單條記錄上傳
 */
export async function testSingleUpload(submissionId: string) {
  console.log(`🧪 測試上傳記錄: ${submissionId}`)

  if (!supabase) {
    console.error('❌ Supabase 未設置')
    return
  }

  try {
    // 獲取記錄
    const submission = await db.submissions.get(submissionId)

    if (!submission) {
      console.error('❌ 找不到記錄')
      return
    }

    console.log('✅ 找到記錄:', submission)

    if (!submission.imageBlob) {
      console.error('❌ 記錄沒有圖片')
      return
    }

    console.log(`📤 開始上傳圖片 (${(submission.imageBlob.size / 1024).toFixed(2)} KB)...`)

    // 上傳圖片
    const fileName = `${submission.id}-${Date.now()}.webp`
    const filePath = `submissions/${fileName}`

    const { data, error } = await supabase.storage
      .from('homework-images')
      .upload(filePath, submission.imageBlob, {
        contentType: 'image/webp',
        upsert: false
      })

    if (error) {
      console.error('❌ 上傳失敗:', error)
      console.error('錯誤詳情:')
      console.error('  message:', error.message)
      // 部分 StorageError 型別未暴露 statusCode，採用可選存取避免型別錯誤
      console.error('  statusCode:', (error as any)?.statusCode ?? 'n/a')
      console.error('  name:', error.name)
      return { success: false, error }
    }

    console.log('✅ 圖片上傳成功:', data)

    // 獲取公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from('homework-images')
      .getPublicUrl(filePath)

    console.log('🌐 公開 URL:', publicUrl)

    // 寫入資料庫
    console.log('💾 寫入 Supabase 資料庫...')

    const { error: dbError } = await supabase
      .from('submissions')
      .insert({
        id: submission.id,
        assignment_id: submission.assignmentId,
        student_id: submission.studentId,
        image_url: publicUrl,
        status: 'synced',
        created_at: new Date(submission.createdAt).toISOString()
      })

    if (dbError) {
      console.error('❌ 資料庫寫入失敗:', dbError)
      console.error('錯誤詳情:')
      console.error('  message:', dbError.message)
      console.error('  code:', dbError.code)
      console.error('  details:', dbError.details)
      console.error('  hint:', dbError.hint)
      return { success: false, error: dbError }
    }

    console.log('✅ 資料庫寫入成功')

    // 更新本地狀態
    await db.submissions.update(submission.id, {
      status: 'synced',
      imageBlob: undefined
    })

    console.log('✅ 本地狀態更新成功')
    console.log('🎉 完整同步流程測試成功！')

    return { success: true, url: publicUrl }

  } catch (error) {
    console.error('❌ 測試過程出錯:', error)
    return { success: false, error }
  }
}

/**
 * 重置指定記錄的狀態為 'scanned'（用於重試）
 */
export async function resetSubmissionStatus(submissionId: string) {
  console.log(`🔄 重置記錄狀態: ${submissionId}`)

  try {
    await db.submissions.update(submissionId, {
      status: 'scanned'
    })
    console.log('✅ 狀態已重置為 scanned')
  } catch (error) {
    console.error('❌ 重置失敗:', error)
  }
}

/**
 * 刪除指定記錄
 */
export async function deleteSubmission(submissionId: string) {
  console.log(`🗑️ 刪除記錄: ${submissionId}`)

  try {
    await db.submissions.delete(submissionId)
    console.log('✅ 記錄已刪除')
  } catch (error) {
    console.error('❌ 刪除失敗:', error)
  }
}

/**
 * 清除所有待同步記錄
 */
export async function clearPendingSubmissions() {
  console.log('🧹 清除所有待同步記錄...')

  const pending = await db.submissions
    .where('status')
    .equals('scanned')
    .toArray()

  console.log(`找到 ${pending.length} 條記錄`)

  if (pending.length === 0) {
    console.log('✅ 沒有待同步記錄')
    return
  }

  const confirm = window.confirm(`確定要刪除 ${pending.length} 條待同步記錄嗎？`)

  if (!confirm) {
    console.log('❌ 已取消')
    return
  }

  for (const submission of pending) {
    await db.submissions.delete(submission.id)
  }

  console.log('✅ 已清除所有待同步記錄')
}

/**
 * 檢查所有作業和提交記錄的對應關係
 */
export async function checkAssignmentSubmissions() {
  console.log('🔍 檢查所有作業和提交記錄...\n')

  // 載入所有作業
  const assignments = await db.assignments.toArray()
  console.log(`📚 找到 ${assignments.length} 個作業:\n`)

  for (const assignment of assignments) {
    const classroom = await db.classrooms.get(assignment.classroomId)
    console.log(`📖 作業: ${assignment.title}`)
    console.log(`  - ID: ${assignment.id}`)
    console.log(`  - 班級: ${classroom?.name || '未知'}`)

    // 查找該作業的提交記錄
    const submissions = await db.submissions
      .where('assignmentId')
      .equals(assignment.id)
      .toArray()

    console.log(`  - 提交記錄數: ${submissions.length}`)

    if (submissions.length > 0) {
      submissions.forEach((sub, index) => {
        console.log(`    ${index + 1}. 狀態: ${sub.status}, 有圖片: ${!!sub.imageBlob}, ID: ${sub.id}`)
      })
    }
    console.log('')
  }

  // 檢查是否有孤立的提交記錄（不屬於任何作業）
  const allSubmissions = await db.submissions.toArray()
  const orphanedSubmissions = allSubmissions.filter(sub =>
    !assignments.some(a => a.id === sub.assignmentId)
  )

  if (orphanedSubmissions.length > 0) {
    console.log(`⚠️ 發現 ${orphanedSubmissions.length} 條孤立的提交記錄（作業已刪除）:`)
    orphanedSubmissions.forEach(sub => {
      console.log(`  - ID: ${sub.id}, 作業 ID: ${sub.assignmentId}, 狀態: ${sub.status}`)
    })
  }

  console.log('\n✅ 檢查完成')
}

/**
 * 完整的數據庫狀態檢查
 */
export async function checkDatabaseStatus() {
  console.log('='.repeat(60))
  console.log('🔍 完整數據庫狀態檢查')
  console.log('='.repeat(60))
  console.log('')

  // 檢查班級
  const classrooms = await db.classrooms.toArray()
  console.log(`📚 班級 (${classrooms.length})`)
  classrooms.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (ID: ${c.id})`)
  })
  console.log('')

  // 檢查學生
  const students = await db.students.toArray()
  console.log(`👥 學生 (${students.length})`)
  if (students.length > 0) {
    const byClassroom = students.reduce((acc, s) => {
      if (!acc[s.classroomId]) acc[s.classroomId] = []
      acc[s.classroomId].push(s)
      return acc
    }, {} as Record<string, any[]>)

    Object.entries(byClassroom).forEach(([classroomId, studentList]) => {
      const classroom = classrooms.find(c => c.id === classroomId)
      console.log(`  - ${classroom?.name || '未知班級'}: ${studentList.length} 位學生`)
    })
  }
  console.log('')

  // 檢查作業
  const assignments = await db.assignments.toArray()
  console.log(`📝 作業 (${assignments.length})`)
  assignments.forEach((a, i) => {
    const classroom = classrooms.find(c => c.id === a.classroomId)
    console.log(`  ${i + 1}. ${a.title} (ID: ${a.id})`)
    console.log(`     班級: ${classroom?.name || '未知'}`)
  })
  console.log('')

  // 檢查提交記錄 - 這是關鍵！
  const submissions = await db.submissions.toArray()
  console.log(`📤 提交記錄 (${submissions.length})`)

  if (submissions.length === 0) {
    console.log('  ⚠️ 沒有任何提交記錄！')
    console.log('  可能原因：')
    console.log('    1. 還沒有使用「作業掃描器」上傳作業')
    console.log('    2. 上傳時選擇的作業或班級不正確')
    console.log('    3. 數據在同步後被意外刪除')
  } else {
    // 按作業分組
    const byAssignment = submissions.reduce((acc, s) => {
      if (!acc[s.assignmentId]) acc[s.assignmentId] = []
      acc[s.assignmentId].push(s)
      return acc
    }, {} as Record<string, any[]>)

    Object.entries(byAssignment).forEach(([assignmentId, subList]) => {
      const assignment = assignments.find(a => a.id === assignmentId)
      console.log(`  - ${assignment?.title || `未知作業 (${assignmentId})`}: ${subList.length} 份`)
      subList.forEach((sub, i) => {
        const student = students.find(s => s.id === sub.studentId)
        console.log(`    ${i + 1}. ${student?.name || '未知學生'} - 狀態: ${sub.status}, 有圖片: ${!!sub.imageBlob}`)
      })
    })
  }
  console.log('')

  // 檢查同步隊列
  const syncQueue = await db.syncQueue.toArray()
  console.log(`🔄 同步隊列 (${syncQueue.length})`)
  if (syncQueue.length > 0) {
    syncQueue.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.action} - ${item.tableName} (${item.recordId})`)
    })
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('✅ 檢查完成')
  console.log('='.repeat(60))
}

// 在瀏覽器 Console 中可用
if (typeof window !== 'undefined') {
  ;(window as any).checkPendingSubmissions = checkPendingSubmissions
  ;(window as any).checkSyncedSubmissions = checkSyncedSubmissions
  ;(window as any).testSingleUpload = testSingleUpload
  ;(window as any).resetSubmissionStatus = resetSubmissionStatus
  ;(window as any).deleteSubmission = deleteSubmission
  ;(window as any).clearPendingSubmissions = clearPendingSubmissions
  ;(window as any).checkAssignmentSubmissions = checkAssignmentSubmissions
  ;(window as any).checkDatabaseStatus = checkDatabaseStatus
}
