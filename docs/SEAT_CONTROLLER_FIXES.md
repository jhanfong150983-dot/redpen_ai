# 🔧 座號控制器修復說明

## 問題總結

### 問題 1：語音識別使用一段時間後當機
**現象**：語音識別運行一段時間後停止響應，無法繼續識別語音

**原因**：
- Web Speech API 的 `continuous: true` 模式下，瀏覽器會在一段時間沒有語音輸入後自動觸發 `onend` 事件
- 原本的實現沒有自動重啟機制，導致一旦 `onend` 被觸發就完全停止

### 問題 2：停止按鈕響應緩慢
**現象**：點擊「停止監聽」按鈕後，需要等待很久才恢復到「開始語音識別」狀態

**原因**：
- 原本的實現在 `stopListening()` 中調用 `recognition.stop()` 後，等待 `onend` 事件觸發才更新 `isListening` 狀態
- `onend` 事件的觸發可能有延遲，導致 UI 更新緩慢

---

## 解決方案

### 修復 1：自動重啟機制

#### 新增的 Ref 狀態
```typescript
const shouldRestartRef = useRef(false)  // 是否應該自動重啟
const isStoppingRef = useRef(false)     // 是否正在停止（防止自動重啟）
```

#### 啟動時啟用自動重啟
```typescript
const startListening = useCallback(() => {
  // ...
  shouldRestartRef.current = true  // ✅ 啟用自動重啟
  isStoppingRef.current = false
  recognitionRef.current.start()
  // ...
}, [])
```

#### 在 onend 中自動重啟
```typescript
recognition.onend = () => {
  console.log('🎤 監聽結束')

  // 如果不是手動停止，且 shouldRestart 為 true，則自動重啟
  if (!isStoppingRef.current && shouldRestartRef.current) {
    console.log('🔄 自動重啟語音識別...')
    setTimeout(() => {
      if (shouldRestartRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start()
        } catch (err) {
          console.error('自動重啟失敗:', err)
          shouldRestartRef.current = false
          setIsListening(false)
        }
      }
    }, 100) // ✅ 延遲 100ms 重啟，避免立即重啟造成的問題
  } else {
    setIsListening(false)
  }
}
```

**效果**：
- ✅ 語音識別會持續運行，即使暫時沒有語音輸入
- ✅ 只有在手動停止時才會真正停止
- ✅ 發生錯誤時會自動停止（不會無限重啟）

---

### 修復 2：立即更新停止狀態

#### 修改前（有延遲）
```typescript
// ❌ 舊版本：等待 onend 事件才更新狀態
const stopListening = useCallback(() => {
  if (recognitionRef.current) {
    recognitionRef.current.stop()
    // 等待 onend 事件觸發 setIsListening(false)
  }
}, [])
```

#### 修改後（立即響應）
```typescript
// ✅ 新版本：立即更新狀態
const stopListening = useCallback(() => {
  console.log('⏹️ 停止語音識別')

  // 立即更新狀態，不等待 onend 事件
  shouldRestartRef.current = false  // 禁用自動重啟
  isStoppingRef.current = true      // 標記為正在停止
  setIsListening(false)             // ✅ 立即更新 UI 狀態

  if (recognitionRef.current) {
    try {
      recognitionRef.current.stop()
    } catch (err) {
      console.error('停止語音識別失敗:', err)
    }
  }
}, [])
```

**效果**：
- ✅ 按鈕立即從「停止監聽」變回「開始語音識別」
- ✅ UI 響應快速，無延遲感
- ✅ 不會因為 `onend` 事件延遲而影響使用體驗

---

### 修復 3：改進錯誤處理

#### 忽略無害的錯誤
```typescript
recognition.onerror = (event) => {
  console.error('語音識別錯誤:', event.error)

  // ✅ 忽略 "no-speech" 錯誤（這是正常的，只是暫時沒有語音）
  if (event.error === 'no-speech') {
    console.log('⏳ 等待語音輸入...')
    return
  }

  // ✅ 忽略 "aborted" 錯誤（這是手動停止造成的）
  if (event.error === 'aborted') {
    console.log('⏹️ 語音識別已中止')
    return
  }

  // 其他錯誤才顯示給用戶
  // ...
}
```

**效果**：
- ✅ 不會因為正常的「沒有語音」而顯示錯誤訊息
- ✅ 用戶體驗更流暢

---

## 測試建議

### 測試場景 1：長時間運行
1. 啟動語音識別
2. 保持沉默 10-20 秒
3. 再次說出座號（例如「五」）
4. **預期結果**：✅ 應該能正常識別並跳轉

### 測試場景 2：快速停止
1. 啟動語音識別
2. 立即點擊「停止監聽」
3. **預期結果**：✅ 按鈕應該立即變回「開始語音識別」（無延遲）

### 測試場景 3：反覆開關
1. 啟動 → 停止 → 啟動 → 停止（重複多次）
2. **預期結果**：✅ 每次都能正常運作，無卡頓

### 測試場景 4：錯誤恢復
1. 啟動語音識別
2. 拒絕麥克風權限
3. **預期結果**：✅ 顯示錯誤訊息，停止監聽，不會無限重試

---

## 控制台日誌

現在你會在控制台看到更詳細的日誌：

```
▶️ 啟動語音識別
🎤 開始監聽...
🎤 語音識別: "五"
✅ 識別到座號: 5
⏳ 等待語音輸入...
🎤 監聽結束
🔄 自動重啟語音識別...
🎤 開始監聽...
⏹️ 停止語音識別
🎤 監聽結束
```

這些日誌可以幫助你了解語音識別的運行狀態。

---

## 技術細節

### 自動重啟流程圖

```
開始語音識別
    ↓
shouldRestartRef = true
isStoppingRef = false
    ↓
recognition.start()
    ↓
onstart → setIsListening(true)
    ↓
持續監聽...
    ↓
[一段時間後] → onend 觸發
    ↓
檢查：!isStoppingRef && shouldRestartRef?
    ├─ 是 → 延遲 100ms → 重新 start()
    └─ 否 → setIsListening(false)
```

### 停止流程圖

```
用戶點擊「停止監聽」
    ↓
立即執行：
- shouldRestartRef = false
- isStoppingRef = true
- setIsListening(false)  ← ✅ UI 立即更新
    ↓
recognition.stop()
    ↓
[稍後] onend 觸發
    ↓
檢查：isStoppingRef === true
    ↓
不自動重啟
```

---

## 性能優化

### 延遲重啟的原因
```typescript
setTimeout(() => {
  recognitionRef.current.start()
}, 100) // 100ms 延遲
```

**為什麼需要延遲**：
- 避免 `stop()` 和 `start()` 調用過於接近
- 給瀏覽器時間完全清理上一個語音識別會話
- 防止「already started」錯誤

---

## 已知限制

1. **瀏覽器限制**：Safari 不支援 Web Speech API
2. **網路需求**：某些瀏覽器需要網路連線進行語音識別
3. **HTTPS 需求**：生產環境需要 HTTPS（開發環境 localhost 可用）
4. **麥克風權限**：需要用戶允許麥克風權限

---

## 更新日期

2024-12-14

## 版本

v1.1.0 - 修復自動重啟和停止延遲問題
