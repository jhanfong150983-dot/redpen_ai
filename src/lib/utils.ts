import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合併 Tailwind CSS class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 获取 Submission 图片的显示 URL
 * 优先使用本地 Blob，否则使用云端 imageUrl
 */
export function getSubmissionImageUrl(submission?: {
  id?: string
  imageBlob?: Blob
  imageUrl?: string
} | null): string | null {
  if (!submission) return null

  // 优先使用本地 Blob
  if (submission.imageBlob) {
    try {
      // 檢查 Blob 是否有效
      if (submission.imageBlob.size === 0) {
        console.warn('⚠️ Blob 大小為 0，無法創建 URL', { submissionId: submission.id })
        // 即使 Blob 大小為 0，還是嘗試使用雲端 URL
      } else {
        // 如果 Blob 沒有類型，嘗試補上
        if (!submission.imageBlob.type || submission.imageBlob.type === '') {
          console.warn('⚠️ Blob 缺少 type 屬性，手動設定為 image/webp', { submissionId: submission.id })
          const fixedBlob = new Blob([submission.imageBlob], { type: 'image/webp' })
          return URL.createObjectURL(fixedBlob)
        }

        return URL.createObjectURL(submission.imageBlob)
      }
    } catch (error) {
      console.error('❌ 創建 Blob URL 失敗:', error, { submissionId: submission.id })
      // 失敗時嘗試使用雲端 URL
    }
  }

  // 使用云端 URL（通过下载 API）
  if (submission.imageUrl && submission.id) {
    return `/api/storage/download?submissionId=${encodeURIComponent(submission.id)}`
  }

  console.warn('⚠️ 無法取得圖片 URL：沒有 imageBlob 也沒有 imageUrl', { submissionId: submission.id })
  return null
}
