import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  ArrowLeft,
  Layers,
  Loader
} from 'lucide-react'
import { db, generateId } from '@/lib/db'
import type { Classroom, Student } from '@/lib/db'

interface ClassroomManagementProps {
  onBack?: () => void
}

interface ClassroomWithStats {
  classroom: Classroom
  studentCount: number
  assignmentCount: number
}

export default function ClassroomManagement({ onBack }: ClassroomManagementProps) {
  const [items, setItems] = useState<ClassroomWithStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 新增班級（透過懸浮視窗）
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStudentCount, setNewStudentCount] = useState(30)
  const [importText, setImportText] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // 卡片內「就地改名」狀態
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [classrooms, students, assignments] = await Promise.all([
        db.classrooms.toArray(),
        db.students.toArray(),
        db.assignments.toArray()
      ])

      const list: ClassroomWithStats[] = classrooms.map((c) => {
        const studentCount = students.filter((s) => s.classroomId === c.id).length
        const assignmentCount = assignments.filter(
          (a) => a.classroomId === c.id
        ).length
        return { classroom: c, studentCount, assignmentCount }
      })

      setItems(list)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '載入班級資料失敗')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 解析匯入的學生名單（座號 + 姓名）
  const parseImportedStudents = (text: string): Array<{ seatNumber: number; name: string }> => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const rows: Array<{ seatNumber: number; name: string }> = []

    for (const line of lines) {
      // 以逗號 / 逗號全形 / 分號 / Tab 切
      const parts = line
        .split(/[\t,，;；]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        const seatNumber = Number.parseInt(parts[0], 10)
        const name = parts.slice(1).join(' ')
        if (Number.isFinite(seatNumber) && name) {
          rows.push({ seatNumber, name })
        }
        continue
      }

      // 後備格式：前面是數字，後面是姓名
      const m = line.match(/^(\d+)\s+(.+)$/)
      if (m) {
        const seatNumber = Number.parseInt(m[1], 10)
        const name = m[2].trim()
        if (Number.isFinite(seatNumber) && name) {
          rows.push({ seatNumber, name })
        }
      }
    }

    rows.sort((a, b) => a.seatNumber - b.seatNumber)
    return rows
  }

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = newName.trim()
    const imported = parseImportedStudents(importText)

    if (!trimmedName) {
      setError('請輸入班級名稱')
      return
    }

    if (imported.length === 0 && (newStudentCount < 1 || newStudentCount > 100)) {
      setError('請輸入學生人數，或貼上匯入的學生名單')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const classroom: Classroom = {
        id: generateId(),
        name: trimmedName
      }
      await db.classrooms.add(classroom)

      const students: Student[] = []

      if (imported.length > 0) {
        for (const row of imported) {
          students.push({
            id: generateId(),
            classroomId: classroom.id,
            seatNumber: row.seatNumber,
            name: row.name
          })
        }
      } else {
        for (let i = 1; i <= newStudentCount; i += 1) {
          students.push({
            id: generateId(),
            classroomId: classroom.id,
            seatNumber: i,
            name: `學生 ${i}`
          })
        }
      }

      if (students.length > 0) {
        await db.students.bulkAdd(students)
      }

      setNewName('')
      setNewStudentCount(30)
      setImportText('')
      setIsCreateModalOpen(false)
      await loadData()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '新增班級失敗')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCommitEdit = async () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null)
      setEditingName('')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const name = editingName.trim()
      await db.classrooms.update(editingId, { name })

      setItems((prev) =>
        prev.map((item) =>
          item.classroom.id === editingId
            ? { ...item, classroom: { ...item.classroom, name } }
            : item
        )
      )
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '更新班級名稱失敗')
    } finally {
      setIsSaving(false)
      setEditingId(null)
      setEditingName('')
    }
  }

  const handleDeleteClassroom = async (target: ClassroomWithStats) => {
    if (isSaving) return

    const ok = window.confirm(
      '刪除此班級將一併刪除班級下的學生、作業與繳交紀錄，確定要刪除嗎？'
    )
    if (!ok) return

    setIsSaving(true)
    setError(null)

    try {
      const classroomId = target.classroom.id

      const assignments = await db.assignments
        .where('classroomId')
        .equals(classroomId)
        .toArray()
      const assignmentIds = assignments.map((a) => a.id)

      await db.students.where('classroomId').equals(classroomId).delete()
      if (assignmentIds.length > 0) {
        await db.submissions.where('assignmentId').anyOf(assignmentIds).delete()
      }
      await db.assignments.where('classroomId').equals(classroomId).delete()
      await db.classrooms.delete(classroomId)

      await loadData()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '刪除班級失敗')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-5xl mx-auto pt-8">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回首頁
          </button>
        )}

        {/* 標題區 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">班級管理</h1>
                <p className="text-sm text-gray-600">
                  檢視、重新命名與刪除班級，並可快速新增班級與學生座號
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewName('')
                setNewStudentCount(30)
                setImportText('')
                setIsCreateModalOpen(true)
              }}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white shadow hover:bg-blue-700"
              title="新增班級"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {/* 左右分欄 */}
        <div className="bg-white rounded-2xl shadow-xl flex flex-col md:flex-row overflow-hidden">
          {/* 左側：班級列表 */}
          <div className="md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200 p-4 md:p-6 max-h-[70vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-700">
                  已建立的班級
                </h2>
              </div>
              {isLoading && (
                <Loader className="w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>

            {items.length === 0 && !isLoading && (
              <p className="text-sm text-gray-500">
                目前尚未建立任何班級，請點右上角的「＋」新增班級。
              </p>
            )}

            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.classroom.id}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {editingId === item.classroom.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => {
                            void handleCommitEdit()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void handleCommitEdit()
                            } else if (e.key === 'Escape') {
                              setEditingId(null)
                              setEditingName('')
                            }
                          }}
                          className="px-2 py-1 border border-blue-300 rounded text-sm w-full max-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {item.classroom.name}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(item.classroom.id)
                              setEditingName(item.classroom.name)
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600"
                            title="更改名稱"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.studentCount} 位學生 · {item.assignmentCount} 份作業
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDeleteClassroom(item)
                    }}
                    className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-60"
                    title="刪除班級"
                    disabled={isSaving}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 右側：提示文字（主要新增在懸浮視窗中處理） */}
          <div className="md:w-1/2 p-6 flex items-center justify-center">
            <div className="text-sm text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700">操作說明：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>左側顯示所有已建立的班級。</li>
                <li>
                  點班級名稱旁的
                  <span className="inline-flex items-center px-1">
                    <Edit2 className="w-3 h-3" />
                  </span>
                  可直接在卡片上更改名稱。
                </li>
                <li>
                  點卡片右側的
                  <span className="inline-flex items-center px-1">
                    <Trash2 className="w-3 h-3" />
                  </span>
                  可刪除班級（包含學生與作業）。
                </li>
                <li>若要新增班級，請點右上角的「＋」開啟新增視窗。</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 新增班級懸浮視窗 */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  新增班級
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  可以自動產生學生座號，或從 Excel / CSV 複製貼上學生名單。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClassroom} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  班級名稱
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：七年甲班"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isCreating}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    學生人數（自動產生）
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newStudentCount}
                      onChange={(e) =>
                        setNewStudentCount(
                          Number.isNaN(Number.parseInt(e.target.value, 10))
                            ? 1
                            : Number.parseInt(e.target.value, 10)
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={isCreating}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      人
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    若未匯入學生名單，將自動產生「學生 1、學生 2、...」。
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    匯入學生名單（可選）
                  </label>
                  <textarea
                    rows={6}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={`範例（可從 Excel 貼上）：\n1\t王小明\n2\t李小華\n3\t張同學\n\n或使用「1,王小明」這種格式。`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isCreating}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    若有填寫此區，將以匯入名單為主，忽略上方學生人數。
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                  disabled={isCreating}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newName.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      建立中...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      建立班級
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

