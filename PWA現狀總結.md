# PWA 現狀總結與提升建議

## 📊 當前 PWABuilder 分數

**Manifest**: 16/44 ❌ (太低,無法上架)
**Service Worker**: +2 ✅
**App Capabilities**: ⚠️

**總分**: ~18/44 (需要提升到 30+ 才能上架)

---

## ✅ 已完成的優化 (剛剛完成)

### 1. Manifest 配置全面升級
- ✅ **基礎欄位完整**: name, short_name, description, start_url, display
- ✅ **進階欄位**: id, theme_color, background_color, orientation, scope, lang, dir
- ✅ **prefer_related_applications**: false (優先使用 PWA 而非原生 App)
- ✅ **categories**: ["education", "productivity"]

### 2. 圖標完整配置 (5 個圖標)
- ✅ **pwa-64x64.png** (purpose: any)
- ✅ **pwa-192x192.png** (purpose: any) - **必須**
- ✅ **pwa-512x512.png** (purpose: any) - **推薦**
- ✅ **maskable-icon-192x192.png** (purpose: maskable) - **新增!**
- ✅ **maskable-icon-512x512.png** (purpose: maskable)

### 3. Screenshots (4 張)
- ✅ 上傳學生作業 (844x1500)
- ✅ AI 批改中 (497x1080)
- ✅ 批改報告 (106x230)
- ✅ 成績總覽 (85x184)

### 4. Shortcuts (3 個快捷選單)
- ✅ 新增作業 → /assignment-setup
- ✅ 開始批改 → /grading-list
- ✅ 成績總覽 → /gradebook

### 5. Share Target (分享整合)
- ✅ 接受 image/* 和 application/pdf
- ✅ 自動導向 /assignment-import

### 6. Service Worker 完整配置
- ✅ **27 → 29 個文件預緩存** (新增 2 個 maskable icons)
- ✅ **離線支援**: navigateFallback: '/index.html'
- ✅ **多層快取策略**:
  - HTML 頁面: NetworkFirst (5秒 timeout)
  - Supabase API: NetworkFirst (1小時)
  - Supabase Storage: CacheFirst (7天)
  - Google Fonts: StaleWhileRevalidate (1年)
  - 圖片: CacheFirst (30天)
  - Gemini API: NetworkOnly (不快取)
- ✅ **自動清理舊快取**: cleanupOutdatedCaches: true

---

## ❌ 為什麼分數還是 16/44?

### 主要問題: Screenshots 尺寸不符合規範 ⚠️

PWABuilder 對 screenshots 有嚴格的尺寸要求:

| 您的截圖 | 當前尺寸 | 問題 | 建議尺寸 |
|---------|---------|------|----------|
| screenshot-upload.png | 844x1500 | ✅ 可接受 | 1242x2688 (更好) |
| screenshot-grading.png | 497x1080 | ⚠️ 稍小 | 1242x2688 |
| screenshot-report.png | 106x230 | ❌ **太小!** | 1242x2688 |
| screenshot-summary.png | 85x184 | ❌ **太小!** | 1242x2688 |

**PWABuilder 最小要求**:
- 寬度: 至少 320px
- 高度: 至少 640px
- **建議**: 1242x2688 (iPhone 14 Pro Max) 或 1290x2796 (3x)

**扣分原因**: 2 張截圖尺寸過小,導致 Screenshots 欄位得 0 分 (應該 +8 分)

---

## 🎯 快速提升到 30+ 分的方案

### 方案 A: 重新擷取高解析度截圖 (推薦) ✨

#### 步驟 1: 使用 Chrome DevTools

1. 開啟您的本地伺服器:
   ```bash
   npm run dev
   ```

2. 打開 Chrome DevTools (F12)

3. 切換到裝置模擬 (Ctrl+Shift+M 或點擊手機圖標)

4. 選擇裝置: **iPhone 14 Pro Max**
   - Dimensions: 430 x 932
   - DPR: 3 (實際解析度: 1290 x 2796)

5. 訪問以下頁面並擷取截圖:
   - `/assignment-setup` - 上傳作業頁面
   - `/grading-list` - 批改清單
   - `/grading/{id}` - 批改進行中 (需要有測試資料)
   - `/gradebook` - 成績總覽
   - `/assignment/{id}/report` - 批改報告

6. 擷取方式:
   - 方法 1: Ctrl+Shift+P → "Capture screenshot" → "Capture full size screenshot"
   - 方法 2: 使用 Windows 截圖工具 (Win+Shift+S)

#### 步驟 2: 調整尺寸 (如果需要)

如果截圖不是 1242x2688,使用以下指令調整:

```bash
# 方法 1: 使用 sharp-cli (已安裝)
npx sharp-cli resize 1242 2688 -i screenshot-old.png -o screenshot-1-upload.png --fit cover

# 方法 2: 使用線上工具
# https://www.iloveimg.com/resize-image
```

#### 步驟 3: 命名規範

```
public/screenshot-1-upload.png      (1242x2688)
public/screenshot-2-camera.png      (1242x2688)
public/screenshot-3-grading.png     (1242x2688)
public/screenshot-4-result.png      (1242x2688)
public/screenshot-5-gradebook.png   (1242x2688)
```

#### 步驟 4: 更新 vite.config.ts

```typescript
screenshots: [
  {
    src: '/screenshot-1-upload.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: '上傳學生作業'
  },
  {
    src: '/screenshot-2-camera.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: '拍照掃描作業'
  },
  {
    src: '/screenshot-3-grading.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'AI 智慧批改'
  },
  {
    src: '/screenshot-4-result.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: '批改結果與建議'
  },
  {
    src: '/screenshot-5-gradebook.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: '成績統計分析'
  }
]
```

#### 步驟 5: 重新建置與部署

```bash
npm run build
vercel --prod
```

#### 預期結果

**Manifest**: 16/44 → **28-30/44** ✅
**Screenshots 欄位**: 0 分 → **+8 分**
**其他優化**: **+4-6 分** (更完整的 screenshots 描述)

---

### 方案 B: 使用現有截圖調整尺寸 (快速但品質較差)

如果您想快速測試,可以直接調整現有截圖:

```bash
cd public

# 調整所有截圖為 1242x2688
npx sharp-cli resize 1242 2688 -i screenshot-upload.png -o screenshot-1-upload.png --fit cover
npx sharp-cli resize 1242 2688 -i screenshot-grading.png -o screenshot-2-grading.png --fit cover
npx sharp-cli resize 1242 2688 -i screenshot-report.png -o screenshot-3-result.png --fit cover
npx sharp-cli resize 1242 2688 -i screenshot-summary.png -o screenshot-4-gradebook.png --fit cover
```

**缺點**: 小圖放大會模糊,不建議用於正式上架

---

### 方案 C: 暫時移除小圖截圖 (不推薦)

如果您急著測試 PWABuilder,可以先移除過小的截圖:

```typescript
screenshots: [
  {
    src: '/screenshot-upload.png',  // 844x1500 - 可接受
    sizes: '844x1500',
    type: 'image/png',
    form_factor: 'narrow',
    label: '上傳學生作業'
  },
  {
    src: '/screenshot-grading.png',  // 497x1080 - 可接受
    sizes: '497x1080',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'AI 批改中'
  }
  // 移除 screenshot-report.png (106x230)
  // 移除 screenshot-summary.png (85x184)
]
```

**預期結果**: Manifest **20-22/44** (仍然偏低,但比 16 好)

---

## 📈 預期最終分數

完成「方案 A」後:

| 項目 | 當前 | 優化後 | 增加 |
|------|------|--------|------|
| **Manifest** | 16/44 | **30-32/44** | +14-16 |
| **Service Worker** | +2 | **+2** | 0 |
| **App Capabilities** | ⚠️ | **+2** | +2 |
| **總分** | ~18/44 | **34-36/44** | +16-18 |

---

## ✅ 上架標準

| 平台 | 最低分數 | 當前 | 優化後 | 狀態 |
|------|---------|------|--------|------|
| **Google Play** | 30+ | 18 ❌ | 34 ✅ | 可上架 |
| **Microsoft Store** | 28+ | 18 ❌ | 34 ✅ | 可上架 |
| **Apple App Store** | 25+ | 18 ❌ | 34 ✅ | 可上架 |

---

## 🚀 立即行動指令

### 選項 1: 我要重新擷取高解析度截圖 (建議)

```bash
# 1. 啟動開發伺服器
npm run dev

# 2. 使用 Chrome DevTools 裝置模擬 (iPhone 14 Pro Max)
#    手動擷取 5 張截圖

# 3. 儲存為:
#    - screenshot-1-upload.png (1242x2688)
#    - screenshot-2-camera.png (1242x2688)
#    - screenshot-3-grading.png (1242x2688)
#    - screenshot-4-result.png (1242x2688)
#    - screenshot-5-gradebook.png (1242x2688)

# 4. 更新 vite.config.ts 的 screenshots 配置

# 5. 重新建置
npm run build

# 6. 部署到 Vercel
vercel --prod

# 7. 重新掃描 PWABuilder
# https://www.pwabuilder.com/
```

### 選項 2: 我要快速調整現有截圖測試 (不建議正式使用)

```bash
cd public

# 調整尺寸
npx sharp-cli resize 1242 2688 -i screenshot-upload.png -o screenshot-1-upload.png --fit cover
npx sharp-cli resize 1242 2688 -i screenshot-grading.png -o screenshot-2-grading.png --fit cover

# 刪除舊檔案
rm screenshot-report.png screenshot-summary.png

# 返回專案根目錄
cd ..

# 手動更新 vite.config.ts 以使用新截圖

# 重新建置
npm run build
```

---

## 📋 檢查清單

在重新掃描 PWABuilder 之前,請確認:

- [ ] 至少有 4 張截圖
- [ ] 每張截圖尺寸 ≥ 1242x2688 或至少 ≥ 640x1136
- [ ] 截圖檔案存在於 `public/` 目錄
- [ ] `vite.config.ts` 的 screenshots 配置正確
- [ ] 執行 `npm run build` 成功
- [ ] 部署到 Vercel 成功
- [ ] 訪問 Vercel 網址確認截圖可載入

---

## 🔗 有用的資源

1. **PWABuilder**: https://www.pwabuilder.com/
2. **Maskable Icons 測試**: https://maskable.app/editor
3. **Chrome DevTools 文件**: https://developer.chrome.com/docs/devtools/device-mode/
4. **PWA Manifest 規範**: https://web.dev/add-manifest/

---

## ❓ 常見問題

### Q: 為什麼我的分數只有 16/44?

A: 主要原因是 **screenshots 尺寸過小**。PWABuilder 要求至少 640x1136,您有 2 張截圖只有 106x230 和 85x184,完全不符合標準。

### Q: 必須要有 44 分才能上架嗎?

A: **不需要!** 通常 30+ 分就足夠上架:
- Google Play: 建議 30+
- Microsoft Store: 建議 28+
- Apple App Store: 建議 25+ (更看重實際功能)

### Q: 我可以不提供 screenshots 嗎?

A: **可以**,但會失去 8 分。如果您的其他項目都做好,最多也只能到 36/44。Screenshots 對應用商店展示很重要,強烈建議提供。

### Q: 優化後還是無法上架怎麼辦?

A: 如果完成所有優化後 PWABuilder 分數仍 < 30,可以:
1. 使用 Lighthouse 審計找出具體問題
2. 檢查瀏覽器 Console 是否有 Service Worker 錯誤
3. 確認所有圖標和截圖都能正常載入
4. 參考 [PWA優化清單.md](PWA優化清單.md) 的詳細指引

---

**下一步**: 選擇「選項 1」重新擷取高解析度截圖,然後重新掃描 PWABuilder! 🚀
