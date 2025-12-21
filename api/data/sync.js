import { getAuthUser } from '../_auth.js'
import { getSupabaseAdmin } from '../_supabase.js'

function parseJsonBody(req) {
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return null
    }
  }
  return body || null
}

function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  return null
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  )
}

export default async function handler(req, res) {
  const { user } = await getAuthUser(req, res)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()

  if (req.method === 'GET') {
    try {
      const [
        classroomsResult,
        studentsResult,
        assignmentsResult,
        submissionsResult
      ] = await Promise.all([
        supabaseAdmin.from('classrooms').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('students').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('assignments').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('submissions').select('*').eq('owner_id', user.id)
      ])

      if (classroomsResult.error) {
        throw new Error(classroomsResult.error.message)
      }
      if (studentsResult.error) {
        throw new Error(studentsResult.error.message)
      }
      if (assignmentsResult.error) {
        throw new Error(assignmentsResult.error.message)
      }
      if (submissionsResult.error) {
        throw new Error(submissionsResult.error.message)
      }

      const classrooms = (classroomsResult.data || []).map((row) => ({
        id: row.id,
        name: row.name
      }))

      const students = (studentsResult.data || []).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        seatNumber: row.seat_number,
        name: row.name
      }))

      const assignments = (assignmentsResult.data || []).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        title: row.title,
        totalPages: row.total_pages,
        domain: row.domain ?? undefined,
        answerKey: row.answer_key ?? undefined
      }))

      const submissions = (submissionsResult.data || []).map((row) => {
        const createdAt = row.created_at ? Date.parse(row.created_at) : null
        const gradedAt = toNumber(row.graded_at)

        return compactObject({
          id: row.id,
          assignmentId: row.assignment_id,
          studentId: row.student_id,
          status: row.status ?? 'synced',
          createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
          score: row.score ?? undefined,
          feedback: row.feedback ?? undefined,
          gradingResult: row.grading_result ?? undefined,
          gradedAt: gradedAt ?? undefined,
          correctionCount: row.correction_count ?? undefined
        })
      })

      res.status(200).json({
        classrooms,
        students,
        assignments,
        submissions
      })
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : '讀取雲端資料失敗'
      })
    }
    return
  }

  if (req.method === 'POST') {
    const body = parseJsonBody(req)
    if (!body) {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }

    const classrooms = Array.isArray(body.classrooms) ? body.classrooms : []
    const students = Array.isArray(body.students) ? body.students : []
    const assignments = Array.isArray(body.assignments) ? body.assignments : []
    const submissions = Array.isArray(body.submissions) ? body.submissions : []

    const nowIso = new Date().toISOString()

    try {
      if (classrooms.length > 0) {
        const rows = classrooms
          .filter((c) => c?.id)
          .map((c) =>
            compactObject({
              id: c.id,
              name: c.name,
              owner_id: user.id,
              updated_at: nowIso
            })
          )

        if (rows.length > 0) {
          const result = await supabaseAdmin
            .from('classrooms')
            .upsert(rows, { onConflict: 'id' })
          if (result.error) throw new Error(result.error.message)
        }
      }

      if (students.length > 0) {
        const rows = students
          .filter((s) => s?.id && s?.classroomId)
          .map((s) =>
            compactObject({
              id: s.id,
              classroom_id: s.classroomId,
              seat_number: s.seatNumber,
              name: s.name,
              owner_id: user.id,
              updated_at: nowIso
            })
          )

        if (rows.length > 0) {
          const result = await supabaseAdmin
            .from('students')
            .upsert(rows, { onConflict: 'id' })
          if (result.error) throw new Error(result.error.message)
        }
      }

      if (assignments.length > 0) {
        const rows = assignments
          .filter((a) => a?.id && a?.classroomId)
          .map((a) =>
            compactObject({
              id: a.id,
              classroom_id: a.classroomId,
              title: a.title,
              total_pages: a.totalPages,
              domain: a.domain ?? undefined,
              answer_key: a.answerKey ?? undefined,
              owner_id: user.id,
              updated_at: nowIso
            })
          )

        if (rows.length > 0) {
          const result = await supabaseAdmin
            .from('assignments')
            .upsert(rows, { onConflict: 'id' })
          if (result.error) throw new Error(result.error.message)
        }
      }

      if (submissions.length > 0) {
        const rows = submissions
          .filter((s) => s?.id && s?.assignmentId && s?.studentId)
          .map((s) => {
            const createdAt = toIsoTimestamp(s.createdAt)
            const gradedAt = toNumber(s.gradedAt)

            return compactObject({
              id: s.id,
              assignment_id: s.assignmentId,
              student_id: s.studentId,
              status: s.status ?? undefined,
              created_at: createdAt ?? undefined,
              score: toNumber(s.score) ?? undefined,
              feedback: s.feedback ?? undefined,
              grading_result: s.gradingResult ?? undefined,
              graded_at: gradedAt ?? undefined,
              correction_count: toNumber(s.correctionCount) ?? undefined,
              owner_id: user.id,
              updated_at: nowIso
            })
          })

        if (rows.length > 0) {
          const result = await supabaseAdmin
            .from('submissions')
            .upsert(rows, { onConflict: 'id' })
          if (result.error) throw new Error(result.error.message)
        }
      }

      res.status(200).json({ success: true })
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : '同步失敗'
      })
    }
    return
  }

  res.status(405).json({ error: 'Method Not Allowed' })
}
