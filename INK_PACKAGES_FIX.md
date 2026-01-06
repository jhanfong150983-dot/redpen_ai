# 修復「尚無方案」問題

## 問題描述

補充墨水頁面顯示「尚未設定補充方案,請聯繫管理者」。

## 原因

資料庫 `ink_packages` 表中沒有任何方案資料,或者:
1. 所有方案的 `is_active` 都是 `false`
2. 方案的時間範圍設定錯誤 (`starts_at` / `ends_at`)

## 解決步驟

### 1. 檢查資料庫

在 Supabase Dashboard → SQL Editor 執行:

```sql
SELECT id, label, drops, bonus_drops, is_active, sort_order, starts_at, ends_at
FROM public.ink_packages
ORDER BY sort_order, drops;
```

### 2. 新增預設方案

如果查詢結果是空的,執行 [fix-ink-packages.sql](fix-ink-packages.sql):

```sql
INSERT INTO public.ink_packages (label, description, drops, bonus_drops, sort_order, is_active) VALUES
('輕量補充', '適合試用或小量需求', 30, 0, 1, true),
('標準補充', '常用老師日常需求', 50, 0, 2, true),
('進階補充', '批改量較大時使用', 100, 0, 3, true),
('大量補充', '適合大量班級或期末', 300, 0, 4, true);
```

### 3. 檢查方案是否生效

執行完後,再次查詢確認:

```sql
SELECT id, label, drops, bonus_drops, is_active, sort_order
FROM public.ink_packages
WHERE is_active = true
ORDER BY sort_order, drops;
```

應該會看到 4 個方案。

### 4. 重新整理頁面

回到補充墨水頁面,重新整理,應該就能看到方案了。

## 方案說明

每個方案包含:
- **label** - 方案名稱
- **description** - 方案說明
- **drops** - 購買的墨水滴數 (也是金額,1滴 = 1元)
- **bonus_drops** - 額外贈送的滴數
- **sort_order** - 排序順序
- **is_active** - 是否啟用
- **starts_at** - 開始時間 (可選)
- **ends_at** - 結束時間 (可選)

## 自訂方案

你可以根據需求修改方案:

```sql
-- 更新方案
UPDATE public.ink_packages
SET drops = 100, bonus_drops = 20
WHERE id = 1;

-- 停用方案
UPDATE public.ink_packages
SET is_active = false
WHERE id = 1;

-- 新增限時方案 (例如:2026年1月的優惠)
INSERT INTO public.ink_packages (
  label, description, drops, bonus_drops,
  starts_at, ends_at, sort_order, is_active
) VALUES (
  '新年優惠', '限時加贈100%', 50, 50,
  '2026-01-01', '2026-01-31', 0, true
);
```

## API 端點

- `GET /api/ink/orders?action=packages` - 取得可用方案列表
  - 只返回 `is_active = true` 的方案
  - 只返回在時間範圍內的方案 (如果有設定 starts_at/ends_at)

## 前端邏輯

[src/pages/InkTopUp.tsx:142-164](src/pages/InkTopUp.tsx#L142-L164) 的 `loadPackages()` 函數會:

1. 呼叫 API 取得方案
2. 如果 API 返回的 `packages` 是空陣列,顯示「尚未設定補充方案」
3. 如果有方案,自動選擇第一個

## Debug 方式

打開瀏覽器的 Developer Tools (F12) → Console,重新整理頁面,查看:

```
📦 API 返回的方案資料: { packages: [...] }
📦 解析後共 4 個方案: [...]
```

如果看到:
```
⚠️ 資料庫中沒有方案,請執行 fix-ink-packages.sql 來新增方案
```

就表示需要執行上面的 SQL。

## 文檔參考

- [docs/SUPABASE_SETUP.md#預設方案](docs/SUPABASE_SETUP.md#L300-L308) - 原始文檔中的預設方案 SQL
