# 管理者面板整合更新

## 更新內容

已將所有管理功能整合到單一入口,使用 Tab 切換不同功能。

### 修改的檔案

1. **新建檔案**:
   - [src/pages/AdminPanel.tsx](src/pages/AdminPanel.tsx) - 新的整合管理面板

2. **修改檔案**:
   - [src/App.tsx](src/App.tsx)
     - 簡化 Page 類型定義 (移除 admin-users, admin-orders, admin-analytics, admin-tags,新增 admin-panel)
     - 移除多餘的 import (AdminUsers, AdminOrders, AdminAnalytics, AdminTags)
     - 新增 AdminPanel import
     - 簡化首頁的管理按鈕 (4個按鈕 → 1個"管理者面板"按鈕)
     - 整合所有管理頁面路由到 admin-panel
     - 更新 URL 參數處理邏輯

   - [src/pages/AdminAnalytics.tsx](src/pages/AdminAnalytics.tsx)
     - 將 onBack 改為可選參數
     - 添加條件渲染,當沒有 onBack 時不顯示返回按鈕

3. **無需修改的檔案** (已經有條件渲染):
   - [src/pages/AdminUsers.tsx](src/pages/AdminUsers.tsx) - 已有 `{onBack && ...}`
   - [src/pages/AdminOrders.tsx](src/pages/AdminOrders.tsx) - 已有 `{onBack && ...}`
   - [src/pages/AdminTags.tsx](src/pages/AdminTags.tsx) - 已有 `{onBack && ...}`

## 功能特點

### 整合管理面板

新的 AdminPanel 整合了 4 個管理功能:

1. **用戶管理** (AdminUsers)
2. **訂單管理** (AdminOrders)
3. **使用情形** (AdminAnalytics)
4. **標籤字典** (AdminTags)

### 使用方式

- 首頁點擊 "管理者面板" 按鈕進入
- 使用頂部 Tab 切換不同功能
- 統一的返回按鈕返回首頁
- 子頁面的返回按鈕自動隱藏

### UI 改進

**之前**:
```
[補充墨水] [使用情形儀表板] [訂單管理] [管理者介面] [標籤字典] [登出]
```

**之後**:
```
[補充墨水] [管理者面板] [登出]
```

更簡潔,不會讓頂部按鈕太擁擠。

## 向後兼容

支援舊的 URL 參數自動跳轉:
- `?page=admin-users` → 進入管理者面板
- `?page=admin-orders` → 進入管理者面板
- `?page=admin-analytics` → 進入管理者面板
- `?page=admin-tags` → 進入管理者面板
- `?page=admin-panel` → 進入管理者面板

未來可以擴展支援指定初始 Tab:
```typescript
<AdminPanel initialTab="orders" />
```

## 測試清單

- [ ] 以管理者身份登入
- [ ] 點擊 "管理者面板" 按鈕
- [ ] 確認顯示 4 個 Tab
- [ ] 切換每個 Tab,確認內容正確顯示
- [ ] 確認每個 Tab 的返回按鈕不顯示
- [ ] 點擊頂部的返回按鈕,確認回到首頁
- [ ] 以一般用戶登入,確認看不到 "管理者面板" 按鈕
- [ ] 測試舊的 URL 參數是否正確跳轉

## 未來改進

可以考慮在 URL 參數中加入當前 Tab 狀態:
- 方便直接連結到特定管理功能
- 重新整理頁面時保持當前 Tab

實作範例:
```typescript
// URL: ?page=admin-panel&tab=orders
const [activeTab, setActiveTab] = useState<TabType>(
  (new URLSearchParams(window.location.search).get('tab') as TabType) || initialTab
)

// Tab 切換時更新 URL
const handleTabChange = (tab: TabType) => {
  setActiveTab(tab)
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  window.history.replaceState({}, '', url.toString())
}
```
