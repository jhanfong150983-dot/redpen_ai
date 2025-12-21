export const SYNC_EVENT_NAME = 'rp-sync-request'

export function requestSync() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME))
}
