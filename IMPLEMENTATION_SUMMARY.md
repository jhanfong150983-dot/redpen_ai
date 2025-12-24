# 三層評分系統實裝摘要

## 概述
成功實裝了基於「Type 1(精確) / Type 2(模糊) / Type 3(評價)」的分層評分系統。系統現在能在 AI 解析標準答案時自動判定題型分類，並在批改時根據分類採用對應的評分邏輯。

---

## 1. 資料庫 Schema 更新

### [src/lib/db.ts](src/lib/db.ts)

#### 新增型別
- `QuestionCategoryType = 1 | 2 | 3` - 題型分類（精確/模糊/評價）
- `RubricDimension` - 評分維度結構（含 name, maxScore, criteria）

#### AnswerKeyQuestion 新增欄位
```typescript
detectedType?: QuestionCategoryType      // AI 判定的題型
detectionReason?: string                 // 判定理由
acceptableAnswers?: string[]             // Type 2 專用：同義詞清單
rubricsDimensions?: RubricDimension[]   // Type 3 專用：評分維度
```

#### GradingDetail 新增欄位
```typescript
detectedType?: QuestionCategoryType      // 記錄該題的 Type
matchingDetails?: {
  matchedAnswer: string                  // 匹配到的參考答案
  matchType: 'exact'|'synonym'|'keyword' // 匹配方式
}
rubricScores?: Array<{                   // Type 3 各維度分數
  dimension: string
  score: number
  maxScore: number
}>
```

---

## 2. AssignmentSetup 使用者介面更新

### [src/pages/AssignmentSetup.tsx](src/pages/AssignmentSetup.tsx)

#### 題型選擇重構
- 原本的平面題型列表改為「三層分類分組」顯示
- 新增 `QuestionTypeOption` 介面，每個題型包含：
  - `category: 1 | 2 | 3` - 所屬分類
  - `categoryLabel` - 分類標籤（如「客觀題（精確）」）
  - `description` - 簡短說明

#### UI 呈現
```
【Type 1 - 客觀題（精確匹配）】
  ☐ 是非  ☐ 選擇

【Type 2 - 半客觀題（模糊匹配）】
  ☐ 填空  ☐ 計算

【Type 3 - 主觀題（評價標準）】
  ☐ 問答  ☐ 簡答  ☐ 短句  ☐ 長句  ☐ 作文
```

教師可自由複選，包括跨分類複選（如 Type 1 + Type 3）。

---

## 3. AI 標準答案提取 Prompt 優化

### [src/lib/gemini.ts](src/lib/gemini.ts) - `buildAnswerKeyPrompt()`

#### Type 判定邏輯
AI 在提取標準答案時需判定每題屬於：

- **Type 1（精確）**
  - 特徵：唯一絕對答案（如 2+3=5、是非題）
  - 輸出：`detectedType=1`, `answer="標準答案"`, 無需 acceptableAnswers/rubricsDimensions
  - 理由：「只有單一絕對答案」

- **Type 2（模糊）**
  - 特徵：核心答案唯一，但表述多樣（如「玉山」vs「Yushan」「台灣最高峰」）
  - 輸出：`detectedType=2`, `answer="標準"`, `acceptableAnswers=["標準", "Yushan", "台灣最高峰", ...]`
  - 理由：「有標準答案，但允許多種表述」

- **Type 3（評價）**
  - 特徵：開放式問題需評分標準（如作文、申論題）
  - 輸出：`detectedType=3`, `referenceAnswer="範例答案"`, `rubricsDimensions=[{name:"維度名", maxScore:5, criteria:"標準"}, ...]`
  - 理由：「開放式題目需依評分標準判斷」

#### 優先級規則
若使用者選了特定題型範圍：
- **優先符合範圍** - 如使用者只選 Type 1+2，則避免判為 Type 3
- **最接近原則** - 如選項中無 Type 2，某題看似 Type 2，改判為 Type 1（最接近）

---

## 4. AI 批改評分 Prompt 優化

### [src/lib/gemini.ts](src/lib/gemini.ts) - `gradeSubmission()` 中的 prompt 構建

#### 分層評分規則

新增「【分層評分規則】」區塊，具體指導：

**Type 1 - 精確匹配**
```
評分邏輯：完全相符 → 滿分；不符 → 0分
容差：符號變體（○/O/✓/√）、格式空白
matchingDetails: {matchedAnswer: "answer", matchType: "exact"}
```

**Type 2 - 模糊匹配**
```
評分邏輯：
  - 完全匹配同義詞 → 滿分
  - 語義同義 → 滿分（如「玉山」vs「Yushan」）
  - 部分匹配（關鍵字對但不完整） → 部分分
  - 不符 → 0分
優先用 acceptableAnswers 列表，若無則用 answer
matchingDetails: {matchedAnswer: "匹配詞", matchType: "exact"|"synonym"|"keyword"}
```

**Type 3 - 評價標準**
```
評分邏輯：逐維度評估 → 累計總分
使用 rubricsDimensions 的多維度評分
若無 rubricsDimensions 則退回 4 級標準（優秀/良好/尚可/待努力）
rubricScores: [{dimension:"維度名", score: X, maxScore: Y}, ...]
```

#### 輸出 JSON 結構新增欄位
```json
{
  "details": [
    {
      "questionId": "1",
      "detectedType": 1|2|3,
      "studentAnswer": "...",
      "isCorrect": boolean,
      "score": number,
      "maxScore": number,
      "reason": "...",
      "matchingDetails": {...},      // Type 2 專用
      "rubricScores": [...]          // Type 3 專用
    }
  ]
}
```

---

## 5. GradingPage 修改AI判定面板

### [src/pages/GradingPage.tsx](src/pages/GradingPage.tsx)

#### 新增 State
```typescript
const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
const [editingDetectedType, setEditingDetectedType] = useState<1 | 2 | 3 | null>(null)
const [editingAcceptableAnswers, setEditingAcceptableAnswers] = useState<string[]>([])
const [editingRubricsDimensions, setEditingRubricsDimensions] = useState<any[]>([])
```

#### UI 互動流程

1. **題目詳情區塊**新增「修改Type」按鈕
   - 點擊打開修改 AI 判定面板

2. **修改面板**允許教師：
   - **選擇 Type**（Type 1 / Type 2 / Type 3）按鈕
   - **Type 2 特化**：編輯「可接受的答案變體」列表（新增/刪除/編輯）
   - **Type 3 特化**：編輯「評分維度」（維度名稱、最高分；新增/刪除）
   
3. **保存按鈕**
   - 更新 `editableDetails[i]` 中的 `detectedType`, `acceptableAnswers`, `rubricScores`
   - 關閉面板

#### 使用場景
教師解析完標準答案後：
```
1. 檢視各題 AI 判定的 Type
2. 若判定有誤，點「修改Type」按鈕
3. 根據題意調整分類和評分細則
4. 保存後，批改時將採用修改後的判定邏輯
```

---

## 6. 系統流程總結

### 新增作業流程

```
教師新增作業
  ↓
選擇題型範圍（可跨分類複選）
  ↓
上傳標準答案圖片
  ↓
AI 解析 → 判定每題的 Type 1/2/3
  ↓
AI 生成對應的評分資訊
  ├─ Type 1: answer
  ├─ Type 2: answer + acceptableAnswers（同義詞）
  └─ Type 3: referenceAnswer + rubricsDimensions（評分維度）
  ↓
教師可修改 AI 判定（選填）
  ├─ 調整 detectedType
  ├─ 修改同義詞列表（Type 2）
  └─ 調整評分維度（Type 3）
  ↓
保存作業
```

### 批改流程

```
上傳學生作業
  ↓
AI 根據 detectedType 採用分層評分
  ├─ Type 1: 精確字符匹配
  ├─ Type 2: 同義詞/關鍵字模糊匹配
  └─ Type 3: 多維度 rubric 評分
  ↓
AI 輸出評分結果（含 matchingDetails/rubricScores）
  ↓
GradingPage 呈現詳細評分（可修改）
  ├─ 修改分數
  ├─ 修改理由
  └─ 修改 AI 判定（Type/同義詞/維度）
  ↓
保存批改結果
```

---

## 7. 主要改動文件清單

| 文件 | 改動項目 | 重要性 |
|------|--------|--------|
| [src/lib/db.ts](src/lib/db.ts) | 新增 `detectedType`, `acceptableAnswers`, `rubricsDimensions` 欄位 | ⭐⭐⭐ |
| [src/lib/gemini.ts](src/lib/gemini.ts) | 改造 `buildAnswerKeyPrompt()`, 新增分層評分規則 | ⭐⭐⭐ |
| [src/pages/AssignmentSetup.tsx](src/pages/AssignmentSetup.tsx) | 題型選擇 UI 重構為三層分類 | ⭐⭐ |
| [src/pages/GradingPage.tsx](src/pages/GradingPage.tsx) | 新增修改 AI 判定面板 | ⭐⭐ |

---

## 8. 使用指南

### 教師視角

**新增作業時**
1. 選擇題型範圍（可跨分類複選）
2. 上傳標準答案
3. AI 自動判定 Type 並生成同義詞/Rubrics（可選擇修改）

**批改作業時**
1. AI 根據 Type 進行智能評分
2. 若需微調，點「修改Type」按鈕進行精細控制
3. 保存結果

### 開發者視角

**擴展機制**
- `RubricDimension` 介面開放，可自定義維度結構
- `acceptableAnswers` 支援任意字符串列表
- `detectionReason` 保留 AI 判定理由，便於審計

**API 相容性**
- 舊的 `rubric` 欄位保留，新系統優先使用 `rubricsDimensions`
- 向後相容：若 `detectedType` 不存在，系統仍可運作

---

## 9. 後續優化建議

1. **Type 2 同義詞庫擴充**
   - 可在配置文件中預設科目特定的同義詞映射
   - AI 根據 domain 自動擴展同義詞列表

2. **Type 3 Rubrics 模板**
   - 為常見題型（作文、申論）預設 Rubrics 模板
   - 教師可快速套用或自訂

3. **評分準確度跟蹤**
   - 記錄教師對 AI 判定的修改頻率
   - 優化 Type 判定和同義詞生成的 Prompt

4. **批量修改 AI 判定**
   - 支援在 AnswerKey 編輯頁面批量調整多題的 Type/同義詞

---

## 10. 測試檢查清單

- [x] 編譯無誤
- [x] 資料庫 Schema 相容
- [x] AssignmentSetup UI 正確渲染三層分類
- [x] Gemini Prompt 包含 Type 判定邏輯
- [x] GradingPage 修改面板正確打開/保存
- [ ] 端對端測試（上傳標準答案 → AI 判定 → 批改 → 修改 AI 判定）
- [ ] 多題型組合測試
- [ ] 跨科目適配測試

---

**實裝日期**: 2025年12月23日
**版本**: v1.0 - 三層分類系統初版
