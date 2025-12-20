# 📊 RedPen 資料庫使用指南

## 概述

RedPen 使用 **Dexie.js** 作為 IndexedDB 的包裝器，提供強大的本地離線儲存功能。

## 資料表結構

### 1. `classrooms` - 班級表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | string | 主鍵 |
| name | string | 班級名稱 |

**索引**: `id` (主鍵), `name`

---

### 2. `students` - 學生表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | string | 主鍵 |
| classroomId | string | 所屬班級 ID |
| seatNumber | number | 座號 |
| name | string | 學生姓名 |

**索引**: `id` (主鍵), `classroomId`, `seatNumber`, `name`

**查詢優化**:
- 可快速查詢特定班級的所有學生
- 可按座號排序

---

### 3. `assignments` - 作業表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | string | 主鍵 |
| classroomId | string | 所屬班級 ID |
| title | string | 作業標題 |
| totalPages | number | 總頁數 |

**索引**: `id` (主鍵), `classroomId`, `title`

**查詢優化**:
- 可快速查詢特定班級的所有作業

---

### 4. `submissions` - 提交記錄表 ⭐

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | string | 主鍵 |
| assignmentId | string | 作業 ID |
| studentId | string | 學生 ID |
| status | 'missing' \| 'scanned' \| 'synced' | 狀態 |
| imageBlob | Blob? | 圖片資料（可選） |
| createdAt | number | 建立時間戳 |

**索引**:
- `id` (主鍵)
- `assignmentId` (單一索引)
- `studentId` (單一索引)
- `status` (單一索引)
- `createdAt` (單一索引)
- **`[assignmentId+studentId]` (複合索引)** ⚡

**查詢優化**:
- ⚡ **超快速查詢**: 透過複合索引快速找到特定作業的特定學生提交
- 可查詢特定作業的所有提交
- 可查詢特定學生的所有提交
- 可過濾未同步的提交

---

### 5. `syncQueue` - 同步佇列表

用於管理離線同步機制。

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | number | 自動遞增主鍵 |
| action | 'create' \| 'update' \| 'delete' | 操作類型 |
| tableName | string | 表名 |
| recordId | string | 記錄 ID |
| data | unknown | 資料內容 |
| createdAt | number | 建立時間戳 |
| retryCount | number | 重試次數 |

---

## 使用範例

### 基本操作

```typescript
import { db, generateId, getCurrentTimestamp } from '@/lib/db'

// 建立班級
const classroomId = generateId()
await db.classrooms.add({
  id: classroomId,
  name: '三年甲班'
})

// 建立學生
const studentId = generateId()
await db.students.add({
  id: studentId,
  classroomId,
  seatNumber: 1,
  name: '王小明'
})

// 建立作業
const assignmentId = generateId()
await db.assignments.add({
  id: assignmentId,
  classroomId,
  title: '數學習作第一單元',
  totalPages: 5
})

// 建立提交記錄（已掃描）
await db.submissions.add({
  id: generateId(),
  assignmentId,
  studentId,
  status: 'scanned',
  imageBlob: blob,
  createdAt: getCurrentTimestamp()
})
```

### 進階查詢

```typescript
// 查詢特定班級的所有學生（按座號排序）
const students = await db.students
  .where('classroomId')
  .equals(classroomId)
  .sortBy('seatNumber')

// 查詢特定作業的所有提交
const submissions = await db.submissions
  .where('assignmentId')
  .equals(assignmentId)
  .toArray()

// 使用複合索引快速查詢（推薦！）
const submission = await db.submissions
  .where('[assignmentId+studentId]')
  .equals([assignmentId, studentId])
  .first()

// 查詢所有未同步的提交
const unsynced = await db.submissions
  .where('status')
  .equals('scanned')
  .toArray()
```

### 批次操作

```typescript
// 批次新增學生
const students = [
  { id: generateId(), classroomId, seatNumber: 1, name: '王小明' },
  { id: generateId(), classroomId, seatNumber: 2, name: '李小華' },
  { id: generateId(), classroomId, seatNumber: 3, name: '張小強' }
]
await db.students.bulkAdd(students)

// 批次更新
await db.submissions
  .where('status')
  .equals('scanned')
  .modify({ status: 'synced' })
```

### 交易操作

```typescript
// 確保原子性操作
await db.transaction('rw', db.assignments, db.submissions, async () => {
  // 建立作業
  await db.assignments.add(assignment)

  // 為所有學生建立 missing 記錄
  const students = await db.students.where('classroomId').equals(classroomId).toArray()
  const submissions = students.map(student => ({
    id: generateId(),
    assignmentId: assignment.id,
    studentId: student.id,
    status: 'missing' as const,
    createdAt: getCurrentTimestamp()
  }))
  await db.submissions.bulkAdd(submissions)
})
```

## 輔助函數

資料庫提供了以下輔助函數（位於 `src/lib/db-examples.ts`）：

### 班級操作
- `createClassroom(name)` - 建立班級
- `getAllClassrooms()` - 取得所有班級
- `getClassroom(id)` - 取得特定班級

### 學生操作
- `createStudent(classroomId, seatNumber, name)` - 建立學生
- `getStudentsByClassroom(classroomId)` - 取得班級學生
- `batchCreateStudents(classroomId, students)` - 批次建立學生

### 作業操作
- `createAssignment(classroomId, title, totalPages)` - 建立作業
- `getAssignmentsByClassroom(classroomId)` - 取得班級作業

### 提交記錄操作
- `createSubmission(assignmentId, studentId, imageBlob)` - 建立提交
- `markAsMissing(assignmentId, studentId)` - 標記缺交
- `getSubmissionsByAssignment(assignmentId)` - 查詢作業提交
- `getSubmissionsByStudent(studentId)` - 查詢學生提交
- `getSubmission(assignmentId, studentId)` - 快速查詢特定提交 ⚡
- `markAsSynced(submissionId)` - 標記已同步
- `getUnsynedSubmissions()` - 取得未同步提交

### 統計查詢
- `getAssignmentStats(assignmentId)` - 取得作業統計

## 測試

在瀏覽器開發者工具執行：

```javascript
// 方式 1: 點擊 UI 測試按鈕
// 開啟 http://localhost:5174，點擊「測試 Dexie 資料庫」

// 方式 2: 控制台執行
await window.testDB()
```

## 性能優化建議

1. **使用複合索引**: 查詢特定作業的特定學生時，使用 `[assignmentId+studentId]` 複合索引
2. **批次操作**: 大量新增時使用 `bulkAdd()`
3. **交易**: 多個相關操作使用 `transaction()`
4. **索引查詢**: 盡量使用已索引的欄位進行查詢

## 注意事項

- IndexedDB 儲存在本地瀏覽器，清除瀏覽器資料會遺失
- Blob 資料（圖片）會佔用較多空間，建議壓縮後儲存
- 查詢前確保索引已建立，可提升查詢效能
- 開發時可使用 Chrome DevTools → Application → IndexedDB 查看資料

## 資料庫工具

Chrome DevTools 查看資料庫：
1. 開啟開發者工具 (F12)
2. Application → Storage → IndexedDB → RedPenDB
3. 可直接查看和編輯資料
