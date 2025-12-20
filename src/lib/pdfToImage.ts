/**
 * PDF 轉圖片工具
 * 使用 pdfjs-dist 將 PDF 轉成 Canvas，再轉成 Blob（WebP 等格式）
 */

import * as pdfjsLib from 'pdfjs-dist'

// 設定 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * 將 PDF 檔的「第一頁」轉成單張圖片 Blob
 * @param file PDF 檔
 * @param options 轉換選項
 */
export async function convertPdfToImage(
  file: File,
  options: {
    scale?: number
    format?: 'image/png' | 'image/jpeg' | 'image/webp'
    quality?: number
  } = {}
): Promise<Blob> {
  const {
    scale = 2,
    format = 'image/webp',
    quality = 0.8
  } = options

  try {
    console.log('開始處理 PDF（單頁）:', file.name)

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise

    console.log(`PDF 載入成功，共 ${pdf.numPages} 頁`)

    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('無法建立 Canvas context')
    }

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport, canvas }).promise

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b)
          } else {
            reject(new Error('Canvas 轉 Blob 失敗'))
          }
        },
        format,
        quality
      )
    })

    return blob
  } catch (error) {
    console.error('PDF 單頁轉圖失敗:', error)
    throw new Error(
      error instanceof Error
        ? `PDF 轉換失敗：${error.message}`
        : 'PDF 轉換失敗'
    )
  }
}

/**
 * 將 PDF 檔「所有頁面」轉成圖片 Blob 陣列
 * @param file PDF 檔
 * @param options 轉換選項
 */
export async function convertPdfToImages(
  file: File,
  options: {
    scale?: number
    format?: 'image/png' | 'image/jpeg' | 'image/webp'
    quality?: number
  } = {}
): Promise<Blob[]> {
  const {
    scale = 2,
    format = 'image/webp',
    quality = 0.8
  } = options

  try {
    console.log('開始處理 PDF（多頁）:', file.name)

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise

    console.log(`PDF 載入成功，共 ${pdf.numPages} 頁`)

    const blobs: Blob[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('無法建立 Canvas context')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: context, viewport, canvas }).promise

      // eslint-disable-next-line no-await-in-loop
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) {
              resolve(b)
            } else {
              reject(new Error('Canvas 轉 Blob 失敗'))
            }
          },
          format,
          quality
        )
      })

      blobs.push(blob)
    }

    console.log(`PDF 全部轉換完成，共 ${blobs.length} 頁`)
    return blobs
  } catch (error) {
    console.error('PDF 全頁轉圖失敗:', error)
    throw new Error(
      error instanceof Error
        ? `PDF 全頁轉換失敗：${error.message}`
        : 'PDF 全頁轉換失敗'
    )
  }
}

/**
 * 簡單檢測檔案類型（圖片 / PDF / 其他）
 */
export function getFileType(file: File): 'image' | 'pdf' | 'unknown' {
  const mimeType = file.type.toLowerCase()

  if (mimeType === 'application/pdf') {
    return 'pdf'
  }

  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'pdf') {
    return 'pdf'
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
    return 'image'
  }

  return 'unknown'
}

/**
 * 將 File 轉成 Blob（主要用於圖片檔）
 */
export async function fileToBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      if (e.target?.result) {
        const blob = new Blob([e.target.result], { type: file.type })
        resolve(blob)
      } else {
        reject(new Error('檔案讀取失敗'))
      }
    }

    reader.onerror = () => {
      reject(new Error('檔案讀取錯誤'))
    }

    reader.readAsArrayBuffer(file)
  })
}
