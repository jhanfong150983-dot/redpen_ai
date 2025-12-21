# Supabase 設定指南

本文檔說明如何設定 Supabase，並改為「前端不直接連 Supabase」的安全模式。

## 0. Google OAuth（登入用）

在 Supabase Dashboard → Authentication → Providers 啟用 Google，填入 Google Client ID/Secret。
Redirect URL 使用 Supabase 提供的 callback（通常為 `https://<project>.supabase.co/auth/v1/callback`）。

## 1. 伺服器端環境變數

前端不再讀取 Supabase URL/Key，所有設定只放在伺服器環境變數：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SITE_URL=http://localhost:5173
```

- `SUPABASE_SERVICE_ROLE_KEY` 只放在 Vercel / Server 端，不可放前端。
- `SITE_URL` 用於 OAuth 回呼（本機與正式網域都要設定）。

## 2. 資料庫結構 (Database Schema)

### profiles 表

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION update_profiles_updated_at();
```

### submissions 表（新增 owner_id）

```sql
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'synced',
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX idx_submissions_owner_id ON public.submissions(owner_id);

CREATE UNIQUE INDEX idx_submissions_assignment_student
ON public.submissions(assignment_id, student_id);

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

## 3. Storage 設定

1. Supabase Dashboard → Storage
2. 建立 Bucket：`homework-images`

是否設為 Public 視需求而定。若不公開，圖片仍可由後端下載。

## 4. 同步 API 流程（後端代理）

前端不再使用 Supabase SDK，而是呼叫你的後端 API：

- `POST /api/data/submission`：上傳圖片 + 寫入資料庫
- `GET /api/storage/download?submissionId=...`：下載圖片

範例（前端僅供參考）：

```typescript
await fetch('/api/data/submission', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    submissionId,
    assignmentId,
    studentId,
    createdAt,
    imageBase64,
    contentType: 'image/webp'
  })
})
```

## 5. 驗證方式

1. 登入後，先建立一筆掃描作業
2. 觸發同步（首頁「同步狀態」）
3. Supabase Database 應該看到 submissions 資料
4. Storage 應該出現 submissions/{submissionId}.webp

## 6. 本機開發提醒

`/api/*` 是後端 Serverless Function，本機開發建議使用 `vercel dev`，或設定等效的 API proxy。

## 7. 安全性建議

- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 放進前端
- 若需開放多人共用，再加 RLS 政策與共享權限模型

---

**相關文檔**：
- https://supabase.com/docs
