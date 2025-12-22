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
    return URL.createObjectURL(submission.imageBlob)
  }

  // 使用云端 URL（通过下载 API）
  if (submission.imageUrl && submission.id) {
    return `/api/storage/download?submissionId=${encodeURIComponent(submission.id)}`
  }

  return null
}
