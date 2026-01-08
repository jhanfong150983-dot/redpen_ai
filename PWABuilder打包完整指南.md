# PWABuilder 打包完整指南

## 🎉 恭喜!您的 PWA 已準備就緒

### 已完成的優化項目 ✅

- ✅ **Service Worker**: 完整配置,33 個檔案預快取
- ✅ **Manifest**: 完整的 manifest.webmanifest (所有必要欄位)
- ✅ **Icons**: 5 個圖標 (64x64, 192x192, 512x512, maskable-192, maskable-512)
- ✅ **Screenshots**: 4 張高解析度截圖 (1242x2688)
- ✅ **Shortcuts**: 3 個應用快捷方式
- ✅ **Share Target**: 支援接收圖片/PDF 分享
- ✅ **部署**: 已部署到 https://redpen-ai.vercel.app

---

## 第一步: 使用 PWABuilder 掃描您的 PWA

### 1. 前往 PWABuilder 網站

開啟瀏覽器訪問: **https://www.pwabuilder.com/**

### 2. 輸入您的 PWA 網址

在首頁的輸入框中輸入:
```
https://redpen-ai.vercel.app
```

### 3. 點擊 "Start" 開始掃描

PWABuilder 會分析您的 PWA,這需要 10-30 秒。

### 4. 查看分數報告

掃描完成後,您會看到類似以下的分數報告:

| 項目 | 優化前 | 優化後 (預期) |
|------|--------|--------------|
| **Manifest** | 16/44 ❌ | **28-34/44** ✅ |
| **Service Worker** | +2 ✅ | **+2** ✅ |
| **App Capabilities** | ⚠️ | **+0~+2** |
| **總分** | ~18/44 | **30-38/44** ✅ |

---

## 第二步: 檢查 Action Items (如果有)

如果 PWABuilder 顯示任何 Action Items (待修復項目),請檢查:

### 常見問題與解決方案:

#### 問題 1: "Screenshots are too small"
**狀態**: ✅ 已解決 (4 張 1242x2688 截圖)

#### 問題 2: "Missing 192x192 or 512x512 icon"
**狀態**: ✅ 已解決 (已包含所有必要圖標)

#### 問題 3: "start_url is missing"
**狀態**: ✅ 已解決 (已設定 start_url: "/")

#### 問題 4: 其他警告
如果出現其他警告,**大部分可以忽略**,只要總分 ≥ 30 即可。

---

## 第三步: 下載應用套件

當分數達到 **30+** 且沒有嚴重錯誤時:

### 1. 找到 "Package for Stores" 按鈕

在 PWABuilder 頁面中間或底部,應該會看到:
```
📦 Package for Stores
```

如果按鈕是灰色且不可點擊,請:
1. 檢查 Action Items 是否有嚴重錯誤 (紅色感嘆號)
2. 確認總分是否 ≥ 28
3. 嘗試重新整理頁面並再次掃描

### 2. 選擇要打包的平台

點擊 "Package for Stores" 後,會看到 3 個選項:

#### 選項 A: Android (Google Play) 📱
- 點擊 **"Android"** 卡片
- 點擊 **"Download Package"** 或 **"Generate"**
- 會下載一個 `.zip` 檔案,包含:
  - Android Studio 專案
  - TWA (Trusted Web Activity) 配置
  - 簽名指南

#### 選項 B: iOS (App Store) 🍎
- 點擊 **"iOS"** 卡片
- 點擊 **"Download Package"**
- 會下載包含 Xcode 專案的檔案

#### 選項 C: Windows (Microsoft Store) 🪟
- 點擊 **"Windows"** 卡片
- 點擊 **"Download Package"**
- 會下載 `.msix` 安裝檔

### 3. 建議優先順序

**推薦順序**:
1. **Android** (最簡單,最快上架)
2. **Windows** (相對簡單)
3. **iOS** (最複雜,審查最嚴格)

---

## 第四步: Android 打包詳細步驟

### 4.1 解壓縮下載的檔案

1. 找到下載的 `.zip` 檔案 (例如: `redpen-ai-android.zip`)
2. 解壓縮到資料夾 (例如: `C:\PWA\redpen-ai-android`)

### 4.2 開啟 Android Studio

如果尚未安裝:
- 下載: https://developer.android.com/studio
- 安裝並開啟

### 4.3 匯入專案

1. 開啟 Android Studio
2. 選擇 **"Open"**
3. 選擇解壓縮的資料夾

### 4.4 設定 Digital Asset Links (重要!)

這是讓 Android App 以 TWA 模式運行的關鍵步驟。

#### 步驟 1: 生成簽名金鑰

在 Android Studio 中:
1. 選單: **Build** → **Generate Signed Bundle / APK**
2. 選擇 **Android App Bundle**
3. 點擊 **Create new...** (建立新金鑰庫)
4. 填寫資訊:
   - Key store path: `C:\PWA\redpen-ai-keystore.jks`
   - Password: 設定密碼 (記住它!)
   - Alias: `redpen-ai-key`
   - 其他欄位填寫您的資訊

#### 步驟 2: 取得 SHA256 指紋

開啟終端機並執行:
```bash
keytool -list -v -keystore C:\PWA\redpen-ai-keystore.jks -alias redpen-ai-key
```

找到 **SHA256** 欄位,複製指紋 (例如: `14:6D:E9:83...`)

#### 步驟 3: 建立 assetlinks.json

在您的專案根目錄建立:
```
C:\Users\GPPS\Downloads\redpen_ai-main\public\.well-known\assetlinks.json
```

內容:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.redpenai.twa",
    "sha256_cert_fingerprints": [
      "您的_SHA256_指紋_這裡"
    ]
  }
}]
```

**替換 `package_name`**: 查看 Android 專案中的 `build.gradle` 找到正確的套件名稱。

#### 步驟 4: 部署 assetlinks.json

```bash
cd C:\Users\GPPS\Downloads\redpen_ai-main
git add public/.well-known/assetlinks.json
git commit -m "新增 Android Digital Asset Links"
git push
```

等待 Vercel 自動部署完成。

#### 步驟 5: 驗證

訪問:
```
https://redpen-ai.vercel.app/.well-known/assetlinks.json
```

應該要能看到您剛才建立的 JSON 檔案。

### 4.5 建置 AAB 檔案

1. 在 Android Studio 中: **Build** → **Generate Signed Bundle / APK**
2. 選擇 **Android App Bundle**
3. 選擇您剛才建立的金鑰庫
4. 點擊 **Next** → **Finish**
5. 等待建置完成 (約 1-5 分鐘)

建置完成後,會在 `app/release/` 資料夾找到 `app-release.aab` 檔案。

---

## 第五步: Windows 打包 (可選)

### 5.1 檢查 MSIX 檔案

PWABuilder 下載的套件應該已包含 `.msix` 檔案。

### 5.2 安裝測試

1. 雙擊 `.msix` 檔案
2. Windows 會提示安裝
3. 安裝後可在開始選單找到 "RedPen AI"

### 5.3 上傳到 Microsoft Store

1. 前往 [Partner Center](https://partner.microsoft.com/dashboard)
2. 註冊開發者帳號 ($19 USD)
3. 建立新應用程式
4. 上傳 `.msix` 檔案
5. 填寫商店資訊 (名稱、描述、截圖)
6. 提交審查

---

## 第六步: iOS 打包 (進階)

### 6.1 系統需求

- **Mac 電腦** (必須)
- Xcode (從 App Store 免費下載)
- Apple Developer 帳號 ($99 USD/年)

### 6.2 開啟 Xcode 專案

1. 解壓縮 PWABuilder 下載的 iOS 套件
2. 雙擊 `.xcodeproj` 檔案開啟 Xcode

### 6.3 設定相機權限 (重要!)

在 `Info.plist` 中加入:
```xml
<key>NSCameraUsageDescription</key>
<string>RedPen AI 需要使用相機拍攝學生作業,以便進行 AI 批改並提供個人化學習建議。</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>允許從照片庫選擇作業圖片上傳。</string>
```

### 6.4 Archive 並上傳

1. Xcode: **Product** → **Archive**
2. 等待建置完成
3. 選擇 **Distribute App** → **App Store Connect**
4. 上傳到 App Store Connect

### 6.5 填寫 App Store 資訊

在 App Store Connect 中:
- 上傳截圖 (iPhone 6.7" 和 iPad Pro)
- 填寫描述
- 提供測試帳號 (重要!)
- 提交審查

---

## 第七步: 上架前檢查清單

### Google Play Store ✅

- [ ] AAB 檔案已建置
- [ ] assetlinks.json 已部署並可訪問
- [ ] Google Play Developer 帳號已註冊 ($25 USD)
- [ ] 準備至少 4 張截圖 (已有 ✅)
- [ ] 準備隱私權政策網址

### Apple App Store 🍎

- [ ] 擁有 Mac 電腦
- [ ] Apple Developer 帳號已註冊 ($99 USD/年)
- [ ] 相機權限說明已加入 Info.plist
- [ ] 準備 iPhone 和 iPad 截圖
- [ ] 準備測試帳號

### Microsoft Store 🪟

- [ ] MSIX 檔案已建置
- [ ] Microsoft Partner Center 帳號已註冊 ($19 USD)
- [ ] 準備至少 1 張截圖

---

## 第八步: 預期審查時間

| 平台 | 審查時間 | 通過率 |
|------|---------|-------|
| **Google Play** | 1-3 天 | 高 (85%) |
| **Microsoft Store** | 1-3 天 | 非常高 (95%) |
| **Apple App Store** | 2-7 天 | 中 (60-70%) |

---

## 常見審查拒絕原因與解決方案

### Google Play 可能拒絕原因:

1. **Digital Asset Links 驗證失敗**
   - 解決: 確認 assetlinks.json 可正常訪問
   - 驗證: `curl https://redpen-ai.vercel.app/.well-known/assetlinks.json`

2. **隱私權政策缺失**
   - 解決: 建立隱私權政策頁面並提供 HTTPS 網址

### Apple App Store 可能拒絕原因:

1. **2.3.10 條款: App 僅是網站包裝**
   - 解決: 強調離線功能、Service Worker、原生相機整合

2. **相機權限說明不夠詳細**
   - 解決: 使用詳細的說明文字 (已在步驟 6.3 提供)

3. **缺少測試帳號**
   - 解決: 在 App Store Connect 提供有效的測試帳號

4. **第三方支付問題** (ECPay)
   - 解決: 考慮移除 iOS 版本的付費功能,或改用 Apple IAP

### Microsoft Store 可能拒絕原因:

幾乎不會被拒絕,Microsoft Store 審查最寬鬆。

---

## 下一步行動

### 立即執行:

1. **訪問 PWABuilder**: https://www.pwabuilder.com/
2. **輸入網址**: `https://redpen-ai.vercel.app`
3. **查看分數**: 確認是否 ≥ 30 分
4. **下載套件**: 選擇 Android 優先

### 如果分數仍 < 30:

請截圖並告訴我:
1. PWABuilder 顯示的分數
2. Action Items 列出的錯誤
3. 我會協助進一步優化

---

## 需要幫助?

如果在打包過程中遇到問題:

1. **Android 相關**: 請提供 `build.gradle` 和錯誤訊息
2. **iOS 相關**: 請提供 Xcode 錯誤截圖
3. **PWABuilder 分數問題**: 請提供 PWABuilder 掃描結果截圖

**祝您上架順利!** 🚀
