# 📸 作业扫描器使用指南

## 概述

作业扫描器是一个 Mobile-first 的 PWA 页面，使用摄像头扫描学生作业，自动压缩并保存到本地数据库。

## 功能特性

✅ **满版视频预览**
- react-webcam 实时显示摄像头画面
- 使用后置摄像头（移动设备）
- 全屏沉浸式体验

✅ **智能座号控制**
- 集成 `useSeatController` Hook
- 显示当前学生姓名
- 语音识别跳转座号
- 自动切换到下一位

✅ **图片压缩优化**
- 自动缩放到 1024px 宽度
- 转换为 WebP 格式（高压缩率）
- 减少存储空间占用

✅ **离线优先**
- 所有数据保存到 IndexedDB
- 无需网络连接即可使用
- 后续可同步到云端

✅ **快捷操作**
- 空格键快速拍照
- 语音控制座号跳转
- 流畅的操作体验

---

## 架构设计

### 组件结构

```
ScannerDemo.tsx (演示入口)
    ↓
    ├─ 初始化测试数据
    │   ├─ 创建班级
    │   ├─ 创建学生
    │   └─ 创建作业
    ↓
ScannerPage.tsx (扫描器核心)
    ↓
    ├─ react-webcam (摄像头)
    ├─ useSeatController (座号控制)
    ├─ Dexie 数据查询
    └─ 图片压缩保存
```

### 数据流

```
1. 用户进入扫描页面
    ↓
2. 加载当前座号的学生信息
    ↓
3. 显示学生姓名
    ↓
4. 用户点击拍照/按空格键
    ↓
5. 获取 Webcam 截图
    ↓
6. 压缩图片 (1024px, WebP, 80% 质量)
    ↓
7. 保存到 submissions 表
    ↓
8. 显示成功动画
    ↓
9. 自动切换到下一位学生
```

---

## 使用步骤

### 1. 初始化测试数据

首次使用需要初始化：

```
访问 http://localhost:5174
↓
点击「作業掃描器」
↓
点击「初始化测试数据」
↓
创建：三年甲班 + 10 位学生 + 1 个作业
```

测试数据：
- **班级**：三年甲班
- **学生**：王小明、李小华、张小强... (共 10 位)
- **作业**：数学习作第一单元 (5 页)

### 2. 开始扫描

```
点击「开始扫描作业」
↓
允许摄像头权限
↓
进入全屏扫描模式
```

### 3. 扫描作业

**方法 1：使用拍照按钮**
1. 对准学生作业
2. 点击绿色「拍照」按钮
3. 等待压缩和保存
4. 自动切换到下一位

**方法 2：使用空格键（推荐）**
1. 对准学生作业
2. 按空格键
3. 快速拍照，提高效率

**方法 3：使用语音控制**
1. 点击右上角麦克风图标
2. 允许麦克风权限
3. 说出座号，例如「五」或「15」
4. 自动跳转到对应学生

### 4. 查看结果

```
返回设置页面
↓
点击「查看已扫描」
↓
控制台显示所有已扫描作业
```

---

## UI 布局

### Mobile-First 设计

```
┌─────────────────────────┐
│  🔴 扫描中    🎤        │ ← 顶部状态栏
│                         │
│                         │
│    Webcam 视频画面       │ ← 满版显示
│                         │
│                         │
│                         │
├─────────────────────────┤
│  👤 王小明              │ ← 学生信息
│                         │
│  [ 1 ] [  拍照 (空格)  ] │ ← 控制栏
│                         │
│  🔴 语音识别中...       │ ← 语音状态
└─────────────────────────┘
```

### 颜色方案

- **背景**：黑色（沉浸式）
- **主按钮**：绿色（拍照）
- **座号**：蓝色
- **状态**：渐变半透明
- **成功**：绿色闪烁动画

---

## 技术实现

### 1. 摄像头配置

```typescript
<Webcam
  ref={webcamRef}
  audio={false}
  screenshotFormat="image/jpeg"
  videoConstraints={{
    facingMode: 'environment', // 后置摄像头
    width: 1920,
    height: 1080
  }}
/>
```

### 2. 图片压缩

```typescript
import { compressImage } from '@/lib/imageCompression'

// 获取截图
const imageSrc = webcamRef.current.getScreenshot()

// 压缩图片
const compressedBlob = await compressImage(imageSrc, {
  maxWidth: 1024,    // 最大宽度
  quality: 0.8,      // 质量 80%
  format: 'image/webp' // WebP 格式
})

// 保存到 Dexie
await db.submissions.add({
  id: generateId(),
  assignmentId,
  studentId: currentStudent.id,
  status: 'scanned',
  imageBlob: compressedBlob,
  createdAt: getCurrentTimestamp()
})
```

### 3. 座号控制集成

```typescript
const {
  currentSeat,
  nextSeat,
  jumpToSeat,
  isListening,
  startListening,
  stopListening
} = useSeatController({
  maxSeat: 10,
  onSeatChange: async (seat) => {
    // 加载新学生信息
    await loadStudentInfo(seat)
  }
})
```

### 4. 学生信息查询

```typescript
const loadStudentInfo = async (seatNumber: number) => {
  const student = await db.students
    .where('classroomId')
    .equals(classroomId)
    .and((s) => s.seatNumber === seatNumber)
    .first()

  setCurrentStudent(student)
}
```

---

## 性能优化

### 1. 图片压缩

**压缩前**：
- 1920×1080 JPEG
- 约 500-800 KB

**压缩后**：
- 1024×576 WebP
- 约 30-80 KB

**优化效果**：减少 **90%** 存储空间

### 2. 自动重用实例

- Webcam 实例复用，避免重复初始化
- SpeechRecognition 自动重启，持续监听

### 3. 键盘快捷键

- 空格键拍照，减少点击操作
- 提高扫描效率

---

## 常见问题

### Q1: 摄像头无法启动？

**解决方法**：
1. 检查浏览器权限
2. 确保使用 HTTPS 或 localhost
3. Chrome/Edge 支持最佳

### Q2: 图片保存失败？

**可能原因**：
1. IndexedDB 存储空间不足
2. 图片压缩失败

**解决方法**：
1. 清理浏览器数据
2. 检查控制台错误信息

### Q3: 学生信息显示为空？

**原因**：该座号没有对应的学生

**解决方法**：
1. 检查学生数据是否正确创建
2. 确认 classroomId 和 seatNumber 匹配

### Q4: 语音识别不工作？

**原因**：浏览器不支持或权限被拒绝

**解决方法**：
1. 使用 Chrome/Edge 浏览器
2. 允许麦克风权限
3. 确保网络连接（某些浏览器需要）

---

## 快捷键

| 按键 | 功能 |
|------|------|
| **空格** | 拍照 |
| **Esc** | 返回设置 |

---

## 测试建议

### 测试场景 1：基本拍照流程
1. 初始化数据
2. 进入扫描模式
3. 拍照 10 次（10 位学生）
4. 查看已扫描作业
5. 验证 IndexedDB 中有 10 条记录

### 测试场景 2：语音控制
1. 启动语音识别
2. 说「五」跳到第 5 号
3. 拍照
4. 说「十」跳到第 10 号
5. 拍照

### 测试场景 3：空格键快捷操作
1. 对准作业
2. 连续按空格键快速拍照
3. 验证自动切换座号

---

## Chrome DevTools 验证

### 查看已保存的图片

1. F12 → Application → IndexedDB → RedPenDB → submissions
2. 点击记录查看 imageBlob
3. 右键 → 查看图片

### 查看图片大小

```javascript
// 控制台执行
const submissions = await db.submissions.toArray()
submissions.forEach(s => {
  console.log(`座号 ${s.studentId}: ${(s.imageBlob.size / 1024).toFixed(2)} KB`)
})
```

---

## 文件结构

```
src/
├── pages/
│   ├── ScannerPage.tsx      # 扫描器核心页面
│   └── ScannerDemo.tsx      # 演示入口（含测试数据初始化）
├── lib/
│   ├── imageCompression.ts  # 图片压缩工具
│   ├── db.ts                # Dexie 数据库
│   └── db-examples.ts       # 数据库操作示例
└── hooks/
    └── useSeatController.ts # 座号控制器 Hook
```

---

## 下一步优化

### 功能增强
- [ ] 支持批量扫描（连续拍照）
- [ ] 添加裁剪功能
- [ ] 支持手写笔记标注
- [ ] OCR 文字识别

### 性能优化
- [ ] 使用 Web Worker 压缩图片
- [ ] 添加拍照预览
- [ ] 支持离线缓存策略

### 同步功能
- [ ] 实现 Supabase 同步
- [ ] 添加同步状态指示器
- [ ] 支持冲突解决

---

## License

MIT
