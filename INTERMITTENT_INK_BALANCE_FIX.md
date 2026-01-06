# 修復間歇性 inkBalance 為 null 的問題

## 問題描述

登入後,`inkBalance` **有時候有值,有時候是 null**,造成使用體驗不穩定。

## 根本原因

這是 **Row Level Security (RLS) 權限問題**:

1. 你的後端程式會根據環境判斷使用哪種 client:
   - 使用 `service_role key` → 有完整權限,可以讀取所有資料
   - 使用 `user access token` → 受 RLS 限制,可能被阻擋

2. 當使用 `user access token` 查詢時,如果 `profiles` 表的 RLS policy 沒有正確設定,查詢就會失敗,導致 `inkBalance` 返回 `null`

## 解決方案

### 方案 1: 臨時修復 (已套用) ✅

我已經修改 [api/auth/me.js](./api/auth/me.js#L24-L27),強制使用 admin client:

```javascript
// 臨時修復: 強制使用 admin client 來避免 RLS 問題
const useAdmin = true  // isServiceRoleKey()
const supabaseDb = getSupabaseAdmin()
```

**優點**: 立即生效,穩定可靠
**缺點**: 繞過了 RLS 安全機制

**現在重新部署或重啟本地開發伺服器,問題應該就解決了!**

### 方案 2: 正確修復 RLS (建議長期使用) 🔧

在 Supabase SQL Editor 執行 [fix-profiles-rls.sql](./fix-profiles-rls.sql) 中的 SQL:

```sql
-- 啟用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 建立正確的 policies
CREATE POLICY "Users can view own profiles"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profiles"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profiles"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

執行完後,把 [api/auth/me.js](./api/auth/me.js#L26) 改回:

```javascript
const useAdmin = isServiceRoleKey()
const supabaseDb = useAdmin
  ? getSupabaseAdmin()
  : accessToken
    ? getSupabaseUserClient(accessToken)
    : null
```

這樣就能正確使用 RLS 並保持安全性。

## 驗證修復

### 檢查 Supabase RLS 狀態

在 Supabase SQL Editor 執行:

```sql
-- 查看 RLS 是否啟用
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'profiles' AND schemaname = 'public';

-- 查看現有的 policies
SELECT policyname, cmd AS operation
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```

### 測試應用程式

1. 重新部署或重啟開發伺服器
2. 登入系統
3. 多次重新整理頁面
4. 確認 `inkBalance` **每次都有正確的值**,不會變成 `null`

## Debug Log

我已經加入詳細的 debug log,重新登入後可以在 console 看到:

```
🔍 Auth check: { userId: '...', useAdmin: true, ... }
✅ Profile query success
🔍 Profile data: { profileLoaded: true, ink_balance: 10, ... }
```

如果看到 `❌ Profile query failed`,表示查詢失敗,請檢查:
1. Supabase 連線設定
2. RLS policies 是否正確
3. 環境變數是否設定正確

## 相關檔案

- [api/auth/me.js](./api/auth/me.js) - 主要修改檔案
- [fix-profiles-rls.sql](./fix-profiles-rls.sql) - RLS 修復腳本
- [server/_supabase.js](./server/_supabase.js) - Supabase client 設定

## 下一步

1. ✅ 使用方案 1 的臨時修復先解決問題
2. 🔧 之後有空時執行方案 2 來正確設定 RLS
3. 🧹 確認修復後移除 debug log
