import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  FileImage,
  Loader,
  Settings,
  Users,
  X
} from 'lucide-react'
import { NumericInput } from '@/components/NumericInput'
import { db, generateId, getCurrentTimestamp } from '@/lib/db'
import type { Assignment, Classroom, Student, Submission } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import { queueDeleteMany } from '@/lib/sync-delete-queue'
import {
  convertPdfToImages,
  getFileType
} from '@/lib/pdfToImage'
import { blobToBase64, validateBlobSize } from '@/lib/imageCompression'
import { safeToBlobWithFallback } from '@/lib/canvasToBlob'
import { isIndexedDbBlobError, shouldAvoidIndexedDbBlob } from '@/lib/blob-storage'

interface AssignmentImportProps {
  assignmentId: string
  onBack?: () => void
}

interface PagePreview {
  index: number // 0-based
  url: string
  blob: Blob
}

interface MappingRow {
  fromIndex: number
  toIndex: number
  seatNumber: number
  studentId: string
  name: string
}

async function mergePageBlobs(pageBlobs: Blob[]): Promise<Blob> {
  if (pageBlobs.length === 1) return pageBlobs[0]

  const bitmaps = await Promise.all(pageBlobs.map((blob) => createImageBitmap(blob)))
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

  // 使用安全的 toBlob 包裝器（帶自動 fallback 和 timeout 保護）
  const merged = await safeToBlobWithFallback(canvas, {
    format: 'image/webp', // 平板不支持時會自動 fallback 到 JPEG
    quality: 0.85
  })

  return merged
}

export default function AssignmentImport({
  assignmentId,
  onBack
}: AssignmentImportProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const avoidBlobStorage = shouldAvoidIndexedDbBlob()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fileName, setFileName] = useState<string>('')
  const [pages, setPages] = useState<PagePreview[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const [pagesPerStudent, setPagesPerStudent] = useState(1)
  const [startSeat, setStartSeat] = useState(1)
  const [absentSeatsInput, setAbsentSeatsInput] = useState('')
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [selectedMappingIndex, setSelectedMappingIndex] = useState(0)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 計算班級中缺少的座號（跳號）
  const missingSeatNumbers = useMemo(() => {
    if (students.length === 0) return []

    const existingSeats = new Set(students.map(s => s.seatNumber))
    const minSeat = Math.min(...students.map(s => s.seatNumber))
    const maxSeat = Math.max(...students.map(s => s.seatNumber))

    const missing: number[] = []
    for (let i = minSeat; i <= maxSeat; i++) {
      if (!existingSeats.has(i)) {
        missing.push(i)
      }
    }
    return missing
  }, [students])

  const missingSeatSet = useMemo(() => new Set(missingSeatNumbers), [missingSeatNumbers])

  // 載入作業與班級、學生資料
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const assignmentData = await db.assignments.get(assignmentId)
        if (!assignmentData) {
          throw new Error('找不到這份作業')
        }
        setAssignment(assignmentData)

        const classroomData = await db.classrooms.get(
          assignmentData.classroomId
        )
        if (!classroomData) {
          throw new Error('找不到對應的班級')
        }
        setClassroom(classroomData)

        const studentsData = await db.students
          .where('classroomId')
          .equals(assignmentData.classroomId)
          .sortBy('seatNumber')
        setStudents(studentsData)
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : '載入資料失敗')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [assignmentId])

  // 解析缺考座號
  const absentSet = useMemo(() => {
    return new Set(
      absentSeatsInput
        .split(/[,\s，、]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && /^\d+$/.test(s))
        .map((s) => Number.parseInt(s, 10))
    )
  }, [absentSeatsInput])

  const targetStudents = useMemo(() => {
    return students
      .filter(
        (s) =>
          s.seatNumber >= startSeat &&
          !absentSet.has(s.seatNumber) &&
          !missingSeatSet.has(s.seatNumber)
      )
      .sort((a, b) => a.seatNumber - b.seatNumber)
  }, [students, startSeat, absentSet, missingSeatSet])

  const targetStudentCount = targetStudents.length
  const assignedStudentCount = mappings.length
  const missingStudentCount = Math.max(targetStudentCount - assignedStudentCount, 0)

  // 自動配對：當 pages、pagesPerStudent、startSeat 或 absentSet 變化時
  useEffect(() => {
    if (pages.length === 0 || students.length === 0) {
      return
    }

    // 延遲一下讓 state 更新完成
    const timer = setTimeout(() => {
      handleAutoMap()
    }, 100)
    return () => clearTimeout(timer)
  }, [
    pages.length,
    pagesPerStudent,
    startSeat,
    absentSeatsInput,
    students.length,
    missingSeatNumbers.length
  ])

  // 智能檢測缺考座號
  const absentSeatHint = useMemo(() => {
    if (pages.length === 0 || students.length === 0 || pagesPerStudent <= 0) {
      return null
    }

    const totalPages = pages.length
    const mappedPages = mappings.reduce((sum, m) => sum + (m.toIndex - m.fromIndex + 1), 0)
    const unmappedPages = totalPages - mappedPages
    const unmappedCopies = Math.floor(unmappedPages / pagesPerStudent)

    if (missingStudentCount > 0) {
      return {
        type: 'missing' as const,
        count: missingStudentCount,
        message: `供 ${totalPages} 頁，每位學生 ${pagesPerStudent} 頁，預計 ${targetStudentCount} 位學生，已分配 ${assignedStudentCount} 位，少了 ${missingStudentCount} 位，代表部分學生未交，請填寫未交座號（必填 ${missingStudentCount} 位）`
      }
    }

    if (unmappedCopies > targetStudentCount) {
      const extraCount = unmappedCopies - targetStudentCount
      return {
        type: 'extra' as const,
        count: extraCount,
        message: `供 ${totalPages} 頁，每位學生 ${pagesPerStudent} 頁，未分配 ${unmappedCopies} 份，學生數 ${targetStudentCount} 人。代表多 ${extraCount} 份，作業份數與學生人數不符，請再次確認。`
      }
    }

    return null
  }, [
    pages.length,
    students.length,
    pagesPerStudent,
    mappings,
    targetStudents,
    targetStudentCount,
    assignedStudentCount,
    missingStudentCount
  ])

  const selectedMapping = mappings[selectedMappingIndex] ?? null

  const pagesInSelectedRange = useMemo(() => {
    if (!selectedMapping) return []
    return pages.filter(
      (p) =>
        p.index >= selectedMapping.fromIndex &&
        p.index <= selectedMapping.toIndex
    )
  }, [pages, selectedMapping])

  const unusedPages = useMemo(() => {
    const used = new Set<number>()
    mappings.forEach((m) => {
      for (let i = m.fromIndex; i <= m.toIndex; i += 1) used.add(i)
    })
    return pages.filter((p) => !used.has(p.index))
  }, [pages, mappings])

  const isConfirmDisabled = isSaving || unusedPages.length > 0 || missingStudentCount > 0

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setError(null)
    setIsUploading(true)
    setPages([])
    setMappings([])
    setSelectedMappingIndex(0)

    try {
      const first = files[0]
      setFileName(first.name)

      const type = getFileType(first)

      if (type !== 'pdf') {
        throw new Error('僅支援 PDF 檔案。請將圖片轉換為 PDF 後再上傳。')
      }

      const blobs = await convertPdfToImages(first, {
        scale: 2,
        format: 'image/webp',
        quality: 0.8
      })

      // 驗證每一頁的大小
      for (let i = 0; i < blobs.length; i++) {
        const validation = validateBlobSize(blobs[i], 1.5)
        if (!validation.valid) {
          throw new Error(`第 ${i + 1} 頁：${validation.message}`)
        }
      }

      const previews: PagePreview[] = blobs.map((blob, idx) => ({
        index: idx,
        blob,
        url: URL.createObjectURL(blob)
      }))

      setPages(previews)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '處理檔案失敗')
    } finally {
      setIsUploading(false)
    }
  }

  const handleAutoMap = () => {
    if (pages.length === 0) {
      setError('請先上傳 PDF 檔案')
      return
    }
    if (!students.length) {
      setError('此班級尚未有學生名單')
      return
    }
    // 驗證每位學生頁數和起始頁號
    const pagesNum = Number(pagesPerStudent)
    const startNum = Number(startSeat)
    if (!Number.isFinite(pagesNum) || pagesNum < 1) {
      setError('請填寫有效的每位學生頁數')
      return
    }
    if (!Number.isFinite(startNum) || startNum < 1) {
      setError('請填寫有效的起始頁號')
      return
    }

    setError(null)

    const result: MappingRow[] = []
    let pageIndex = 0

    for (const stu of targetStudents) {
      if (pageIndex >= pages.length) break

      const fromIndex = pageIndex
      const toIndex = Math.min(
        pageIndex + pagesPerStudent - 1,
        pages.length - 1
      )

      result.push({
        fromIndex,
        toIndex,
        seatNumber: stu.seatNumber,
        studentId: stu.id,
        name: stu.name
      })

      pageIndex += pagesPerStudent
    }

    setMappings(result)
    setSelectedMappingIndex(0)
  }

  const handleSaveMappings = async () => {
    if (!assignment) {
      setError('找不到這份作業')
      return
    }
    if (mappings.length === 0) {
      setError('請先產生配對結果')
      return
    }

    // 檢查作業份數與學生人數是否匹配
    const totalPages = pages.length
    const mappedPages = mappings.reduce((sum, m) => sum + (m.toIndex - m.fromIndex + 1), 0)
    const unmappedPages = totalPages - mappedPages
    const unmappedCopies = Math.floor(unmappedPages / pagesPerStudent)

    if (missingStudentCount > 0) {
      const message = `供 ${totalPages} 頁，每位學生 ${pagesPerStudent} 頁，預計 ${targetStudentCount} 位學生，已分配 ${assignedStudentCount} 位，少了 ${missingStudentCount} 位，代表部分學生未交，請填寫未交座號（必填 ${missingStudentCount} 位）。`
      const input = prompt(
        message + '\n\n請輸入未交座號（用逗號分隔，例如：3, 5, 12）：'
      )
      if (input === null) {
        return
      }

      setAbsentSeatsInput(input)
      setError('請重新檢查配對結果後再次點擊確認匯入')
      return
    }

    if (unmappedCopies > targetStudentCount) {
      const extraCount = unmappedCopies - targetStudentCount
      const confirmed = confirm(
        `供 ${totalPages} 頁，每位學生 ${pagesPerStudent} 頁，未分配 ${unmappedCopies} 份，學生數 ${targetStudentCount} 人。\n\n代表多 ${extraCount} 份，作業份數與學生人數不符。\n\n是否仍要繼續匯入？`
      )
      if (!confirmed) {
        return
      }
    }

    setError(null)
    setIsSaving(true)

    try {
      let successCount = 0

      for (const mapping of mappings) {
        const pageBlobs = pages
          .filter((p) => p.index >= mapping.fromIndex && p.index <= mapping.toIndex)
          .map((p) => p.blob)

        if (pageBlobs.length === 0) continue

        const imageBlob =
          pageBlobs.length === 1 ? pageBlobs[0] : await mergePageBlobs(pageBlobs)

        const existingSubmissions = await db.submissions
          .where('assignmentId')
          .equals(assignment.id)
          .and((sub) => sub.studentId === mapping.studentId)
          .toArray()

        const existingIds = existingSubmissions.map((sub) => sub.id)
        await queueDeleteMany('submissions', existingIds)

        for (const oldSub of existingSubmissions) {
          await db.submissions.delete(oldSub.id)
        }

        const imageBase64 = await blobToBase64(imageBlob)
        const submission: Submission = {
          id: generateId(),
          assignmentId: assignment.id,
          studentId: mapping.studentId,
          status: 'scanned',
          imageBase64,
          ...(avoidBlobStorage ? {} : { imageBlob }),
          createdAt: getCurrentTimestamp()
        }

        try {
          await db.submissions.add(submission)
        } catch (error) {
          if (!avoidBlobStorage && isIndexedDbBlobError(error)) {
            const submissionWithoutBlob: Submission = {
              id: submission.id,
              assignmentId: submission.assignmentId,
              studentId: submission.studentId,
              status: submission.status,
              imageBase64: submission.imageBase64,
              createdAt: submission.createdAt
            }
            await db.submissions.add(submissionWithoutBlob)
          } else {
            throw error
          }
        }
        successCount += 1
      }

      alert(`已成功建立 ${successCount} 份作業`)
      if (successCount > 0) {
        requestSync()
      }
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '配對結果寫入失敗')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto pt-6">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            返回作業列表
          </button>
        )}

        {/* 標題 */}
        <div className="bg-white rounded-2xl shadow-md p-5 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-100">
              <FileImage className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                電子檔匯入 - {assignment?.title}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                班級：{classroom?.name} · 學生數：{students.length} 人
              </p>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>自動配對建議：請先將紙本考卷大致依座號排序</span>
            </div>
            {!assignment?.answerKey && (
              <p className="mt-1 text-red-500 font-semibold">
                尚未設定標準答案，無法進行 AI 批改。
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {/* 1. 檔案上傳 + 自動配對設定 */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                上傳 PDF 檔案
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                disabled={isUploading}
                className="block w-full text-xs text-gray-700
                  file:mr-2 file:px-3 file:py-2 file:border-0
                  file:text-xs file:font-semibold
                  file:bg-indigo-50 file:text-indigo-700
                  hover:file:bg-indigo-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                檔案大小限制：單檔壓縮後需小於 1.5 MB
              </p>
              {isUploading && (
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>處理 PDF 中，請稍候...</span>
                </div>
              )}
              {!isUploading && fileName && (
                <p className="mt-1 text-xs text-gray-500">已選擇：{fileName}</p>
              )}
              {!isUploading && pages.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  已拆出 {pages.length} 頁影像
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-gray-600" />
                <span className="text-xs font-semibold text-gray-700">
                  自動配對設定
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    每位學生頁數
                  </label>
                  <NumericInput
                    min={1}
                    max={4}
                    value={pagesPerStudent}
                    onChange={(v) => setPagesPerStudent(typeof v === 'number' ? v : (v === '' ? ('' as unknown as number) : 1))}
                    className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    起始頁號
                  </label>
                  <NumericInput
                    min={1}
                    max={200}
                    value={startSeat}
                    onChange={(v) => setStartSeat(typeof v === 'number' ? v : (v === '' ? ('' as unknown as number) : 1))}
                    className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 顯示班級中缺少的座號 */}
              {missingSeatNumbers.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800 font-medium mb-1">
                    班級中缺少的座號：
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {missingSeatNumbers.map(seat => (
                      <span
                        key={seat}
                        className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs"
                      >
                        {seat}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    這些座號在班級管理中不存在，系統會自動跳過。
                  </p>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500">
              <p>
                建議先將紙本考卷依座號大致排序後再掃描。
                上傳 PDF 後會自動配對，請在下方檢查每位學生的分配結果。
              </p>
            </div>
          </div>
        </div>

        {/* 2. 左右分欄：左側學生列表 + 右側預覽 */}
        {mappings.length > 0 && (
          <div className="grid lg:grid-cols-[350px_1fr] gap-4 mb-6">
            {/* 左側：學生選單 */}
            <div className="bg-white rounded-2xl shadow-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  學生列表
                </h2>
                <span className="text-xs text-gray-500">
                  {mappings.length} / {students.length} 人
                </span>
              </div>

              <div className="max-h-[600px] overflow-y-auto space-y-1">
                {mappings.map((m, idx) => (
                  <button
                    key={`${m.seatNumber}-${m.studentId}`}
                    type="button"
                    onClick={() => setSelectedMappingIndex(idx)}
                    className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors ${
                      idx === selectedMappingIndex
                        ? 'bg-indigo-50 border-2 border-indigo-500'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm font-semibold ${
                          idx === selectedMappingIndex ? 'text-indigo-900' : 'text-gray-900'
                        }`}>
                          {m.seatNumber} 號
                        </span>
                        <span className={`ml-2 text-sm ${
                          idx === selectedMappingIndex ? 'text-indigo-700' : 'text-gray-700'
                        }`}>
                          {m.name}
                        </span>
                      </div>
                      <span className={`text-xs ${
                        idx === selectedMappingIndex ? 'text-indigo-600' : 'text-gray-500'
                      }`}>
                        第 {m.fromIndex + 1}
                        {m.toIndex === m.fromIndex ? '' : `–${m.toIndex + 1}`} 頁
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* 確認匯入按鈕 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {unusedPages.length > 0 && absentSeatHint?.type === 'extra' && (
                  <p className="text-xs text-red-600 mb-2">
                    ⚠️ 尚有 {unusedPages.length} 頁未分配
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSaveMappings}
                  disabled={isConfirmDisabled}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      寫入中...
                    </>
                  ) : (
                    '確認匯入'
                  )}
                </button>
              </div>
            </div>

            {/* 右側：頁面預覽 */}
          <div className="bg-white rounded-2xl shadow-md p-4 flex flex-col gap-3 min-h-[320px]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">頁面預覽</h2>
              {selectedMapping && (
                <p className="text-xs text-gray-500">
                  顯示：第 {selectedMapping.fromIndex + 1}
                  {selectedMapping.toIndex === selectedMapping.fromIndex
                    ? ''
                    : `–${selectedMapping.toIndex + 1}`}
                  頁
                </p>
              )}
            </div>

            {selectedMapping && pagesInSelectedRange.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pagesInSelectedRange.map((p) => (
                  <div
                    key={p.index}
                    className="border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setIsPreviewModalOpen(true)}
                  >
                    <div className="bg-gray-50 px-3 py-2 text-sm text-gray-700 font-medium">
                      第 {p.index + 1} 頁
                    </div>
                    <div className="aspect-[3/4] bg-white">
                      {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                      <img
                        src={p.url}
                        alt={`第 ${p.index + 1} 頁預覽`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 border border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-slate-50 min-h-[200px]">
                <div className="text-xs text-gray-400 flex flex-col items-center gap-1">
                  <FileImage className="w-5 h-5" />
                  <span>尚未產生配對結果</span>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

      </div>
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <p className="text-xs text-gray-500">頁面預覽</p>
                {selectedMapping ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedMapping.seatNumber} 號 · {selectedMapping.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      頁碼：第 {selectedMapping.fromIndex + 1}
                      {selectedMapping.toIndex === selectedMapping.fromIndex
                        ? ''
                        : `–${selectedMapping.toIndex + 1}`}
                      頁
                    </p>
                  </>
                ) : (
                  <h3 className="text-lg font-semibold text-gray-900">尚未選擇配對</h3>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-gray-50 overflow-y-auto max-h-[85vh]">
              {!selectedMapping || pagesInSelectedRange.length === 0 ? (
                <p className="text-sm text-gray-500">尚未產生配對結果。</p>
              ) : (
                <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-4">
                  {pagesInSelectedRange.map((p) => (
                    <div
                      key={p.index}
                      className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-700">
                          第 {p.index + 1} 頁 · 配對給 {selectedMapping.seatNumber} 號
                        </p>
                      </div>
                      <div className="bg-white flex items-center justify-center p-4">
                        <img
                          src={p.url}
                          alt={`第 ${p.index + 1} 頁預覽`}
                          className="max-h-[75vh] w-full object-contain bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
