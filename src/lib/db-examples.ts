/**
 * Dexie.js 資料庫使用範例
 *
 * 這個檔案展示如何使用 RedPen 資料庫進行 CRUD 操作
 */

import { db, generateId, getCurrentTimestamp } from './db'
import type { Classroom, Student, Assignment, Submission } from './db'

// ==================== 班級操作 ====================

/**
 * 建立班級
 */
export async function createClassroom(name: string): Promise<string> {
  const classroom: Classroom = {
    id: generateId(),
    name
  }
  await db.classrooms.add(classroom)
  return classroom.id
}

/**
 * 取得所有班級
 */
export async function getAllClassrooms(): Promise<Classroom[]> {
  return await db.classrooms.toArray()
}

/**
 * 取得特定班級
 */
export async function getClassroom(id: string): Promise<Classroom | undefined> {
  return await db.classrooms.get(id)
}

// ==================== 學生操作 ====================

/**
 * 建立學生
 */
export async function createStudent(
  classroomId: string,
  seatNumber: number,
  name: string
): Promise<string> {
  const student: Student = {
    id: generateId(),
    classroomId,
    seatNumber,
    name
  }
  await db.students.add(student)
  return student.id
}

/**
 * 取得特定班級的所有學生（依座號排序）
 */
export async function getStudentsByClassroom(classroomId: string): Promise<Student[]> {
  return await db.students
    .where('classroomId')
    .equals(classroomId)
    .sortBy('seatNumber')
}

/**
 * 批次建立學生
 */
export async function batchCreateStudents(
  classroomId: string,
  students: Array<{ seatNumber: number; name: string }>
): Promise<void> {
  const studentRecords: Student[] = students.map(s => ({
    id: generateId(),
    classroomId,
    seatNumber: s.seatNumber,
    name: s.name
  }))
  await db.students.bulkAdd(studentRecords)
}

// ==================== 作業操作 ====================

/**
 * 建立作業
 */
export async function createAssignment(
  classroomId: string,
  title: string,
  totalPages: number
): Promise<string> {
  const assignment: Assignment = {
    id: generateId(),
    classroomId,
    title,
    totalPages
  }
  await db.assignments.add(assignment)
  return assignment.id
}

/**
 * 取得特定班級的所有作業
 */
export async function getAssignmentsByClassroom(classroomId: string): Promise<Assignment[]> {
  return await db.assignments
    .where('classroomId')
    .equals(classroomId)
    .toArray()
}

// ==================== 提交記錄操作 ====================

/**
 * 建立提交記錄（已掃描）
 */
export async function createSubmission(
  assignmentId: string,
  studentId: string,
  imageBlob: Blob
): Promise<string> {
  const submission: Submission = {
    id: generateId(),
    assignmentId,
    studentId,
    status: 'scanned',
    imageBlob,
    createdAt: getCurrentTimestamp()
  }
  await db.submissions.add(submission)
  return submission.id
}

/**
 * 標記為缺交
 */
export async function markAsMissing(
  assignmentId: string,
  studentId: string
): Promise<string> {
  const submission: Submission = {
    id: generateId(),
    assignmentId,
    studentId,
    status: 'missing',
    createdAt: getCurrentTimestamp()
  }
  await db.submissions.add(submission)
  return submission.id
}

/**
 * 取得特定作業的所有提交（快速查詢）
 */
export async function getSubmissionsByAssignment(assignmentId: string): Promise<Submission[]> {
  return await db.submissions
    .where('assignmentId')
    .equals(assignmentId)
    .toArray()
}

/**
 * 取得特定學生的所有提交（快速查詢）
 */
export async function getSubmissionsByStudent(studentId: string): Promise<Submission[]> {
  return await db.submissions
    .where('studentId')
    .equals(studentId)
    .toArray()
}

/**
 * 取得特定作業的特定學生提交（使用複合索引，超快速）
 */
export async function getSubmission(
  assignmentId: string,
  studentId: string
): Promise<Submission | undefined> {
  return await db.submissions
    .where('[assignmentId+studentId]')
    .equals([assignmentId, studentId])
    .first()
}

/**
 * 更新提交狀態為已同步
 */
export async function markAsSynced(submissionId: string): Promise<void> {
  await db.submissions.update(submissionId, { status: 'synced' })
}

/**
 * 取得所有未同步的提交
 */
export async function getUnsynedSubmissions(): Promise<Submission[]> {
  return await db.submissions
    .where('status')
    .equals('scanned')
    .toArray()
}

// ==================== 統計查詢 ====================

/**
 * 取得作業提交統計
 */
export async function getAssignmentStats(assignmentId: string) {
  const submissions = await getSubmissionsByAssignment(assignmentId)

  const scanned = submissions.filter(s => s.status === 'scanned').length
  const synced = submissions.filter(s => s.status === 'synced').length
  const missing = submissions.filter(s => s.status === 'missing').length

  return {
    total: submissions.length,
    scanned,
    synced,
    missing,
    completed: scanned + synced
  }
}

// ==================== 清空資料（開發測試用） ====================

/**
 * 清空所有資料表
 */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.classrooms, db.students, db.assignments, db.submissions, async () => {
    await db.classrooms.clear()
    await db.students.clear()
    await db.assignments.clear()
    await db.submissions.clear()
  })
}
