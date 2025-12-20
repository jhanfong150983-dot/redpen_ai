import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合併 Tailwind CSS class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
