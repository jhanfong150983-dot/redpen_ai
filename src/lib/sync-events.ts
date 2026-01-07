export const SYNC_EVENT_NAME = 'rp-sync-request'
export const SYNC_COMPLETE_EVENT_NAME = 'rp-sync-complete'

export function requestSync() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME))
}

export function notifySyncComplete() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT_NAME))
}

export function waitForSync(timeoutMs = 5000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener(SYNC_COMPLETE_EVENT_NAME, handler)
      reject(new Error('同步超時'))
    }, timeoutMs)

    const handler = () => {
      clearTimeout(timeout)
      window.removeEventListener(SYNC_COMPLETE_EVENT_NAME, handler)
      resolve()
    }

    window.addEventListener(SYNC_COMPLETE_EVENT_NAME, handler)
  })
}
