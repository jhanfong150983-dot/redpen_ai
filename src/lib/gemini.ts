import {
  db,
  type Submission,
  type GradingResult,
  type AnswerKey,
  type AnswerExtractionCorrection
} from './db'

const geminiProxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/proxy'
export const isGeminiAvailable = Boolean(geminiProxyUrl)

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

  const candidates = [
    'gemini-2.5-pro',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-image'
  ]

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
let currentModelName = 'gemini-2.5-pro'

export interface ExtractAnswerKeyOptions {
  domain?: string
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


const answerKeyDomainHints: Record<string, string> = {
  '國語': `
- 以關鍵字、成語或句子重點為主，避免抄全文。
- 文意題避免主觀推論，只抽取題幹可判斷的詞。`,
  '數學': `
- 計算題保留最終數值與必要單位；需公式時留核心公式。
- 幾何/代數題可列主要結論，避免冗長過程。`,
  '社會': `
- 名詞、年代、地點、人物要精確；時間題保留年份或朝代。
- 請專注於同音異字的錯誤，特別是地名。用字錯誤視為錯誤。例如：九州和九洲。`,
  '自然': `
- 保留關鍵名詞、數值、實驗結論；單位必須保留，化學式/符號需完整。`,
  '英語': `
- 拼字需精確；大小寫與標點依題幹要求；完形/選擇用正確選項或必要單字短語。`
}

const gradingDomainHints: Record<string, string> = {
  '國語': `
- 以關鍵字、成語或句子重點為主，避免抄全文。
- 文意題避免主觀推論，只抽取題幹可判斷的詞。`,
  '數學': `
- 計算題保留最終數值與必要單位；需公式時留核心公式。
- 幾何/代數題可列主要結論，避免冗長過程。`,
  '社會': `
- 名詞、年代、地點、人物要精確；時間題保留年份或朝代。
- 請專注於同音異字的錯誤，特別是地名。用字錯誤視為錯誤。例如：九州和九洲。`,
  '自然': `
- 保留關鍵名詞、數值、實驗結論；單位必須保留，化學式/符號需完整。`,
  '英語': `
- 拼字需精確；大小寫與標點依題幹要求；完形/選擇用正確選項或必要單字短語。`
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
    let collection = db.answerExtractionCorrections
      .orderBy('createdAt')
      .reverse()
    if (domain) {
      collection = collection.filter((item) => item.domain === domain)
    }
    return await collection.limit(limit).toArray()
  } catch (err) {
    console.warn('無法讀取擷取錯誤紀錄', err)
    return []
  }
}

function buildAnswerKeyPrompt(domain?: string, allowedQuestionTypes?: import('./db').QuestionType[]) {
  const questionTypeLabels: Record<import('./db').QuestionType, string> = {
    truefalse: '是非題',
    choice: '選擇題',
    fill: '填空/簡答式填寫',
    calc: '計算題',
    qa: '問答題',
    short: '簡答題',
    short_sentence: '短句題',
    long: '長句題',
    essay: '作文'
  }

  let typeInstruction = `- 題型：請判斷題目類型並填入 type。若不確定，預設填 "fill"。
  - truefalse：是非題
  - choice：選擇題
  - fill：填空/簡答式填寫
  - calc：計算題
  - qa：問答題
  - short：簡答題
  - short_sentence：短句題
  - long：長句題
  - essay：作文`

  if (allowedQuestionTypes && allowedQuestionTypes.length > 0) {
    const allowedLabels = allowedQuestionTypes.map(t => `${t}（${questionTypeLabels[t]}）`).join('、')
    typeInstruction = `- 題型：本作業的題型範圍限定為【${allowedLabels}】，請在此範圍內判斷題目類型並填入 type。
  - 嚴格限制：type 只能從這些類型中選擇：${allowedQuestionTypes.map(t => `"${t}"`).join(' | ')}
  - 若難以判斷，請選擇最接近的類型，不可使用範圍外的題型`
  }

  const base = `
你是一位嚴謹的老師，要從一張「標準答案／解答本」圖片整理出可機器批改的標準答案表。

只回傳符合此型別的純 JSON（無 Markdown/解釋/註解）：
interface AnswerKey {
  questions: Array<{
    id: string;      // 題號，如 "1", "1-1"
    type: "truefalse" | "choice" | "fill" | "calc" | "qa" | "short" | "short_sentence" | "long" | "essay";
    answer?: string;          // 客觀題：判斷對錯所需的核心字詞/數值
    referenceAnswer?: string; // 主觀題：範例答案或關鍵要點
    rubric?: {
      levels: Array<{
        label: "優秀" | "良好" | "尚可" | "待努力";
        min: number;
        max: number;
        criteria: string;
      }>;
    };
    maxScore: number;// 該題滿分 > 0
  }>;
  totalScore: number; // 為所有 maxScore 之和
}

規則（嚴禁憑空捏造）：
- 題號：圖片有題號就用；看不到則依序用 1, 2...，不可跳號或重複。
${typeInstruction}
- 客觀題（truefalse/choice/fill）：填 answer，只留能判斷對錯的核心字詞/數值。
- 主觀題（calc/qa/short/short_sentence/long/essay）：填 referenceAnswer 與 rubric。
  - rubric 固定 4 級（優秀/良好/尚可/待努力），分數範圍需落在 1~maxScore。
  - criteria 請依題目與 referenceAnswer 擬定，簡潔且可判分。
- 配分：圖片有配分直接用；否則估計：選擇題 2-5 分、填充/是非 2-4 分、簡答 5-8 分、申論 8-15 分；不可為 0。
- totalScore 必須等於所有 maxScore 總和，若不符請重算後回傳。
- 若完全無法辨識任何題目，回傳 { "questions": [], "totalScore": 0 }。若部分題目模糊，就跳過那些題，不要猜。
`.trim()

  const hint = domain ? answerKeyDomainHints[domain] : ''
  return hint ? `${base}\n\n【${domain} 額外規則】${hint.trim()}` : base
}

/**
 * 後處理：檢查並補充缺失的題目
 */
function fillMissingQuestions(
  result: GradingResult,
  answerKey: AnswerKey
): { result: GradingResult; missingQuestionIds: string[] } {
  const expectedIds = new Set(answerKey.questions.map(q => q.id))
  const actualIds = new Set((result.details ?? []).map(d => d.questionId))
  const missingIds = Array.from(expectedIds).filter(id => !actualIds.has(id))

  if (missingIds.length > 0) {
    console.warn(`⚠️ AI 遺漏了 ${missingIds.length} 題：${missingIds.join(', ')}`)

    // 補充缺失的題目
    const missingDetails = missingIds.map(id => {
      const question = answerKey.questions.find(q => q.id === id)
      return {
        questionId: id,
        studentAnswer: '未作答/無法辨識',
        score: 0,
        maxScore: question?.maxScore ?? 0,
        isCorrect: false,
        reason: 'AI未能辨識此題答案，已自動標記為0分，需人工複核',
        confidence: 0
      }
    })

    result.details = [...(result.details ?? []), ...missingDetails]

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

/**
 * 單份作業批改（支援 AnswerKey 與答案卷圖片）
 */
export async function gradeSubmission(
  submissionImage: Blob,
  answerKeyImage: Blob | null,
  answerKey?: AnswerKey,
  options?: GradeSubmissionOptions
): Promise<GradingResult> {
  if (!isGeminiAvailable) throw new Error('Gemini 服務未設定')

  try {
    console.log(`🧠 使用模型 ${currentModelName} 進行批改...`)

    const submissionBase64 = await blobToBase64(submissionImage)
    const requestParts: GeminiRequestPart[] = []

    // --- Prompt 區（通用所有科目） ---
    let prompt = `
你是一位嚴謹、公正的老師，負責批改學生的紙本作業。
本系統會用在各種科目（例如：國語、英文、數學、自然、社會等），
請主要根據「題目文字」與「標準答案」來判斷對錯，不要憑常識亂猜。
`.trim()

    if (answerKey) {
      // 情境 1：已經有結構化 AnswerKey
      const questionIds = answerKey.questions.map(q => q.id).join(', ')
      prompt += `

下面是本次作業的標準答案與配分（JSON 格式）：
${JSON.stringify(answerKey)}

請嚴格依照這份 AnswerKey 逐題批改：
- **必須輸出所有題號**：${questionIds}（共 ${answerKey.questions.length} 題）
- 即使學生未作答、空白、或答案完全無法辨識，也必須為該題輸出一條記錄：
  * studentAnswer 填 "未作答" 或 "無法辨識"
  * score = 0
  * isCorrect = false
  * confidence 可設為 100（因為確實沒寫或確實看不清）
- 每一題都要輸出是否正確與得分。
- 題號 id 以 AnswerKey 中的 "id" 為主（例如 "1", "1-1"）。
- 客觀題（truefalse/choice/fill）使用 answer 判斷對錯。
- 主觀題（calc/qa/short/short_sentence/long/essay）使用 referenceAnswer 與 rubric 判分：
  - 分數需落在 rubric 對應等級的 min~max 區間。
  - reason 請寫出「符合哪個等級」與對應 criteria。
- 學生答案只要清楚寫出關鍵字（例如「黑潮」「黃海」「6/7」等），即使字跡不完美也視為正確。
- 相同的錯誤答案出現在不同題目時，要分別根據各題題意判斷是否錯誤。
`.trim()
    } else if (answerKeyImage) {
      // 情境 2：沒有結構化 AnswerKey，但有答案卷圖片
      const answerKeyBase64 = await blobToBase64(answerKeyImage)
      prompt += `

第一張圖片是「標準答案／解答本」，第二張圖片是「學生作業」。
請先從標準答案圖片中，為每一題抽取「題號、正確答案、配分（可以合理估計）」，
再根據這些標準答案來批改學生作業。
請不要憑空新增題目，也不要改變題號。
`.trim()
      requestParts.push({
        inlineData: { mimeType: 'image/jpeg', data: answerKeyBase64 }
      })
    } else {
      // 情境 3：只有學生作業圖片（最不可靠，只為相容）
      prompt += `

目前沒有提供標準答案，只有學生作業圖片。
請先保守推測每一題題意與合理答案，再進行批改。
只有在你非常有把握的情況下才判為正確，題意不清就視為不給分。
`.trim()
    }

    const domainHint = buildGradingDomainSection(options?.domain)
    if (domainHint && options?.domain) {
      prompt += `

【${options.domain} 批改要點】
${domainHint}
`.trim()
    }

    if (options?.regrade?.questionIds?.length) {
      const questionIds = options.regrade.questionIds
      const previousDetails = options.regrade.previousDetails ?? []
      const forcedIds = options.regrade.forceUnrecognizableQuestionIds ?? []
      const previousAnswerLines = previousDetails
        .filter((detail) => detail?.questionId && questionIds.includes(detail.questionId))
        .map((detail) => {
          const answerText = detail?.studentAnswer ?? ''
          return `- ${detail.questionId}：${answerText}`
        })
        .join('\n')

      prompt += `

【再次批改模式】
- 只重新擷取與批改以下題號：${questionIds.join(', ')}。
- 這些題目的「上一次學生答案」已確認錯誤，不可以再輸出完全相同的 studentAnswer（除非題號在「強制無法辨識清單」）。
- 其他題目請維持原結果，不要改動。
- 請根據未變更題目 + 重新批改題目，更新 mistakes/weaknesses/suggestions 與 totalScore。
- 以下為目前完整批改 details（未標記題目請維持不變）：
${JSON.stringify(previousDetails)}
`.trim()

      if (previousAnswerLines) {
        prompt += `

上一次學生答案（已確認錯誤）：
${previousAnswerLines}
`.trim()
      }

      if (forcedIds.length > 0) {
        prompt += `

強制無法辨識清單：
- 下列題號已由教師標記為「AI無法辨識」，請直接將 studentAnswer 設為 "AI無法辨識"，score=0，isCorrect=false，reason 說明無法辨識。
${forcedIds.map((id) => `- ${id}`).join('\n')}
`.trim()
      }
    }

    const recentCorrections = await getRecentAnswerExtractionCorrections(
      options?.domain,
      5
    )
    if (recentCorrections.length > 0) {
      const lines = recentCorrections
        .map((item) => {
          const aiAnswer = item.aiStudentAnswer || '—'
          return `- 題目 ${item.questionId}：AI「${aiAnswer}」→ 正確「${item.correctedStudentAnswer}」`
        })
        .join('\n')

      prompt += `

【近期 AI 擷取錯誤參考】
以下為教師標記的「AI 擷取錯誤 → 正確答案」對照。請在開始批改前先檢討並校正這些錯誤，避免重蹈覆轍。
請先在內部整理成 3-5 條「避免重犯的辨識原則」，再開始擷取學生答案；原則僅供內部使用，禁止輸出。
完成擷取前，請逐題對照最近錯誤清單做自我檢查。
這些對照是高優先規則，必須優先遵守；僅用於提醒辨識細節，不得推論：
${lines}
`.trim()
    }

    if (options?.strict) {
      prompt += `

【嚴謹模式】
- 若題意、字跡或答案不清楚，請判為不給分，並在 reason 說明原因。
- 不要推測或補寫；只根據題目文字與標準答案判斷。
- 答案不完整或缺少關鍵字/數值時，視為錯誤。
- 請再次檢查每題得分與 totalScore 是否一致。
`.trim()
    }

    prompt += `

【學生答案擷取規則】
- 請辨識圖片中學生手寫的字跡。
- 所見即所得：學生寫什麼字就輸出什麼字；請固執的抄寫不要修正。
- 禁止推論：不可依上下文猜字，字跡顯示什麼就輸出什麼。
- 處理模糊：完全無法辨識的字請輸出「無法辨識」，不要硬猜。
`.trim()

    prompt += `

【單題擷取信心率（0-100）】
- 定義：只根據「擷取學生答案時的猶豫程度」給分，不是圖片清晰度，也不是比對正確答案。
- 100 分（絕對直覺）：答案只有唯一一種解釋，不需推測即可鎖定答案。
- 80-99 分（微小雜訊）：極短瞬間曾考慮雜訊/筆誤，但可排除其他可能。
- 60-79 分（主要歧義）：在兩個或多個答案間猶豫，需要依賴上下文或筆劃做最可能猜測。
- 0-59 分（純粹猜測）：多個候選可能性接近，主觀上非常困惑。
- 在輸出 JSON 前，請在內部針對每一題做「候選人競爭分析」：
  1. 我第一眼看到的字元是什麼？
  2. 是否存在第二候選字元？
  3. 若有第二候選，兩者相似度有多高？
  以上分析僅供內部使用，禁止在輸出中呈現。
`.trim()

    // 要求輸出統一的 JSON 結構（所有科目通用）
    prompt += `

請務必回傳「純 JSON」，不要加上 Markdown 標記，結構如下：

{
  "totalScore": 整數（0 到本份作業總分。若沒有 AnswerKey，可用 0-100）,
  "details": [
    {
      "questionId": "題號（如 1, 1-1）",
      "studentAnswer": "完整還原學生實際寫的內容，包括錯字或無法辨識的部分",
      "isCorrect": true 或 false,
      "score": 已給分數,
      "maxScore": 該題滿分,
      "reason": "為什麼判定對或錯（簡短說明，著重在概念與規則；主觀題需對應 rubric）",
      "matchedLevel": "主觀題可選：優秀/良好/尚可/待努力",
      "confidence": 0-100（擷取學生答案時的猶豫程度）
    }
  ],
  "mistakes": [
    {
      "id": "題號",
      "question": "題目簡要說明",
      "reason": "錯在哪裡（例如：誤把寒流寫成暖流、分數通分錯誤、文意理解錯誤等）"
    }
  ],
  "weaknesses": [
    "需要加強的概念（例如：海流與氣候、分數四則運算、主被動語態、文意理解等）"
  ],
  "suggestions": [
    "針對上述弱點的具體練習建議（例如：重看課本某一節、多做哪一類題型）"
  ]
}

若為「再次批改模式」，details 請只回傳被要求重新批改的題號。
`.trim()

    requestParts.push(prompt)
    requestParts.push({
      inlineData: { mimeType: 'image/jpeg', data: submissionBase64 }
    })

    const text = (await generateGeminiText(currentModelName, requestParts))
      .replace(/```json|```/g, '')
      .trim()

    let parsed = JSON.parse(text) as GradingResult

    const reviewReasons: string[] = []
    if (!parsed.details || !Array.isArray(parsed.details)) {
      reviewReasons.push('缺少逐題詳解')
    }
    if (parsed.totalScore === 0) {
      reviewReasons.push('總分為 0，請複核')
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

    // 步驟 2：後處理補漏（如果有 AnswerKey）
    let missingQuestionIds: string[] = []
    if (answerKey && !options?.regrade?.mode) {
      const fillResult = fillMissingQuestions(parsed, answerKey)
      parsed = fillResult.result
      missingQuestionIds = fillResult.missingQuestionIds
    }

    // 步驟 3：自動重試缺失的題目（除非明確跳過）
    if (
      missingQuestionIds.length > 0 &&
      !options?.skipMissingRetry &&
      !options?.regrade?.mode
    ) {
      console.log(`🔄 自動重試批改缺失的 ${missingQuestionIds.length} 題...`)

      try {
        const retryResult = await gradeSubmission(
          submissionImage,
          answerKeyImage,
          answerKey,
          {
            ...options,
            skipMissingRetry: true, // 防止無限遞迴
            regrade: {
              questionIds: missingQuestionIds,
              previousDetails: parsed.details,
              mode: 'missing'
            }
          }
        )

        // 合併重試結果
        if (retryResult.details && Array.isArray(retryResult.details)) {
          const retryDetailsMap = new Map(
            retryResult.details.map(d => [d.questionId, d])
          )

          parsed.details = (parsed.details ?? []).map(detail => {
            if (
              missingQuestionIds.includes(detail.questionId ?? '') &&
              retryDetailsMap.has(detail.questionId ?? '')
            ) {
              const retryDetail = retryDetailsMap.get(detail.questionId ?? '')
              // 只有當重試結果不是空答案時才替換
              if (
                retryDetail &&
                retryDetail.studentAnswer !== '未作答/無法辨識' &&
                retryDetail.studentAnswer !== '未作答' &&
                retryDetail.studentAnswer !== '無法辨識'
              ) {
                console.log(`✅ 重試成功辨識題目 ${detail.questionId}`)
                return retryDetail
              }
            }
            return detail
          })

          // 重新計算 totalScore
          parsed.totalScore = parsed.details.reduce(
            (sum, d) => sum + (d.score ?? 0),
            0
          )

          // 更新 reviewReasons
          const stillMissingIds = (parsed.details ?? [])
            .filter(
              d =>
                missingQuestionIds.includes(d.questionId ?? '') &&
                (d.studentAnswer === '未作答/無法辨識' ||
                  d.studentAnswer === '未作答' ||
                  d.studentAnswer === '無法辨識')
            )
            .map(d => d.questionId)

          if (stillMissingIds.length < missingQuestionIds.length) {
            parsed.reviewReasons = (parsed.reviewReasons ?? []).map(reason =>
              reason.includes('AI 遺漏')
                ? `AI 遺漏 ${missingQuestionIds.length} 題，重試後仍有 ${stillMissingIds.length} 題無法辨識（${stillMissingIds.join(', ')}）`
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

    if (
      (error as any).message?.includes('404') ||
      (error as any).message?.includes('not found')
    ) {
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
  // 先快速偵測可用模型（只做一次）
  const workingModel = await diagnoseModels()
  if (workingModel) {
    currentModelName = workingModel
  }

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i]
    onProgress(i + 1, submissions.length)

    try {
      if (!sub.imageBlob) {
        console.warn(`跳過沒有 imageBlob 的作業: ${sub.id}`)
        failCount++
        continue
      }
      const result = await gradeSubmission(sub.imageBlob, answerKeyBlob, answerKey, options)

      // 重要：保留 imageBlob，確保批改後仍可預覽
      await db.submissions.update(sub.id!, {
        status: 'graded',
        score: result.totalScore,
        gradingResult: result,
        gradedAt: Date.now(),
        imageBlob: sub.imageBlob  // 保留圖片
      })

      if (result.totalScore === 0) {
        failCount++
      } else {
        successCount++
      }
    } catch (e) {
      console.error(`批改作業 ${sub.id} 失敗:`, e)
      failCount++
    }

    // 簡單延遲，避免打太快
    if (i < submissions.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

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

  const prompt = buildAnswerKeyPrompt(opts?.domain, opts?.allowedQuestionTypes)

  const text = (await generateGeminiText(currentModelName, [
    prompt,
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ]))
    .replace(/```json|```/g, '')
    .trim()

  return JSON.parse(text) as AnswerKey
}








