// api/proxy.js
// 這段程式碼在 Vercel 的伺服器上執行，前端看不到
import { getAuthUser } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  let user = null
  try {
    const result = await getAuthUser(req, res)
    user = result.user
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' })
    return
  }

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const apiKey = process.env.SECRET_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server API Key missing' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  }

  const { model, contents, ...payload } = body || {}
  if (!model || !Array.isArray(contents)) {
    res.status(400).json({ error: 'Missing model or contents' })
    return
  }

  const modelPath = String(model).startsWith('models/')
    ? String(model)
    : `models/${model}`
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...payload })
    })

    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    res.status(response.ok ? 200 : response.status).json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Gemini API' })
  }
}
