/**
 * Phase 4 測試 1: Prompt 長度驗證
 * 目標：確認 Prompt 已從 1500-2200 字精簡至 800-1200 字
 */

function buildAnswerKeyPrompt(domain, priorWeightTypes) {
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
    // 有標準答案+思考過程時：
    "rubricsDimensions": [
      {"name": "計算過程", "maxScore": 3, "criteria": "步驟清晰"},
      {"name": "最終答案", "maxScore": 2, "criteria": "答案正確"}
    ],
    // 純評價題時：
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
  "totalScore": 50  // 所有題目滿分總和
}

【題型分類標準】
- Type 1（唯一答案）：精確匹配，答案唯一且不可替換（如：2+3=5、選擇A）
- Type 2（多答案可接受）：核心答案固定但允許不同表述（如：「光合作用」vs「植物製造養分」）
- Type 3（依表現給分）：開放式或計算題，需評分規準
  · 計算題：用 rubricsDimensions，維度通常包括「計算過程」和「最終答案」
  · 申論題：有明確答案要點時用 rubricsDimensions（如：「列舉三個優點」）
            純評價題時用 rubric 4級評價（如：「你對此事的看法」）

【規則】
- 題號：圖片有就用，無則1, 2, 3...（不可跳號）
- 配分：圖片有就用，無則估計（是非/選擇2-5分，簡答5-8分，申論8-15分）
- totalScore = 所有 maxScore 總和
- 無法辨識時回傳 {"questions": [], "totalScore": 0}
`.trim()

  // Prior Weight 提示
  let priorHint = ''
  if (priorWeightTypes && priorWeightTypes.length > 0) {
    const typeLabels = priorWeightTypes.map((t, i) => {
      const priority = i === 0 ? '最優先' : i === 1 ? '次優先' : '最後'
      const typeName = t === 1 ? 'Type 1（唯一答案）' : t === 2 ? 'Type 2（多答案可接受）' : 'Type 3（依表現給分）'
      return `${priority}：${typeName}`
    }).join('、')

    priorHint = `\n\n【Prior Weight - 教師指定題型偏好】
教師指定此作業的題型優先級：${typeLabels}

請優先按此順序判斷，但若遇到強烈證據顯示不符時（例如明顯的申論題但教師優先Type 1），可偏離並設定：
- "aiDivergedFromPrior": true
- "aiOriginalDetection": <你的判斷類型>

注意：只在強烈證據時才偏離，一般情況應遵循教師的Prior Weight。`
  }

  // 領域提示（精簡版）
  const domainHints = {
    '國語': '關鍵字優先，避免抄全文',
    '數學': '數值+單位完整，公式需核心部分',
    '社會': '專注同音異字（如：九州≠九洲）',
    '自然': '名詞/數值/單位必須完整',
    '英語': '拼字/大小寫需精確'
  }

  const domainHint = domain && domainHints[domain]
    ? `\n\n【${domain}提示】${domainHints[domain]}`
    : ''

  return base + priorHint + domainHint
}

// 測試場景
console.log('='.repeat(60))
console.log('Phase 4 測試 1: Prompt 長度驗證')
console.log('='.repeat(60))

const scenarios = [
  { name: '場景1 (單選 + 數學)', priorWeights: [2], domain: '數學' },
  { name: '場景2 (雙選 + 國語)', priorWeights: [2, 1], domain: '國語' },
  { name: '場景3 (三選 + 自然)', priorWeights: [2, 1, 3], domain: '自然' },
  { name: '場景4 (單選 + 無領域)', priorWeights: [2], domain: undefined },
  { name: '場景5 (三選 + 無領域)', priorWeights: [2, 1, 3], domain: undefined }
]

const results = []

scenarios.forEach(({ name, priorWeights, domain }) => {
  const prompt = buildAnswerKeyPrompt(domain, priorWeights)
  const length = prompt.length
  const inRange = length >= 800 && length <= 1200

  results.push({
    name,
    length,
    inRange,
    status: inRange ? '✅ 通過' : '❌ 不通過'
  })

  console.log(`\n${name}:`)
  console.log(`  字數: ${length}`)
  console.log(`  範圍: 800-1200`)
  console.log(`  結果: ${inRange ? '✅ 通過' : '❌ 不通過'}`)
})

console.log('\n' + '='.repeat(60))
console.log('測試結果摘要')
console.log('='.repeat(60))

const allPassed = results.every(r => r.inRange)
const minLength = Math.min(...results.map(r => r.length))
const maxLength = Math.max(...results.map(r => r.length))

console.log(`\n所有場景字數範圍: ${minLength} - ${maxLength}`)
console.log(`目標範圍: 800 - 1200`)
console.log(`\n通過場景: ${results.filter(r => r.inRange).length}/${results.length}`)
console.log(`\n最終結果: ${allPassed ? '✅ 全部通過' : '❌ 部分失敗'}`)

// 詳細輸出（可選）
console.log('\n' + '='.repeat(60))
console.log('詳細 Prompt 內容（場景3）')
console.log('='.repeat(60))
const detailedPrompt = buildAnswerKeyPrompt('自然', [2, 1, 3])
console.log(detailedPrompt)

process.exit(allPassed ? 0 : 1)
