import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合併 Tailwind CSS class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 检测是否为 Safari 浏览器
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
}

/**
 * 获取 Submission 图片的显示 URL
 * Safari 優先使用 Base64，其他瀏覽器優先使用 Blob，最後使用雲端 URL
 */
export function getSubmissionImageUrl(submission?: {
  id?: string
  imageBlob?: Blob
  imageBase64?: string
  imageUrl?: string
} | null): string | null {
  if (!submission) return null

  const safari = isSafari()

  // Safari 優先使用 Base64（避免 Blob 序列化問題）
  if (safari && submission.imageBase64) {
    console.log('🧭 Safari 使用 Base64', { submissionId: submission.id })
    return submission.imageBase64
  }

  // 优先使用本地 Blob
  if (submission.imageBlob) {
    try {
      // 檢查 Blob 是否有效
      if (submission.imageBlob.size === 0) {
        console.warn('⚠️ Blob 大小為 0，無法創建 URL', { submissionId: submission.id })
        // Blob 無效，嘗試使用 Base64 備份
        if (submission.imageBase64) {
          console.log('🔄 Blob 無效，改用 Base64 備份', { submissionId: submission.id })
          return submission.imageBase64
        }
      } else {
        // 如果 Blob 沒有類型，嘗試補上
        if (!submission.imageBlob.type || submission.imageBlob.type === '') {
          console.warn('⚠️ Blob 缺少 type 屬性，手動設定為 image/jpeg', { submissionId: submission.id })
          const fixedBlob = new Blob([submission.imageBlob], { type: 'image/jpeg' })
          return URL.createObjectURL(fixedBlob)
        }

        return URL.createObjectURL(submission.imageBlob)
      }
    } catch (error) {
      console.error('❌ 創建 Blob URL 失敗:', error, { submissionId: submission.id })
      // 失敗時嘗試使用 Base64 備份
      if (submission.imageBase64) {
        console.log('🔄 Blob 失敗，改用 Base64 備份', { submissionId: submission.id })
        return submission.imageBase64
      }
    }
  }

  // 非 Safari 或 Blob 失敗後，嘗試使用 Base64
  if (submission.imageBase64) {
    console.log('🔄 使用 Base64 備份', { submissionId: submission.id })
    return submission.imageBase64
  }

  // 使用云端 URL（通过下载 API）
  if (submission.imageUrl && submission.id) {
    return `/api/storage/download?submissionId=${encodeURIComponent(submission.id)}`
  }

  console.warn('⚠️ 無法取得圖片 URL：沒有 imageBlob、imageBase64 也沒有 imageUrl', { submissionId: submission.id })
  return null
}
