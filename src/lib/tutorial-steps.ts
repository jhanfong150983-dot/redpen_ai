/**
 * 引导式教学步骤定义
 */

export interface TutorialStep {
  id: string
  title: string
  content: string
  targetSelector: string // CSS 选择器定位目标元素
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  highlightElement?: boolean // 是否高亮显示目标元素
  animation?: {
    type: 'drag-drop' // 动画类型
    fromSelector: string // 起始元素选择器
    toSelector: string // 目标元素选择器
  }
}

export interface TutorialFlow {
  id: string
  name: string
  steps: TutorialStep[]
}

/**
 * 班级管理教学流程（7 步）
 */
const classroomFlow: TutorialFlow = {
  id: 'classroom',
  name: '班級管理教學',
  steps: [
    {
      id: 'welcome',
      title: '歡迎使用班級管理',
      content: '這裡可以管理您的所有班級，包含建立、編輯、分類和刪除班級。讓我們開始快速導覽！',
      targetSelector: 'body',
      position: 'center',
      highlightElement: false
    },
    {
      id: 'create-classroom',
      title: '新增班級',
      content: '點擊卡片列表最下方的「新增班級」按鈕，即可快速建立新班級。您可以輸入班級名稱、學生人數，和直接匯入學生名單。',
      targetSelector: '[data-tutorial="create-classroom"]',
      position: 'top',
      highlightElement: true
    },
    {
      id: 'create-folder',
      title: '建立資料夾',
      content: '點擊「新建資料夾」按鈕可以建立分類資料夾，例如「112學年度」、「七年級」等，幫助您組織管理班級。',
      targetSelector: '[data-tutorial="create-folder"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'drag-drop',
      title: '拖曳分類',
      content: '您可以直接拖曳左側的班級卡片到右側的資料夾中，輕鬆完成分類。也可以拖曳到「全部」來取消分類。',
      targetSelector: '.space-y-2',
      position: 'right',
      highlightElement: false,
      animation: {
        type: 'drag-drop',
        fromSelector: '[data-tutorial-card="first-classroom-card"]',
        toSelector: '[data-tutorial-folder="first-folder"]'
      }
    },
    {
      id: 'sort-options',
      title: '排序功能',
      content: '使用右上角的排序選單，可以依建立時間或名稱筆畫順序排列班級和資料夾，方便您快速找到需要的班級。',
      targetSelector: 'select[aria-label="排序方式"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'edit-classroom',
      title: '編輯班級',
      content: '點擊班級名稱旁的筆圖標可以修改班級名稱。所有修改都會自動同步到雲端。',
      targetSelector: '[title="更改名稱"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'edit-students',
      title: '編輯學生名單',
      content: '點擊人頭圖標可以編輯學生名單。所有修改都會自動同步到雲端。',
      targetSelector: '[title="編輯學生名單"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'complete',
      title: '完成！',
      content: '您已經掌握班級管理的基本操作了！現在可以開始建立您的班級，開啟教學管理之旅。',
      targetSelector: 'body',
      position: 'center',
      highlightElement: false
    }
  ]
}

/**
 * 作业管理教学流程（8 步）
 */
const assignmentFlow: TutorialFlow = {
  id: 'assignment',
  name: '作業管理教學',
  steps: [
    {
      id: 'welcome',
      title: '歡迎使用作業管理',
      content: '這裡可以為班級建立作業、設定標準答案、管理作業分類。讓我們開始導覽！',
      targetSelector: 'body',
      position: 'center',
      highlightElement: false
    },
    {
      id: 'select-classroom',
      title: '選擇班級',
      content: '首先選擇要管理作業的班級。每個班級都有獨立的作業列表和資料夾。',
      targetSelector: 'select[aria-label="選擇班級"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'create-assignment',
      title: '新增作業',
      content: '點擊「新增作業」按鈕可以建立新作業。您需要上傳作業檔案，系統會自動辨識頁數和題目。',
      targetSelector: '[title="新增作業"]',
      position: 'top',
      highlightElement: true
    },
    {
      id: 'sort-and-folder',
      title: '排序與分類',
      content: '使用排序選單可以調整作業和資料夾的順序。建立資料夾可以將作業分類為「段考」、「小考」、「作業」等。',
      targetSelector: 'select[aria-label="排序方式"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'answer-key',
      title: '設定標準答案',
      content: '點擊作業卡片上的書本圖標可以設定標準答案。上傳答案卷照片後，AI 會自動辨識並建立評分標準。',
      targetSelector: '[title="編輯標準答案"]',
      position: 'left',
      highlightElement: true
    },
    {
      id: 'copy-assignment',
      title: '複製作業',
      content: '點擊複製圖標可以將作業複製到其他班級，節省重複建立的時間。',
      targetSelector: '[title="複製作業到其他班級"]',
      position: 'left',
      highlightElement: true
    },
    {
      id: 'edit-assignment',
      title: '編輯作業',
      content: '點擊作業標題旁的筆圖標可以修改作業名稱。點擊垃圾桶圖標可以刪除作業（注意：刪除後無法恢復）。',
      targetSelector: '[title="修改標題"]',
      position: 'bottom',
      highlightElement: true
    },
    {
      id: 'complete',
      title: '完成！',
      content: '您已經了解作業管理的功能了！接下來可以建立作業、匯入學生作業並使用 AI 批改。',
      targetSelector: 'body',
      position: 'center',
      highlightElement: false
    }
  ]
}

/**
 * 所有教学流程
 */
export const TUTORIAL_FLOWS: Record<string, TutorialFlow> = {
  classroom: classroomFlow,
  assignment: assignmentFlow
  // 注：import 和 grading 流程暂不实现，因为这些页面不在当前修改范围内
}

/**
 * 获取指定教学流程
 * @param flowId 流程 ID
 */
export function getTutorialFlow(flowId: string): TutorialFlow | undefined {
  return TUTORIAL_FLOWS[flowId]
}
