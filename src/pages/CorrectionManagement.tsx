import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader, CheckCircle, Download, Columns } from 'lucide-react'
import { db } from '@/lib/db'
import { requestSync } from '@/lib/sync-events'
import type { Assignment, Classroom, Submission } from '@/lib/db'

interface CorrectionManagementProps {
  assignmentId: string
  onBack?: () => void
}

interface CorrectionItem {
  id: string
  question: string
  reason: string
  done: boolean
}

interface CorrectionCard {
  submissionId: string
  studentId: string
  studentName: string
  seatNumber: number | null
  correctionCount: number
  mistakes: CorrectionItem[]
  imageUrl?: string
}

const escapeXml = (v: string) =>
  (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeHtml = (v: string) =>
  (v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function heatColor(count: number): string {
  if (count >= 6) return 'border-l-4 border-red-500 bg-red-50'
  if (count >= 4) return 'border-l-4 border-red-400 bg-red-50'
  if (count >= 2) return 'border-l-4 border-amber-400 bg-amber-50'
  if (count >= 1) return 'border-l-4 border-amber-200 bg-amber-50'
  return 'border-l-4 border-gray-200 bg-white'
}

export default function CorrectionManagement({
  assignmentId,
  onBack
}: CorrectionManagementProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [cards, setCards] = useState<CorrectionCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [compactMode, setCompactMode] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const a = await db.assignments.get(assignmentId)
        if (!a) throw new Error('找不到這份作業')
        setAssignment(a)

        const c = await db.classrooms.get(a.classroomId)
        if (!c) throw new Error('找不到班級資料')
        setClassroom(c)

        const stu = await db.students
          .where('classroomId')
          .equals(a.classroomId)
          .toArray()
        const subs = await db.submissions
          .where('assignmentId')
          .equals(assignmentId)
          .toArray()

        const mapped = subs.reduce<CorrectionCard[]>((acc, s) => {
          const mistakes = s.gradingResult?.mistakes || []
          if (!mistakes.length) return acc

          const student = stu.find((st) => st.id === s.studentId)
          const imageUrl = s.imageBlob ? URL.createObjectURL(s.imageBlob) : undefined

          const items: CorrectionItem[] = mistakes.map((m) => ({
            id: m.id,
            question: m.question,
            reason: m.reason,
            done: false
          }))

          acc.push({
            submissionId: s.id,
            studentId: s.studentId,
            studentName: student?.name || '未知學生',
            seatNumber: student?.seatNumber ?? null,
            correctionCount: s.correctionCount ?? 0,
            mistakes: items,
            imageUrl
          })
          return acc
        }, [])

        mapped.sort((a, b) => {
          const sa = a.seatNumber ?? 99999
          const sb = b.seatNumber ?? 99999
          if (sa !== sb) return sa - sb
          return a.studentName.localeCompare(b.studentName)
        })

        setCards(mapped)
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : '載入訂正資料失敗')
      } finally {
        setIsLoading(false)
      }
    }
    void load()

    return () => {
      setCards((prev) => {
        prev.forEach((c) => {
          if (c.imageUrl) URL.revokeObjectURL(c.imageUrl)
        })
        return prev
      })
    }
  }, [assignmentId])

  const activeCards = useMemo(
    () =>
      cards
        .filter((c) => c.mistakes.some((m) => !m.done))
        .sort((a, b) => {
          const sa = a.seatNumber ?? 99999
          const sb = b.seatNumber ?? 99999
          if (sa !== sb) return sa - sb
          return a.studentName.localeCompare(b.studentName)
        }),
    [cards]
  )

  const visibleCards = useMemo(
    () => (showCompleted ? cards : activeCards),
    [showCompleted, cards, activeCards]
  )

  const toggleMistake = (submissionId: string, mistakeId: string) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.submissionId !== submissionId) return c
        const mistakes = c.mistakes.map((m) =>
          m.id === mistakeId ? { ...m, done: !m.done } : m
        )
        return { ...c, mistakes }
      })
    )
  }

  const setCorrectionCount = async (submissionId: string, nextCount: number) => {
    const safeCount = Math.max(0, nextCount)
    setCards((prev) =>
      prev.map((c) =>
        c.submissionId === submissionId ? { ...c, correctionCount: safeCount } : c
      )
    )
    try {
      await db.submissions.update(submissionId, {
        correctionCount: safeCount
      } as Partial<Submission>)
      requestSync()
    } catch (e) {
      console.error('更新訂正次數失敗', e)
    }
  }

  const increaseCount = async (submissionId: string) => {
    const current =
      cards.find((c) => c.submissionId === submissionId)?.correctionCount || 0
    await setCorrectionCount(submissionId, current + 1)
  }

  const resetCount = async (submissionId: string) => {
    await setCorrectionCount(submissionId, 0)
  }

  const handleExportExcel = () => {
    const preferred = showCompleted ? cards : activeCards
    const targets = preferred.length > 0 ? preferred : cards
    const sheets = targets
      .map((c, idx) => {
        const seat = c.seatNumber != null ? c.seatNumber.toString() : ''
      const name = c.studentName || `學生${idx + 1}`
      const sheetNameRaw = `${seat ? `${seat}-` : ''}${name}`.slice(0, 25)
      const sheetName = escapeXml(sheetNameRaw || `sheet${idx + 1}`)
      const titleLine = `作業標題：${assignment?.title || ''}`
      const seatNameLine = `座號：${seat || '—'}    姓名：${name}`
        const divider = '-----------------------------------------'
        const mistakesRows = c.mistakes
          .filter((m) => !m.done)
          .map(
            (m) => `<Row>
              <Cell ss:StyleID="cell"><Data ss:Type="String">□</Data></Cell>
              <Cell ss:StyleID="cell"><Data ss:Type="String">${escapeXml(m.question)}</Data></Cell>
              <Cell ss:StyleID="cell"><Data ss:Type="String">${escapeXml(m.reason)}</Data></Cell>
            </Row>`
          )
          .join('')
        return `
        <Worksheet ss:Name="${sheetName}">
          <Table>
            <Column ss:AutoFitWidth="1" ss:Width="40"/>
            <Column ss:AutoFitWidth="1" ss:Width="200"/>
            <Column ss:AutoFitWidth="1" ss:Width="220"/>
            <Row>
              <Cell ss:MergeAcross="2" ss:StyleID="card"><Data ss:Type="String">${escapeXml(titleLine)}</Data></Cell>
            </Row>
            <Row>
              <Cell ss:MergeAcross="2" ss:StyleID="card"><Data ss:Type="String">${escapeXml(seatNameLine)}</Data></Cell>
            </Row>
            <Row>
              <Cell ss:MergeAcross="2" ss:StyleID="card"><Data ss:Type="String">${escapeXml(divider)}</Data></Cell>
            </Row>
            <Row>
              <Cell ss:StyleID="header"><Data ss:Type="String">確認</Data></Cell>
              <Cell ss:StyleID="header"><Data ss:Type="String">錯題</Data></Cell>
              <Cell ss:StyleID="header"><Data ss:Type="String">原因</Data></Cell>
            </Row>
            ${
              mistakesRows ||
              `<Row>
                <Cell ss:StyleID="cell"><Data ss:Type="String">□</Data></Cell>
                <Cell ss:StyleID="cell"><Data ss:Type="String">全部正確</Data></Cell>
                <Cell ss:StyleID="cell"><Data ss:Type="String"></Data></Cell>
              </Row>`
            }
          </Table>
        </Worksheet>`
      })
      .join('\n')

    const xml = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Styles>
        <Style ss:ID="base">
          <Font ss:FontName="標楷體" />
          <Alignment ss:Vertical="Top" ss:WrapText="1"/>
        </Style>
        <Style ss:ID="card">
          <Font ss:FontName="標楷體" ss:Bold="1" />
          <Alignment ss:Vertical="Top" ss:WrapText="1"/>
          <Borders>
            <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
          </Borders>
        </Style>
        <Style ss:ID="header" ss:Parent="card">
          <Font ss:FontName="標楷體" ss:Bold="1" />
          <Alignment ss:Vertical="Center" ss:WrapText="1"/>
        </Style>
        <Style ss:ID="cell" ss:Parent="base">
          <Borders>
            <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
            <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
          </Borders>
        </Style>
      </Styles>
      ${sheets}
    </Workbook>`

    const blob = new Blob([`\uFEFF${xml}`], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '訂正清單.xls'
    a.click()
    URL.revokeObjectURL(url)
  }

  const ensurePdfLibs = async () => {
    const anyWin = window as any
    const load = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = src
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(`載入失敗: ${src}`))
        document.body.appendChild(s)
      })
    if (!anyWin.html2canvas) {
      await load('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')
    }
    if (!anyWin.jspdf) {
      await load('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
    }
  }

  const handleExportPdf = async () => {
    try {
      await ensurePdfLibs()
      const anyWin = window as any
      const targets = activeCards.length > 0 ? activeCards : cards
      if (targets.length === 0) return

      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '800px'
      container.style.fontFamily = 'DFKai-SB, PMingLiU, "Microsoft JhengHei", serif'

      targets.forEach((c) => {
        const seat = c.seatNumber != null ? c.seatNumber.toString() : '—'
        const name = c.studentName
        const card = document.createElement('div')
        card.style.border = '1px solid #000'
        card.style.padding = '16px'
        card.style.marginBottom = '12px'
        card.style.width = '760px'
        card.style.boxSizing = 'border-box'
        card.style.backgroundColor = '#fff'
        card.innerHTML = `
          <div style="font-weight:bold;margin-bottom:6px;">作業標題：${escapeHtml(
            assignment?.title || ''
          )}</div>
          <div style="font-weight:bold;margin-bottom:6px;">座號：${escapeHtml(
            seat
          )}　　姓名：${escapeHtml(name)}</div>
          <div style="margin-bottom:8px;">-----------------------------------------</div>
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <colgroup>
              <col style="width:50px;" />
              <col style="width:200px;" />
              <col style="width:260px;" />
            </colgroup>
            <thead>
              <tr>
                <th style="border:1px solid #000; padding:6px; text-align:center;">確認</th>
                <th style="border:1px solid #000; padding:6px; text-align:center;">錯題</th>
                <th style="border:1px solid #000; padding:6px; text-align:center;">原因</th>
              </tr>
            </thead>
            <tbody>
              ${
                c.mistakes.filter((m) => !m.done).length === 0
                  ? `<tr>
                      <td style="border:1px solid #000; padding:6px; text-align:center; vertical-align:top;">□</td>
                      <td style="border:1px solid #000; padding:6px; word-break:break-word;">全部正確</td>
                      <td style="border:1px solid #000; padding:6px; word-break:break-word;"></td>
                    </tr>`
                  : c.mistakes
                      .filter((m) => !m.done)
                      .map(
                        (m) => `<tr>
                          <td style="border:1px solid #000; padding:6px; text-align:center; vertical-align:top;">□</td>
                          <td style="border:1px solid #000; padding:6px; word-break:break-word;">${escapeHtml(
                            m.question
                          )}</td>
                          <td style="border:1px solid #000; padding:6px; word-break:break-word;">${escapeHtml(
                            m.reason
                          )}</td>
                        </tr>`
                      )
                      .join('')
              }
            </tbody>
          </table>
        `
        container.appendChild(card)
      })

      document.body.appendChild(container)
      const canvases = await Promise.all(
        Array.from(container.children).map((node) =>
          (anyWin.html2canvas as any)(node as HTMLElement, { scale: 2 })
        )
      )

      const { jsPDF } = anyWin.jspdf
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 24
      const usableHeight = pageHeight - margin * 2
      let yCursor = margin
      canvases.forEach((canvas: HTMLCanvasElement) => {
        const imgData = canvas.toDataURL('image/jpeg', 0.95)
        const ratio = Math.min(
          (pageWidth - margin * 2) / canvas.width,
          usableHeight / canvas.height
        )
        const w = canvas.width * ratio
        const h = canvas.height * ratio

        if (yCursor + h > margin + usableHeight) {
          pdf.addPage()
          yCursor = margin
        }
        const x = (pageWidth - w) / 2
        pdf.addImage(imgData, 'JPEG', x, yCursor, w, h)
        yCursor += h + 12
      })
      pdf.save('訂正清單.pdf')
      document.body.removeChild(container)
    } catch (e) {
      console.error('匯出 PDF 失敗', e)
      alert('匯出 PDF 失敗，請再試一次')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-orange-500 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">載入訂正資料中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 p-4">
      <style>
        {`
          @page {
            size: A4;
            margin: 12mm;
          }
          @media print {
            .print-hidden { display: none !important; }
            .print-block { display: block !important; }
            .print-card { break-inside: avoid; page-break-inside: avoid; }
          }
        `}
      </style>
      <div className="max-w-7xl mx-auto pt-8">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors print-hidden"
          >
            <ArrowLeft className="w-5 h-5" />
            返回
          </button>
        )}

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">訂正管理 · 儀表板</h1>
              <p className="text-sm text-gray-600">
                班級：{classroom?.name || '未知班級'} · 作業：{assignment?.title || '未知作業'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                需訂正學生：{activeCards.length} 人
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print-hidden">
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200 text-sm"
              >
                <Download className="w-4 h-4" />
                匯出PDF(卡片)
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1 px-3 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200 text-sm"
              >
                <Download className="w-4 h-4" />
                匯出Excel(分頁)
              </button>
              <button
                type="button"
                onClick={() => setCompactMode((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm bg-white text-gray-700 hover:bg-gray-100 border-gray-200 transition-colors"
              >
                <Columns className="w-4 h-4" />
                {compactMode ? '切換寬鬆視圖' : '切換緊湊視圖'}
              </button>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  showCompleted
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                {showCompleted ? '隱藏已完成' : '顯示已完成'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 print-hidden">
            <p>{error}</p>
          </div>
        )}

        <div
          className={`grid ${compactMode ? 'gap-3' : 'gap-4'} print-hidden`}
          style={
            compactMode
              ? { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }
              : undefined
          }
        >
          {visibleCards.length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-3 2xl:col-span-4 bg-white rounded-xl shadow p-6 text-center text-gray-500">
              {showCompleted ? '目前沒有學生紀錄。' : '目前沒有需要訂正的學生。'}
            </div>
          ) : (
            visibleCards.map((card) => {
              return (
                <div
                  key={card.submissionId}
                  className={`rounded-xl shadow ${compactMode ? 'p-3' : 'p-4'} border border-gray-100 ${heatColor(
                    card.correctionCount || 0
                  )}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                        {card.seatNumber != null
                          ? `${card.seatNumber} ${card.studentName}`
                          : card.studentName}
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        訂正次數：{card.correctionCount || 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void increaseCount(card.submissionId)}
                        className="inline-flex items-center px-2 py-1 rounded-lg bg-white/80 border border-orange-200 text-orange-700 text-xs hover:bg-orange-50"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetCount(card.submissionId)}
                        className="inline-flex items-center px-2 py-1 rounded-lg bg-white/80 border border-gray-200 text-gray-600 text-xs hover:bg-gray-50"
                        title="重置為 0"
                      >
                        0
                      </button>
                    </div>
                  </div>

                  <div className={compactMode ? 'flex flex-wrap gap-1' : 'space-y-2'}>
                    {card.mistakes.map((m) => {
                      const common = {
                        key: m.id,
                        type: 'button' as const,
                        onClick: () => toggleMistake(card.submissionId, m.id)
                      }
                      return compactMode ? (
                        <button
                          {...common}
                          className={`px-2 py-1 rounded border text-left text-xs ${
                            m.done
                              ? 'bg-green-50 border-green-200 text-green-700 line-through'
                              : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                          }`}
                          title={m.reason}
                        >
                          <div className="flex items-center gap-1">
                            {m.done ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <span className="w-3.5 h-3.5 border border-gray-300 rounded-full inline-flex" />
                            )}
                            <span className="font-medium truncate max-w-[140px]">
                              {m.question}
                            </span>
                          </div>
                        </button>
                      ) : (
                        <button
                          {...common}
                          className={`w-full text-left px-3 py-2 rounded-lg border ${
                            m.done
                              ? 'bg-green-50 border-green-200 text-green-700 line-through'
                              : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm">
                            {m.done ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <span className="w-4 h-4 border border-gray-300 rounded-full inline-flex" />
                            )}
                            <span className="font-medium truncate">{m.question}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {m.reason}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}
