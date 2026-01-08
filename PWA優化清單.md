# PWA 優化清單 - 提升 PWABuilder 分數

## 📊 當前狀態

**Manifest**: 16/44 → 目標: 35+/44
**Service Worker**: +2 ✅
**App Capabilities**: ⚠️ 需要優化

---

## ✅ 已完成的優化

### 1. Manifest 基礎配置
- ✅ **name**: "RedPen AI - 作業批改"
- ✅ **short_name**: "RedPen AI"
- ✅ **description**: 完整描述
- ✅ **start_url**: "/"
- ✅ **display**: "standalone"
- ✅ **theme_color**: "#2563eb"
- ✅ **background_color**: "#ffffff"
- ✅ **id**: "/" (穩定識別碼)
- ✅ **lang**: "zh-TW"
- ✅ **dir**: "ltr"
- ✅ **scope**: "/"
- ✅ **orientation**: "any"
- ✅ **categories**: ["education", "productivity"]
- ✅ **prefer_related_applications**: false

### 2. 圖標配置
- ✅ **64x64 PNG** (purpose: any)
- ✅ **192x192 PNG** (purpose: any) - **必須**
- ✅ **512x512 PNG** (purpose: any) - **推薦**
- ✅ **512x512 PNG** (purpose: maskable) - Android 適應性圖標

### 3. Screenshots (應用商店展示)
- ✅ 4 張螢幕截圖
  - 上傳學生作業 (844x1500)
  - AI 批改中 (497x1080)
  - 批改報告 (106x230)
  - 成績總覽 (85x184)

### 4. Shortcuts (快捷選單)
- ✅ 新增作業
- ✅ 開始批改
- ✅ 成績總覽

### 5. Share Target (分享整合)
- ✅ 接受 image/* 和 application/pdf
- ✅ 導向 /assignment-import

### 6. Service Worker
- ✅ 已註冊並運行
- ✅ 預緩存 27 個文件
- ✅ 離線支援 (navigateFallback)
- ✅ 多層快取策略
- ✅ 自動清理舊快取

---

## 🔍 PWABuilder 可能扣分的原因

### Manifest 分數低的常見原因:

#### 1. **Screenshots 尺寸不符合建議** ⚠️
**問題**: 您的截圖尺寸太小
- screenshot-report.png: 106x230 (太小!)
- screenshot-summary.png: 85x184 (太小!)

**建議尺寸**:
- **手機**: 1242x2688 (iPhone 14 Pro Max)
- **平板**: 2048x2732 (iPad Pro 12.9")
- **最小**: 320x640

**解決方案**: 重新擷取高解析度截圖

#### 2. **缺少寬螢幕截圖** ⚠️
**問題**: 只有 narrow (手機) 截圖,缺少 wide (平板/桌面)

**建議**: 添加 2-3 張 wide 截圖
```json
{
  "src": "/screenshot-desktop-1.png",
  "sizes": "1920x1080",
  "type": "image/png",
  "form_factor": "wide",
  "label": "桌面版批改介面"
}
```

#### 3. **缺少 IARC 評級** ⚠️
**問題**: 沒有 `iarc_rating_id`

**說明**: 這是應用商店上架時才填寫的,現在可以忽略

#### 4. **缺少更多 Maskable Icons** ⚠️
**建議**: 添加 192x192 的 maskable icon
```json
{
  "src": "/maskable-icon-192x192.png",
  "sizes": "192x192",
  "type": "image/png",
  "purpose": "maskable"
}
```

---

## 🎯 提升分數的行動方案

### 優先級 1: 修正截圖 (預計 +8 分)

#### 步驟 1: 使用 Chrome DevTools 重新擷取

1. **開啟 Chrome DevTools** (F12)
2. **切換到裝置模擬** (Ctrl+Shift+M)
3. **選擇裝置**: iPhone 14 Pro Max (430x932)
4. **設定比例**: DPR 3x (實際解析度: 1290x2796)
5. **擷取畫面**:
   - 上傳作業頁面
   - 相機拍攝頁面
   - AI 批改中畫面
   - 批改結果頁面
   - 成績總覽頁面

#### 步驟 2: 壓縮圖片
```bash
# 使用 TinyPNG 或 ImageMagick
convert screenshot-upload.png -resize 1242x2688 -quality 85 screenshot-1-upload.png
```

#### 步驟 3: 更新 manifest
```typescript
screenshots: [
  {
    src: '/screenshot-1-upload.png',
    sizes: '1242x2688',
    type: 'image/png',
    form_factor: 'narrow',
    label: '上傳學生作業'
  },
  // ... 其他 4 張
]
```

### 優先級 2: 添加 192x192 Maskable Icon (預計 +2 分)

```bash
# 使用 @vite-pwa/assets-generator 重新生成
npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.png
```

更新 manifest:
```typescript
icons: [
  // ... 現有圖標
  {
    src: '/maskable-icon-192x192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'maskable'
  }
]
```

### 優先級 3: 添加寬螢幕截圖 (預計 +3 分)

擷取 2 張桌面版截圖:
- 批改介面全景 (1920x1080)
- 成績統計儀表板 (1920x1080)

### 優先級 4: 優化 Service Worker (App Capabilities)

#### 確保通過的項目:
- ✅ Service Worker 已註冊
- ✅ 離線頁面可用
- ✅ 快取策略完整
- ⚠️ **可能缺少**: Web Push Notifications (可選)

---

## 🚀 快速修正指令

### 1. 重新生成圖標 (包含 192 maskable)
```bash
npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.png
```

### 2. 重新建置
```bash
npm run build
```

### 3. 部署到 Vercel
```bash
vercel --prod
```

### 4. 重新掃描 PWABuilder
- 前往: https://www.pwabuilder.com/
- 輸入新的 Vercel 網址
- 查看更新後的分數

---

## 📋 PWABuilder 評分標準 (44 分滿分)

### Manifest (最多 30 分)
- **基礎欄位** (10 分): name, short_name, description, start_url, display, icons
- **進階欄位** (8 分): id, theme_color, background_color, orientation, scope
- **Screenshots** (8 分): 至少 4 張,符合尺寸規範
- **Shortcuts** (2 分): 至少 2 個快捷選單
- **Share Target** (2 分): 支援分享整合

### Service Worker (最多 10 分)
- **基礎註冊** (5 分): Service Worker 已註冊
- **離線支援** (3 分): navigateFallback 配置
- **快取策略** (2 分): runtimeCaching 完整

### App Capabilities (最多 4 分)
- **安裝提示** (2 分): beforeinstallprompt 事件處理
- **通知功能** (2 分): Push Notifications (可選)

---

## ✨ 預期結果

完成以上優化後:

**Manifest**: 16/44 → **30-32/44** ✅
**Service Worker**: +2 → **+2** ✅
**App Capabilities**: ⚠️ → **+2** ✅

**總分**: 18/44 → **34-36/44** 🎉

**結論**: **可以上架!** Google Play 和 Microsoft Store 通常接受 30+ 分的 PWA

---

## 🔗 有用的工具

1. **Maskable.app**: https://maskable.app/editor
   - 測試 maskable icons 在不同形狀下的顯示

2. **PWA Asset Generator**:
   ```bash
   npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.png
   ```

3. **Lighthouse CI**:
   ```bash
   npx @lhci/cli autorun --collect.url=http://localhost:4173
   ```

4. **Real Favicon Generator**: https://realfavicongenerator.net/
   - 生成完整的 favicon 套件

---

## ⚠️ 重要提醒

### 為什麼分數不是 44/44?

某些項目是**應用商店上架時才填寫**的:
- **iarc_rating_id**: IARC 年齡分級認證碼
- **related_applications**: 關聯的原生 App
- **display_override**: 進階顯示模式
- **scope_extensions**: 多域名支援

這些是**可選項目**,不影響 PWA 的基本功能和上架能力。

### 何時可以上架?

- **Google Play**: 建議 30+ 分
- **Microsoft Store**: 建議 28+ 分
- **Apple App Store**: 需要 Xcode 專案,分數影響較小

---

**下一步**: 修正截圖尺寸,重新生成 maskable icon,再次掃描 PWABuilder! 🚀
