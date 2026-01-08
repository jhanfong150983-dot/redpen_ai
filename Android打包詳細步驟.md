# Android 打包詳細步驟指南

## 🎯 目標
從 PWABuilder 下載完整的 Android Studio 專案並建置 AAB 檔案。

---

## 第一步: 在 PWABuilder 下載正確的 Android 套件

### 1.1 前往 PWABuilder

訪問: https://www.pwabuilder.com/

### 1.2 輸入您的 PWA 網址

```
https://redpen-ai.vercel.app
```

點擊 **"Start"** 開始掃描。

### 1.3 等待掃描完成

您應該會看到分數報告。無論分數多少,都可以繼續打包。

### 1.4 點擊 "Package for Stores"

找到頁面中間或底部的 **"Package for Stores"** 按鈕。

### 1.5 選擇 Android

點擊 **Android** 卡片。

### 1.6 重要!選擇正確的打包選項

在 Android 打包頁面,您會看到幾個選項:

#### 選項 A: TWA (Trusted Web Activity) - 推薦 ✅

這是最標準的選項,會生成完整的 Android Studio 專案。

**特徵**:
- 檔案名稱: `android-twa.zip` 或類似
- 檔案大小: 約 50-200 KB (小型壓縮檔)
- 內容: 包含 `build.gradle`, `AndroidManifest.xml` 等檔案

**如何選擇**:
- 如果有下拉選單,選擇 **"TWA"** 或 **"Classic"**
- 或直接點擊 **"Download Package"**

#### 選項 B: Signed APK (不推薦)

這會直接給您一個已簽名的 APK,但您無法自訂配置。

**跳過這個選項**,除非您只是想快速測試。

### 1.7 填寫應用資訊

PWABuilder 可能會要求您填寫一些資訊:

| 欄位 | 建議值 |
|------|--------|
| **Package Name** | `com.redpenai.app` |
| **App Name** | `RedPen AI` |
| **Version Code** | `1` |
| **Version Name** | `1.0.0` |
| **Host** | `redpen-ai.vercel.app` |
| **Start URL** | `/` |

填寫完成後,點擊 **"Generate"** 或 **"Download"**。

### 1.8 下載並解壓縮

1. 檔案會下載到您的下載資料夾
2. 檔案名稱類似: `redpen-ai-android-twa.zip`
3. **解壓縮到**: `C:\PWA\redpen-ai-android\`

---

## 第二步: 驗證下載的專案

### 2.1 檢查必要檔案

解壓縮後,**必須包含**以下檔案和資料夾:

```
C:\PWA\redpen-ai-android\
├── app/
│   ├── build.gradle
│   └── src/
│       └── main/
│           └── AndroidManifest.xml
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── build.gradle
├── settings.gradle
└── gradlew.bat
```

### 2.2 如果缺少檔案

如果解壓縮後**沒有看到這些檔案**,表示下載的不是正確的套件。

**解決方案**:
1. 回到 PWABuilder
2. 查找 **"Advanced Options"** 或 **"Download Options"**
3. 選擇 **"Include Android Studio Project"** 或 **"Full Project"**
4. 重新下載

---

## 第三步: 在 Android Studio 開啟專案

### 3.1 啟動 Android Studio

如果尚未安裝:
- 下載: https://developer.android.com/studio
- 安裝並啟動

### 3.2 開啟專案

1. 點擊 **"Open"** (不是 "New Project")
2. 瀏覽到 `C:\PWA\redpen-ai-android\`
3. 選擇整個資料夾
4. 點擊 **"OK"**

### 3.3 等待 Gradle 同步

這是**最重要的步驟**!

1. Android Studio 會自動開始 Gradle 同步
2. 底部會顯示 **"Gradle Build Running..."**
3. **請耐心等待 3-10 分鐘**
4. 過程中可能會下載多個依賴包

### 3.4 如何確認同步完成

**成功標誌**:
- 底部狀態列顯示 **"Gradle sync finished"**
- 左側 Project 結構完整顯示
- **Build** 選單不再是灰色

**失敗標誌**:
- 紅色錯誤訊息
- "Sync failed" 提示

---

## 第四步: 解決常見 Gradle 同步問題

### 問題 1: "Failed to find target with hash string 'android-XX'"

**解決方案**:
1. 點擊錯誤訊息中的 **"Install missing SDK package(s)"**
2. 或前往 **Tools** → **SDK Manager**
3. 勾選建議的 SDK 版本
4. 點擊 **"Apply"** 安裝

### 問題 2: "Could not resolve dependencies"

**原因**: 網路連線問題或 Gradle 伺服器問題

**解決方案**:
1. 確認電腦已連接網路
2. 關閉防火牆或 VPN (暫時)
3. 點擊 **File** → **Sync Project with Gradle Files** 重試

### 問題 3: Gradle 版本過舊

**解決方案**:
1. 開啟 `gradle/wrapper/gradle-wrapper.properties`
2. 將 `distributionUrl` 更新為:
   ```
   distributionUrl=https\://services.gradle.org/distributions/gradle-8.0-bin.zip
   ```
3. 重新同步

---

## 第五步: 生成簽名金鑰 (Keystore)

### 5.1 使用 Android Studio 生成

1. 點擊 **Build** → **Generate Signed Bundle / APK**
2. 選擇 **Android App Bundle**
3. 點擊 **"Create new..."** (在 Key store path 旁邊)

### 5.2 填寫金鑰資訊

| 欄位 | 建議值 | 說明 |
|------|--------|------|
| **Key store path** | `C:\PWA\redpen-ai-keystore.jks` | 金鑰檔案位置 |
| **Password** | 設定強密碼 | **務必記住!** |
| **Alias** | `redpen-ai-key` | 金鑰別名 |
| **Validity (years)** | `25` | 有效期限 |
| **First and Last Name** | 您的名字 | 例如: 黃政昱 |
| **Organizational Unit** | `Development` | 部門 |
| **Organization** | `RedPen AI` | 組織名稱 |
| **City or Locality** | 您的城市 | 例如: 台北 |
| **State or Province** | 您的省份 | 例如: 台灣 |
| **Country Code** | `TW` | 國家代碼 |

### 5.3 點擊 "OK" 生成金鑰

金鑰會儲存在 `C:\PWA\redpen-ai-keystore.jks`

**重要**: 請備份這個檔案和密碼!未來更新 App 時需要使用相同的金鑰。

---

## 第六步: 建置 AAB 檔案

### 6.1 繼續簽名流程

生成金鑰後,您會回到 "Generate Signed Bundle / APK" 視窗。

1. 確認 Key store path 正確
2. 輸入 Key store password
3. 確認 Key alias 為 `redpen-ai-key`
4. 輸入 Key password (通常與 Key store password 相同)
5. 點擊 **"Next"**

### 6.2 選擇建置類型

1. 選擇 **"release"**
2. 勾選 **"Export encrypted key"** (可選,用於 Google Play 內部測試)
3. 點擊 **"Create"**

### 6.3 等待建置完成

建置過程需要 1-5 分鐘。

完成後,Android Studio 會顯示:
```
Signed Bundle(s) generated successfully
```

並提供檔案位置連結。

### 6.4 找到 AAB 檔案

AAB 檔案位置:
```
C:\PWA\redpen-ai-android\app\release\app-release.aab
```

---

## 第七步: 配置 Digital Asset Links (重要!)

這是讓 Android App 以 TWA 模式運行的關鍵。

### 7.1 取得 SHA256 指紋

開啟終端機並執行:

```bash
keytool -list -v -keystore C:\PWA\redpen-ai-keystore.jks -alias redpen-ai-key
```

輸入密碼後,找到 **SHA256** 欄位,複製指紋。

例如:
```
SHA256: 14:6D:E9:83:2C:73:94:D4:F2:42:67:8E:0A:B1:C5:...
```

### 7.2 取得正確的 Package Name

開啟 `app/build.gradle`,找到:
```groovy
applicationId "com.example.myapp"
```

複製這個 Package Name (例如: `com.redpenai.twa`)

### 7.3 建立 assetlinks.json

在您的 RedPen AI 專案中建立檔案:

```bash
mkdir -p C:\Users\GPPS\Downloads\redpen_ai-main\public\.well-known
```

建立 `assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.redpenai.twa",
    "sha256_cert_fingerprints": [
      "14:6D:E9:83:2C:73:94:D4:F2:42:67:8E:0A:B1:C5:..."
    ]
  }]
}
```

**替換**:
- `package_name`: 您的實際 Package Name
- `sha256_cert_fingerprints`: 您的實際 SHA256 指紋

### 7.4 部署到 Vercel

```bash
cd C:\Users\GPPS\Downloads\redpen_ai-main
git add public/.well-known/assetlinks.json
git commit -m "新增 Android Digital Asset Links"
git push
```

等待 Vercel 自動部署。

### 7.5 驗證

訪問:
```
https://redpen-ai.vercel.app/.well-known/assetlinks.json
```

應該能看到您剛建立的 JSON 檔案。

---

## 第八步: 測試 APK/AAB

### 8.1 安裝到實體裝置 (推薦)

1. 使用 USB 連接 Android 手機到電腦
2. 在手機上啟用 **"開發者選項"** 和 **"USB 偵錯"**
3. 在 Android Studio 中點擊 **"Run"** (綠色播放按鈕)
4. 選擇您的裝置
5. App 會自動安裝並啟動

### 8.2 確認 TWA 模式

如果 Digital Asset Links 配置正確:
- ✅ App 啟動時**沒有網址列**
- ✅ 顯示為原生應用
- ✅ 可以正常使用所有功能

如果仍然顯示網址列:
- ❌ Digital Asset Links 驗證失敗
- 請重新檢查 assetlinks.json 的 Package Name 和 SHA256 指紋

---

## 第九步: 上傳到 Google Play Console

### 9.1 註冊 Google Play Developer 帳號

1. 前往: https://play.google.com/console
2. 支付 $25 USD 註冊費 (一次性)
3. 填寫開發者資料

### 9.2 建立新應用

1. 點擊 **"Create app"**
2. 填寫應用名稱: **RedPen AI - 作業批改**
3. 選擇語言: **中文 (繁體)**
4. 選擇類型: **App**
5. 選擇免費或付費: **免費**

### 9.3 上傳 AAB

1. 前往 **"Production"** → **"Create new release"**
2. 上傳 `app-release.aab`
3. 填寫版本說明
4. 點擊 **"Review release"**

### 9.4 完成商店資訊

需要填寫:
- App 圖標 (512x512 PNG)
- 功能圖片 (1024x500 PNG)
- 截圖 (至少 2 張,已有 4 張 ✅)
- 簡短說明 (80 字元)
- 完整說明 (4000 字元)
- 分類: **教育**
- 隱私權政策網址

### 9.5 提交審查

完成所有必填項目後,點擊 **"Submit for review"**。

審查時間: **1-3 天**

---

## 常見問題與解決方案

### Q1: Gradle 同步一直失敗怎麼辦?

**解決方案**:
1. 關閉 Android Studio
2. 刪除專案中的 `.gradle` 和 `build` 資料夾
3. 重新開啟專案
4. 讓 Gradle 重新同步

### Q2: 建置 AAB 時出現錯誤?

**常見錯誤**: "Duplicate class found"

**解決方案**:
開啟 `app/build.gradle`,在 `dependencies` 區塊加入:
```groovy
configurations {
    all*.exclude group: 'com.google.guava', module: 'listenablefuture'
}
```

### Q3: TWA 顯示網址列,無法隱藏?

**原因**: Digital Asset Links 驗證失敗

**解決方案**:
1. 確認 assetlinks.json 可正常訪問
2. 確認 Package Name 和 SHA256 指紋正確
3. 等待 24 小時 (Google 需要時間驗證)
4. 解除安裝並重新安裝 App

---

## 檢查清單

在提交到 Google Play 之前,請確認:

- [ ] AAB 檔案已成功建置
- [ ] 已在實體裝置測試
- [ ] Digital Asset Links 已配置並驗證成功
- [ ] App 以 TWA 模式運行 (無網址列)
- [ ] 所有功能正常 (包含相機、離線模式)
- [ ] 已準備好 Google Play Developer 帳號
- [ ] 已準備好所有商店資料 (圖標、截圖、說明)

---

**完成以上步驟後,您的 Android App 就可以上架到 Google Play Store 了!** 🎉
