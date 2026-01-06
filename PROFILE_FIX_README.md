# 修復 inkBalance 為 null 的問題

## 問題原因

你的帳號 (`jhanfong150983@gmail.com`) 登入後,後端返回的資料中 `inkBalance` 為 `null`,這是因為:

1. **資料庫中沒有你的 profile 記錄** - 當新用戶首次登入時,系統沒有自動在 `profiles` 表中建立記錄
2. **缺少自動建立 profile 的 trigger** - 原本的資料庫設定文件中缺少這個重要的 trigger

## 解決步驟

### 1. 在 Supabase 中執行 SQL

請登入你的 Supabase Dashboard → SQL Editor,執行 [fix-profile-trigger.sql](./fix-profile-trigger.sql) 檔案中的所有 SQL。

或者直接複製以下 SQL 執行:

```sql
-- 建立自動創建 profile 的函數
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    avatar_url,
    role,
    permission_tier,
    ink_balance
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'user',
    'basic',
    10
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 建立 trigger,當新用戶註冊時自動執行
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 針對已存在但沒有 profile 的用戶,手動補建 profile
INSERT INTO public.profiles (id, email, name, avatar_url, role, permission_tier, ink_balance)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'avatar_url', ''),
  'user',
  'basic',
  10
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;
```

### 2. 驗證修復

執行完 SQL 後:

1. 重新整理頁面並登入
2. 檢查前端返回的資料,`inkBalance` 應該不再是 `null`,而是 `10`
3. 可以在 Supabase Dashboard → Table Editor → profiles 表中確認你的記錄已建立

### 3. 未來新用戶

執行完上述 SQL 後,未來所有新用戶登入時都會自動建立 profile 記錄,不會再出現 `inkBalance: null` 的問題。

## 技術細節

### 問題發生位置

在 [api/auth/me.js:76-79](./api/auth/me.js#L76-L79) 中:

```javascript
inkBalance:
  profileLoaded && typeof profile?.ink_balance === 'number'
    ? profile.ink_balance
    : null
```

因為你的帳號沒有 profile 記錄,所以 `profileLoaded` 為 `false`,導致返回 `null`。

### 修復內容

1. 建立 `handle_new_user()` 函數 - 從 `auth.users` 的 metadata 中提取用戶資料並建立 profile
2. 建立 `on_auth_user_created` trigger - 當新用戶註冊時自動觸發
3. 補建現有用戶的 profile - 一次性修復所有缺少 profile 的用戶

## 相關文件

- [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md) - 已更新,加入自動建立 profile 的設定
- [fix-profile-trigger.sql](./fix-profile-trigger.sql) - 修復用的 SQL 腳本
