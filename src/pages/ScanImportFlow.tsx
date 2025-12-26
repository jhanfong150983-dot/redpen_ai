import { useState, useEffect } from 'react'
import { Loader } from 'lucide-react'
import { db, generateId, getCurrentTimestamp } from '@/lib/db'
import type { Student, Submission } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import { queueDeleteMany } from '@/lib/sync-delete-queue'
import SeatSelectionPage from './SeatSelectionPage'
import CameraCapturePage from './CameraCapturePage'

interface ScanImportFlowProps {
  classroomId: string
  assignmentId: string
  pagesPerStudent: number
}

type ViewType = 'selection' | 'capture'

interface SelectedStudent {
  id: string
  seatNumber: number
  name: string
}

export default function ScanImportFlow({
  classroomId,
  assignmentId,
  pagesPerStudent
}: ScanImportFlowProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentView, setCurrentView] = useState<ViewType>('selection')
  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null)
  const [capturedData, setCapturedData] = useState<Map<string, Blob[]>>(new Map())
  const [isSaving, setIsSaving] = useState(false)

  // 載入學生名單
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const studentsData = await db.students
          .where('classroomId')
          .equals(classroomId)
          .sortBy('seatNumber')
        setStudents(studentsData)
      } catch (error) {
        console.error('載入學生名單失敗:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [classroomId])

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent({
      id: student.id,
      seatNumber: student.seatNumber,
      name: student.name
    })
    setCurrentView('capture')
  }

  const handleCaptureComplete = (imageBlob: Blob) => {
    if (!selectedStudent) return

    setCapturedData((prev) => {
      const newMap = new Map(prev)
      const existing = newMap.get(selectedStudent.id) || []
      const updated = [...existing, imageBlob]
      newMap.set(selectedStudent.id, updated)
      return newMap
    })

    // 檢查是否已達到要求頁數
    const currentPages = (capturedData.get(selectedStudent.id) || []).length + 1
    if (currentPages >= pagesPerStudent) {
      // 已完成，返回選擇頁面
      setCurrentView('selection')
      setSelectedStudent(null)
    }
  }

  const handleBack = () => {
    setCurrentView('selection')
    setSelectedStudent(null)
  }

  const handleSubmit = async () => {
    if (capturedData.size === 0) {
      alert('尚未拍攝任何作業')
      return
    }

    const confirmed = confirm(
      `確認要送出 ${capturedData.size} 位學生的作業嗎？`
    )
    if (!confirmed) return

    setIsSaving(true)
    try {
      let successCount = 0

      for (const [studentId, blobs] of capturedData.entries()) {
        // 合併多頁為單一圖片（如果需要）
        let imageBlob: Blob
        if (blobs.length === 1) {
          imageBlob = blobs[0]
        } else {
          // 使用簡單的垂直合併
          imageBlob = await mergeImagesVertically(blobs)
        }

        // 刪除舊的 submission（如果存在）
        const existingSubmissions = await db.submissions
          .where('assignmentId')
          .equals(assignmentId)
          .and((sub) => sub.studentId === studentId)
          .toArray()

        const existingIds = existingSubmissions.map((sub) => sub.id)
        await queueDeleteMany('submissions', existingIds)

        for (const oldSub of existingSubmissions) {
          await db.submissions.delete(oldSub.id)
        }

        // 建立新的 submission
        const submission: Submission = {
          id: generateId(),
          assignmentId,
          studentId,
          status: 'scanned',
          imageBlob,
          createdAt: getCurrentTimestamp()
        }

        await db.submissions.add(submission)
        successCount += 1
      }

      alert(`已成功建立 ${successCount} 份作業`)
      requestSync()

      // 清空已拍攝數據
      setCapturedData(new Map())
    } catch (error) {
      console.error('送出作業失敗:', error)
      alert(error instanceof Error ? error.message : '送出作業失敗')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入學生名單中...</p>
        </div>
      </div>
    )
  }

  if (isSaving) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-green-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">送出作業中...</p>
        </div>
      </div>
    )
  }

  if (currentView === 'capture' && selectedStudent) {
    const currentPageCount = (capturedData.get(selectedStudent.id) || []).length

    return (
      <CameraCapturePage
        studentId={selectedStudent.id}
        seatNumber={selectedStudent.seatNumber}
        name={selectedStudent.name}
        pagesPerStudent={pagesPerStudent}
        currentPageCount={currentPageCount}
        onCaptureComplete={handleCaptureComplete}
        onBack={handleBack}
      />
    )
  }

  return (
    <SeatSelectionPage
      students={students}
      capturedData={capturedData}
      pagesPerStudent={pagesPerStudent}
      onSelectStudent={handleSelectStudent}
      onSubmit={handleSubmit}
    />
  )
}

// 垂直合併多張圖片
async function mergeImagesVertically(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0]

  const bitmaps = await Promise.all(blobs.map((blob) => createImageBitmap(blob)))
  const width = Math.max(...bitmaps.map((bmp) => bmp.width))
  const height = bitmaps.reduce((sum, bmp) => sum + bmp.height, 0)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmaps.forEach((bmp) => bmp.close())
    throw new Error('無法建立畫布')
  }

  let offsetY = 0
  bitmaps.forEach((bmp) => {
    const offsetX = Math.floor((width - bmp.width) / 2)
    ctx.drawImage(bmp, offsetX, offsetY)
    offsetY += bmp.height
    bmp.close()
  })

  const merged = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('無法產生合併影像'))
      },
      'image/webp',
      0.85
    )
  })

  return merged
}
