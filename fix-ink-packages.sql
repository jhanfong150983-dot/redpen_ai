-- 修復墨水方案設定
-- 在 Supabase SQL Editor 中執行此檔案

-- 檢查現有方案
SELECT id, label, drops, bonus_drops, is_active, sort_order
FROM public.ink_packages
ORDER BY sort_order, drops;

-- 如果沒有方案,新增預設方案
-- 注意: 如果已有方案,請先檢查上面的查詢結果,避免重複新增

INSERT INTO public.ink_packages (label, description, drops, bonus_drops, sort_order, is_active) VALUES
('輕量補充', '適合試用或小量需求', 30, 0, 1, true),
('標準補充', '常用老師日常需求', 50, 0, 2, true),
('進階補充', '批改量較大時使用', 100, 0, 3, true),
('大量補充', '適合大量班級或期末', 300, 0, 4, true)
ON CONFLICT DO NOTHING;

-- 驗證方案已新增
SELECT id, label, drops, bonus_drops, is_active, sort_order, created_at
FROM public.ink_packages
ORDER BY sort_order, drops;

-- 如果要更新現有方案,可以使用:
-- UPDATE public.ink_packages SET is_active = true WHERE is_active = false;

-- 如果要刪除所有方案重新開始,可以使用:
-- DELETE FROM public.ink_packages;
