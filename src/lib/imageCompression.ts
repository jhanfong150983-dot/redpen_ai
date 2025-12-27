/**
 * 图片压缩工具
 */

import { getWebPSupportSync } from './webpSupport'
import { safeToBlobWithFallback } from './canvasToBlob'

interface CompressImageOptions {
  maxWidth?: number
  quality?: number
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
}

/**
 * 压缩图片
 * @param dataUrl - Base64 格式的图片数据
 * @param options - 压缩选项
 * @returns Promise<Blob> - 压缩后的图片 Blob
 */
export async function compressImage(
  dataUrl: string,
  options: CompressImageOptions = {}
): Promise<Blob> {
  // 使用運行時檢測替代 User Agent 檢測（更準確）
  const supportsWebP = getWebPSupportSync()
  const defaultFormat = supportsWebP ? 'image/webp' : 'image/jpeg'

  const {
    maxWidth = 1024,
    quality = 0.8,
    format = defaultFormat
  } = options

  console.log(`🔧 壓縮設定: format=${format}, WebP支持=${supportsWebP}`)

  return new Promise((resolve, reject) => {
    const img = new Image()
    let timeoutId: number | null = null

    img.onload = async () => {
      if (timeoutId) clearTimeout(timeoutId)

      try {
        // 创建 Canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('无法创建 Canvas context'))
          return
        }

        // 计算缩放比例
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          const ratio = maxWidth / width
          width = maxWidth
          height = height * ratio
        }

        // 設定 Canvas 尺寸
        canvas.width = width
        canvas.height = height

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height)

        // 使用安全的 toBlob 包裝器（帶 fallback 和 timeout）
        const blob = await safeToBlobWithFallback(canvas, { format, quality })
        console.log(`✅ 图片压缩完成: ${(blob.size / 1024).toFixed(2)} KB, 類型: ${blob.type}`)
        resolve(blob)
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(new Error('图片加载失败'))
    }

    // 添加圖片載入 timeout（30秒）
    timeoutId = window.setTimeout(() => {
      reject(new Error('圖片載入超時'))
    }, 30000)

    img.src = dataUrl
  })
}

/**
 * 将 Blob 转换为 Base64
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('转换失败'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 获取图片尺寸信息
 */
export async function getImageInfo(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * 接受 File/Blob 物件，將其壓縮後回傳 Blob
 * @param file - File 或 Blob 物件
 * @param options - 壓縮選項
 * @returns Promise<Blob>
 */
export async function compressImageFile(
  file: File | Blob,
  options: CompressImageOptions = {}
): Promise<Blob> {
  const dataUrl = await blobToBase64(file);
  return await compressImage(dataUrl, options);
}

/**
 * 格式化檔案大小為可讀字串
 * @param bytes - 檔案大小（位元組）
 * @returns 格式化後的字串 (例如: "1.23 MB", "456.78 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * 驗證 Blob 大小是否超過限制
 * @param blob - 要檢查的 Blob 物件
 * @param maxSizeMB - 最大允許大小（MB），預設 1.5 MB
 * @returns 驗證結果物件
 */
export function validateBlobSize(
  blob: Blob,
  maxSizeMB: number = 1.5
): { valid: boolean; sizeMB: number; maxSizeMB: number; message?: string } {
  const sizeBytes = blob.size
  const sizeMB = sizeBytes / (1024 * 1024)
  const valid = sizeMB <= maxSizeMB

  let message: string | undefined
  if (!valid) {
    message = `壓縮後檔案仍過大（${formatFileSize(sizeBytes)}），超過限制 ${maxSizeMB} MB。\n建議：\n1. 使用解析度較低的圖片\n2. 裁切掉不必要的空白區域\n3. 使用 PDF 格式並調低掃描解析度`
  }

  return {
    valid,
    sizeMB: parseFloat(sizeMB.toFixed(2)),
    maxSizeMB,
    message
  }
}
