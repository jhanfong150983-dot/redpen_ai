-- Supabase Storage Policy 設定
-- 在 Supabase Dashboard > SQL Editor 中執行此 SQL

-- 1. 允許所有人讀取 homework-images bucket 中的圖片
CREATE POLICY "Public Access - Anyone can view images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'homework-images' );

-- 2. 允許所有人上傳圖片到 homework-images bucket
-- 注意：如果你想限制只有認證用戶可以上傳，請參考下方註解的替代方案
CREATE POLICY "Public Upload - Anyone can upload images"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'homework-images' );

-- 3. 允許所有人更新自己上傳的圖片
CREATE POLICY "Public Update - Anyone can update images"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'homework-images' )
WITH CHECK ( bucket_id = 'homework-images' );

-- 4. 允許所有人刪除圖片
CREATE POLICY "Public Delete - Anyone can delete images"
ON storage.objects FOR DELETE
USING ( bucket_id = 'homework-images' );

-- ============================================
-- 替代方案：只允許認證用戶上傳（更安全）
-- 如果需要更高安全性，可以用以下 policy 替換上面的 INSERT policy
-- ============================================

-- CREATE POLICY "Authenticated users can upload"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--   bucket_id = 'homework-images'
--   AND auth.role() = 'authenticated'
-- );

-- ============================================
-- 檢查現有 Policies
-- ============================================

-- 查看 homework-images bucket 的所有 policies
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
WHERE schemaname = 'storage'
  AND tablename = 'objects';
