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
    let base64 = submission.imageBase64

    // 🔍 調試：顯示 Base64 的前 200 個字符
    console.log(`🔍 Base64 前200字:`, base64.substring(0, 200))

    // 🔧 檢測並修復損壞的 Base64 前綴
    // 正常格式: "data:image/jpeg;base64,/9j/4AAQ..."
    // 損壞格式: "data:image/jpeg;base64,/jpegbase64/9j/4AAQ..." 或 "data:image/jpeg;base64,dataimage/jpegbase64/9j/..."
    const correctPrefix = /^data:image\/[^;]+;base64,/i

    if (correctPrefix.test(base64)) {
      // 提取前綴
      const prefixMatch = base64.match(correctPrefix)
      if (prefixMatch) {
        const prefix = prefixMatch[0] // "data:image/jpeg;base64,"
        const afterPrefix = base64.substring(prefix.length)

        console.log(`🔍 前綴後的前50字:`, afterPrefix.substring(0, 50))

        // 檢測損壞模式：查找 "jpegbase64" 或 "dataimage" 等異常文字
        if (afterPrefix.includes('jpegbase64') || afterPrefix.includes('dataimage')) {
          console.warn(`⚠️ 檢測到損壞的Base64數據（包含異常文字），正在修復...`, { submissionId: submission.id })
          console.warn(`原始前200字:`, base64.substring(0, 200))

          // 找到 /9j/ 的位置（JPEG Base64 的標準開頭）
          const jpegStart = base64.indexOf('/9j/')
          if (jpegStart > prefix.length) {
            base64 = prefix + base64.substring(jpegStart)
            console.log(`✅ 修復完成，新前150字:`, base64.substring(0, 150))
          } else {
            console.error(`❌ 無法找到 /9j/ 標記`, { submissionId: submission.id })
          }
        }
      }
    }

    // 確保有正確的 data URL 格式
    if (!base64.startsWith('data:image/')) {
      console.warn(`⚠️ Base64缺少data URL前綴，添加默認前綴`, { submissionId: submission.id })
      base64 = `data:image/jpeg;base64,${base64}`
    }

    console.log(`✅ 使用 Base64 (${browser})`, { submissionId: submission.id, length: base64.length })
    return base64
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
