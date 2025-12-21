import { useRef, useState, useEffect, useCallback } from 'react'
import Webcam from 'react-webcam'
import { Camera, Mic, MicOff, User, CheckCircle, AlertCircle, Upload } from 'lucide-react'
import { useSeatController } from '@/hooks/useSeatController'
import { db, generateId, getCurrentTimestamp } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import { compressImage } from '@/lib/imageCompression'
import { convertPdfToImage, getFileType } from '@/lib/pdfToImage'
import type { Student, Submission } from '@/lib/db'

interface ScannerPageProps {
  classroomId: string
  assignmentId: string
  maxSeat: number
}

export default function ScannerPage({
  classroomId,
  assignmentId,
  maxSeat
}: ScannerPageProps) {
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureSuccess, setCaptureSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null)

  // 批量模式：暫存所有學生的圖片
  const [capturedImages, setCapturedImages] = useState<Map<string, { blob: Blob; url: string }>>(new Map())
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 調試：打印接收到的 props
  useEffect(() => {
    console.log('📋 ScannerPage 接收到的參數:')
    console.log(`   classroomId: ${classroomId}`)
    console.log(`   assignmentId: ${assignmentId}`)
    console.log(`   maxSeat: ${maxSeat}`)
  }, [classroomId, assignmentId, maxSeat])

  // 使用座號控制器
  const {
    currentSeat,
    nextSeat,
    isListening,
    startListening,
    stopListening,
    isSupported: isVoiceSupported
  } = useSeatController({
    maxSeat,
    onSeatChange: async (seat) => {
      console.log('切換到座號:', seat)
      await loadStudentInfo(seat)
    }
  })

  /**
   * 載入學生資訊
   */
  const loadStudentInfo = useCallback(async (seatNumber: number) => {
    try {
      const student = await db.students
        .where('classroomId')
        .equals(classroomId)
        .and((s) => s.seatNumber === seatNumber)
        .first()

      if (student) {
        setCurrentStudent(student)
        setError(null)
      } else {
        setCurrentStudent(null)
        setError(`找不到第 ${seatNumber} 號學生`)
      }
    } catch (err) {
      console.error('載入學生資訊失敗:', err)
      setError('載入學生資訊失敗')
      setCurrentStudent(null)
    }
  }, [classroomId])

  /**
   * 暫存圖片（不保存到資料庫）
   */
  const storeImage = useCallback(async (imageBlob: Blob) => {
    if (!currentStudent) {
      throw new Error('當前學生資訊未載入')
    }

    // 創建預覽 URL
    const previewUrl = URL.createObjectURL(imageBlob)

    // 暫存到 Map 中
    setCapturedImages(prev => {
      const newMap = new Map(prev)
      // 如果已經有這個學生的圖片，先清理舊的 URL
      const existing = prev.get(currentStudent.id)
      if (existing) {
        URL.revokeObjectURL(existing.url)
      }
      newMap.set(currentStudent.id, { blob: imageBlob, url: previewUrl })
      return newMap
    })

    // 更新預覽圖片
    setLastCapturedImage(previewUrl)

    console.log(`✅ 已暫存 ${currentStudent.name} 的作業`)

    // 顯示成功提示
    setCaptureSuccess(true)

    // 自動切換到下一位
    setTimeout(() => {
      nextSeat()
      setCaptureSuccess(false)
    }, 500)
  }, [currentStudent, nextSeat])

  /**
   * 拍照並暫存
   */
  const capture = useCallback(async () => {
    if (!webcamRef.current || !currentStudent) {
      setError('無法拍照：攝像頭未準備好或學生資訊未載入')
      return
    }

    setIsCapturing(true)
    setError(null)

    try {
      // 1. 獲取截圖 (Base64)
      const imageSrc = webcamRef.current.getScreenshot()
      if (!imageSrc) {
        throw new Error('無法獲取截圖')
      }

      console.log('📸 截圖成功')

      // 2. 壓縮圖片
      console.log('🔄 開始壓縮圖片...')
      const compressedBlob = await compressImage(imageSrc, {
        maxWidth: 1024,
        quality: 0.8,
        format: 'image/webp'
      })

      console.log(`✅ 壓縮完成: ${(compressedBlob.size / 1024).toFixed(2)} KB`)

      // 3. 暫存圖片
      await storeImage(compressedBlob)

    } catch (err) {
      console.error('拍照失敗:', err)
      setError(err instanceof Error ? err.message : '拍照失敗')
    } finally {
      setIsCapturing(false)
    }
  }, [currentStudent, storeImage])

  /**
   * 處理文件上傳並暫存
   */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!currentStudent) {
      setError('請先選擇學生')
      return
    }

    setIsCapturing(true)
    setError(null)

    try {
      const fileType = getFileType(file)
      console.log(`📁 文件類型: ${fileType}, 文件名: ${file.name}`)

      let imageBlob: Blob

      if (fileType === 'image') {
        // 處理圖片文件
        console.log('🖼️ 處理圖片文件...')

        // 讀取圖片並壓縮
        const reader = new FileReader()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => {
            if (e.target?.result && typeof e.target.result === 'string') {
              resolve(e.target.result)
            } else {
              reject(new Error('圖片讀取失敗'))
            }
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        // 壓縮圖片
        imageBlob = await compressImage(dataUrl, {
          maxWidth: 1024,
          quality: 0.8,
          format: 'image/webp'
        })

        console.log(`✅ 圖片壓縮完成: ${(imageBlob.size / 1024).toFixed(2)} KB`)

      } else if (fileType === 'pdf') {
        // 處理 PDF 文件
        console.log('📄 處理 PDF 文件...')

        // 將 PDF 第一頁轉換為圖片
        imageBlob = await convertPdfToImage(file, {
          scale: 2,
          format: 'image/webp',
          quality: 0.8
        })

        console.log(`✅ PDF 轉換完成: ${(imageBlob.size / 1024).toFixed(2)} KB`)

      } else {
        throw new Error('不支援的文件格式，請上傳圖片或 PDF 文件')
      }

      // 暫存圖片
      await storeImage(imageBlob)

    } catch (err) {
      console.error('文件上傳失敗:', err)
      setError(err instanceof Error ? err.message : '文件上傳失敗')
    } finally {
      setIsCapturing(false)
    }
  }, [currentStudent, storeImage])

  /**
   * 批量確認送出所有作業
   */
  const handleBatchSubmit = useCallback(async () => {
    if (capturedImages.size === 0) {
      setError('沒有任何作業需要送出')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      let successCount = 0

      console.log('📤 開始批量保存作業到資料庫...')
      console.log(`   作業 ID: ${assignmentId}`)
      console.log(`   待保存數量: ${capturedImages.size}`)

      // 批量保存到資料庫
      for (const [studentId, imageData] of capturedImages.entries()) {
        // 先刪除該學生的舊提交（如果有的話）
        const existingSubmissions = await db.submissions
          .where('assignmentId')
          .equals(assignmentId)
          .and(sub => sub.studentId === studentId)
          .toArray()

        if (existingSubmissions.length > 0) {
          console.log(`🗑️ 刪除學生 ${studentId} 的 ${existingSubmissions.length} 份舊提交`)
          for (const oldSub of existingSubmissions) {
            await db.submissions.delete(oldSub.id)
          }
        }

        // 創建新提交
        const submission: Submission = {
          id: generateId(),
          assignmentId,
          studentId: studentId,
          status: 'scanned',
          imageBlob: imageData.blob,
          createdAt: getCurrentTimestamp()
        }

        console.log(`💾 保存作業: studentId=${studentId}, assignmentId=${assignmentId}, submissionId=${submission.id}`)
        await db.submissions.add(submission)
        successCount++
      }

      console.log(`✅ 批量保存完成！成功保存 ${successCount} 份作業`)

      // 驗證保存結果
      const savedSubmissions = await db.submissions
        .where('assignmentId')
        .equals(assignmentId)
        .toArray()
      console.log(`🔍 驗證: 資料庫中該作業現有 ${savedSubmissions.length} 份提交`)

      // 清理所有 URL
      capturedImages.forEach(imageData => {
        URL.revokeObjectURL(imageData.url)
      })

      // 清空暫存
      setCapturedImages(new Map())
      setShowConfirmation(false)
      setLastCapturedImage(null)

      alert(`成功送出 ${successCount} 份作業！`)
      requestSync()

    } catch (err) {
      console.error('❌ 批量送出失敗:', err)
      setError(err instanceof Error ? err.message : '批量送出失敗')
    } finally {
      setIsSubmitting(false)
    }
  }, [capturedImages, assignmentId])

  /**
   * 觸發文件選擇
   */
  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /**
   * 處理文件選擇
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
      // 清空 input，允許重複選擇同一文件
      e.target.value = ''
    }
  }, [handleFileUpload])

  // 載入所有學生
  useEffect(() => {
    const loadAllStudents = async () => {
      try {
        const allStudents = await db.students
          .where('classroomId')
          .equals(classroomId)
          .toArray()
        setStudents(allStudents)
      } catch (err) {
        console.error('載入學生列表失敗:', err)
      }
    }
    loadAllStudents()
  }, [classroomId])

  // 初始載入學生資訊
  useEffect(() => {
    loadStudentInfo(currentSeat)
  }, [currentSeat, loadStudentInfo])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 空格键拍照
      if (e.code === 'Space' && !isCapturing) {
        e.preventDefault()
        capture()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [capture, isCapturing])

  // 如果顯示確認視窗
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">確認送出作業</h2>
          <p className="text-gray-600 mb-6">已掃描 {capturedImages.size} 份作業，請確認後送出</p>

          {/* 縮圖網格 */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mb-6">
            {Array.from(capturedImages.entries()).map(([studentId, imageData]) => {
              const student = students.find(s => s.id === studentId)
              return (
                <div key={studentId} className="bg-gray-100 rounded-lg overflow-hidden">
                  <div className="aspect-square relative">
                    <img
                      src={imageData.url}
                      alt={`${student?.name} 的作業`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-xs font-semibold text-gray-900">
                      {student?.seatNumber}號 {student?.name}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setShowConfirmation(false)}
              disabled={isSubmitting}
              className="flex-1 py-4 bg-gray-600 text-white rounded-xl font-bold text-lg hover:bg-gray-700 disabled:opacity-50"
            >
              返回繼續掃描
            </button>
            <button
              onClick={handleBatchSubmit}
              disabled={isSubmitting}
              className="flex-1 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? '送出中...' : '確認送出'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* 隱藏的文件輸入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 攝像頭畫面 - 滿版顯示 */}
      <div className="flex-1 relative overflow-hidden">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{
            facingMode: 'environment', // 使用後置攝像頭
            width: 1920,
            height: 1080
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* 成功提示動畫 */}
        {captureSuccess && (
          <div className="absolute inset-0 bg-green-500 bg-opacity-30 flex items-center justify-center animate-pulse z-10">
            <div className="bg-white rounded-full p-6">
              <CheckCircle className="w-16 h-16 text-green-600" />
            </div>
          </div>
        )}

        {/* 頂部狀態欄 */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">掃描中</span>
            </div>

            {/* 語音控制按鈕 */}
            {isVoiceSupported && (
              <button
                onClick={isListening ? stopListening : startListening}
                className={`p-2 rounded-full transition-colors ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 底部控制欄 */}
      <div className="bg-gradient-to-t from-black via-black/95 to-black/70 text-white p-6 pb-8">
        {/* 錯誤提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-200">{error}</span>
          </div>
        )}

        {/* 學生資訊 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <User className="w-6 h-6 text-blue-400" />
            <div className="flex-1">
              <div className="text-sm text-gray-400">當前學生</div>
              <div className="text-2xl font-bold">
                {currentStudent ? currentStudent.name : '載入中...'}
              </div>
            </div>
            {/* 預覽圖片 */}
            {lastCapturedImage && (
              <div className="flex-shrink-0">
                <div className="text-xs text-gray-400 mb-1 text-center">最近上傳</div>
                <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-green-400 shadow-lg">
                  <img
                    src={lastCapturedImage}
                    alt="預覽"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 掃描進度 */}
        {capturedImages.size > 0 && (
          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
            <div className="text-sm text-blue-200">
              已掃描 <span className="font-bold text-xl">{capturedImages.size}</span> / {maxSeat} 份作業
            </div>
          </div>
        )}

        {/* 座號顯示和操作按鈕 */}
        <div className="space-y-3">
          {/* 座號和拍照/上傳按鈕 */}
          <div className="flex items-center gap-3">
            {/* 座號 */}
            <div className="flex-shrink-0 bg-blue-600 rounded-xl px-6 py-4 text-center min-w-[100px]">
              <div className="text-sm text-blue-200 mb-1">座號</div>
              <div className="text-4xl font-bold">{currentSeat}</div>
            </div>

            {/* 上傳文件按鈕 */}
            <button
              onClick={triggerFileUpload}
              disabled={isCapturing || !currentStudent}
              className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-6 rounded-xl font-bold text-base transition-all ${
                isCapturing
                  ? 'bg-gray-600 cursor-not-allowed'
                  : currentStudent
                  ? 'bg-purple-600 hover:bg-purple-700 active:scale-95'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              <Upload className="w-5 h-5" />
              上傳
            </button>

            {/* 拍照按鈕 */}
            <button
              onClick={capture}
              disabled={isCapturing || !currentStudent}
              className={`flex-1 flex items-center justify-center gap-3 py-6 rounded-xl font-bold text-lg transition-all ${
                isCapturing
                  ? 'bg-gray-600 cursor-not-allowed'
                  : currentStudent
                  ? 'bg-green-600 hover:bg-green-700 active:scale-95'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              <Camera className="w-6 h-6" />
              {isCapturing ? '處理中...' : '拍照'}
            </button>
          </div>

          {/* 完成掃描按鈕 */}
          {capturedImages.size > 0 && (
            <button
              onClick={() => setShowConfirmation(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg transition-all bg-orange-600 hover:bg-orange-700 active:scale-95"
            >
              <CheckCircle className="w-6 h-6" />
              完成掃描，確認送出 ({capturedImages.size} 份)
            </button>
          )}
        </div>

        {/* 語音監聽狀態 */}
        {isListening && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-full text-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              語音識別中...
            </div>
          </div>
        )}

        {/* 提示資訊 */}
        <div className="mt-4 text-center text-sm text-gray-400">
          拍照 (空格) | 上傳圖片/PDF | {isVoiceSupported ? '語音跳轉座號' : '語音功能不可用'}
        </div>
      </div>
    </div>
  )
}
