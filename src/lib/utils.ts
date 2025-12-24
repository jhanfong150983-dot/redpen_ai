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
 * 優先順序：Base64 > Blob > 雲端 URL
 * 理由：Base64 在所有瀏覽器都穩定，Blob 在某些情況下可能有問題
 */
export function getSubmissionImageUrl(submission?: {
  id?: string
  imageBlob?: Blob
  imageBase64?: string
  imageUrl?: string
} | null): string | null {
  if (!submission) {
    console.log('❌ getSubmissionImageUrl: submission 為空')
    return null
  }

  const safari = isSafari()
  const browser = safari ? 'Safari' : 'Chrome/Other'

  console.log(`🖼️ 取得圖片 URL (${browser}):`, {
    submissionId: submission.id,
    hasBlob: !!submission.imageBlob,
    blobSize: submission.imageBlob?.size,
    blobType: submission.imageBlob?.type,
    hasBase64: !!submission.imageBase64,
    base64Length: submission.imageBase64?.length,
    hasImageUrl: !!submission.imageUrl
  })

  // 策略 1: 優先使用 Base64（最穩定，所有瀏覽器都支持）
  if (submission.imageBase64) {
    console.log(`✅ 使用 Base64 (${browser})`, { submissionId: submission.id })
    return submission.imageBase64
  }

  // 策略 2: 使用本地 Blob
  if (submission.imageBlob) {
    try {
      // 檢查 Blob 是否有效
      if (submission.imageBlob.size === 0) {
        console.warn('⚠️ Blob 大小為 0，無法使用', { submissionId: submission.id })
      } else {
        // 如果 Blob 沒有類型，嘗試補上
        if (!submission.imageBlob.type || submission.imageBlob.type === '') {
          console.warn(`⚠️ Blob 缺少 type，設定為 image/jpeg (${browser})`, { submissionId: submission.id })
          const fixedBlob = new Blob([submission.imageBlob], { type: 'image/jpeg' })
          const url = URL.createObjectURL(fixedBlob)
          console.log(`✅ 使用 Blob URL (修復後, ${browser})`, { submissionId: submission.id, url })
          return url
        }

        const url = URL.createObjectURL(submission.imageBlob)
        console.log(`✅ 使用 Blob URL (${browser})`, { submissionId: submission.id, url })
        return url
      }
    } catch (error) {
      console.error(`❌ 創建 Blob URL 失敗 (${browser}):`, error, { submissionId: submission.id })
    }
  }

  // 策略 3: 使用云端 URL（從 Supabase 下載）
  if (submission.imageUrl && submission.id) {
    const url = `/api/storage/download?submissionId=${encodeURIComponent(submission.id)}`
    console.log(`✅ 使用雲端 URL (${browser})`, { submissionId: submission.id, url })
    return url
  }

  console.error(`❌ 無法取得圖片 URL (${browser})：沒有任何可用的圖片來源`, {
    submissionId: submission.id,
    hasBlob: !!submission.imageBlob,
    hasBase64: !!submission.imageBase64,
    hasImageUrl: !!submission.imageUrl
  })
  return null
}
