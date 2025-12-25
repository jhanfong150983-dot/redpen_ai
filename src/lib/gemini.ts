import {
  db,
  type Submission,
  type GradingResult,
  type AnswerKey,
  type AnswerExtractionCorrection
} from './db'

const geminiProxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/proxy'

// 你這套設計是「一定走 proxy」：有沒有可用最後由 fetch 成功與否決定
export const isGeminiAvailable = true

// 工具：Blob 轉 Base64（去掉 data: 前綴）
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

type GeminiInlineDataPart = {
  inlineData: {
    mimeType: string
    data: string
  }
}

type GeminiRequestPart = string | GeminiInlineDataPart
type GeminiPart = { text: string } | GeminiInlineDataPart

function normalizeParts(parts: GeminiRequestPart[]): GeminiPart[] {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part))
}

async function generateGeminiText(
  modelName: string,
  parts: GeminiRequestPart[]
): Promise<string> {
  const response = await fetch(geminiProxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      model: modelName,
      contents: [{ role: 'user', parts: normalizeParts(parts) }]
    })
  })

  let data: any = null
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `Gemini request failed (${response.status})`
    throw new Error(message)
  }

  const text = (data?.candidates ?? [])
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!text) {
    throw new Error('Gemini response empty')
  }

  return text
}

/**
 * 🔍 模型健診工具
 * 依序測試候選模型，選出可用的一個作為 currentModelName
 */
export async function diagnoseModels() {
  if (!isGeminiAvailable) {
    console.error('Gemini 服務未設定')
    return
  }

  const candidates = ['gemini-3-pro-preview']

  console.log('🩺 開始測試可用的 Gemini 模型...')
  let winnerModel = ''

  for (const modelName of candidates) {
    try {
      console.log(`Testing: ${modelName} ...`)
      const text = await generateGeminiText(modelName, ['Hi'])
      console.log(`✅ ${modelName} 測試成功，回應片段:`, text.slice(0, 10))

      if (!winnerModel) winnerModel = modelName
    } catch (error: any) {
      console.warn(
        `⚠️ ${modelName} 測試失敗:`,
        error.message?.split(':')[0] || error.message
      )
    }
  }

  if (winnerModel) {
    console.log(`✅ 最終決定使用模型: ${winnerModel}`)
    alert(`模型偵測完成！推薦模型：${winnerModel}\n(詳細請看 F12 Console)`)
    return winnerModel
  } else {
    console.error('❌ 所有候選模型都測試失敗，請檢查 API Key 或網路狀態')
    alert('所有模型都無法使用，請檢查 API Key 或網路狀態')
    return 'gemini-1.5-flash' // 保留一個預設退路
  }
}

// 預設使用的模型名稱（會被 diagnoseModels 動態覆蓋）
let currentModelName = 'gemini-3-pro-preview'

export interface ExtractAnswerKeyOptions {
  domain?: string
  priorWeightTypes?: import('./db').QuestionCategoryType[] // Prior Weight：優先級順序

  // @deprecated 已廢棄，請使用 priorWeightTypes 替代
  allowedQuestionTypes?: import('./db').QuestionType[]
}

export interface GradeSubmissionOptions {
  strict?: boolean
  domain?: string
  skipMissingRetry?: boolean
  regrade?: {
    questionIds: string[]
    previousDetails?: Array<{
      questionId?: string
      studentAnswer?: string
      score?: number
      maxScore?: number
      isCorrect?: boolean
      reason?: string
      confidence?: number
    }>
    forceUnrecognizableQuestionIds?: string[]
    mode?: 'correction' | 'missing'
  }
}

const gradingDomainHints: Record<string, string> = {
  國語: `
【評分提示（只影響 isCorrect/score/reason，不得影響 studentAnswer）】
1. 文意題：避免主觀推論，只在 reason 說明「缺哪些關鍵字/要點」。
2. 字音造詞題：檢查學生答案讀音是否符合題目要求（如：ㄋㄨㄥˋ 可答「弄瓦」，不可答「巷弄(ㄌㄨㄥˋ)」），讀音錯誤直接 0 分。
`.trim(),

  數學: `
計算題保留最終數值與必要單位；需公式時留核心公式。
幾何/代數題可列主要結論，避免冗長過程。
`.trim(),

  社會: `
名詞、年代、地點、人物要精確；時間題保留年份或朝代。
請專注於同音異字的錯誤，特別是地名。用字錯誤視為錯誤。例如：九州和九洲。
`.trim(),

  自然: `
保留關鍵名詞、數值、實驗結論；單位必須保留，化學式/符號需完整。
`.trim(),

  英語: `
拼字需精確；大小寫與標點依題幹要求；完形/選擇用正確選項或必要單字短語。
`.trim()
}

function buildGradingDomainSection(domain?: string) {
  const hint = domain ? gradingDomainHints[domain] : ''
  return hint ? hint.trim() : ''
}

async function getRecentAnswerExtractionCorrections(
  domain?: string,
  limit = 5
): Promise<AnswerExtractionCorrection[]> {
  try {
    let collection = db.answerExtractionCorrections.orderBy('createdAt').reverse()
    if (domain) {
      collection = collection.filter((item) => item.domain === domain)
    }
    return await collection.limit(limit).toArray()
  } catch (err) {
    console.warn('無法讀取擷取錯誤紀錄', err)
    return []
  }
}

function buildAnswerKeyPrompt(
  domain?: string,
  priorWeightTypes?: import('./db').QuestionCategoryType[]
) {
  const base = `
從標準答案圖片提取可機器批改的答案表。回傳純 JSON（無 Markdown）：

{
  "questions": [{
    "id": "1",           // 題號
    "type": 1 | 2 | 3,   // 題型分類（必填）
    "maxScore": 5,       // 滿分

    // Type 1 專用：標準答案
    "answer": "正確答案",

    // Type 2 專用：可接受的答案變體
    "referenceAnswer": "範例答案",
    "acceptableAnswers": ["同義詞1", "同義詞2"],

    // Type 3 專用：評分規準
    "referenceAnswer": "評分要點",
    "rubricsDimensions": [
      {"name": "計算過程", "maxScore": 3, "criteria": "步驟清晰"},
      {"name": "最終答案", "maxScore": 2, "criteria": "答案正確"}
    ],
    "rubric": {
      "levels": [
        {"label": "優秀", "min": 9, "max": 10, "criteria": "邏輯清晰完整"},
        {"label": "良好", "min": 7, "max": 8, "criteria": "大致正確"},
        {"label": "尚可", "min": 5, "max": 6, "criteria": "部分正確"},
        {"label": "待努力", "min": 1, "max": 4, "criteria": "多處錯誤"}
      ]
    },

    // AI偏離提醒
    "aiDivergedFromPrior": false,
    "aiOriginalDetection": 1
  }],
  "totalScore": 50
}

【題型分類標準】
Type 1（唯一答案）：精確匹配，答案唯一且不可替換
- 例：是非題(O/X)、選擇題(A/B/C)、計算結果(2+3=5)

Type 2（多答案可接受）：核心答案固定但允許不同表述
- 例：詞義解釋「光合作用」vs「植物製造養分」
- 異音字造詞「ㄋㄨㄥˋ：弄瓦、弄璋」「ㄌㄨㄥˋ：巷弄」（須記錄讀音於 referenceAnswer）
- 相似字造詞「(言部)辯：辯護、爭辯」「(辛部)辨：辨別、分辨」（須記錄部首於 referenceAnswer）

Type 3（依表現給分）：開放式或計算題，需評分規準
- 計算題：用 rubricsDimensions，維度通常包括「計算過程」和「最終答案」
- 申論題：有明確答案要點時用 rubricsDimensions（如：「列舉三個優點」）
- 純評價題：用 rubric 4級評價（優秀/良好/尚可/待努力）

【規則】
- 題號：圖片有就用，無則 1, 2, 3...（不可跳號）
- 配分：圖片有就用，無則估計（是非/選擇 2-5 分，簡答 5-8 分，申論 8-15 分）
- totalScore = 所有 maxScore 總和
- 無法辨識時回傳 {"questions": [], "totalScore": 0}
`.trim()

  let priorHint = ''
  if (priorWeightTypes && priorWeightTypes.length > 0) {
    const typeLabels = priorWeightTypes
      .map((t, i) => {
        const priority = i === 0 ? '最優先' : i === 1 ? '次優先' : '最後'
        const typeName =
          t === 1 ? 'Type 1（唯一答案）' : t === 2 ? 'Type 2（多答案可接受）' : 'Type 3（依表現給分）'
        return `${priority}：${typeName}`
      })
      .join('、')

    priorHint = `

【Prior Weight - 教師指定題型偏好】
教師指定此作業的題型優先級：${typeLabels}

請優先按此順序判斷，但若遇到強烈證據顯示不符時可偏離並設定：
- "aiDivergedFromPrior": true
- "aiOriginalDetection": <你的判斷類型>

注意：只在強烈證據時才偏離，一般情況應遵循 Prior Weight。
`.trim()
  }

  const domainHints: Record<string, string> = {
    國語: `
【寫國字 vs 寫注音題型識別】
- 關鍵判斷依據：看「題目要求」而非「圖片內容」
- 題目文字包含「寫國字」「國字注音」→ 答案應為「國字」
- 題目文字包含「注音」「寫出讀音」→ 答案應為「注音符號」
- 典型場景：
  - 題目：「劈（寫國字）」→ 答案抓「劈」而非「ㄆ一」
  - 題目：「ㄆ一ㄣˊ（寫注音）」→ 答案抓「ㄆ一ㄣˊ」而非「貧」
- ⚠️ 圖片中可能同時有國字和注音，必須依據「題目要求」抓取正確形式

【相近字 vs 同音字 vs 異音字題型】
- 相近字造詞：字形相似（如：辨/辯、嗇/普）
- 同音字造詞：讀音相同字形不同（如：ㄋㄨㄥˋ：弄/農）
- 異音字造詞：同字不同讀音（如：行（ㄏㄤˊ/ㄒㄧㄥˊ））
- 題組中可能混合三種題型，需逐題判斷

【多步驟題型處理】
- 若題目包含「步驟一」「步驟二」等分階段指示
- 應視為 1 題（多維度評分），而非拆成多題
- rubricsDimensions 應包含各步驟的評分維度

【字音辨別造詞題（含注音符號，如：ㄋㄨㄥˋ：____）】
- 判斷為 Type 2
- referenceAnswer 必須包含讀音說明，如「ㄋㄨㄥˋ讀音的詞語」
- acceptableAnswers 列出標準答案中的所有範例詞

【方格框題目識別】
- 定義：連續空白方格（填單字或注音），如：□□□□
- 判定：一行包含連續方格，該行視為 1 題
- 題號生成：有引導文字（如「ㄋㄨㄥˋ：」）就用；無則按順序編號 1,2,3...
- 典型：
  - 注音填寫：「ㄋㄨㄥˋ：□□□□」→ 1 題（Type 2，注音造詞）
  - 生字造詞：「光：□□ □□」→ 1 題（2個詞，Type 2）
`.trim(),
    數學: '數值+單位完整，公式需核心部分',
    社會: '專注同音異字（如：九州≠九洲）',
    自然: '名詞/數值/單位必須完整',
    英語: '拼字/大小寫需精確'
  }

  const domainHint =
    domain && domainHints[domain] ? `\n\n【${domain}提示】\n${domainHints[domain]}` : ''

  return [base, priorHint, domainHint].filter(Boolean).join('\n')
}

/**
 * 後處理：檢查並補充缺失的題目
 */
function fillMissingQuestions(
  result: GradingResult,
  answerKey: AnswerKey
): { result: GradingResult; missingQuestionIds: string[] } {
  const expectedIds = new Set(answerKey.questions.map((q) => q.id))
  const actualIds = new Set((result.details ?? []).map((d) => d.questionId))
  const missingIds = Array.from(expectedIds).filter((id) => !actualIds.has(id))

  if (missingIds.length > 0) {
    console.warn(`⚠️ AI 遺漏了 ${missingIds.length} 題：${missingIds.join(', ')}`)

    const missingDetails = missingIds.map((id) => {
      const question = answerKey.questions.find((q) => q.id === id)
      return {
        questionId: id,
        studentAnswer: '無法辨識',
        score: 0,
        maxScore: question?.maxScore ?? 0,
        isCorrect: false,
        reason: 'AI未能辨識此題答案，已自動標記為0分，需人工複核',
        confidence: 0
      }
    })

    result.details = [...(result.details ?? []), ...missingDetails]

    // ✅ 依 AnswerKey 排序（避免補題跑到最尾端）
    const order = new Map(answerKey.questions.map((q, i) => [q.id, i]))
    result.details.sort((a, b) => {
      const ai = order.get(a.questionId ?? '') ?? 9999
      const bi = order.get(b.questionId ?? '') ?? 9999
      return ai - bi
    })

    // 重新計算 totalScore
    result.totalScore = result.details.reduce((sum, d) => sum + (d.score ?? 0), 0)

    // 標記需要複核
    result.needsReview = true
    result.reviewReasons = [
      ...(result.reviewReasons ?? []),
      `AI 遺漏 ${missingIds.length} 題，已自動補上（${missingIds.join(', ')}）`
    ]
  }

  return { result, missingQuestionIds: missingIds }
}

function isEmptyStudentAnswer(ans?: string) {
  const a = (ans ?? '').trim()
  return a === '未作答' || a === '無法辨識' || a === '未作答/無法辨識'
}

/**
 * 抽取第一個完整 JSON 物件（用括號配對，避免正則截斷）
 */
function extractFirstJsonObject(text: string): string {
  const s = text.trim()
  const start = s.indexOf('{')
  if (start === -1) return s
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return s
}

// ========================
// 新增：兩段式批改 - 類型定義
// ========================
export type ExtractedDetail = {
  questionId: string
  studentAnswer: string
  confidence: number
}

export type ExtractedAnswers = {
  details: ExtractedDetail[]
}

// ========================
// 新增：sanitize 防呆（程式端硬擋）
// ========================
function sanitizeExtractedAnswers(
  extracted: ExtractedAnswers,
  answerKey?: AnswerKey
): { extracted: ExtractedAnswers; reviewFlags: string[] } {
  const reviewFlags: string[] = []
  const answerKeyMap = new Map(answerKey?.questions.map((q) => [q.id, q]))

  const sanitized: ExtractedAnswers = {
    details: extracted.details.map((detail) => {
      // 先 trim 並正規化空白答案
      let studentAnswer = (detail.studentAnswer ?? '').trim()
      if (!studentAnswer) studentAnswer = '未作答'

      const confidence = detail.confidence
      const qid = detail.questionId
      const question = answerKeyMap.get(qid)

      // 跳過已經是「未作答/無法辨識」的答案（避免誤判 & 減少運算）
      if (isEmptyStudentAnswer(studentAnswer)) {
        return { ...detail, studentAnswer }
      }

      // 規則 1：長度 > 40 且 confidence < 85 → 視為高風險改寫
      if (studentAnswer.length > 40 && confidence < 85) {
        reviewFlags.push(`extract_suspect_rewrite:${qid}`)
        return { ...detail, studentAnswer: '無法辨識' }
      }

      // 規則 2：含明顯擴寫/造句跡象（避免誤殺閱讀理解題的正常連接詞）
      const narrativePatterns = /驚喜|耶誕節|畢竟|怎可能|感受到|準備了|令人|讓我|使得|當時|如今|竟然|居然|果然|究竟/
      if (narrativePatterns.test(studentAnswer) && confidence < 90) {
        reviewFlags.push(`extract_suspect_narrative:${qid}`)
        return { ...detail, studentAnswer: '無法辨識' }
      }

      // 規則 3：標準答案語氣（多逗號/句號且字數很長）且 confidence < 90
      const punctuationCount = (studentAnswer.match(/[，。、；]/g) || []).length
      if (punctuationCount >= 2 && studentAnswer.length > 30 && confidence < 90) {
        reviewFlags.push(`extract_suspect_standard_answer:${qid}`)
        return { ...detail, studentAnswer: '無法辨識' }
      }

      // 規則 4：題目配分很低但答案超長
      if (question && question.maxScore <= 5 && studentAnswer.length > 50) {
        reviewFlags.push(`extract_suspect_long_for_small_score:${qid}`)
        return { ...detail, studentAnswer: '無法辨識' }
      }

      return { ...detail, studentAnswer }
    })
  }

  return { extracted: sanitized, reviewFlags }
}

// ========================
// 新增：第一階段 - 純抄寫（不評分）
// ========================
export async function extractStudentAnswers(
  submissionImage: Blob,
  answerKey?: AnswerKey,
  options?: GradeSubmissionOptions
): Promise<ExtractedAnswers> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  console.log(`🔍 階段 1：抽取學生答案（純 OCR）...`)

  const submissionBase64 = await blobToBase64(submissionImage)
  const mimeType = submissionImage.type || 'image/jpeg'

  const promptParts: string[] = []

  let requiredQuestionIds: string[] = []
  if (answerKey) {
    requiredQuestionIds = options?.regrade?.questionIds || answerKey.questions.map((q) => q.id)
    promptParts.push(`
請從學生作業圖片中，抽取以下題號的學生答案：${requiredQuestionIds.join(', ')}

硬約束：
- details 必須包含所有題號：${requiredQuestionIds.join(', ')}（共 ${requiredQuestionIds.length} 題）
- 不得遺漏任何題號
- 不得輸出額外的題號
- details.length 必須等於 ${requiredQuestionIds.length}
- 即使學生未作答也要輸出該題號，studentAnswer 填「未作答」
`.trim())
  } else {
    promptParts.push(`請從學生作業圖片中，抽取所有題目的學生答案。`)
  }

  promptParts.push(`
回傳純 JSON（無 markdown）：
{
  "details": [
    {
      "questionId": "1",
      "studentAnswer": "學生手寫內容（逐字抄寫）",
      "confidence": 0-100
    }
  ]
}
`.trim())

  // 加入近期擷取錯誤參考（幫助模型避免重複錯誤）
  const recentCorrections = await getRecentAnswerExtractionCorrections(options?.domain, 5)
  if (recentCorrections.length > 0) {
    const lines = recentCorrections
      .map((item) => {
        const aiAnswer = item.aiStudentAnswer || '—'
        return `- 題目 ${item.questionId}：AI 曾錯誤輸出「${aiAnswer}」→ 正確應為「${item.correctedStudentAnswer}」`
      })
      .join('\n')

    promptParts.push(`【近期 AI 擷取錯誤參考】\n${lines}`.trim())
  }

  // 硬規則放最後
  promptParts.push(`
【抄寫硬規則（最高優先）】
1. studentAnswer 必須逐字逐畫抄寫圖片中學生的手寫筆跡
2. 禁止改寫、禁止摘要、禁止補全、禁止修正錯字
3. 禁止輸出任何你推測的句子
4. 禁止輸出題目內容
5. 禁止輸出標準答案內容
6. 完全空白 → 只能輸出「未作答」
7. 有筆跡但看不清 → 只能輸出「無法辨識」
8. 允許用「[?]」標記看不清的單字，例如：「光[?]作用」
9. confidence 只反映字跡清晰度，與答案對錯無關
10. 只允許輸出 keys：details、questionId、studentAnswer、confidence；禁止額外 keys（如 notes、commentary）
`.trim())

  const prompt = promptParts.join('\n\n')
  const requestParts: GeminiRequestPart[] = [
    prompt,
    { inlineData: { mimeType, data: submissionBase64 } }
  ]

  const text = (await generateGeminiText(currentModelName, requestParts))
    .replace(/```json|```/g, '')
    .trim()

  // 用括號配對抽取第一個完整 JSON 物件（避免多 JSON 黏在一起）
  const cleaned = extractFirstJsonObject(text)
  let parsed = JSON.parse(cleaned) as ExtractedAnswers

  // 程式端補漏：如果有 answerKey 且 details 有缺題，直接補上「未作答」
  if (requiredQuestionIds.length > 0) {
    const extractedIds = new Set(parsed.details.map((d) => d.questionId))
    const missingIds = requiredQuestionIds.filter((id) => !extractedIds.has(id))

    if (missingIds.length > 0) {
      console.warn(`⚠️ 抽取階段遺漏 ${missingIds.length} 題：${missingIds.join(', ')}，自動補上「未作答」`)
      const missingDetails: ExtractedDetail[] = missingIds.map((id) => ({
        questionId: id,
        studentAnswer: '未作答',
        confidence: 0
      }))
      parsed.details = [...parsed.details, ...missingDetails]

      // 依 answerKey 排序
      if (answerKey) {
        const order = new Map(answerKey.questions.map((q, i) => [q.id, i]))
        parsed.details.sort((a, b) => {
          const ai = order.get(a.questionId) ?? 9999
          const bi = order.get(b.questionId) ?? 9999
          return ai - bi
        })
      }
    }

    // 移除多餘的題號
    const extraDetails = parsed.details.filter((d) => !requiredQuestionIds.includes(d.questionId))
    if (extraDetails.length > 0) {
      console.warn(
        `⚠️ 抽取階段多出 ${extraDetails.length} 題：${extraDetails.map((d) => d.questionId).join(', ')}，已移除`
      )
      parsed.details = parsed.details.filter((d) => requiredQuestionIds.includes(d.questionId))
    }
  }

  console.log(`✅ 階段 1 完成：抽取 ${parsed.details.length} 題`)
  return parsed
}

// ========================
// 新增：第二階段 - 評分（嚴禁改寫 studentAnswer）
// ========================
export async function gradeWithExtractedAnswers(
  extracted: ExtractedAnswers,
  answerKey?: AnswerKey,
  answerKeyImage?: Blob | null,
  options?: GradeSubmissionOptions
): Promise<GradingResult> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  console.log(`📊 階段 2：依標準答案評分...`)

  const promptSections: string[] = []
  let answerKeyImageData: { mimeType: string; data: string } | null = null

  promptSections.push(`
你是一位嚴謹、公正的老師，負責批改學生的紙本作業。
本系統會用在各種科目（例如：國語、英文、數學、自然、社會等），
請主要根據「題目文字」與「標準答案」來判斷對錯，不要憑常識亂猜。
`.trim())

  // 將已抽取的學生答案加入 prompt
  promptSections.push(`
【已抽取的學生答案（不可修改）】
以下是已經抽取完成的學生答案，你必須原封不動使用這些答案進行評分：
${JSON.stringify(extracted.details, null, 2)}

⚠️ 絕對禁止：
- 禁止修改 studentAnswer 的任何內容
- 禁止補全、改寫、修正、優化學生答案
- 你只能依據這些答案進行評分，並在 reason 中說明扣分原因
`.trim())

  if (answerKey) {
    const questionIds = answerKey.questions.map((q) => q.id).join(', ')
    promptSections.push(`
下面是本次作業的標準答案與配分（JSON 格式）：
${JSON.stringify(answerKey)}

【批改流程】
請嚴格依照這份 AnswerKey 逐題批改：

- 必須輸出所有題號：${questionIds}（共 ${answerKey.questions.length} 題）
- 即使學生未作答、空白、或答案完全無法辨識，也必須為該題輸出一條記錄。
- 題號 id 以 AnswerKey 中的 "id" 為主（例如 "1", "1-1"）。

【評分規則】
- studentAnswer 若為「未作答」或「無法辨識」→ 直接 score=0、isCorrect=false、reason 簡短說明
- 其他情況依據 AnswerKey 類型評分：
  - Type 1（精確）：使用 answer 字段嚴格對比。完全相符 → 滿分；不符 → 0分
  - Type 2（模糊）：使用 acceptableAnswers 進行語義匹配。完全/語義相符 → 滿分；部分 → 部分分
    - 字音造詞題：若 referenceAnswer 含讀音說明（如「ㄋㄨㄥˋ讀音」），學生答案必須符合該讀音；讀音錯誤直接 0 分
  - Type 3（評價）：使用 rubricsDimensions 多維度評分，逐維度累計總分；若無維度則用 rubric 4級標準
`.trim())
  } else if (answerKeyImage) {
    const answerKeyBase64 = await blobToBase64(answerKeyImage)
    const mimeType = answerKeyImage.type || 'image/jpeg'
    answerKeyImageData = { mimeType, data: answerKeyBase64 }
    promptSections.push(`
圖片是「標準答案／解答本」。
請先從標準答案圖片中，為每一題抽取「題號、正確答案、配分（可以合理估計）」，
再根據這些標準答案來批改學生作業。
請不要憑空新增題目，也不要改變題號。
`.trim())
  } else {
    promptSections.push(`
目前沒有提供標準答案，請依據你的判斷進行評分。
如需保守推測題意或合理答案，只能寫在 reason（或 mistakes/weaknesses/suggestions）。
`.trim())
  }

  const domainHint = buildGradingDomainSection(options?.domain)
  if (domainHint && options?.domain) {
    promptSections.push(`【${options.domain} 批改要點】\n${domainHint}`.trim())
  }

  if (options?.strict) {
    promptSections.push(`
【嚴謹模式】
- 若題意、字跡或答案不清楚，請判為不給分，並在 reason 說明原因
- 不要推測或補寫；只根據題目文字與標準答案判斷
- 答案不完整或缺少關鍵字/數值時，視為錯誤
- 請再次檢查每題得分與 totalScore 是否一致
`.trim())
  }

  promptSections.push(`
回傳純 JSON：
{
  "totalScore": 整數,
  "details": [
    {
      "questionId": 題號,
      "detectedType": 1|2|3,
      "studentAnswer": 學生答案（必須與輸入完全一致），
      "isCorrect": true/false,
      "score": 得分,
      "maxScore": 滿分,
      "reason": 簡短理由,
      "confidence": 0-100,
      "matchingDetails": {Type 2: {matchedAnswer, matchType: exact|synonym|keyword}},
      "rubricScores": {Type 3: [{dimension, score, maxScore}]}
    }
  ],
  "mistakes": [{id, question, reason}],
  "weaknesses": [概念],
  "suggestions": [建議]
}
`.trim())

  // ✅ 修正：先組裝 prompt，再 push 圖片（提高服從度）
  const prompt = promptSections.join('\n\n')
  const requestParts: GeminiRequestPart[] = [prompt]

  if (answerKeyImageData) {
    requestParts.push({
      inlineData: { mimeType: answerKeyImageData.mimeType, data: answerKeyImageData.data }
    })
  }

  const text = (await generateGeminiText(currentModelName, requestParts))
    .replace(/```json|```/g, '')
    .trim()

  let parsed = JSON.parse(text) as GradingResult

  // 硬性覆蓋：強制使用 extracted 的 studentAnswer
  const extractedMap = new Map(extracted.details.map((d) => [d.questionId, d]))

  if (parsed.details && Array.isArray(parsed.details)) {
    parsed.details = parsed.details.map((detail) => {
      const qid = detail.questionId ?? ''
      if (extractedMap.has(qid)) {
        const extractedDetail = extractedMap.get(qid)!
        return { ...detail, studentAnswer: extractedDetail.studentAnswer }
      }
      return detail
    })
  }

  // 補齊：如果有 answerKey 且模型在第二階段少回了題目，補回來
  if (answerKey && parsed.details) {
    const gradedIds = new Set(parsed.details.map((d) => d.questionId))
    const allRequiredIds = answerKey.questions.map((q) => q.id)
    const missingInGrading = allRequiredIds.filter((id) => !gradedIds.has(id))

    if (missingInGrading.length > 0) {
      console.warn(
        `⚠️ 評分階段遺漏 ${missingInGrading.length} 題：${missingInGrading.join(', ')}，自動補上（使用 extracted 的答案）`
      )
      const missingGradingDetails = missingInGrading.map((id) => {
        const question = answerKey.questions.find((q) => q.id === id)
        const extractedDetail = extractedMap.get(id)
        return {
          questionId: id,
          studentAnswer: extractedDetail?.studentAnswer ?? '未作答',
          score: 0,
          maxScore: question?.maxScore ?? 0,
          isCorrect: false,
          reason: 'AI未回傳此題詳解，需複核',
          confidence: extractedDetail?.confidence ?? 0
        }
      })
      parsed.details = [...parsed.details, ...missingGradingDetails]

      // 依 AnswerKey 排序
      const order = new Map(answerKey.questions.map((q, i) => [q.id, i]))
      parsed.details.sort((a, b) => {
        const ai = order.get(a.questionId ?? '') ?? 9999
        const bi = order.get(b.questionId ?? '') ?? 9999
        return ai - bi
      })

      // 重新計算 totalScore
      parsed.totalScore = parsed.details.reduce((sum, d) => sum + (d.score ?? 0), 0)
    }
  }

  console.log(`✅ 階段 2 完成：評分完成`)
  return parsed
}

// ========================
// 改造：gradeSubmission 改成兩段式流程
// ========================
export async function gradeSubmission(
  submissionImage: Blob,
  answerKeyImage: Blob | null,
  answerKey?: AnswerKey,
  options?: GradeSubmissionOptions
): Promise<GradingResult> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  try {
    console.log(`🧠 使用模型 ${currentModelName} 進行兩段式批改...`)

    // ========================
    // 階段 1：抽取學生答案（純 OCR）
    // ========================
    const extracted = await extractStudentAnswers(submissionImage, answerKey, options)

    // ========================
    // 階段 2：sanitize 防呆
    // ========================
    const { extracted: sanitized, reviewFlags } = sanitizeExtractedAnswers(extracted, answerKey)

    // ========================
    // 階段 3：評分
    // ========================
    let parsed = await gradeWithExtractedAnswers(sanitized, answerKey, answerKeyImage, options)

    // ========================
    // 階段 4：合併 reviewFlags
    // ========================
    if (reviewFlags.length > 0) {
      parsed.needsReview = true
      parsed.reviewReasons = [...(parsed.reviewReasons ?? []), ...reviewFlags]
    }

    // ========================
    // 階段 5：檢查遺漏與異常
    // ========================
    const reviewReasons: string[] = [...(parsed.reviewReasons ?? [])]
    if (!parsed.details || !Array.isArray(parsed.details)) {
      reviewReasons.push('缺少逐題詳解')
    }
    if (parsed.totalScore === 0 && (parsed.details?.length ?? 0) === 0) {
      reviewReasons.push('總分為 0 且缺少逐題詳解，請複核')
    }
    if ((parsed.mistakes?.length ?? 0) === 0 && (parsed.details?.length ?? 0) === 0) {
      reviewReasons.push('未偵測到題目或錯誤，請確認解析是否成功')
    }

    const textBlob = [
      ...(parsed.feedback ?? []),
      ...(parsed.suggestions ?? []),
      ...(parsed.weaknesses ?? [])
    ]
      .join(' ')
      .toLowerCase()

    if (/[?？]|模糊|無法|不確定|看不清楚|not sure|uncertain/.test(textBlob)) {
      reviewReasons.push('模型信心不明或表述不確定')
    }

    parsed.needsReview = reviewReasons.length > 0
    parsed.reviewReasons = reviewReasons

    // ========================
    // 階段 6：後處理補漏（如果有 AnswerKey）
    // ========================
    let missingQuestionIds: string[] = []
    if (answerKey && !options?.regrade?.mode) {
      const fillResult = fillMissingQuestions(parsed, answerKey)
      parsed = fillResult.result
      missingQuestionIds = fillResult.missingQuestionIds
    }

    // ========================
    // 階段 7：自動重試缺失的題目（除非明確跳過）
    // ========================
    if (missingQuestionIds.length > 0 && !options?.skipMissingRetry && !options?.regrade?.mode) {
      console.log(`🔄 自動重試批改缺失的 ${missingQuestionIds.length} 題...`)

      try {
        const retryResult = await gradeSubmission(submissionImage, answerKeyImage, answerKey, {
          ...options,
          skipMissingRetry: true,
          regrade: {
            questionIds: missingQuestionIds,
            previousDetails: parsed.details,
            mode: 'missing'
          }
        })

        if (retryResult.details && Array.isArray(retryResult.details)) {
          const retryDetailsMap = new Map(retryResult.details.map((d) => [d.questionId, d]))

          parsed.details = (parsed.details ?? []).map((detail) => {
            const qid = detail.questionId ?? ''
            if (missingQuestionIds.includes(qid) && retryDetailsMap.has(qid)) {
              const retryDetail = retryDetailsMap.get(qid)
              // ✅ 只有重試不是空答案才替換
              if (retryDetail && !isEmptyStudentAnswer(retryDetail.studentAnswer)) {
                console.log(`✅ 重試成功辨識題目 ${qid}`)
                return retryDetail
              }
            }
            return detail
          })

          parsed.totalScore = (parsed.details ?? []).reduce((sum, d) => sum + (d.score ?? 0), 0)

          const stillMissingIds = (parsed.details ?? [])
            .filter(
              (d) => missingQuestionIds.includes(d.questionId ?? '') && isEmptyStudentAnswer(d.studentAnswer)
            )
            .map((d) => d.questionId)

          if (stillMissingIds.length < missingQuestionIds.length) {
            parsed.reviewReasons = (parsed.reviewReasons ?? []).map((reason) =>
              reason.includes('AI 遺漏')
                ? `AI 遺漏 ${missingQuestionIds.length} 題，重試後仍有 ${stillMissingIds.length} 題無法辨識（${stillMissingIds.join(
                    ', '
                  )}）`
                : reason
            )
          }
        }
      } catch (retryError) {
        console.warn('⚠️ 重試批改失敗:', retryError)
      }
    }

    return parsed
  } catch (error) {
    console.error(`❌ ${currentModelName} 批改失敗:`, error)

    if ((error as any).message?.includes('404') || (error as any).message?.includes('not found')) {
      return {
        totalScore: 0,
        mistakes: [],
        weaknesses: [],
        suggestions: [],
        feedback: [`模型 ${currentModelName} 不存在或不可用`]
      }
    }

    return {
      totalScore: 0,
      mistakes: [],
      weaknesses: [],
      suggestions: [],
      feedback: ['系統錯誤', (error as Error).message]
    }
  }
}

/**
 * 批改多份作業（一鍵批改）
 */
export async function gradeMultipleSubmissions(
  submissions: Submission[],
  answerKeyBlob: Blob | null,
  onProgress: (current: number, total: number) => void,
  answerKey?: AnswerKey,
  options?: GradeSubmissionOptions
) {
  console.log(`📝 開始批量批改 ${submissions.length} 份作業`)

  const workingModel = await diagnoseModels()
  if (workingModel) {
    currentModelName = workingModel
    console.log(`✅ 使用模型: ${workingModel}`)
  }

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i]
    console.log(`\n📄 批改第 ${i + 1}/${submissions.length} 份作業: ${sub.id}`)
    onProgress(i + 1, submissions.length)

    try {
      if (!sub.imageBlob) {
        console.warn(`⚠️ 跳過沒有 imageBlob 的作業: ${sub.id}`)
        failCount++
        continue
      }

      console.log(`🔍 開始批改作業 ${sub.id}...`)
      const result = await gradeSubmission(sub.imageBlob, answerKeyBlob, answerKey, options)
      console.log(`📊 批改結果: 得分 ${result.totalScore}`)

      console.log(`💾 儲存批改結果到資料庫...`)
      await db.submissions.update(sub.id!, {
        status: 'graded',
        score: result.totalScore,
        gradingResult: result,
        gradedAt: Date.now(),
        imageBlob: sub.imageBlob,
        imageBase64: sub.imageBase64
      })

      successCount++
      console.log(
        `✅ 批改成功 (${i + 1}/${submissions.length}): ${sub.id}, 得分: ${result.totalScore}, 累計成功: ${successCount}`
      )
    } catch (e) {
      failCount++
      console.error(`❌ 批改作業失敗 (${i + 1}/${submissions.length}): ${sub.id}`, e)
      console.error(`   累計失敗: ${failCount}`)
    }

    if (i < submissions.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  console.log(`\n🏁 批改完成！總計: ${submissions.length}, 成功: ${successCount}, 失敗: ${failCount}`)
  console.log(`📤 返回結果: { successCount: ${successCount}, failCount: ${failCount} }`)

  return { successCount, failCount }
}

/**
 * 從答案卷圖片中抽取 AnswerKey（給 AssignmentSetup 使用）
 */
export async function extractAnswerKeyFromImage(
  answerSheetImage: Blob,
  opts?: ExtractAnswerKeyOptions
): Promise<AnswerKey> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  console.log('🧾 開始從答案卷圖片抽取 AnswerKey...')
  const imageBase64 = await blobToBase64(answerSheetImage)
  const mimeType = answerSheetImage.type || 'image/jpeg'

  let priorWeightTypes = opts?.priorWeightTypes
  if (!priorWeightTypes && opts?.allowedQuestionTypes && opts.allowedQuestionTypes.length > 0) {
    const { migrateLegacyQuestionType } = await import('./db')
    priorWeightTypes = Array.from(new Set(opts.allowedQuestionTypes.map(migrateLegacyQuestionType))).sort() as import(
      './db'
    ).QuestionCategoryType[]
    console.log('📦 已自動遷移 allowedQuestionTypes 為 priorWeightTypes:', priorWeightTypes)
  }

  const prompt = buildAnswerKeyPrompt(opts?.domain, priorWeightTypes)

  const text = (await generateGeminiText(currentModelName, [
    prompt,
    { inlineData: { mimeType, data: imageBase64 } }
  ]))
    .replace(/```json|```/g, '')
    .trim()

  return JSON.parse(text) as AnswerKey
}

/**
 * 重新分析被標記的題目
 * 只針對 needsReanalysis === true 的題目重新分析
 */
export async function reanalyzeQuestions(
  answerSheetImage: Blob,
  markedQuestions: import('./db').AnswerKeyQuestion[],
  domain?: string,
  priorWeightTypes?: import('./db').QuestionCategoryType[]
): Promise<import('./db').AnswerKeyQuestion[]> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  if (markedQuestions.length === 0) {
    return []
  }

  console.log(`🔄 重新分析 ${markedQuestions.length} 題...`)

  const imageBase64 = await blobToBase64(answerSheetImage)
  const mimeType = answerSheetImage.type || 'image/jpeg'

  const questionIds = markedQuestions.map((q) => q.id).join(', ')
  const basePrompt = buildAnswerKeyPrompt(domain, priorWeightTypes)

  const reanalyzePrompt = `
${basePrompt}

【重新分析模式 - 強制完整輸出】
必須重新分析以下題號：${questionIds}（共 ${markedQuestions.length} 題）

⚠️ 強制要求：
- 必須輸出所有 ${markedQuestions.length} 題的完整資料
- 即使某題在圖片中看不清楚，也必須輸出該題號，並在 referenceAnswer 標記「圖片中無法辨識」
- 題號順序可以不同，但數量必須完全一致
- 禁止遺漏任何題號

其他題目請忽略，不要輸出。

請仔細辨識這些題目的內容，重新判斷類型並提取答案。
`.trim()

  const text = (await generateGeminiText(currentModelName, [
    reanalyzePrompt,
    { inlineData: { mimeType, data: imageBase64 } }
  ]))
    .replace(/```json|```/g, '')
    .trim()

  const result = JSON.parse(text) as import('./db').AnswerKey

  const requestedIds = markedQuestions.map((q) => q.id)
  const returnedIds = result.questions.map((q) => q.id)
  const missingIds = requestedIds.filter((id) => !returnedIds.includes(id))

  if (missingIds.length > 0) {
    console.warn(`⚠️ AI 遺漏了 ${missingIds.length} 題：${missingIds.join(', ')}`)
    console.warn(`要求分析：${requestedIds.join(', ')}`)
    console.warn(`實際回傳：${returnedIds.join(', ')}`)

    const placeholderQuestions = missingIds.map((id) => {
      const originalQuestion = markedQuestions.find((q) => q.id === id)!
      return {
        id,
        type: 2 as import('./db').QuestionCategoryType,
        maxScore: originalQuestion.maxScore || 0,
        referenceAnswer: 'AI 無法從圖片中重新辨識此題，請手動編輯',
        acceptableAnswers: [],
        needsReanalysis: true
      }
    })

    result.questions.push(...placeholderQuestions)
    console.log(`🔧 已自動為遺漏的 ${missingIds.length} 題創建佔位項（需手動編輯）`)
  }

  console.log(`✅ 重新分析完成，共 ${result.questions.length} 題（要求 ${markedQuestions.length} 題）`)

  return result.questions
}

// ========================
// 改動摘要（5 行）
// ========================
// 1. 新增 extractStudentAnswers()：純 OCR 抄寫，禁止評分/改寫/推測
// 2. 新增 gradeWithExtractedAnswers()：依抽取結果評分，硬性覆蓋 studentAnswer
// 3. 新增 sanitizeExtractedAnswers()：程式端防呆，擋改寫/敘事/超長答案
// 4. 改造 gradeSubmission()：兩段式流程（抽取 → sanitize → 評分 → 合併 reviewFlags）
// 5. 修正所有 MIME type：改用 blob.type || 'image/jpeg'（extractAnswerKeyFromImage、reanalyzeQuestions）
