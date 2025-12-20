export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'Missing GEMINI_API_KEY' })
      return
    }

    const { prompt } = req.body || {}
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' })
      return
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    })

    const data = await r.json()
    res.status(r.ok ? 200 : r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: String(e) })
  }
}
