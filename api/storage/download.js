import { getAuthUser } from '../../server/_auth.js'
import { getSupabaseAdmin } from '../../server/_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const { user } = await getAuthUser(req, res)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const submissionIdParam = req.query?.submissionId
    const submissionId = Array.isArray(submissionIdParam)
      ? submissionIdParam[0]
      : submissionIdParam
    if (!submissionId) {
      res.status(400).json({ error: 'Missing submissionId' })
      return
    }

    // 後端始終使用 service role key 繞過 RLS
    const supabaseDb = getSupabaseAdmin()

    const { data: submission, error: submissionError } = await supabaseDb
      .from('submissions')
      .select('id, owner_id')
      .eq('id', submissionId)
      .maybeSingle()

    if (submissionError) {
      res.status(500).json({ error: submissionError.message })
      return
    }

    if (!submission || submission.owner_id !== user.id) {
      res.status(404).json({ error: 'Submission not found' })
      return
    }

    const filePath = `submissions/${submissionId}.webp`
    const { data, error } = await supabaseDb.storage
      .from('homework-images')
      .download(filePath)

    if (error || !data) {
      res.status(404).json({ error: 'Image not found' })
      return
    }

    const arrayBuffer = await data.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.setHeader('Content-Type', data.type || 'image/webp')
    res.setHeader('Content-Length', buffer.length)
    res.status(200).send(buffer)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
