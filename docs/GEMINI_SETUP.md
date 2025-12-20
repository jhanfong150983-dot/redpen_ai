# Google Gemini AI 設定指南

本文檔說明如何申請和設定 Google Gemini API，用於 AI 批改功能。

## 1. 申請 Gemini API Key

### 步驟 1：前往 Google AI Studio

訪問：https://makersuite.google.com/app/apikey

或者：https://aistudio.google.com/app/apikey

### 步驟 2：登入 Google 帳號

使用你的 Google 帳號登入。

### 步驟 3：創建 API Key

1. 點擊 **"Get API key"** 或 **"Create API key"** 按鈕
2. 選擇或創建一個 Google Cloud 專案
3. 點擊 **"Create API key in new project"** 或選擇現有專案
4. 複製生成的 API Key（格式類似：`AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`）

⚠️ **重要**：妥善保管你的 API Key，不要公開分享或提交到 GitHub！

## 2. 設定環境變數

### 方法 1：編輯 .env 檔案

打開專案根目錄的 `.env` 檔案，添加：

```env
VITE_GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

將 `AIzaSyXXX...` 替換為你實際的 API Key。

### 方法 2：從 .env.example 複製

如果 `.env` 不存在，可以從 `.env.example` 複製：

```bash
cp .env.example .env
```

然後編輯 `.env`，填入你的 API Key。

## 3. 重啟開發伺服器

設定完成後，重啟開發伺服器以載入環境變數：

1. 按 `Ctrl+C` 停止當前服務器
2. 重新運行：
   ```bash
   npm run dev
   ```

## 4. 驗證設定

### 檢查 1：查看首頁

訪問 http://localhost:5174，點擊 **「AI 批改」** 按鈕。

如果看到黃色警告訊息：
```
⚠️ Gemini API 未設定，請在 .env 中設定 VITE_GEMINI_API_KEY
```

說明 API Key 沒有正確設定，請檢查：
- `.env` 檔案是否存在
- API Key 格式是否正確（`VITE_GEMINI_API_KEY=...`）
- 是否重啟了開發伺服器

### 檢查 2：瀏覽器控制台

打開瀏覽器控制台（F12），應該看到：
```
✅ Gemini API 已設定
```

如果看到：
```
⚠️ VITE_GEMINI_API_KEY 未設定，AI 批改功能將無法使用
```

說明環境變數未正確載入。

## 5. 使用 AI 批改功能

### 完整流程

1. **創建班級和學生**
   - 點擊「班級設置」
   - 輸入班級名稱和學生人數
   - 提交創建

2. **創建作業**
   - 點擊「作業設置」
   - 選擇班級，輸入作業名稱
   - 提交創建

3. **掃描學生作業**
   - 點擊「作業掃描器」
   - 選擇班級和作業
   - 拍照或上傳學生作業

4. **AI 批改**
   - 點擊「AI 批改」
   - 選擇要批改的作業
   - 點擊「AI 一鍵批改」按鈕
   - 等待批改完成

### 批改結果

批改完成後，每個學生的卡片會顯示：
- **總分**：顯示在卡片右上角
- **評語標籤**：例如「字跡工整」、「計算正確」
- **狀態**：從「已掃描」變為「已批改」

## 6. Gemini API 定價

### 免費額度

Gemini 1.5 Flash 模型提供慷慨的免費額度：

- **每分鐘 15 次請求**
- **每天 1500 次請求**
- **每月 100 萬 tokens**

對於批改作業的場景，免費額度通常足夠使用。

### 付費方案

如果超過免費額度，可以升級到付費方案：

- 訪問：https://console.cloud.google.com/billing
- 啟用 Google Cloud Billing
- 費用詳情：https://ai.google.dev/pricing

## 7. Prompt 設計說明

### 當前 Prompt 結構

```
你是一位國小老師，正在批改學生的手寫作業。

**標準答案：**
q1. 42 (10分)
q2. 正確答案範例 (15分)
總分：25分

**批改要求：**
1. 仔細分析圖片中的手寫答案
2. 對比標準答案，給出每題的分數
3. 總分不得超過 25 分
4. 提供 2-3 條簡短評語

**回傳格式（JSON）：**
{
  "scores": {
    "q1": 分數(number),
    "q2": 分數(number)
  },
  "totalScore": 總分(number),
  "feedback": ["評語1", "評語2", "評語3"]
}
```

### 自定義標準答案

在 `GradingPage.tsx` 的 `handleGradeAll` 函數中，找到：

```typescript
const answerKey: AnswerKey = {
  questions: [
    { id: 'q1', answer: '42', maxScore: 10 },
    { id: 'q2', answer: '正確答案範例', maxScore: 15 }
  ],
  totalScore: 25
}
```

修改為你實際的標準答案。

### 未來改進方向

- 將標準答案存儲在 Assignment 資料表中
- 支援多種題型（選擇題、填空題、問答題）
- 自定義評分規則
- 批改歷史記錄

## 8. 常見問題

### Q: API Key 無效

**錯誤訊息**：`API key not valid`

**解決方法**：
1. 檢查 API Key 是否正確複製（沒有多餘空格）
2. 確認 API Key 是從 Google AI Studio 獲取的
3. 檢查 API Key 是否已啟用

### Q: 超過速率限制

**錯誤訊息**：`Resource has been exhausted (e.g. check quota)`

**解決方法**：
1. 等待 1 分鐘後重試
2. 程式已內建每次批改間隔 1 秒，避免超過限制
3. 如果經常觸發，考慮升級到付費方案

### Q: 圖片無法辨識

**錯誤訊息**：`圖片模糊無法辨識`

**解決方法**：
1. 確保圖片清晰，光線充足
2. 避免反光、陰影
3. 確保字跡工整可辨
4. 重新拍攝或上傳更清晰的圖片

### Q: JSON 解析失敗

**錯誤訊息**：`AI 回應格式不正確`

**可能原因**：
- AI 回應包含額外的文字解釋
- JSON 格式不正確

**解決方法**：
- 程式已自動移除 markdown 代碼塊標記
- 如果持續失敗，請在控制台查看 AI 原始回應
- 考慮調整 Prompt，要求更嚴格的 JSON 格式

## 9. 安全性建議

1. **不要公開 API Key**
   - 不要將 `.env` 提交到 Git
   - 已添加 `.env` 到 `.gitignore`

2. **限制 API Key 權限**
   - 在 Google Cloud Console 中限制 API Key 只能訪問 Gemini API
   - 設定 HTTP referrer 限制（僅允許你的網域）

3. **監控使用量**
   - 定期檢查 API 使用量
   - 設定配額警報

---

**相關文檔**：
- [Google AI Studio](https://makersuite.google.com/)
- [Gemini API 文檔](https://ai.google.dev/docs)
- [定價說明](https://ai.google.dev/pricing)
