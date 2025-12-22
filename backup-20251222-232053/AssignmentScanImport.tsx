import { useEffect, useState } from 'react'
import { Loader, AlertCircle } from 'lucide-react'
import { db } from '@/lib/db'
import type { Assignment, Classroom } from '@/lib/db'
import ScannerPage from './ScannerPage'

interface AssignmentScanImportProps {
  assignmentId: string
  onBack?: () => void
}

export default function AssignmentScanImport({
  assignmentId,
  onBack
}: AssignmentScanImportProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [maxSeat, setMaxSeat] = useState<number>(30)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const a = await db.assignments.get(assignmentId)
        if (!a) {
          setError('找不到這份作業。')
          return
        }
        setAssignment(a)

        const c = await db.classrooms.get(a.classroomId)
        if (!c) {
          setError('找不到此作業所屬的班級。')
          return
        }
        setClassroom(c)

        const studentCount = await db.students
          .where('classroomId')
          .equals(a.classroomId)
          .count()
        setMaxSeat(studentCount || 30)
      } catch (e) {
        console.error(e)
        setError('載入作業資訊時發生錯誤。')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [assignmentId])

  if (!isLoading && assignment && classroom && !error) {
    return (
      <div>
        {onBack && (
          <button
            onClick={onBack}
            className="fixed top-4 left-4 z-50 px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow text-sm font-medium text-gray-700"
          >
            返回作業匯入
          </button>
        )}
        <ScannerPage
          classroomId={assignment.classroomId}
          assignmentId={assignment.id}
          maxSeat={maxSeat}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <Loader className="w-12 h-12 text-purple-600 mx-auto mb-4 animate-spin" />
        <p className="text-gray-600">
          {error ? '載入作業資訊時發生錯誤。' : '準備進入拍攝作業匯入…'}
        </p>
        {error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

