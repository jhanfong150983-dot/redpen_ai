import { useEffect, useState } from 'react'
import { Loader, AlertCircle, ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import type { Assignment } from '@/lib/db'
import ScanImportFlow from './ScanImportFlow'

interface AssignmentScanImportProps {
  assignmentId: string
  onBack?: () => void
}

export default function AssignmentScanImport({
  assignmentId,
  onBack
}: AssignmentScanImportProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [pagesPerStudent, setPagesPerStudent] = useState<number>(1)
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
        setPagesPerStudent(Math.max(1, a.totalPages || 1))
      } catch (e) {
        console.error(e)
        setError('載入作業資訊時發生錯誤。')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [assignmentId])

  if (!isLoading && assignment && !error) {
    return (
      <div className="relative">
        {onBack && (
          <button
            onClick={onBack}
            className="fixed top-4 left-4 z-50 px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow text-sm font-medium text-gray-700 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回作業匯入
          </button>
        )}
        <ScanImportFlow
          classroomId={assignment.classroomId}
          assignmentId={assignment.id}
          pagesPerStudent={pagesPerStudent}
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
