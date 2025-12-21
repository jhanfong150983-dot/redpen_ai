import { getAuthUser } from '../_auth.js'
import { getSupabaseAdmin } from '../_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const { user } = await getAuthUser(req, res)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
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

    const {
      submissionId,
      assignmentId,
      studentId,
      createdAt,
      imageBase64,
      contentType
    } = body || {}

    if (!submissionId || !assignmentId || !studentId || !createdAt || !imageBase64) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const supabaseAdmin = getSupabaseAdmin()
    const filePath = `submissions/${submissionId}.webp`
    const buffer = Buffer.from(String(imageBase64), 'base64')

    const { error: uploadError } = await supabaseAdmin.storage
      .from('homework-images')
      .upload(filePath, buffer, {
        contentType: contentType || 'image/webp',
        upsert: true
      })

    if (uploadError) {
      res.status(500).json({ error: `圖片上傳失敗: ${uploadError.message}` })
      return
    }

    const createdTime =
      typeof createdAt === 'number' ? createdAt : Date.parse(createdAt)
    if (!Number.isFinite(createdTime)) {
      res.status(400).json({ error: 'Invalid createdAt' })
      return
    }

    const timestamp = new Date(createdTime).toISOString()

    const { error: dbError } = await supabaseAdmin
      .from('submissions')
      .upsert(
        {
          id: submissionId,
          assignment_id: assignmentId,
          student_id: studentId,
          image_url: filePath,
          status: 'synced',
          created_at: timestamp,
          owner_id: user.id
        },
        {
          onConflict: 'assignment_id,student_id',
          ignoreDuplicates: false
        }
      )

    if (dbError) {
      res.status(500).json({ error: `資料庫寫入失敗: ${dbError.message}` })
      return
    }

    res.status(200).json({ success: true, imageUrl: filePath })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
}
