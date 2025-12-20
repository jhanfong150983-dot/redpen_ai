# 🎤 座號控制器 Hook 使用指南

## 概述

`useSeatController` 是一個自定義 React Hook，提供座號管理和語音識別功能。

## 功能特性

✅ **座號管理**
- 自動遞增座號
- 跳轉到指定座號
- 座號範圍驗證（不超過最大值）

✅ **語音識別**
- Web Speech API 整合
- 支援中文和阿拉伯數字識別
- 自動跳轉到語音識別的座號

✅ **瀏覽器兼容性**
- 自動檢測瀏覽器支援度
- Chrome/Edge 完整支援
- Safari 不支援語音識別（會顯示提示）

✅ **錯誤處理**
- 麥克風權限管理
- 網路錯誤處理
- 用戶友善的錯誤訊息

---

## 安裝與導入

```typescript
import { useSeatController } from '@/hooks/useSeatController'
```

---

## 基本用法

### 最簡單的使用方式

```typescript
function MyComponent() {
  const { currentSeat, nextSeat } = useSeatController({ maxSeat: 30 })

  return (
    <div>
      <h1>座號: {currentSeat}</h1>
      <button onClick={nextSeat}>下一位</button>
    </div>
  )
}
```

### 完整功能使用

```typescript
function AdvancedComponent() {
  const {
    currentSeat,
    nextSeat,
    jumpToSeat,
    resetSeat,
    isListening,
    startListening,
    stopListening,
    isSupported,
    error
  } = useSeatController({
    maxSeat: 30,
    autoStart: false,
    onSeatChange: (seat) => {
      console.log('座號切換到:', seat)
    }
  })

  return (
    <div>
      {/* 當前座號 */}
      <h1>當前座號: {currentSeat}</h1>

      {/* 控制按鈕 */}
      <button onClick={nextSeat}>下一位</button>
      <button onClick={() => jumpToSeat(10)}>跳到第 10 位</button>
      <button onClick={resetSeat}>重置</button>

      {/* 語音控制 */}
      {isSupported ? (
        <button onClick={isListening ? stopListening : startListening}>
          {isListening ? '停止監聽' : '開始語音識別'}
        </button>
      ) : (
        <p>您的瀏覽器不支援語音識別</p>
      )}

      {/* 錯誤訊息 */}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

---

## API 參考

### 參數 (Options)

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `maxSeat` | `number` | ✅ | - | 最大座號 |
| `autoStart` | `boolean` | ❌ | `false` | 是否自動啟動語音識別 |
| `onSeatChange` | `(seat: number) => void` | ❌ | - | 座號改變時的回調函數 |

### 返回值 (Return)

| 屬性 | 類型 | 說明 |
|------|------|------|
| `currentSeat` | `number` | 當前座號 |
| `nextSeat` | `() => void` | 下一個座號（+1，不超過最大值） |
| `jumpToSeat` | `(seat: number) => void` | 跳轉到指定座號 |
| `resetSeat` | `() => void` | 重置座號到 1 |
| `isListening` | `boolean` | 是否正在監聽語音 |
| `startListening` | `() => void` | 啟動語音識別 |
| `stopListening` | `() => void` | 停止語音識別 |
| `isSupported` | `boolean` | 瀏覽器是否支援語音識別 |
| `error` | `string \| null` | 錯誤訊息 |

---

## 語音識別功能

### 支援的數字格式

#### 阿拉伯數字
- "1", "2", "3", ..., "30"
- "5" → 跳到第 5 號
- "15" → 跳到第 15 號

#### 中文數字（簡體/繁體）
- 單位數：「一」、「二」、「三」、「四」、「五」、「六」、「七」、「八」、「九」
- 十位數：「十」、「十一」、「十五」、「二十」、「二十三」
- 繁體：「壹」、「貳」、「參」、「肆」、「伍」、「陸」、「柒」、「捌」、「玖」、「拾」

#### 範例
| 語音輸入 | 識別結果 |
|----------|----------|
| "五" | 5 |
| "十" | 10 |
| "十五" | 15 |
| "二十" | 20 |
| "二十三" | 23 |
| "5" | 5 |
| "15" | 15 |

### 使用語音識別

```typescript
const { startListening, stopListening, isListening } = useSeatController({ maxSeat: 30 })

// 啟動語音識別
startListening()

// 說出座號，例如："五" 或 "15"
// 系統會自動跳轉到對應座號

// 停止語音識別
stopListening()
```

### 瀏覽器兼容性

| 瀏覽器 | 支援度 |
|--------|--------|
| Chrome | ✅ 完整支援 |
| Edge | ✅ 完整支援 |
| Firefox | ⚠️ 部分支援（需啟用） |
| Safari | ❌ 不支援 |

**建議**: 使用 Chrome 或 Edge 以獲得最佳體驗。

---

## 錯誤處理

### 常見錯誤訊息

| 錯誤類型 | 錯誤訊息 | 解決方法 |
|----------|----------|----------|
| `no-speech` | 未檢測到語音 | 確保麥克風正常，重新嘗試 |
| `audio-capture` | 未找到麥克風 | 檢查麥克風連接 |
| `not-allowed` | 麥克風權限被拒絕 | 在瀏覽器設定中允許麥克風權限 |
| `network` | 網路錯誤 | 檢查網路連線 |

### 檢查瀏覽器支援

```typescript
const { isSupported, error } = useSeatController({ maxSeat: 30 })

if (!isSupported) {
  return <div>您的瀏覽器不支援語音識別，建議使用 Chrome</div>
}

if (error) {
  return <div className="error">{error}</div>
}
```

---

## 完整範例

### 作業批改場景

```typescript
import { useSeatController } from '@/hooks/useSeatController'
import { useState } from 'react'

function AssignmentGrading() {
  const [submissions, setSubmissions] = useState<Record<number, string>>({})

  const {
    currentSeat,
    nextSeat,
    jumpToSeat,
    isListening,
    startListening,
    stopListening,
    isSupported
  } = useSeatController({
    maxSeat: 30,
    onSeatChange: (seat) => {
      console.log(`正在批改第 ${seat} 號學生的作業`)
    }
  })

  const handleSubmit = (feedback: string) => {
    setSubmissions({ ...submissions, [currentSeat]: feedback })
    nextSeat() // 批改完成後自動跳到下一位
  }

  return (
    <div>
      <h1>批改第 {currentSeat} 號學生作業</h1>

      {/* 語音控制 */}
      {isSupported && (
        <div>
          <button onClick={isListening ? stopListening : startListening}>
            {isListening ? '🔴 停止語音' : '🎤 語音跳轉'}
          </button>
          {isListening && <p>請說出座號...</p>}
        </div>
      )}

      {/* 作業內容 */}
      <textarea
        placeholder="輸入評語..."
        onChange={(e) => handleSubmit(e.target.value)}
      />

      {/* 導航按鈕 */}
      <button onClick={nextSeat}>下一位 →</button>
    </div>
  )
}
```

---

## 開發者提示

### 除錯模式

Hook 會在控制台輸出詳細的語音識別資訊：

```
🎤 語音識別: "十五"
✅ 識別到座號: 15
```

打開瀏覽器控制台 (F12) 查看即時語音識別結果。

### 性能優化

- 使用 `useCallback` 優化函數引用
- 語音識別實例會被正確清理（避免記憶體洩漏）
- 座號驗證防止超出範圍

### 注意事項

1. **語音識別需要麥克風權限**：首次使用時瀏覽器會請求權限
2. **需要 HTTPS**：在生產環境中，Web Speech API 需要 HTTPS 連線
3. **持續監聽**：語音識別會持續監聽直到手動停止
4. **網路需求**：某些瀏覽器的語音識別需要網路連線

---

## 測試

訪問測試頁面查看完整示範：

```
http://localhost:5174
```

點擊「測試座號控制器」按鈕進入演示頁面。

---

## TypeScript 支援

Hook 完全使用 TypeScript 編寫，提供完整的類型定義。

```typescript
interface UseSeatControllerOptions {
  maxSeat: number
  autoStart?: boolean
  onSeatChange?: (seat: number) => void
}

interface UseSeatControllerReturn {
  currentSeat: number
  nextSeat: () => void
  jumpToSeat: (seat: number) => void
  resetSeat: () => void
  isListening: boolean
  startListening: () => void
  stopListening: () => void
  isSupported: boolean
  error: string | null
}
```

---

## License

MIT
