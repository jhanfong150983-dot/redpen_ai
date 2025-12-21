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

function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
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

function normalizeDeletedList(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return { id: item, deletedAt: null }
      }
      if (item && typeof item === 'object') {
        const id = item.id || item.recordId
        const deletedAt = toMillis(item.deletedAt) ?? null
        if (typeof id === 'string' && id.length > 0) {
          return { id, deletedAt }
        }
      }
      return null
    })
    .filter(Boolean)
}

async function fetchExistingUpdatedMap(supabaseAdmin, tableName, ids, ownerId) {
  if (ids.length === 0) return new Map()
  const result = await supabaseAdmin
    .from(tableName)
    .select('id, updated_at')
    .eq('owner_id', ownerId)
    .in('id', ids)
  if (result.error) {
    throw new Error(result.error.message)
  }
  return new Map(
    (result.data || []).map((row) => [row.id, toMillis(row.updated_at)])
  )
}

async function fetchDeletedSet(supabaseAdmin, tableName, ids, ownerId) {
  if (ids.length === 0) return new Set()
  const result = await supabaseAdmin
    .from('deleted_records')
    .select('record_id')
    .eq('owner_id', ownerId)
    .eq('table_name', tableName)
    .in('record_id', ids)
  if (result.error) {
    throw new Error(result.error.message)
  }
  return new Set((result.data || []).map((row) => row.record_id))
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
        submissionsResult,
        deletedResult
      ] = await Promise.all([
        supabaseAdmin.from('classrooms').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('students').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('assignments').select('*').eq('owner_id', user.id),
        supabaseAdmin.from('submissions').select('*').eq('owner_id', user.id),
        supabaseAdmin
          .from('deleted_records')
          .select('table_name, record_id, deleted_at')
          .eq('owner_id', user.id)
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
      if (deletedResult.error) {
        throw new Error(deletedResult.error.message)
      }

      const deleted = {
        classrooms: [],
        students: [],
        assignments: [],
        submissions: []
      }
      const deletedSets = {
        classrooms: new Set(),
        students: new Set(),
        assignments: new Set(),
        submissions: new Set()
      }

      for (const row of deletedResult.data || []) {
        const tableName = row.table_name
        const recordId = row.record_id
        if (!recordId || !deleted[tableName]) continue
        deleted[tableName].push(
          compactObject({
            id: recordId,
            deletedAt: toMillis(row.deleted_at) ?? undefined
          })
        )
        deletedSets[tableName].add(recordId)
      }

      const classrooms = (classroomsResult.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        updatedAt: toMillis(row.updated_at) ?? undefined
      }))

      const students = (studentsResult.data || []).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        seatNumber: row.seat_number,
        name: row.name,
        updatedAt: toMillis(row.updated_at) ?? undefined
      }))

      const assignments = (assignmentsResult.data || []).map((row) => ({
        id: row.id,
        classroomId: row.classroom_id,
        title: row.title,
        totalPages: row.total_pages,
        domain: row.domain ?? undefined,
        answerKey: row.answer_key ?? undefined,
        updatedAt: toMillis(row.updated_at) ?? undefined
      }))

      const submissions = (submissionsResult.data || []).map((row) => {
        const createdAt = row.created_at ? Date.parse(row.created_at) : null
        const gradedAt = toNumber(row.graded_at)
        const updatedAt = toMillis(row.updated_at)

        return compactObject({
          id: row.id,
          assignmentId: row.assignment_id,
          studentId: row.student_id,
          status: row.status ?? 'synced',
          imageUrl: row.image_url ?? undefined,
          createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
          score: row.score ?? undefined,
          feedback: row.feedback ?? undefined,
          gradingResult: row.grading_result ?? undefined,
          gradedAt: gradedAt ?? undefined,
          correctionCount: row.correction_count ?? undefined,
          updatedAt: updatedAt ?? undefined
        })
      })

      res.status(200).json({
        classrooms: classrooms.filter((row) => !deletedSets.classrooms.has(row.id)),
        students: students.filter((row) => !deletedSets.students.has(row.id)),
        assignments: assignments.filter((row) => !deletedSets.assignments.has(row.id)),
        submissions: submissions.filter((row) => !deletedSets.submissions.has(row.id)),
        deleted
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
    const deletedPayload =
      body.deleted && typeof body.deleted === 'object' ? body.deleted : {}

    const nowIso = new Date().toISOString()

    try {
      const applyDeletes = async (tableName, items) => {
        const list = normalizeDeletedList(items)
        if (list.length === 0) return

        const deleteRows = list.map((item) =>
          compactObject({
            owner_id: user.id,
            table_name: tableName,
            record_id: item.id,
            deleted_at: toIsoTimestamp(item.deletedAt) ?? nowIso
          })
        )

        const tombstoneResult = await supabaseAdmin
          .from('deleted_records')
          .upsert(deleteRows, {
            onConflict: 'owner_id,table_name,record_id'
          })
        if (tombstoneResult.error) {
          throw new Error(tombstoneResult.error.message)
        }

        const ids = list.map((item) => item.id)
        const deleteResult = await supabaseAdmin
          .from(tableName)
          .delete()
          .in('id', ids)
          .eq('owner_id', user.id)
        if (deleteResult.error) {
          throw new Error(deleteResult.error.message)
        }
      }

      await applyDeletes('classrooms', deletedPayload.classrooms)
      await applyDeletes('students', deletedPayload.students)
      await applyDeletes('assignments', deletedPayload.assignments)
      await applyDeletes('submissions', deletedPayload.submissions)

      const buildUpsertRows = async (tableName, items, mapper) => {
        const filtered = items.filter((item) => item?.id)
        if (filtered.length === 0) return []
        const ids = filtered.map((item) => item.id)
        const [existingMap, deletedSet] = await Promise.all([
          fetchExistingUpdatedMap(supabaseAdmin, tableName, ids, user.id),
          fetchDeletedSet(supabaseAdmin, tableName, ids, user.id)
        ])

        const rows = []
        for (const item of filtered) {
          if (deletedSet.has(item.id)) continue
          const hasExisting = existingMap.has(item.id)
          const existingUpdatedAt = existingMap.get(item.id)
          if (hasExisting) {
            const incomingUpdatedAt = toMillis(item.updatedAt ?? item.updated_at)
            if (!incomingUpdatedAt || (existingUpdatedAt && incomingUpdatedAt <= existingUpdatedAt)) {
              continue
            }
          }
          rows.push(mapper(item))
        }
        return rows
      }

      const classroomRows = await buildUpsertRows(
        'classrooms',
        classrooms.filter((c) => c?.id),
        (c) =>
        compactObject({
          id: c.id,
          name: c.name,
          owner_id: user.id,
          updated_at: nowIso
        })
      )

      if (classroomRows.length > 0) {
        const result = await supabaseAdmin
          .from('classrooms')
          .upsert(classroomRows, { onConflict: 'id' })
        if (result.error) throw new Error(result.error.message)
      }

      const studentRows = await buildUpsertRows(
        'students',
        students.filter((s) => s?.id && s?.classroomId),
        (s) =>
        compactObject({
          id: s.id,
          classroom_id: s.classroomId,
          seat_number: s.seatNumber,
          name: s.name,
          owner_id: user.id,
          updated_at: nowIso
        })
      )

      if (studentRows.length > 0) {
        const result = await supabaseAdmin
          .from('students')
          .upsert(studentRows, { onConflict: 'id' })
        if (result.error) throw new Error(result.error.message)
      }

      const assignmentRows = await buildUpsertRows(
        'assignments',
        assignments.filter((a) => a?.id && a?.classroomId),
        (a) =>
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

      if (assignmentRows.length > 0) {
        const result = await supabaseAdmin
          .from('assignments')
          .upsert(assignmentRows, { onConflict: 'id' })
        if (result.error) throw new Error(result.error.message)
      }

      const submissionRows = await buildUpsertRows(
        'submissions',
        submissions.filter((s) => s?.id && s?.assignmentId && s?.studentId),
        (s) => {
          const createdAt = toIsoTimestamp(s.createdAt)
          const gradedAt = toNumber(s.gradedAt)
          const imageUrl =
            s.imageUrl || s.image_url || `submissions/${s.id}.webp`

          return compactObject({
            id: s.id,
            assignment_id: s.assignmentId,
            student_id: s.studentId,
            status: s.status ?? undefined,
            image_url: imageUrl,
            created_at: createdAt ?? undefined,
            score: toNumber(s.score) ?? undefined,
            feedback: s.feedback ?? undefined,
            grading_result: s.gradingResult ?? undefined,
            graded_at: gradedAt ?? undefined,
            correction_count: toNumber(s.correctionCount) ?? undefined,
            owner_id: user.id,
            updated_at: nowIso
          })
        }
      )

      if (submissionRows.length > 0) {
        const result = await supabaseAdmin
          .from('submissions')
          .upsert(submissionRows, { onConflict: 'id' })
        if (result.error) throw new Error(result.error.message)
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
