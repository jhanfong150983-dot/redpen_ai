-- 檢查 profiles 表的 RLS 是否啟用
-- 在 Supabase SQL Editor 執行這個查詢來查看目前狀態

-- 1. 查看 profiles 表的 RLS 狀態
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'profiles' AND schemaname = 'public';

-- 2. 查看現有的 RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';

-- ====================================================
-- 修復方案 1: 如果你想使用 RLS (推薦用於多用戶系統)
-- ====================================================

-- 啟用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 刪除舊的 policies (如果存在)
DROP POLICY IF EXISTS "Users can view own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profiles" ON public.profiles;

-- 建立新的 policies
-- 允許使用者查看自己的 profile
CREATE POLICY "Users can view own profiles"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 允許使用者新增自己的 profile
CREATE POLICY "Users can insert own profiles"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 允許使用者更新自己的 profile
CREATE POLICY "Users can update own profiles"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ====================================================
-- 修復方案 2: 如果你想關閉 RLS (簡單但不安全)
-- ====================================================
-- 注意: 這會讓所有用戶都能讀取所有 profiles
-- 只有在使用 service_role key 且完全信任後端時才建議使用

-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- ====================================================
-- 驗證修復
-- ====================================================

-- 再次查看 RLS 狀態
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'profiles' AND schemaname = 'public';

-- 查看 policies
SELECT
  policyname,
  cmd AS operation,
  roles
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
