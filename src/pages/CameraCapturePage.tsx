import { useRef, useState, useCallback } from 'react'
import Webcam from 'react-webcam'
import { Camera, Upload, ArrowLeft, Loader } from 'lucide-react'
import { compressImageFile } from '@/lib/imageCompression'

interface CameraCapturePageProps {
  studentId: string
  seatNumber: number
  name: string
  pagesPerStudent: number
  currentPageCount: number
  onCaptureComplete: (imageBlob: Blob) => void
  onBack: () => void
}

export default function CameraCapturePage({
  seatNumber,
  name,
  pagesPerStudent,
  currentPageCount,
  onCaptureComplete,
  onBack
}: CameraCapturePageProps) {
  const webcamRef = useRef<Webcam>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return

    setIsProcessing(true)
    try {
      const imageSrc = webcamRef.current.getScreenshot()
      if (!imageSrc) {
        throw new Error('無法擷取影像')
      }

      // 將 base64 轉換為 Blob
      const response = await fetch(imageSrc)
      const blob = await response.blob()

      // 壓縮圖片
      const compressed = await compressImageFile(blob, {
        maxWidth: 1600,
        quality: 0.85,
        format: 'image/webp'
      })

      onCaptureComplete(compressed)
    } catch (error) {
      console.error('拍照失敗:', error)
      alert(error instanceof Error ? error.message : '拍照失敗')
    } finally {
      setIsProcessing(false)
    }
  }, [onCaptureComplete])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setIsProcessing(true)
      try {
        // 壓縮圖片
        const compressed = await compressImageFile(file, {
          maxWidth: 1600,
          quality: 0.85,
          format: 'image/webp'
        })

        onCaptureComplete(compressed)
      } catch (error) {
        console.error('上傳失敗:', error)
        alert(error instanceof Error ? error.message : '上傳失敗')
      } finally {
        setIsProcessing(false)
        // 清空 input
        event.target.value = ''
      }
    },
    [onCaptureComplete]
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* 頂部資訊列 */}
      <div className="bg-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">返回選擇</span>
          </button>

          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">
              {seatNumber} 號 · {name}
            </h1>
            <p className="text-sm text-indigo-600 font-semibold">
              第 {currentPageCount + 1} / {pagesPerStudent} 張
            </p>
          </div>

          <div className="w-24"></div>
        </div>
      </div>

      {/* 相機預覽區 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl">
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: 'environment',
              width: 1920,
              height: 1080
            }}
            className="w-full rounded-2xl shadow-2xl"
          />

          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <div className="text-center text-white">
                <Loader className="w-12 h-12 mx-auto mb-3 animate-spin" />
                <p className="text-lg font-semibold">處理中...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作按鈕 */}
      <div className="bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center gap-4">
            {/* 拍照按鈕 */}
            <button
              type="button"
              onClick={handleCapture}
              disabled={isProcessing}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-indigo-600 text-white font-semibold text-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg"
            >
              <Camera className="w-6 h-6" />
              拍照
            </button>

            {/* 上傳按鈕 */}
            <label className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-lg hover:bg-gray-200 cursor-pointer transition-all transform hover:scale-105 active:scale-95 shadow-md">
              <Upload className="w-6 h-6" />
              上傳
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="hidden"
              />
            </label>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            拍攝清晰後會自動返回座號選擇頁面
          </p>
        </div>
      </div>
    </div>
  )
}
