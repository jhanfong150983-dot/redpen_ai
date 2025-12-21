import { clearAuthCookies, isSecureRequest } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  clearAuthCookies(res, isSecureRequest(req))
  res.status(200).json({ success: true })
}
