import { useState, useEffect } from 'react'
import { onNetworkChange } from '@/lib/supabase'

/**
 * Hook 用於檢測網路連線狀態
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const cleanup = onNetworkChange((online) => {
      setIsOnline(online)
    })

    return cleanup
  }, [])

  return isOnline
}
