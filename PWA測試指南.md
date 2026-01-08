# PWA 功能測試指南

## 伺服器已啟動 ✅

**本地網址**: http://localhost:4173/

---

## 測試步驟

### 第一步: 開啟瀏覽器

1. 打開 **Google Chrome** 或 **Microsoft Edge** (推薦)
2. 在網址列輸入: `http://localhost:4173/`
3. 按 Enter

---

### 第二步: 檢查 Service Worker 註冊

#### 方法 1: 查看 Console (推薦)

1. 按 `F12` 打開開發者工具
2. 切換到 **Console (控制台)** 分頁
3. 重新整理頁面 (`Ctrl + R` 或 `F5`)
4. **預期看到**:
   ```
   ✅ 應用已可離線使用
   ```

#### 方法 2: 查看 Application 面板

1. 按 `F12` 打開開發者工具
2. 切換到 **Application** 分頁
3. 左側選單找到 **Service Workers**
4. **預期看到**:
   - ✅ 狀態: **activated and is running**
   - ✅ Source: `sw.js`
   - ✅ 綠色圓點 (表示正在運行)

---

### 第三步: 測試 PWA Manifest

1. 在 **Application** 分頁
2. 左側選單點擊 **Manifest**
3. **預期看到**:
   - ✅ Name: `RedPen AI - 作業批改`
   - ✅ Short name: `RedPen AI`
   - ✅ Start URL: `/`
   - ✅ Theme color: `#2563eb` (藍色)
   - ✅ Display: `standalone`
   - ✅ Icons: 顯示 logo.svg

---

### 第四步: 測試快取 (Cache Storage)

1. 在 **Application** 分頁
2. 左側選單展開 **Cache Storage**
3. **預期看到多個快取**:
   - ✅ `workbox-precache-v2-...` (預快取的靜態資源)
   - ✅ 點開可看到 17 個快取文件:
     - `index.html`
     - `index-*.js`
     - `index-*.css`
     - `workbox-window.prod.es5-*.js`
     - 其他靜態資源

---

### 第五步: 測試離線功能 (重要!)

#### 步驟 5.1: 切換到離線模式

1. 在 **Network (網路)** 分頁
2. 找到頂部的 **Throttling** 下拉選單 (預設是 "No throttling")
3. 選擇 **Offline** (離線)

#### 步驟 5.2: 重新整理頁面

1. 按 `Ctrl + R` 或 `F5` 重新整理
2. **預期結果**:
   - ✅ 頁面**仍然可以正常載入** (從快取載入)
   - ✅ 看到 Landing Page 畫面
   - ❌ YouTube 影片無法播放 (正常,需要網路)
   - ✅ Console 沒有錯誤訊息

#### 步驟 5.3: 恢復線上模式

1. 將 **Throttling** 改回 **No throttling**
2. 重新整理頁面
3. YouTube 影片應該可以正常播放

---

### 第六步: 測試 YouTube 影片

1. 確保在**線上模式** (不是 Offline)
2. 滾動到 "老師的日常,我們懂" 區塊
3. **預期看到**:
   - ✅ YouTube 嵌入式播放器
   - ✅ 可以點擊播放影片
   - ✅ 可以全螢幕觀看
   - ✅ 影片內容: RedPen AI 介紹

---

### 第七步: Lighthouse PWA 審計 (進階)

1. 在開發者工具切換到 **Lighthouse** 分頁
2. 選擇:
   - ✅ Categories: **Progressive Web App**
   - ✅ Device: **Mobile**
3. 點擊 **Analyze page load**
4. **預期分數**:
   - ✅ PWA: **接近 100 分**
   - ✅ Performance: **≥ 80 分**

#### 關鍵檢查項目:
- ✅ "Registers a service worker" (已註冊 Service Worker)
- ✅ "Web app manifest meets the installability requirements" (Manifest 符合安裝要求)
- ✅ "Configured for a custom splash screen" (有自訂啟動畫面)
- ✅ "Sets a theme color for the address bar" (有設定主題顏色)

---

## 常見問題排除

### 問題 1: Console 顯示 "Service Worker 註冊失敗"

**解決方法**:
1. 確認伺服器正在運行 (http://localhost:4173)
2. 清除瀏覽器快取:
   - 開發者工具 → Application → Storage → Clear site data
3. 重新整理頁面

---

### 問題 2: 離線時頁面完全無法載入

**可能原因**:
- Service Worker 尚未安裝完成
- 第一次訪問需要線上模式安裝 Service Worker

**解決方法**:
1. 切換回線上模式 (Online)
2. 重新整理頁面
3. 等待 Console 顯示 "✅ 應用已可離線使用"
4. 再次切換到離線模式測試

---

### 問題 3: YouTube 影片無法播放

**可能原因**:
- 網路問題
- YouTube 嵌入限制

**解決方法**:
1. 確認網路連線正常
2. 檢查 Console 是否有錯誤訊息
3. 嘗試在新分頁直接開啟: https://www.youtube.com/watch?v=gbTN5zb67To

---

## 測試完成檢查清單

完成所有測試後,請確認:

- [ ] Service Worker 已註冊 (Console 有 ✅ 訊息)
- [ ] Manifest 資訊正確顯示
- [ ] Cache Storage 有 17 個預快取文件
- [ ] 離線模式下頁面仍可載入
- [ ] 線上模式下 YouTube 影片可播放
- [ ] Lighthouse PWA 分數 ≥ 80 分

---

## 結束測試

測試完成後,請在終端機按 `Ctrl + C` 停止伺服器。

---

## 下一步

測試通過後,可以繼續:
1. **第二階段**: 生成多尺寸圖標並優化 Manifest
2. **第三階段**: 使用 PWABuilder 打包成原生應用
3. **第四階段**: 上架到應用商店

---

**有任何問題,隨時告訴我!**
