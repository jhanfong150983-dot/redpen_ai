# Google Play Store 上架完整指南

## 🎉 恭喜!您已擁有所有需要的檔案

您下載的 PWABuilder Google Play 套件包含:

| 檔案 | 狀態 |
|------|------|
| ✅ RedPen AI.aab | 已準備好上傳 |
| ✅ RedPen AI.apk | 可用於測試 |
| ✅ signing.keystore | 金鑰已備份 |
| ✅ assetlinks.json | **已部署到 Vercel** ✅ |

---

## 第一步: 驗證 Digital Asset Links (5 分鐘)

### 1.1 等待 Vercel 部署完成

1. 前往 https://vercel.com/dashboard
2. 確認最新部署狀態為 **"Ready"** ✅

### 1.2 驗證 assetlinks.json

開啟瀏覽器訪問:
```
https://redpen-ai.vercel.app/.well-known/assetlinks.json
```

**應該看到**:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.vercel.redpen_ai.twa",
    "sha256_cert_fingerprints": ["2E:EE:74:58:..."]
  }
}]
```

**如果無法訪問**:
- 等待 1-2 分鐘讓 Vercel 部署完成
- 重新整理頁面
- 確認 GitHub 推送成功

---

## 第二步: 測試 APK (可選,推薦)

### 2.1 安裝到 Android 裝置

**方法 A: 使用 USB 連接**

1. 在 Android 手機上啟用 **"開發者選項"**:
   - 前往 **設定** → **關於手機**
   - 連續點擊 **"版本號碼"** 7 次
   - 返回設定,應該會看到 **"開發者選項"**

2. 啟用 **"USB 偵錯"**:
   - 前往 **設定** → **開發者選項**
   - 開啟 **"USB 偵錯"**

3. 用 USB 連接手機到電腦

4. 將 `RedPen AI.apk` 複製到手機

5. 在手機上開啟檔案管理器,點擊 APK 安裝

**方法 B: 透過雲端硬碟**

1. 將 `RedPen AI.apk` 上傳到 Google Drive
2. 在手機上下載
3. 點擊安裝

### 2.2 測試功能

安裝後,開啟 App 並測試:
- ✅ App 啟動時**沒有網址列** (表示 TWA 模式成功)
- ✅ 所有功能正常 (登入、上傳、批改)
- ✅ 離線模式正常
- ✅ 相機功能正常

**如果看到網址列**:
- 表示 Digital Asset Links 尚未驗證成功
- 等待 24 小時後重試 (Google 需要時間驗證)
- 或繼續上架,Google Play 版本會自動驗證

---

## 第三步: 註冊 Google Play Developer 帳號

### 3.1 前往 Google Play Console

訪問: https://play.google.com/console

### 3.2 註冊並支付

1. 使用您的 Google 帳號登入
2. 點擊 **"Create account"** 或 **"註冊"**
3. 選擇 **"Individual"** (個人) 或 **"Organization"** (組織)
4. 填寫開發者資料:
   - 開發者名稱: **RedPen AI** 或 **黃政昱**
   - 聯絡信箱: **jhanfong150983@gmail.com**
   - 國家/地區: **台灣**

5. 支付 **$25 USD** 註冊費 (一次性,終身有效)

6. 等待 24-48 小時審核通過

---

## 第四步: 建立新應用程式

### 4.1 點擊 "Create app"

在 Google Play Console 中,點擊 **"Create app"** 或 **"建立應用程式"**。

### 4.2 填寫基本資訊

| 欄位 | 填寫內容 |
|------|----------|
| **App name** | RedPen AI - 作業批改 |
| **Default language** | 中文 (繁體) - zh-TW |
| **App or game** | App |
| **Free or paid** | Free (免費) |

### 4.3 同意聲明

勾選以下聲明:
- ✅ 我同意 Google Play 開發人員計劃政策
- ✅ 我同意美國出口法律

點擊 **"Create app"** 建立。

---

## 第五步: 上傳 AAB 檔案

### 5.1 前往 Production

在左側選單中,點擊:
**Release** → **Production** → **Create new release**

### 5.2 上傳 AAB

1. 點擊 **"Upload"** 按鈕
2. 選擇您下載的 **`RedPen AI.aab`** 檔案
3. 等待上傳完成 (約 10-30 秒)

### 5.3 填寫版本說明

**Release name**: `1.0.0` (自動填入)

**Release notes (版本說明)** - 中文 (繁體):
```
首次發布

功能:
• AI 智慧批改學生作業
• 自動辨識錯誤並提供個人化建議
• 支援離線批改
• 相機拍攝作業上傳
• 成績管理與統計
• 批改報告匯出

感謝您使用 RedPen AI!
```

### 5.4 儲存草稿

點擊 **"Save"** 儲存草稿 (先不要點 "Review release")。

---

## 第六步: 完成商店資訊

### 6.1 前往 Store presence → Main store listing

填寫以下資訊:

#### App name (應用程式名稱)
```
RedPen AI - 作業批改
```

#### Short description (簡短說明) - 80 字元以內
```
AI 輔助教師快速批改作業,自動辨識錯誤並提供個人化建議
```

#### Full description (完整說明) - 4000 字元以內
```
RedPen AI 是一款專為教師設計的智慧作業批改工具,運用先進的 AI 技術,協助教師快速、準確地批改學生作業,大幅減少批改時間,讓教師有更多時間專注於教學與學生互動。

主要功能:
✨ AI 智慧批改
自動辨識學生作業中的錯誤,提供詳細的批改建議與改進方向。

📷 相機掃描上傳
支援使用手機相機直接拍攝學生作業,或從相簿選擇圖片上傳。

📊 成績管理
自動記錄學生成績,提供統計分析與成績追蹤功能。

🔄 批次批改
一次上傳多份作業,快速完成整班批改工作。

💾 離線支援
即使沒有網路,仍可查看已批改的作業與成績資料。

📝 批改報告
生成詳細的批改報告,可匯出分享給學生與家長。

適用對象:
• 中小學教師
• 補習班老師
• 家教老師
• 教育工作者

RedPen AI 讓批改作業不再是負擔,釋放教師時間,專注於更有價值的教學工作!
```

### 6.2 上傳圖形資產

#### App icon (應用程式圖示) - 512x512 PNG

使用您專案中的 `public/pwa-512x512.png`。

如果需要,可以訪問:
```
https://redpen-ai.vercel.app/pwa-512x512.png
```
右鍵儲存。

#### Feature graphic (精選圖片) - 1024x500 PNG

這是 Google Play 商店展示的橫幅圖片。

**快速製作方式**:
1. 使用 Canva: https://www.canva.com/
2. 建立自訂尺寸 1024x500
3. 加入:
   - RedPen AI Logo
   - 標題: "RedPen AI - AI 作業批改"
   - 副標題: "釋放教師時間,專注教學"
   - 背景色: #2563eb (藍色)

或使用線上工具自動生成:
https://www.figma.com/templates/feature-graphic/

#### Screenshots (螢幕截圖) - 至少 2 張

您已經有 4 張 1242x2688 的截圖!

**上傳這些截圖**:
1. `public/screenshot-1-landing.png`
2. `public/screenshot-2-features.png`
3. `public/screenshot-3-intro.png`
4. `public/screenshot-4-demo.png`

可以從 Vercel 下載:
- https://redpen-ai.vercel.app/screenshot-1-landing.png
- https://redpen-ai.vercel.app/screenshot-2-features.png
- https://redpen-ai.vercel.app/screenshot-3-intro.png
- https://redpen-ai.vercel.app/screenshot-4-demo.png

### 6.3 分類與聯絡資訊

| 欄位 | 選擇/填寫 |
|------|----------|
| **App category** | Education (教育) |
| **Email address** | jhanfong150983@gmail.com |
| **Phone number** (可選) | 0981-716-650 |
| **Website** (可選) | https://redpen-ai.vercel.app |

點擊 **"Save"** 儲存。

---

## 第七步: 內容分級

### 7.1 前往 Content rating

點擊左側選單: **Policy** → **App content** → **Content rating**

### 7.2 填寫問卷

點擊 **"Start questionnaire"**

**Email address**: jhanfong150983@gmail.com

**Category**: Education (教育)

**問題範例**:
- 應用程式是否包含暴力內容? → **否**
- 應用程式是否包含性相關內容? → **否**
- 應用程式是否包含粗俗語言? → **否**
- 應用程式是否包含毒品/酒精相關內容? → **否**

根據您的實際情況誠實回答所有問題。

完成後,點擊 **"Save questionnaire"** → **"Calculate rating"**。

應該會得到 **"Everyone"** 或 **"3+"** 的分級。

---

## 第八步: 隱私權政策

### 8.1 前往 Privacy policy

點擊: **Policy** → **App content** → **Privacy policy**

### 8.2 提供隱私權政策網址

**隱私權政策網址**:
```
https://redpen-ai.vercel.app/
```

(您的應用已經有隱私權政策聲明,在首頁的法律聲明區塊)

或者建立獨立頁面:
```
https://redpen-ai.vercel.app/privacy.html
```

點擊 **"Save"**。

---

## 第九步: 目標受眾與內容

### 9.1 前往 Target audience and content

點擊: **Policy** → **App content** → **Target audience and content**

### 9.2 設定目標年齡層

**Target age**: 選擇 **"13+"** 或 **"18+"**

(因為是教師工具,建議選擇 18+)

### 9.3 是否為兒童應用

**是否專為兒童設計?** → **否**

點擊 **"Save"**。

---

## 第十步: 資料安全

### 10.1 前往 Data safety

點擊: **Policy** → **App content** → **Data safety**

### 10.2 資料收集聲明

**您的應用程式是否收集或分享使用者資料?** → **是**

**收集的資料類型**:
- ✅ Personal info (個人資訊): Email, Name
- ✅ Photos and videos (照片與影片): User-generated photos (作業圖片)

**資料使用目的**:
- ✅ App functionality (應用功能)
- ✅ Analytics (分析)

**資料分享**:
- ✅ Third parties (第三方): Google Gemini API (AI processing)

**資料安全措施**:
- ✅ Data is encrypted in transit (傳輸中加密)
- ✅ Users can request data deletion (可要求刪除資料)

點擊 **"Save"**。

---

## 第十一步: 政府應用程式

### 11.1 前往 Government apps

點擊: **Policy** → **App content** → **Government apps**

### 11.2 回答問題

**應用程式是否為政府應用程式?** → **否**

點擊 **"Save"**。

---

## 第十二步: 提交審查

### 12.1 檢查所有項目

在左側選單確認所有項目都已完成:
- ✅ Main store listing
- ✅ App releases (AAB uploaded)
- ✅ Content rating
- ✅ Privacy policy
- ✅ Target audience
- ✅ Data safety
- ✅ Government apps

### 12.2 返回 Production release

點擊: **Release** → **Production** → 您之前儲存的草稿

### 12.3 Review release

點擊 **"Review release"**

檢查所有資訊正確後,點擊 **"Start rollout to Production"**

### 12.4 確認提交

會出現確認視窗,點擊 **"Rollout"** 或 **"發布"**

---

## 第十三步: 等待審查

### 審查時間

**通常**: 1-3 天
**最快**: 數小時
**最慢**: 7 天

### 審查狀態

可在 **Dashboard** 查看審查狀態:
- 🟡 **Under review** (審查中)
- 🟢 **Approved** (已核准)
- 🔴 **Rejected** (被拒絕)

### 如果被拒絕

Google 會發送電子郵件說明拒絕原因。

**常見拒絕原因**:
1. **Digital Asset Links 驗證失敗**
   - 確認 assetlinks.json 可正常訪問
   - 確認 SHA256 指紋正確

2. **隱私權政策不完整**
   - 補充更詳細的隱私權政策說明

3. **截圖不清晰或功能不符**
   - 更換更清晰的截圖

根據拒絕原因修正後,可重新提交審查。

---

## 🎉 上架成功後

### 您的 App 將出現在:

```
https://play.google.com/store/apps/details?id=app.vercel.redpen_ai.twa
```

### 分享連結

可以將此連結分享給使用者,他們就能在 Google Play 商店下載您的 App!

### 後續更新

如果需要更新 App:
1. 使用 PWABuilder 生成新的 AAB (記得使用相同的 signing.keystore)
2. 在 Google Play Console 建立新版本
3. 上傳新的 AAB
4. 提交審查

---

## 重要檔案備份清單

請務必備份這些檔案:

- ✅ **signing.keystore** (金鑰檔案)
- ✅ **signing-key-info.txt** (金鑰資訊)
- ✅ **RedPen AI.aab** (原始 AAB)

**建議備份位置**:
- Google Drive
- Dropbox
- 外接硬碟
- GitHub Private Repository

**沒有這些檔案,您將無法更新 App!**

---

## 需要幫助?

如果在上架過程中遇到問題:
1. 查看 Google Play Console 的錯誤訊息
2. 參考 Google Play 官方說明文件
3. 或聯繫我協助除錯

**祝您上架順利!** 🚀
