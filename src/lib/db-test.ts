/**
 * 資料庫測試腳本
 *
 * 在瀏覽器控制台使用：
 * import { testDatabase } from '@/lib/db-test'
 * await testDatabase()
 */

import {
  createClassroom,
  createStudent,
  createAssignment,
  createSubmission,
  markAsMissing,
  getSubmission,
  getAssignmentStats,
  getAllClassrooms,
  getStudentsByClassroom,
  getAssignmentsByClassroom,
  getSubmissionsByAssignment
} from './db-examples'

export async function testDatabase() {
  console.log('🚀 開始測試 RedPen 資料庫...\n')

  try {
    // 1. 建立班級
    console.log('📚 建立班級...')
    const classroomId = await createClassroom('三年甲班')
    console.log(`✅ 班級建立成功，ID: ${classroomId}`)

    // 2. 建立學生
    console.log('\n👥 建立學生...')
    const student1Id = await createStudent(classroomId, 1, '王小明')
    const student2Id = await createStudent(classroomId, 2, '李小華')
    const student3Id = await createStudent(classroomId, 3, '張小強')
    console.log(`✅ 建立了 3 位學生`)

    // 3. 建立作業
    console.log('\n📝 建立作業...')
    const assignmentId = await createAssignment(classroomId, '數學習作第一單元', 5)
    console.log(`✅ 作業建立成功，ID: ${assignmentId}`)

    // 4. 建立提交記錄
    console.log('\n📤 建立提交記錄...')

    // 模擬圖片 Blob
    const fakeImageBlob = new Blob(['fake image data'], { type: 'image/jpeg' })

    await createSubmission(assignmentId, student1Id, fakeImageBlob)
    await createSubmission(assignmentId, student2Id, fakeImageBlob)
    await markAsMissing(assignmentId, student3Id) // 張小強缺交

    console.log('✅ 建立了 3 筆提交記錄（2 筆已掃描，1 筆缺交）')

    // 5. 查詢測試
    console.log('\n🔍 查詢測試...')

    // 查詢所有班級
    const classrooms = await getAllClassrooms()
    console.log(`班級數量: ${classrooms.length}`, classrooms)

    // 查詢班級學生
    const students = await getStudentsByClassroom(classroomId)
    console.log(`學生數量: ${students.length}`, students)

    // 查詢班級作業
    const assignments = await getAssignmentsByClassroom(classroomId)
    console.log(`作業數量: ${assignments.length}`, assignments)

    // 查詢作業提交
    const submissions = await getSubmissionsByAssignment(assignmentId)
    console.log(`提交記錄數量: ${submissions.length}`, submissions)

    // 6. 複合索引查詢測試（快速查詢特定學生的特定作業）
    console.log('\n⚡ 測試複合索引查詢...')
    const submission = await getSubmission(assignmentId, student1Id)
    console.log('王小明的提交記錄:', submission)

    // 7. 統計查詢
    console.log('\n📊 作業統計...')
    const stats = await getAssignmentStats(assignmentId)
    console.log('統計結果:', stats)

    console.log('\n✅ 所有測試完成！')
    return {
      classroomId,
      studentIds: [student1Id, student2Id, student3Id],
      assignmentId,
      stats
    }
  } catch (error) {
    console.error('❌ 測試失敗:', error)
    throw error
  }
}

// 匯出到 window 物件，方便在控制台使用
if (typeof window !== 'undefined') {
  (window as any).testDB = testDatabase
}
