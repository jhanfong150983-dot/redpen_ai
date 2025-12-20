import { useState, useEffect } from 'react'
import { Camera, Loader, AlertCircle, ArrowLeft } from 'lucide-react'
import ScannerPage from './ScannerPage'
import { db } from '@/lib/db'
import type { Classroom, Assignment } from '@/lib/db'

interface ScannerDemoProps {
  onBack?: () => void
}

export default function ScannerDemo({ onBack }: ScannerDemoProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [assignments, setAssignments] = useState<Array<Assignment & { submissionCount?: number }>>([])
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('')
  const [maxSeat, setMaxSeat] = useState(30)
  const [isLoading, setIsLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string>('')

  // 載入班級列表
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      setError('')

      try {
        const classroomData = await db.classrooms.toArray()
        setClassrooms(classroomData)

        if (classroomData.length > 0 && !selectedClassroomId) {
          setSelectedClassroomId(classroomData[0].id)
        }
      } catch (err) {
        console.error('❌ 載入失敗:', err)
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // 當選擇班級改變時，載入該班級的作業和學生數量
  useEffect(() => {
    const loadClassroomData = async () => {
      if (!selectedClassroomId) return

      try {
        // 載入該班級的作業
        const assignmentData = await db.assignments
          .where('classroomId')
          .equals(selectedClassroomId)
          .toArray()

        // 載入每個作業的提交數量
        const assignmentsWithCount = await Promise.all(
          assignmentData.map(async (assignment) => {
            const submissionCount = await db.submissions
              .where('assignmentId')
              .equals(assignment.id)
              .count()
            return { ...assignment, submissionCount }
          })
        )

        setAssignments(assignmentsWithCount)

        // 自動選擇第一個作業，或者清除無效的選擇
        if (assignmentData.length > 0) {
          // 檢查當前選擇的作業是否還在列表中
          const currentStillValid = assignmentData.some(a => a.id === selectedAssignmentId)
          if (!currentStillValid) {
            // 如果當前選擇已無效，選擇第一個作業
            setSelectedAssignmentId(assignmentData[0].id)
          }
        } else {
          setSelectedAssignmentId('')
        }

        // 獲取學生數量
        const studentCount = await db.students
          .where('classroomId')
          .equals(selectedClassroomId)
          .count()

        setMaxSeat(studentCount || 30)
      } catch (err) {
        console.error('❌ 載入班級資料失敗:', err)
      }
    }

    loadClassroomData()
  }, [selectedClassroomId])

  const handleStartScanning = () => {
    if (!selectedClassroomId) {
      setError('請選擇班級')
      return
    }

    if (!selectedAssignmentId) {
      setError('請選擇作業')
      return
    }

    const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId)
    console.log('🎯 開始掃描作業:')
    console.log(`   作業名稱: ${selectedAssignment?.title}`)
    console.log(`   作業 ID: ${selectedAssignmentId}`)
    console.log(`   班級 ID: ${selectedClassroomId}`)

    setIsScanning(true)
  }

  // 如果正在掃描，顯示掃描頁面
  if (isScanning && selectedClassroomId && selectedAssignmentId) {
    return (
      <div>
        <button
          onClick={() => setIsScanning(false)}
          className="fixed top-4 left-4 z-50 px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow text-sm font-medium text-gray-700"
        >
          ← 返回設置
        </button>
        <ScannerPage
          classroomId={selectedClassroomId}
          assignmentId={selectedAssignmentId}
          maxSeat={maxSeat}
        />
      </div>
    )
  }

  // 設置頁面
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
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

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* 標題 */}
          <div className="text-center mb-8">
            <Camera className="w-16 h-16 text-purple-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              作業掃描器
            </h1>
            <p className="text-gray-600">
              選擇班級和作業後開始掃描
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <Loader className="w-12 h-12 text-purple-600 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">載入中...</p>
            </div>
          ) : classrooms.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                還沒有班級
              </h3>
              <p className="text-gray-600 mb-6">
                請先在「班級設置」中創建班級和學生
              </p>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  返回首頁
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* 選擇班級 */}
              <div>
                <label htmlFor="classroom" className="block text-sm font-medium text-gray-700 mb-2">
                  選擇班級
                </label>
                <select
                  id="classroom"
                  value={selectedClassroomId}
                  onChange={(e) => setSelectedClassroomId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  學生人數: {maxSeat} 人
                </p>
              </div>

              {/* 選擇作業 */}
              <div>
                <label htmlFor="assignment" className="block text-sm font-medium text-gray-700 mb-2">
                  選擇作業
                </label>
                {assignments.length > 0 ? (
                  <>
                    <select
                      id="assignment"
                      value={selectedAssignmentId}
                      onChange={(e) => setSelectedAssignmentId(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
                    >
                      {assignments.map((assignment) => (
                        <option key={assignment.id} value={assignment.id}>
                          {assignment.title}{assignment.submissionCount ? ` (已有 ${assignment.submissionCount} 份)` : ''}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const selected = assignments.find(a => a.id === selectedAssignmentId)
                      return selected?.submissionCount ? (
                        <p className="mt-2 text-xs text-purple-600 font-medium">
                          此作業已有 {selected.submissionCount} 份提交
                        </p>
                      ) : null
                    })()}
                  </>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                    該班級還沒有作業，請先在「作業設置」中創建作業
                  </div>
                )}
              </div>

              {/* 錯誤提示 */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* 開始掃描按鈕 */}
              <button
                onClick={handleStartScanning}
                disabled={!selectedClassroomId || !selectedAssignmentId}
                className="w-full bg-purple-600 text-white py-6 rounded-xl hover:bg-purple-700 transition-colors font-bold text-xl flex items-center justify-center gap-3 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Camera className="w-6 h-6" />
                開始掃描作業
              </button>

              {/* 說明 */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                <p className="font-semibold mb-2">📱 使用說明：</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>選擇要掃描的班級和作業</li>
                  <li>點擊「開始掃描作業」進入掃描模式</li>
                  <li>對準學生作業，點擊拍照或上傳文件</li>
                  <li>支援拍照、上傳圖片（JPG/PNG/WebP）、上傳 PDF</li>
                  <li>拍照後自動保存並切換到下一位學生</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
