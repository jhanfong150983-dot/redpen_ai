/**
 * 图片压缩工具
 */

interface CompressImageOptions {
  maxWidth?: number
  quality?: number
  format?: 'image/jpeg' | 'image/png' | 'image/webp'
}

/**
 * 檢測是否為 Safari 瀏覽器
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
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
  // Safari 對 WebP 支援不佳，改用 JPEG
  const defaultFormat = isSafari() ? 'image/jpeg' : 'image/webp'

  const {
    maxWidth = 1024,
    quality = 0.8,
    format = defaultFormat
  } = options

  console.log(`🔧 壓縮設定: format=${format}, isSafari=${isSafari()}`)

  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
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

      // 转换为 Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(`✅ 图片压缩完成: ${(blob.size / 1024).toFixed(2)} KB, 類型: ${blob.type}`)

            // 確保 Blob 有正確的 type 屬性
            if (!blob.type || blob.type === '') {
              console.warn('⚠️ Blob 類型為空，手動設定為', format)
              const fixedBlob = new Blob([blob], { type: format })
              resolve(fixedBlob)
            } else {
              resolve(blob)
            }
          } else {
            reject(new Error('图片压缩失败'))
          }
        },
        format,
        quality
      )
    }

    img.onerror = () => {
      reject(new Error('图片加载失败'))
    }

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
