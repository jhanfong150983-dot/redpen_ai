import { useState } from 'react'
import { Users, Plus, CheckCircle, ArrowLeft } from 'lucide-react'
import { db, generateId } from '@/lib/db'
import type { Classroom, Student } from '@/lib/db'

interface ClassroomSetupProps {
  onBack?: () => void
}

export default function ClassroomSetup({ onBack }: ClassroomSetupProps) {
  const [classroomName, setClassroomName] = useState('')
  const [studentCount, setStudentCount] = useState(30)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!classroomName.trim()) {
      setError('請輸入班級名稱')
      return
    }

    if (studentCount < 1 || studentCount > 100) {
      setError('學生人數必須在 1-100 之間')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      // 1. 創建班級
      const classroom: Classroom = {
        id: generateId(),
        name: classroomName.trim()
      }

      await db.classrooms.add(classroom)
      console.log('✅ 班級創建成功:', classroom)

      // 2. 批量創建學生
      const students: Student[] = []
      for (let i = 1; i <= studentCount; i++) {
        students.push({
          id: generateId(),
          classroomId: classroom.id,
          seatNumber: i,
          name: `學生 ${i}`
        })
      }

      await db.students.bulkAdd(students)
      console.log(`✅ 成功創建 ${studentCount} 位學生`)

      // 顯示成功提示
      setSuccess(true)

      // 重置表單
      setTimeout(() => {
        setClassroomName('')
        setStudentCount(30)
        setSuccess(false)
      }, 2000)

    } catch (err) {
      console.error('❌ 創建失敗:', err)
      setError(err instanceof Error ? err.message : '創建失敗，請重試')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto pt-8">
        {/* 返回按鈕 */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回
          </button>
        )}

        {/* 標題卡片 */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">班級設置</h1>
              <p className="text-sm text-gray-600">創建班級並生成學生名單</p>
            </div>
          </div>
        </div>

        {/* 表單卡片 */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 班級名稱 */}
            <div>
              <label htmlFor="classroomName" className="block text-sm font-medium text-gray-700 mb-2">
                班級名稱
              </label>
              <input
                id="classroomName"
                type="text"
                value={classroomName}
                onChange={(e) => setClassroomName(e.target.value)}
                placeholder="例如：三年甲班"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isSubmitting}
              />
            </div>

            {/* 學生人數 */}
            <div>
              <label htmlFor="studentCount" className="block text-sm font-medium text-gray-700 mb-2">
                學生人數
              </label>
              <div className="relative">
                <input
                  id="studentCount"
                  type="number"
                  min="1"
                  max="100"
                  value={studentCount}
                  onChange={(e) => setStudentCount(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isSubmitting}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  人
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                將自動生成：學生 1, 學生 2, ... 學生 {studentCount}
              </p>
            </div>

            {/* 錯誤提示 */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* 成功提示 */}
            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">創建成功！</span>
              </div>
            )}

            {/* 提交按鈕 */}
            <button
              type="submit"
              disabled={isSubmitting || !classroomName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-lg"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  創建中...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  創建班級
                </>
              )}
            </button>
          </form>

          {/* 說明 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl text-sm text-gray-600">
            <p className="font-semibold mb-2">📝 說明：</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>班級創建後會自動生成學生名單</li>
              <li>學生名稱默認為「學生 1」、「學生 2」等</li>
              <li>可在資料庫中手動修改學生姓名</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
