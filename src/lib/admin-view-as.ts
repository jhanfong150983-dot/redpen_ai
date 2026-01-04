import { useEffect, useState } from 'react'

export type AdminViewAs = {
  ownerId: string
  name?: string
  email?: string
}

const STORAGE_KEY = 'admin_view_as'
const EVENT_NAME = 'admin-view-as-change'

function parseViewAs(raw: string | null): AdminViewAs | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const ownerId =
      typeof parsed?.ownerId === 'string' ? parsed.ownerId.trim() : ''
    if (!ownerId) return null
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
    const email = typeof parsed?.email === 'string' ? parsed.email.trim() : ''
    return {
      ownerId,
      ...(name ? { name } : {}),
      ...(email ? { email } : {})
    }
  } catch {
    return null
  }
}

export function getAdminViewAs(): AdminViewAs | null {
  if (typeof window === 'undefined') return null
  return parseViewAs(window.localStorage.getItem(STORAGE_KEY))
}

export function setAdminViewAs(next: AdminViewAs | null) {
  if (typeof window === 'undefined') return
  if (!next) {
    window.localStorage.removeItem(STORAGE_KEY)
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function clearAdminViewAs() {
  setAdminViewAs(null)
}

export function useAdminViewAs() {
  const [viewAs, setViewAsState] = useState<AdminViewAs | null>(() =>
    getAdminViewAs()
  )

  useEffect(() => {
    const handleChange = () => {
      setViewAsState(getAdminViewAs())
    }

    window.addEventListener(EVENT_NAME, handleChange)
    window.addEventListener('storage', handleChange)
    return () => {
      window.removeEventListener(EVENT_NAME, handleChange)
      window.removeEventListener('storage', handleChange)
    }
  }, [])

  const updateViewAs = (next: AdminViewAs | null) => {
    setAdminViewAs(next)
    setViewAsState(next)
  }

  return {
    viewAs,
    setViewAs: updateViewAs,
    clearViewAs: () => updateViewAs(null)
  }
}
