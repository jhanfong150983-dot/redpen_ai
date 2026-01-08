# 第三階段: PWABuilder 打包指南

## 概述

PWABuilder 是 Microsoft 提供的免費工具,可以將您的 PWA 自動打包成:
- **Android App** (APK/AAB 格式)
- **iOS App** (Xcode 專案)
- **Windows App** (MSIX 安裝檔)

---

## 前置條件 ✅

在使用 PWABuilder 之前,需要:

### 1. PWA 必須部署在公開的 HTTPS 網址

**為什麼?**
- PWABuilder 需要掃描您的網站
- Service Worker 只能在 HTTPS 環境運行
- 應用商店要求驗證 PWA 的網址

**您的選擇**:
- ✅ **Vercel** (推薦,免費,自動 HTTPS)
- Netlify (免費)
- GitHub Pages (免費)
- Cloudflare Pages (免費)

---

## 步驟 1: 部署到 Vercel

### 方法 A: 使用 Vercel CLI (最快)

#### 1.1 安裝 Vercel CLI (如果還沒有)

```bash
npm install -g vercel
```

#### 1.2 登入 Vercel

```bash
vercel login
```

**會發生什麼**:
- 瀏覽器會開啟 Vercel 登入頁面
- 使用 Google/GitHub/Email 登入
- 回到終端機確認登入成功

#### 1.3 部署專案

```bash
# 確保在專案根目錄
cd c:\Users\GPPS\Downloads\redpen_ai-main

# 部署到 Vercel
vercel --prod
```

**過程中會問的問題**:
1. "Set up and deploy?" → 選 **Y**
2. "Which scope?" → 選您的帳號
3. "Link to existing project?" → 選 **N** (第一次部署)
4. "What's your project's name?" → 直接按 Enter (使用預設名稱)
5. "In which directory is your code located?" → 直接按 Enter (使用 ./)
6. "Want to override the settings?" → 選 **N**

**完成後**:
- 會顯示網址,例如: `https://redpen-ai.vercel.app`
- 複製這個網址,等等會用到

---

### 方法 B: 使用 Vercel Dashboard (網頁版)

#### 1. 前往 Vercel

網址: https://vercel.com/

#### 2. 登入並建立新專案

1. 點擊 "Add New..." → "Project"
2. 選擇 "Import Git Repository"
3. 如果您的專案在 GitHub:
   - 選擇 repository
   - 點擊 "Import"
4. 如果專案在本地:
   - 需要先 push 到 GitHub

#### 3. 設定專案

**Framework Preset**: Vite
**Build Command**: `npm run build`
**Output Directory**: `dist`
**Install Command**: `npm install`

**Environment Variables** (如果有):
- `VITE_GEMINI_PROXY_URL` (如果有設定)

#### 4. 部署

點擊 "Deploy" 按鈕,等待 2-3 分鐘。

**完成後**:
- 取得網址: `https://your-project.vercel.app`

---

### 方法 C: 連結現有的 Vercel 專案 (如果已部署)

如果您已經在 Vercel 上有這個專案:

```bash
# 重新建置並部署
npm run build
vercel --prod
```

---

## 步驟 2: 驗證部署

### 2.1 檢查網站是否正常

訪問您的 Vercel 網址 (例: `https://redpen-ai.vercel.app`):

**檢查清單**:
- [ ] Landing Page 正常顯示
- [ ] YouTube 影片可以播放
- [ ] 圖標正常載入 (檢查 favicon)
- [ ] 沒有 Console 錯誤 (F12 查看)

### 2.2 檢查 PWA 功能

1. 按 `F12` → **Application** 分頁
2. 左側點擊 **Service Workers**
3. **確認狀態**: activated and is running ✅
4. 左側點擊 **Manifest**
5. **確認圖標**: 應該看到 4 個圖標

### 2.3 測試離線功能

1. **Network** 分頁 → 選擇 **Offline**
2. 重新整理頁面 (`F5`)
3. **預期**: 頁面仍可載入 ✅

---

## 步驟 3: 使用 PWABuilder

### 3.1 前往 PWABuilder

網址: https://www.pwabuilder.com/

### 3.2 輸入您的 PWA 網址

1. 在首頁的輸入框填入您的 Vercel 網址
   ```
   https://redpen-ai.vercel.app
   ```

2. 點擊 **"Start"** 按鈕

3. **等待分析** (約 10-30 秒)

### 3.3 查看分析結果

PWABuilder 會顯示您的 PWA 分數和檢查項目:

**必須通過的項目** (紅綠燈):
- ✅ **Manifest** (綠燈) - Manifest 正確配置
- ✅ **Service Worker** (綠燈) - Service Worker 已註冊
- ✅ **HTTPS** (綠燈) - 使用 HTTPS

**可選的項目** (黃燈可接受):
- 🟡 **Offline** - 離線功能 (應該是綠燈)
- 🟡 **Installable** - 可安裝性

**如果有紅燈**:
- 點擊查看詳細資訊
- 根據建議修正問題
- 重新部署並再次掃描

---

## 步驟 4: 下載各平台套件

### 4.1 Android (Google Play Store)

#### 點擊 "Publish to Stores"

在頁面底部找到 **Android** 區塊:

1. 點擊 **"Generate Package"** 按鈕
2. 選擇打包選項:
   - **Package ID**: `com.redpenai.app` (或您想要的)
   - **App Name**: `RedPen AI`
   - **App Version**: `1.0.0`
   - **Host**: 您的 Vercel 網址
   - **Signing Key**: 選擇 "Generate new"

3. 點擊 **"Generate"**

4. 下載生成的 `.zip` 檔案

**內容**:
- Android Studio 專案資料夾
- `app-release-signed.apk` (可直接安裝測試)
- `app-release-signed.aab` (上架 Google Play 用)
- `README.md` (說明文件)
- `assetlinks.json` (Digital Asset Links 設定)

---

### 4.2 iOS (App Store)

在 **iOS** 區塊:

1. 點擊 **"Generate Package"**
2. 填寫資訊:
   - **Bundle ID**: `com.redpenai.app`
   - **App Name**: `RedPen AI`
   - **URL**: 您的 Vercel 網址

3. 下載 `.zip` 檔案

**內容**:
- Xcode 專案 (需要 Mac 打開)
- `Info.plist` (已配置好)
- `README.md`

**重要**:
- 需要 Mac 電腦和 Xcode
- 需要 Apple Developer 帳號 ($99/年)

---

### 4.3 Windows (Microsoft Store)

在 **Windows** 區塊:

1. 點擊 **"Generate Package"**
2. 填寫資訊:
   - **Package ID**: `RedPenAI`
   - **Publisher**: 您的名稱
   - **Version**: `1.0.0.0`

3. 下載 `.msix` 檔案

**內容**:
- `.msix` 安裝檔 (可直接安裝測試)
- `AppxManifest.xml`

---

## 步驟 5: 設定 Digital Asset Links (Android 必需!)

### 5.1 上傳 assetlinks.json 到 Vercel

PWABuilder 生成的 Android 套件中包含 `assetlinks.json` 檔案。

#### 建立檔案

1. 從下載的 Android 套件中找到 `assetlinks.json`
2. 複製到您的專案:
   ```bash
   mkdir -p public/.well-known
   cp /path/to/assetlinks.json public/.well-known/
   ```

3. 內容範例:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.redpenai.app",
       "sha256_cert_fingerprints": [
         "YOUR_SHA256_FINGERPRINT_HERE"
       ]
     }
   }]
   ```

#### 配置 Vercel 路由

確保 `vercel.json` 正確配置:

```json
{
  "rewrites": [
    {
      "source": "/.well-known/assetlinks.json",
      "destination": "/.well-known/assetlinks.json"
    },
    {
      "source": "/((?!api).*)",
      "destination": "/index.html"
    }
  ]
}
```

#### 重新部署

```bash
npm run build
vercel --prod
```

#### 驗證

訪問:
```
https://redpen-ai.vercel.app/.well-known/assetlinks.json
```

應該顯示 JSON 內容 ✅

---

## 步驟 6: 測試生成的應用

### Android 測試

#### 方法 A: 直接安裝 APK (實體裝置)

1. 將 `app-release-signed.apk` 傳到手機
2. 點擊安裝 (可能需要允許 "未知來源")
3. 安裝後開啟測試

**測試項目**:
- [ ] App 圖標顯示正確
- [ ] 開啟後無網址列 (TWA 模式)
- [ ] 所有功能正常運作
- [ ] 相機權限可正常取得

#### 方法 B: Android Studio 測試

1. 解壓下載的 `.zip`
2. 用 Android Studio 開啟專案
3. 連接 Android 裝置或啟動模擬器
4. 點擊 "Run"

---

### iOS 測試 (需要 Mac)

1. 解壓下載的 `.zip`
2. 用 Xcode 開啟 `.xcodeproj`
3. 連接 iPhone (模擬器無法測試相機)
4. 選擇您的開發者帳號
5. 點擊 "Run"

**測試項目**:
- [ ] 相機權限對話框正確顯示
- [ ] 所有功能正常
- [ ] 沒有 WKWebView 錯誤

---

### Windows 測試

#### 安裝 MSIX

1. 雙擊 `.msix` 檔案
2. 點擊 "安裝"
3. 可能需要開發者模式或信任的憑證

**測試項目**:
- [ ] App 可正常啟動
- [ ] 圖標顯示在開始選單
- [ ] 所有功能正常

---

## 步驟 7: 準備上架資料

在上架前,需要準備:

### 共通資料

- [ ] **App 名稱**: RedPen AI - 作業批改
- [ ] **簡短說明**: AI 輔助批改,釋放教師時間 (80 字元內)
- [ ] **完整說明**: 詳細功能介紹 (4000 字元內)
- [ ] **關鍵字**: 作業批改, AI教師, 教育工具, 自動評分
- [ ] **分類**: 教育 (Education)
- [ ] **年齡分級**: 4+ (所有年齡)

### 圖片資源

- [ ] **應用程式圖標**: 512x512 PNG (已有 ✅)
- [ ] **螢幕截圖**: 4-5 張 (1242x2688 for iOS)
  - 使用 `public/screenshot-*.png` (可能需要調整尺寸)
- [ ] **特色圖片** (Android): 1024x500 PNG

### 法律文件

- [ ] **隱私權政策**: HTTPS 網址 (必須!)
  - 範例: `https://redpen-ai.vercel.app/privacy.html`
  - 說明收集的資料、用途、第三方服務
- [ ] **服務條款** (可選)

---

## 常見問題

### Q1: PWABuilder 顯示 "Service Worker not found"

**原因**:
- Service Worker 沒有正確註冊
- HTTPS 配置問題

**解決**:
1. 在瀏覽器訪問您的網站
2. `F12` → Application → Service Workers
3. 確認狀態是 "activated"
4. 清除快取後重新掃描

---

### Q2: Android App 顯示網址列 (不是 TWA)

**原因**: Digital Asset Links 驗證失敗

**解決**:
1. 確認 `assetlinks.json` 可訪問
2. SHA256 指紋正確
3. Package name 一致

---

### Q3: iOS 相機無法使用

**原因**:
- `NSCameraUsageDescription` 未設定
- WKWebView 不支援 `getUserMedia`

**解決**:
- 使用 Capacitor Camera Plugin (已在計劃中)
- 或使用檔案上傳替代

---

## 下一步

完成 PWABuilder 打包後:

1. **測試所有平台的應用**
2. **準備應用商店資料**
3. **申請開發者帳號** (如果還沒有)
4. **提交審查**

詳細的上架流程請參考:
- 📄 **第四階段-應用商店上架指南.md** (即將建立)

---

**有任何問題隨時告訴我!** 🚀
