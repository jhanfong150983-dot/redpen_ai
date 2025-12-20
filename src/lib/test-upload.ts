/**
 * Supabase Storage 上傳測試
 *
 * 使用方式：
 * 1. 在瀏覽器 Console 中執行 testUpload()
 * 2. 檢查是否成功上傳
 */

import { supabase } from './supabase'

export async function testUpload() {
  console.log('🧪 開始測試 Supabase Storage 上傳...')

  if (!supabase) {
    console.error('❌ Supabase 未設定，請檢查 .env 檔案')
    return
  }

  try {
    // 創建一個測試用的 Blob（小圖片）
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 100
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      console.error('❌ 無法創建 Canvas')
      return
    }

    // 繪製一個簡單的測試圖案
    ctx.fillStyle = '#4F46E5'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '20px Arial'
    ctx.fillText('TEST', 20, 60)

    // 轉換為 Blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('轉換失敗')),
        'image/png'
      )
    })

    console.log('✅ 測試圖片已創建:', blob.size, 'bytes')

    // 上傳到 Supabase Storage
    const fileName = `test-${Date.now()}.png`
    const filePath = `submissions/${fileName}`

    console.log('📤 上傳中:', filePath)

    const { data, error } = await supabase.storage
      .from('homework-images')
      .upload(filePath, blob, {
        contentType: 'image/png',
        upsert: false
      })

    if (error) {
      console.error('❌ 上傳失敗:', error)
      console.error('錯誤詳情:', {
        message: error.message,
        statusCode: (error as any)?.statusCode ?? 'n/a',
        name: error.name
      })
      return
    }

    console.log('✅ 上傳成功!', data)

    // 取得公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from('homework-images')
      .getPublicUrl(filePath)

    console.log('🌐 公開 URL:', publicUrl)
    console.log('✅ 測試完成！你可以訪問上方 URL 查看圖片')

    return {
      success: true,
      url: publicUrl,
      path: filePath
    }

  } catch (error) {
    console.error('❌ 測試過程出錯:', error)
    return {
      success: false,
      error
    }
  }
}

// 在瀏覽器 Console 中可用
if (typeof window !== 'undefined') {
  ;(window as any).testSupabaseUpload = testUpload
}
