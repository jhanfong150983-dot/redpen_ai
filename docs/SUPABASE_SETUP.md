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
SITE_URL=http://localhost:3000
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
  role TEXT DEFAULT 'user', -- user | admin
  permission_tier TEXT DEFAULT 'basic', -- basic | advanced
  ink_balance INTEGER DEFAULT 10,
  admin_note TEXT,
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

已存在 `profiles` 表時，可用以下方式補欄位：

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS permission_tier TEXT DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS ink_balance INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS admin_note TEXT;
```

### classrooms 表

```sql
CREATE TABLE IF NOT EXISTS public.classrooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### students 表

```sql
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_students_classroom_id ON public.students(classroom_id);
CREATE INDEX idx_students_owner_id ON public.students(owner_id);
```

### assignments 表

```sql
CREATE TABLE IF NOT EXISTS public.assignments (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_pages INTEGER NOT NULL,
  domain TEXT,
  answer_key JSONB,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assignments_classroom_id ON public.assignments(classroom_id);
CREATE INDEX idx_assignments_owner_id ON public.assignments(owner_id);
```

### submissions 表（同步批改結果）

```sql
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'synced',
  score NUMERIC,
  feedback TEXT,
  grading_result JSONB,
  graded_at BIGINT,
  correction_count INTEGER,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX idx_submissions_owner_id ON public.submissions(owner_id);

CREATE UNIQUE INDEX idx_submissions_assignment_student
ON public.submissions(assignment_id, student_id);
```

已存在 `submissions` 表時，可用以下方式補欄位：

```sql
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS score NUMERIC,
ADD COLUMN IF NOT EXISTS feedback TEXT,
ADD COLUMN IF NOT EXISTS grading_result JSONB,
ADD COLUMN IF NOT EXISTS graded_at BIGINT,
ADD COLUMN IF NOT EXISTS correction_count INTEGER;
```

### deleted_records 表（衝突刪除 tombstone）

刪除時不直接復活舊資料，會先寫入刪除記錄，避免不同裝置互相覆蓋。

```sql
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_records_unique
ON public.deleted_records(owner_id, table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_deleted_records_owner
ON public.deleted_records(owner_id);
```

### ink_ledger 表（墨水變動記錄）

```sql
CREATE TABLE IF NOT EXISTS public.ink_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ink_ledger_user_id ON public.ink_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ink_ledger_created_at ON public.ink_ledger(created_at);
```

### ink_sessions 表（批改會話）

```sql
CREATE TABLE IF NOT EXISTS public.ink_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ink_sessions_user_status
ON public.ink_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_ink_sessions_expires
ON public.ink_sessions(expires_at);
```

### ink_session_usage 表（批改會話用量）

```sql
CREATE TABLE IF NOT EXISTS public.ink_session_usage (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ink_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  usage_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ink_session_usage_session
ON public.ink_session_usage(session_id);

CREATE INDEX IF NOT EXISTS idx_ink_session_usage_user
ON public.ink_session_usage(user_id);
```

### ink_orders 表（購點訂單）

```sql
CREATE TABLE IF NOT EXISTS public.ink_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  drops INTEGER NOT NULL,
  amount_twd INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_txn_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ink_orders_provider_txn
ON public.ink_orders(provider, provider_txn_id);

CREATE INDEX IF NOT EXISTS idx_ink_orders_user_id ON public.ink_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_ink_orders_status ON public.ink_orders(status);
```

### updated_at 自動更新（classrooms / students / assignments / submissions）

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_classrooms_updated_at') THEN
    CREATE TRIGGER update_classrooms_updated_at
    BEFORE UPDATE ON public.classrooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_students_updated_at') THEN
    CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assignments_updated_at') THEN
    CREATE TRIGGER update_assignments_updated_at
    BEFORE UPDATE ON public.assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_submissions_updated_at') THEN
    CREATE TRIGGER update_submissions_updated_at
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ink_orders_updated_at') THEN
    CREATE TRIGGER update_ink_orders_updated_at
    BEFORE UPDATE ON public.ink_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
```

## 3. Storage 設定

1. Supabase Dashboard → Storage
2. 建立 Bucket：`homework-images`

是否設為 Public 視需求而定。若不公開，圖片仍可由後端下載。

## 4. 同步 API 流程（後端代理）

前端不再使用 Supabase SDK，而是呼叫你的後端 API：

- `POST /api/data/submission`：上傳圖片 + 寫入資料庫
- `POST /api/data/sync`：上傳班級／學生／作業／批改結果（全量同步）
- `GET /api/data/sync`：下載雲端資料回本機
- `deleted_records` 會用於「刪除優先」衝突規則，避免資料被舊裝置覆蓋回來。
- `GET /api/storage/download?submissionId=...`：下載圖片

前端已改為「資料變更後自動同步」，不需要手動按鈕。

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

完整同步（拉資料回本機）：

```typescript
await fetch('/api/data/sync', {
  method: 'GET',
  credentials: 'include'
})
```

## 5. 驗證方式

1. 登入後建立班級 / 作業 / 匯入作業
2. 等待同步指示顯示「已同步」
3. Supabase Database 應該看到 classrooms / students / assignments / submissions
4. Storage 應該出現 submissions/{submissionId}.webp

## 6. 本機開發提醒

`/api/*` 是後端 Serverless Function，本機開發建議使用 `vercel dev`，或設定等效的 API proxy。

## 7. 安全性建議

- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 放進前端
- 若需開放多人共用，再加 RLS 政策與共享權限模型

---

**相關文檔**：
- https://supabase.com/docs
