import { dispatchInkBalance } from './ink-events'

const INK_SESSION_STORAGE_KEY = 'rp-ink-session-id'

let cachedInkSessionId: string | null = null

function readStoredInkSessionId() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(INK_SESSION_STORAGE_KEY)
}

export function getInkSessionId() {
  if (cachedInkSessionId !== null) return cachedInkSessionId
  const stored = readStoredInkSessionId()
  cachedInkSessionId = stored || null
  return cachedInkSessionId
}

export function setInkSessionId(sessionId: string | null) {
  cachedInkSessionId = sessionId
  if (typeof window === 'undefined') return
  if (sessionId) {
    window.sessionStorage.setItem(INK_SESSION_STORAGE_KEY, sessionId)
  } else {
    window.sessionStorage.removeItem(INK_SESSION_STORAGE_KEY)
  }
}

export async function startInkSession() {
  const response = await fetch('/api/ink/sessions?action=start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({})
  })

  let data: any = null
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    setInkSessionId(null)
    const message = data?.error || '無法建立批改會話'
    throw new Error(message)
  }

  const sessionId =
    typeof data?.sessionId === 'string' ? data.sessionId.trim() : ''
  if (!sessionId) {
    setInkSessionId(null)
    throw new Error('無法建立批改會話')
  }

  setInkSessionId(sessionId)
  return { sessionId, expiresAt: data?.expiresAt }
}

export async function closeInkSession(sessionId?: string | null) {
  const id = sessionId || getInkSessionId()
  if (!id) return
  let inkSummary: {
    chargedPoints?: number
    balanceBefore?: number | null
    balanceAfter?: number | null
    applied?: boolean
  } | null = null

  try {
    const response = await fetch('/api/ink/sessions?action=close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId: id })
    })
    let data: any = null
    try {
      data = await response.json()
    } catch {
      data = {}
    }
    if (response.ok) {
      inkSummary = data?.ink ?? null
      const updatedBalance = Number(data?.ink?.balanceAfter)
      if (Number.isFinite(updatedBalance)) {
        dispatchInkBalance(updatedBalance)
      }
    }
  } catch (error) {
    console.warn('Ink session close failed:', error)
  } finally {
    setInkSessionId(null)
  }

  return inkSummary
}
