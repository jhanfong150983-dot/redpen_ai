# 權限和墨水快取檢查報告

## 檢查日期
2026-01-06

## 檢查範圍
全面檢查所有與 `inkBalance`、`permissionTier`、`role` 相關的快取邏輯

## 檢查結果

### ✅ 已修復的問題

#### 1. App.tsx - fetchAuth 的快取邏輯 (已移除)

**位置**: [src/App.tsx:112-120](src/App.tsx#L112-L120)

**原始問題**:
```typescript
// ❌ 舊的有問題的程式碼 (已移除)
setAuth((prev) => {
  const previousBalance = prev.status === 'authenticated' ? prev.user.inkBalance ?? 0 : 0
  const nextBalance =
    typeof data.user.inkBalance === 'number'
      ? data.user.inkBalance
      : previousBalance  // 會永久快取錯誤值!
  return {
    status: 'authenticated',
    user: {
      ...data.user,
      inkBalance: nextBalance
    }
  }
})
```

**問題描述**:
- 如果 API 第一次返回 `inkBalance: null`,會被快取為 `0`
- 之後即使 API 修復,前端仍會保留錯誤的值
- 導致用戶看到的權限等級和墨水餘額不正確

**修復後**:
```typescript
// ✅ 新的正確程式碼
setAuth({
  status: 'authenticated',
  user: {
    ...data.user,
    role: data.user.role || 'user',
    permissionTier: data.user.permissionTier || 'basic',
    inkBalance: typeof data.user.inkBalance === 'number' ? data.user.inkBalance : 0
  }
})
```

**修復說明**:
- 直接使用 API 返回的值,不保留舊值
- 如果 API 返回 `null`,顯示 `0` (表示有問題,而不是假裝正常)
- 配合事件系統 (`INK_BALANCE_EVENT`) 仍可即時更新墨水餘額

---

### ✅ 正常的快取使用

#### 1. App.tsx - INK_BALANCE_EVENT 事件監聽器

**位置**: [src/App.tsx:167-187](src/App.tsx#L167-L187)

**用途**: 監聽墨水餘額變化事件,即時更新 UI

**程式碼**:
```typescript
const handleInkBalance = (event: Event) => {
  const detail = (event as CustomEvent<InkBalanceDetail>).detail
  if (!detail || !Number.isFinite(detail.inkBalance)) return
  setAuth((prev) => {
    if (prev.status !== 'authenticated') return prev
    return {
      ...prev,
      user: {
        ...prev.user,
        inkBalance: detail.inkBalance  // ✅ 這裡使用 prev 是正確的
      }
    }
  })
}
```

**為什麼這裡使用 `prev` 是正確的**:
- 這是**事件驅動的更新**,不是 API 查詢
- 只更新 `inkBalance` 欄位,保留其他欄位 (role, permissionTier 等)
- 事件由以下地方觸發:
  - 批改作業時扣墨水 ([src/lib/gemini.ts](src/lib/gemini.ts))
  - 購買墨水成功 ([src/pages/InkTopUp.tsx](src/pages/InkTopUp.tsx))
  - 批改會話結束 ([src/lib/ink-session.ts](src/lib/ink-session.ts))

**狀態**: ✅ 正常,無需修改

---

#### 2. ink-session.ts - Session ID 快取

**位置**: [src/lib/ink-session.ts:5-16](src/lib/ink-session.ts#L5-L16)

**用途**: 快取批改會話 ID 到 sessionStorage

**程式碼**:
```typescript
let cachedInkSessionId: string | null = null

function readStoredInkSessionId() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(INK_SESSION_STORAGE_KEY)
}

export function getInkSessionId() {
  if (cachedInkSessionId !== null) return cachedInkSessionId
  const stored = readStoredInkSessionId()
  cachedInkSessionId = stored || null
  return cachedInkSessionId
}
```

**快取內容**:
- ✅ 只快取 `sessionId` (字串)
- ✅ 不快取 `inkBalance` 或權限資料
- ✅ 使用 sessionStorage (分頁關閉即清除)

**狀態**: ✅ 正常,無需修改

---

### ✅ 其他 localStorage/sessionStorage 使用

檢查結果:所有 localStorage/sessionStorage 使用都**不涉及權限或墨水資料**

| 檔案 | 用途 | 快取內容 |
|------|------|----------|
| [src/lib/admin-view-as.ts](src/lib/admin-view-as.ts#L33-L41) | 管理者模擬用戶 | 模擬的用戶 ID |
| [src/lib/db.ts](src/lib/db.ts#L313-L359) | 資料夾遷移 | 空資料夾資料 (遷移後刪除) |
| [src/lib/ink-session.ts](src/lib/ink-session.ts#L9-L25) | 批改會話 | Session ID |
| [src/lib/logger.ts](src/lib/logger.ts#L6) | Debug 模式 | Debug 開關 |
| [src/lib/sort-preferences.ts](src/lib/sort-preferences.ts#L15-L34) | 排序偏好 | 用戶選擇的排序方式 |
| [src/lib/tutorial-storage.ts](src/lib/tutorial-storage.ts) | 教學狀態 | 教學完成進度 |
| [src/pages/CorrectionManagement.tsx](src/pages/CorrectionManagement.tsx#L38-L99) | 批改管理 | 排序、分組設定 |

**狀態**: ✅ 全部正常,無需修改

---

## 檢查項目總結

### ❌ 發現並修復的問題
1. **App.tsx fetchAuth 快取邏輯** - 會永久快取錯誤的 inkBalance 值 → **已修復**

### ✅ 正常的實作
1. **INK_BALANCE_EVENT 事件系統** - 即時更新墨水餘額
2. **ink-session.ts** - 只快取 session ID,不快取餘額
3. **其他 localStorage 使用** - 都不涉及權限或墨水

### 📋 無快取的資料來源
以下資料**完全依賴 API**,沒有前端快取:
- ✅ `user.role` - 從 `/api/auth/me` 取得
- ✅ `user.permissionTier` - 從 `/api/auth/me` 取得
- ✅ `user.inkBalance` (初始值) - 從 `/api/auth/me` 取得
- ✅ `user.inkBalance` (即時更新) - 透過 `INK_BALANCE_EVENT` 事件

---

## 建議

### ✅ 已完成
- [x] 移除 `fetchAuth` 中的 `previousBalance` 快取邏輯
- [x] 確保 API 始終返回正確的值 (已修復 RLS 問題)

### 📝 後續維護建議
1. **避免快取認證資料**: 所有 `user.*` 欄位應直接來自 API,不要保留舊值
2. **信任事件系統**: `INK_BALANCE_EVENT` 已經處理即時更新,不需要額外的快取
3. **API 優先**: 如果 API 返回 `null`,應該顯示錯誤,而不是用快取掩蓋問題

---

## 測試清單

- [ ] 清除瀏覽器 localStorage/sessionStorage
- [ ] 重新登入
- [ ] 確認顯示正確的 role (admin)
- [ ] 確認顯示正確的 permissionTier (admin)
- [ ] 確認顯示正確的 inkBalance (89)
- [ ] 批改作業後確認墨水即時扣除
- [ ] 購買墨水後確認墨水即時增加
- [ ] 重新整理頁面確認資料不會丟失

---

## 結論

**所有與權限和墨水相關的快取問題已經找出並修復。**

唯一的問題是 `App.tsx` 中的 `previousBalance` 快取邏輯,已經在本次修復中移除。其他所有 localStorage/sessionStorage 使用都是正常的,不涉及權限或墨水資料的快取。

系統現在完全依賴:
1. **API 查詢** - 取得最新的認證狀態和墨水餘額
2. **事件系統** - 即時更新墨水餘額變化

不再有任何會導致錯誤值被永久快取的邏輯。
