import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  FileImage,
  Loader,
  Settings,
  Sparkles,
  Users,
  X
} from 'lucide-react'
import { db, generateId, getCurrentTimestamp } from '@/lib/db'
import type { Assignment, Classroom, Student, Submission } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import {
  convertPdfToImages,
  fileToBlob,
  getFileType
} from '@/lib/pdfToImage'

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

export default function AssignmentImport({
  assignmentId,
  onBack
}: AssignmentImportProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<Student[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fileName, setFileName] = useState<string>('')
  const [pages, setPages] = useState<PagePreview[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const [pagesPerStudent, setPagesPerStudent] = useState(2)
  const [startSeat, setStartSeat] = useState(1)
  const [absentSeatsInput, setAbsentSeatsInput] = useState('')
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [selectedMappingIndex, setSelectedMappingIndex] = useState(0)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)


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

      let blobs: Blob[] = []

      if (type === 'pdf') {
        blobs = await convertPdfToImages(first, {
          scale: 2,
          format: 'image/webp',
          quality: 0.8
        })
      } else if (type === 'image') {
        const list: Blob[] = []
        // 多張圖片視為多頁
        // eslint-disable-next-line no-restricted-syntax
        for (const f of Array.from(files)) {
          // eslint-disable-next-line no-await-in-loop
          const blob = await fileToBlob(f)
          list.push(blob)
        }
        blobs = list
      } else {
        throw new Error('不支援的檔案格式，請上傳 PDF 或圖片檔')
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
      setError('請先上傳 PDF 或圖片檔')
      return
    }
    if (!students.length) {
      setError('此班級尚未有學生名單')
      return
    }

    setError(null)

    const effectiveStudents = students
      .filter(
        (s) => s.seatNumber >= startSeat && !absentSet.has(s.seatNumber)
      )
      .sort((a, b) => a.seatNumber - b.seatNumber)

    const result: MappingRow[] = []
    let pageIndex = 0

    for (const stu of effectiveStudents) {
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

        for (const oldSub of existingSubmissions) {
          await db.submissions.delete(oldSub.id)
        }

        const submission: Submission = {
          id: generateId(),
          assignmentId: assignment.id,
          studentId: mapping.studentId,
          status: 'scanned',
          imageBlob,
          createdAt: getCurrentTimestamp()
        }

        await db.submissions.add(submission)
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
                班級：{classroom?.name} · 學生數：{students.length}
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
                上傳 PDF 或圖片檔
              </label>
              <input
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={handleFileChange}
                disabled={isUploading}
                className="block w-full text-xs text-gray-700
                  file:mr-2 file:px-3 file:py-2 file:border-0
                  file:text-xs file:font-semibold
                  file:bg-indigo-50 file:text-indigo-700
                  hover:file:bg-indigo-100"
              />
              {fileName && (
                <p className="mt-1 text-xs text-gray-500">已選擇：{fileName}</p>
              )}
              {pages.length > 0 && (
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
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={pagesPerStudent}
                    onChange={(e) =>
                      setPagesPerStudent(
                        Number.isNaN(Number.parseInt(e.target.value, 10))
                          ? 1
                          : Number.parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    起始座號
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={startSeat}
                    onChange={(e) =>
                      setStartSeat(
                        Number.isNaN(Number.parseInt(e.target.value, 10))
                          ? 1
                          : Number.parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  缺考座號（選填）
                </label>
                <input
                  type="text"
                  value={absentSeatsInput}
                  onChange={(e) => setAbsentSeatsInput(e.target.value)}
                  placeholder="例如：3, 5, 12"
                  className="w-full px-2 py-1 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  這些座號會被跳過，不會配對任何頁面。
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between text-xs text-gray-500">
              <div className="mb-2 space-y-1">
                <p>
                  建議先將紙本考卷依座號大致排序後再掃描，
                  搭配「每位學生頁數」與「缺考座號」可快速自動配對。
                </p>
                {unusedPages.length > 0 && (
                  <p className="text-amber-600">
                    目前有 {unusedPages.length} 頁未被配對（可在下方確認）。
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAutoMap}
                disabled={pages.length === 0 || isUploading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    處理檔案中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    產生自動配對結果
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 2. 左側預覽 + 右側配對結果 */}
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          {/* 左：大圖預覽 + 縮圖列 */}
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

            <div
              className={`flex-1 border border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-slate-50 ${
                selectedMapping ? 'cursor-pointer' : 'cursor-default'
              }`}
              onClick={() => {
                if (selectedMapping) setIsPreviewModalOpen(true)
              }}
            >
              {selectedMapping && pagesInSelectedRange.length > 0 ? (
                <div className="flex gap-3">
                  {pagesInSelectedRange.map((p) => (
                    // eslint-disable-next-line jsx-a11y/img-redundant-alt
                    <img
                      key={p.index}
                      src={p.url}
                      alt={`第 ${p.index + 1} 頁預覽`}
                      className="w-32 h-44 rounded-lg shadow-md object-contain bg-white border border-gray-200"
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 flex flex-col items-center gap-1">
                  <FileImage className="w-5 h-5" />
                  <span>尚未產生配對結果</span>
                </div>
              )}
            </div>

            {/* 縮圖列（僅顯示頁碼方塊示意） */}
            {pages.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">所有頁面（示意）：</p>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {pages.map((p) => (
                    <div
                      key={p.index}
                      className="w-10 h-14 rounded-md flex items-center justify-center text-[10px] text-gray-700 border border-gray-200 bg-gray-50"
                    >
                      {p.index + 1}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右：配對結果表 */}
          <div className="bg-white rounded-2xl shadow-md p-4 min-h-[320px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">
                自動配對結果
              </h2>
              {unusedPages.length > 0 && (
                <p className="text-xs text-amber-600">
                  尚有 {unusedPages.length} 頁未分配
                </p>
              )}
            </div>

            {mappings.length === 0 ? (
              <p className="text-xs text-gray-500">
                請先上傳檔案並按下「產生自動配對結果」。
              </p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-4 bg-gray-50 px-3 py-2 font-semibold text-gray-700">
                  <div>頁碼範圍</div>
                  <div>座號</div>
                  <div>學生姓名</div>
                  <div>檢視</div>
                </div>
                <div className="max-h-60 overflow-auto">
                  {mappings.map((m, idx) => (
                    <button
                      key={`${m.fromIndex}-${m.seatNumber}`}
                      type="button"
                      onClick={() => setSelectedMappingIndex(idx)}
                      className={`grid grid-cols-4 w-full px-3 py-2 text-left border-t border-gray-100 ${
                        idx === selectedMappingIndex
                          ? 'bg-indigo-50 text-indigo-800'
                          : 'bg-white hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div>
                        第 {m.fromIndex + 1}
                        {m.toIndex === m.fromIndex
                          ? ''
                          : `–${m.toIndex + 1}`} 頁
                      </div>
                      <div>{m.seatNumber}</div>
                      <div>{m.name}</div>
                      <div className="text-right">
                        {idx === selectedMappingIndex ? '✓ 已選取' : '檢視'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mappings.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>已配對 {mappings.length} 位學生</span>
                <button
                  type="button"
                  onClick={handleSaveMappings}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
            )}
          </div>
        </div>

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
              {pages.length === 0 ? (
                <p className="text-sm text-gray-500">尚未產生配對結果。</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {pages.map((p) => {
                    const isMapped =
                      selectedMapping &&
                      p.index >= selectedMapping.fromIndex &&
                      p.index <= selectedMapping.toIndex

                    return (
                      <div
                        key={p.index}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                      >
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-600 bg-gray-50 border-b border-gray-100">
                          <span>第 {p.index + 1} 頁</span>
                          {isMapped && (
                            <span className="text-indigo-600 font-semibold">已配對</span>
                          )}
                        </div>
                        <div className="bg-white flex items-center justify-center">
                          <img
                            src={p.url}
                            alt={`第 ${p.index + 1} 頁預覽`}
                            className="max-h-[70vh] w-full object-contain bg-white"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
