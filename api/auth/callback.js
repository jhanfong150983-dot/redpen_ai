import {
  parseCookies,
  getAuthCookieNames,
  clearOAuthCookies,
  setAuthCookies,
  exchangeCodeForSession,
  isSecureRequest
} from '../_auth.js'
import { getSupabaseAdmin } from '../_supabase.js'

function getSiteUrl(req) {
  const proto = req.headers?.['x-forwarded-proto'] || 'http'
  const host = req.headers?.host
  if (!host) return process.env.SITE_URL || ''
  return `${proto}://${host}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const { code, error, error_description } = req.query || {}
  const codeValue = Array.isArray(code) ? code[0] : code
  if (error) {
    res.status(400).json({ error: error_description || error })
    return
  }

  if (!codeValue) {
    res.status(400).json({ error: 'Missing OAuth response' })
    return
  }

  const cookies = parseCookies(req)
  const { verifier: verifierCookie } = getAuthCookieNames()
  const verifier = cookies[verifierCookie]

  if (!verifier) {
    clearOAuthCookies(res, isSecureRequest(req))
    res.status(400).json({ error: 'Missing OAuth verifier' })
    return
  }

  try {
    const session = await exchangeCodeForSession(codeValue, verifier)
    clearOAuthCookies(res, isSecureRequest(req))

    const user = session.user
    if (!user) {
      res.status(500).json({ error: '登入失敗' })
      return
    }

    const supabaseAdmin = getSupabaseAdmin()
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      ''
    const avatarUrl = user.user_metadata?.avatar_url || ''

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        name: fullName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    )

    if (profileError) {
      res.status(500).json({ error: '建立使用者資料失敗' })
      return
    }

    setAuthCookies(res, session, isSecureRequest(req))

    const siteUrl = process.env.SITE_URL || getSiteUrl(req)
    res.writeHead(302, { Location: siteUrl || '/' })
    res.end()
  } catch (err) {
    clearOAuthCookies(res, isSecureRequest(req))
    res.status(500).json({ error: err instanceof Error ? err.message : '登入失敗' })
  }
}
