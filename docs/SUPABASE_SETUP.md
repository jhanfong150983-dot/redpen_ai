# Supabase 設定指南

本文檔說明如何設定 Supabase 以支援作業批改 App 的雲端同步功能。

## 1. 環境變數設定

在專案根目錄創建 `.env` 檔案：

```bash
cp .env.example .env
```

填入你的 Supabase 憑證：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 2. 資料庫結構 (Database Schema)

### submissions 表

在 Supabase SQL Editor 中執行以下 SQL：

```sql
-- 創建 submissions 表
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'synced',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引以加快查詢
CREATE INDEX idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX idx_submissions_created_at ON public.submissions(created_at);

-- 創建複合唯一索引，確保同一作業的同一學生不會重複提交
CREATE UNIQUE INDEX idx_submissions_assignment_student
ON public.submissions(assignment_id, student_id);

-- 自動更新 updated_at 欄位的觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### 欄位說明

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | TEXT | 提交記錄的唯一 ID（與 Dexie 同步） |
| `assignment_id` | TEXT | 作業 ID |
| `student_id` | TEXT | 學生 ID |
| `image_url` | TEXT | 上傳到 Storage 的圖片公開 URL |
| `status` | TEXT | 狀態（默認 'synced'） |
| `created_at` | TIMESTAMP | 創建時間 |
| `updated_at` | TIMESTAMP | 更新時間 |

## 3. Storage 設定

### 創建 Bucket

1. 進入 Supabase Dashboard → Storage
2. 創建新的 Bucket：`homework-images`
3. 設定為 **Public** Bucket（允許公開讀取）

### Bucket 設定

```javascript
// Bucket 名稱
const bucketName = 'homework-images'

// 文件路徑格式
const filePath = `submissions/${submissionId}-${timestamp}.webp`
```

### Storage Policy (RLS)

如果需要更細緻的權限控制，可以設定 Row Level Security：

```sql
-- 允許所有人讀取圖片
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'homework-images' );

-- 只允許認證用戶上傳
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'homework-images'
  AND auth.role() = 'authenticated'
);
```

## 4. 使用 useSync Hook

### 基本使用

```typescript
import { useSync } from '@/hooks/useSync'

function App() {
  const {
    isSyncing,
    lastSyncTime,
    pendingCount,
    error,
    triggerSync
  } = useSync({
    autoSync: true,      // 自動同步
    syncInterval: 30000  // 每 30 秒同步一次
  })

  return (
    <div>
      <p>待同步: {pendingCount} 條</p>
      <p>上次同步: {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : '從未同步'}</p>
      {isSyncing && <p>同步中...</p>}
      {error && <p className="text-red-600">{error}</p>}

      <button onClick={triggerSync} disabled={isSyncing}>
        手動同步
      </button>
    </div>
  )
}
```

### 同步狀態顯示組件

```typescript
import { useSync } from '@/hooks/useSync'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

function SyncStatus() {
  const isOnline = useOnlineStatus()
  const { isSyncing, pendingCount, lastSyncTime, error, triggerSync } = useSync()

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">同步狀態</span>
        <span className={`px-2 py-1 rounded text-xs ${isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {isOnline ? '在線' : '離線'}
        </span>
      </div>

      {pendingCount > 0 && (
        <p className="text-sm text-gray-600 mb-2">
          待同步: {pendingCount} 條記錄
        </p>
      )}

      {lastSyncTime && (
        <p className="text-xs text-gray-500 mb-2">
          上次同步: {new Date(lastSyncTime).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      {isSyncing && (
        <p className="text-sm text-blue-600">同步中...</p>
      )}

      <button
        onClick={triggerSync}
        disabled={isSyncing || !isOnline}
        className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isSyncing ? '同步中...' : '手動同步'}
      </button>
    </div>
  )
}
```

## 5. 同步流程

```
1. 檢查網路狀態 (navigator.onLine)
   ↓
2. 從 Dexie 查詢 status === 'scanned' 的記錄
   ↓
3. 逐筆處理：
   ├─ 上傳圖片 Blob 到 Supabase Storage
   ├─ 取得圖片公開 URL
   ├─ 將記錄寫入 Supabase Database
   └─ 更新 Dexie 狀態為 'synced' 並刪除 imageBlob
   ↓
4. 完成同步，更新待同步數量
```

## 6. 離線優先架構

- **離線時**：所有資料存儲在 Dexie (IndexedDB)
- **在線時**：自動同步到 Supabase
- **網路恢復時**：自動觸發同步
- **定時同步**：每 30 秒自動檢查並同步（可配置）

## 7. 空間優化

同步成功後，本地 `imageBlob` 會被刪除以節省空間：

```typescript
await db.submissions.update(submission.id, {
  status: 'synced',
  imageBlob: undefined  // 刪除本地 Blob
})
```

查詢時可根據 `status` 判斷：
- `scanned`: 有本地圖片，未同步
- `synced`: 已同步，需從 Supabase 取得圖片

## 8. 錯誤處理

- 網路錯誤：保留在本地，下次繼續嘗試
- 上傳失敗：記錄錯誤，跳過該筆繼續處理其他
- 重複上傳：使用 `upsert: false` 避免覆蓋

## 9. 開發測試

```typescript
// 手動創建測試資料
const submission = await db.submissions.add({
  id: generateId(),
  assignmentId: 'test-assignment',
  studentId: 'test-student',
  status: 'scanned',
  imageBlob: blob,  // WebP Blob
  createdAt: Date.now()
})

// 觸發同步
const { triggerSync } = useSync({ autoSync: false })
await triggerSync()

// 檢查結果
const synced = await db.submissions.get(submission.id)
console.log(synced.status)  // 應為 'synced'
console.log(synced.imageBlob)  // 應為 undefined
```

## 10. 安全性建議

1. **啟用 RLS (Row Level Security)**：確保使用者只能訪問自己的資料
2. **使用認證**：結合 Supabase Auth 進行使用者驗證
3. **限制 Storage 大小**：設定單檔案大小上限
4. **定期清理**：刪除過期或無效的圖片

---

## 疑難排解

### 問題：圖片上傳失敗

**可能原因**：
- Bucket 不存在或名稱錯誤
- Storage Policy 設定錯誤
- 網路連線問題

**解決方法**：
```typescript
// 檢查 Bucket 是否存在
const { data, error } = await supabase.storage.listBuckets()
console.log(data)

// 測試上傳
const { error } = await supabase.storage
  .from('homework-images')
  .upload('test.webp', blob)
console.log(error)
```

### 問題：資料庫寫入失敗

**可能原因**：
- 表格不存在
- 欄位類型不匹配
- 違反唯一性約束

**解決方法**：
```sql
-- 檢查表格結構
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'submissions';

-- 查看錯誤詳情
-- 在 Supabase Dashboard → Database → Logs
```

---

**相關文檔**：
- [Supabase Storage 文檔](https://supabase.com/docs/guides/storage)
- [Supabase Database 文檔](https://supabase.com/docs/guides/database)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
