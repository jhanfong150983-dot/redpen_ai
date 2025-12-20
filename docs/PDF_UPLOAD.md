# 📄 PDF 上传功能使用指南

## 概述

作业扫描器现在支持 **PDF 文件上传**功能，可以自动将 PDF 第一页转换为图片并保存到数据库。

## 功能特性

✅ **支持多种格式**
- 图片格式：JPG, PNG, GIF, WebP
- PDF 格式：自动提取第一页

✅ **自动转换**
- PDF → Canvas → WebP Blob
- 高质量渲染（2x 分辨率）
- 自动压缩优化

✅ **无缝集成**
- 与拍照功能统一接口
- 自动保存并切换下一位
- 完整错误处理

---

## 技术实现

### 1. PDF.js Worker 配置

在 Vite 环境下，需要正确配置 PDF.js worker：

```typescript
import * as pdfjsLib from 'pdfjs-dist'

// 设置 worker 路径
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

**为什么需要设置 workerSrc？**
- PDF.js 使用 Web Worker 进行 PDF 解析
- Vite 需要明确指定 worker 文件路径
- 使用 `import.meta.url` 确保正确的模块路径

---

### 2. PDF 转图片核心代码

```typescript
export async function convertPdfToImage(
  file: File,
  options = {}
): Promise<Blob> {
  const { scale = 2, format = 'image/webp', quality = 0.8 } = options

  // 1. 读取 PDF 文件
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  // 2. 获取第一页
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })

  // 3. 创建 Canvas
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = viewport.width
  canvas.height = viewport.height

  // 4. 渲染 PDF 页面到 Canvas
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise

  // 5. Canvas 转 Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('转换失败')),
      format,
      quality
    )
  })
}
```

---

### 3. 文件类型检测

```typescript
export function getFileType(file: File): 'image' | 'pdf' | 'unknown' {
  const mimeType = file.type.toLowerCase()

  if (mimeType === 'application/pdf') {
    return 'pdf'
  }

  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  // 通过扩展名判断
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'pdf') {
    return 'pdf'
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
    return 'image'
  }

  return 'unknown'
}
```

---

### 4. 统一处理流程

```typescript
const handleFileUpload = async (file: File) => {
  const fileType = getFileType(file)
  let imageBlob: Blob

  if (fileType === 'image') {
    // 处理图片：读取 → 压缩 → Blob
    const dataUrl = await readFileAsDataURL(file)
    imageBlob = await compressImage(dataUrl, {
      maxWidth: 1024,
      quality: 0.8,
      format: 'image/webp'
    })
  } else if (fileType === 'pdf') {
    // 处理 PDF：提取第一页 → Canvas → Blob
    imageBlob = await convertPdfToImage(file, {
      scale: 2,
      format: 'image/webp',
      quality: 0.8
    })
  } else {
    throw new Error('不支持的文件格式')
  }

  // 保存到数据库
  await saveImage(imageBlob)
}
```

---

## 使用方法

### 方法 1：点击上传按钮

1. 进入扫描模式
2. 点击左侧「**上传**」按钮（紫色，Upload 图标）
3. 选择图片或 PDF 文件
4. 自动处理并保存
5. 自动切换到下一位学生

### 方法 2：拖放文件（未实现）

_可作为未来功能扩展_

---

## 处理流程

### 图片文件处理流程

```
用户选择图片
    ↓
FileReader.readAsDataURL()
    ↓
compressImage()
    - 缩放到 1024px
    - 转换为 WebP
    - 质量 80%
    ↓
保存到 Dexie
    ↓
nextSeat() 切换下一位
```

### PDF 文件处理流程

```
用户选择 PDF
    ↓
file.arrayBuffer()
    ↓
pdfjsLib.getDocument()
    ↓
pdf.getPage(1) 获取第一页
    ↓
page.render() 渲染到 Canvas
    - scale: 2x (高分辨率)
    ↓
canvas.toBlob()
    - format: image/webp
    - quality: 0.8
    ↓
保存到 Dexie
    ↓
nextSeat() 切换下一位
```

---

## UI 布局

### 底部控制栏布局

```
┌──────────────────────────────────────┐
│  [座号]  [上传]  [      拍照      ]  │
│   1      📤         📷 拍照          │
└──────────────────────────────────────┘
```

- **座号区域**：蓝色，显示当前座号
- **上传按钮**：紫色，Upload 图标
- **拍照按钮**：绿色，Camera 图标（占最大空间）

---

## 性能优化

### PDF 渲染参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `scale` | 2 | 2x 分辨率，提高清晰度 |
| `format` | `image/webp` | WebP 格式，高压缩率 |
| `quality` | 0.8 | 80% 质量，平衡大小和质量 |

### 文件大小对比

| 文件类型 | 原始大小 | 转换后大小 | 压缩率 |
|---------|---------|-----------|-------|
| PDF (A4, 1页) | 200-500 KB | 50-100 KB | **75-80%** |
| JPG 图片 | 800 KB | 60 KB | **92%** |
| PNG 图片 | 2 MB | 80 KB | **96%** |

---

## 错误处理

### 常见错误及解决方法

| 错误 | 原因 | 解决方法 |
|------|------|----------|
| `Worker not found` | PDF.js worker 路径错误 | 检查 `workerSrc` 配置 |
| `Invalid PDF structure` | PDF 文件损坏 | 重新上传或修复 PDF |
| `Canvas conversion failed` | Canvas API 不支持 | 使用现代浏览器 |
| `File too large` | 文件超过浏览器限制 | 压缩 PDF 或使用更小的文件 |

### 错误捕获示例

```typescript
try {
  const imageBlob = await convertPdfToImage(file)
  await saveImage(imageBlob)
} catch (err) {
  console.error('PDF 转换失败:', err)
  setError(
    err instanceof Error
      ? `PDF 转换失败: ${err.message}`
      : 'PDF 转换失败'
  )
}
```

---

## 控制台日志

### 成功处理 PDF

```
📁 文件类型: pdf, 文件名: math-homework.pdf
📄 处理 PDF 文件...
📄 开始处理 PDF: math-homework.pdf
✅ PDF 加载成功，共 5 页
📐 页面尺寸: 1654x2339
✅ PDF 页面渲染完成
✅ 转换完成: 78.32 KB
✅ PDF 转换完成: 78.32 KB
✅ 保存成功: 1702876543210-abc123
```

### 成功处理图片

```
📁 文件类型: image, 文件名: photo.jpg
🖼️ 处理图片文件...
🔄 开始压缩图片...
✅ 图片压缩完成: 45.21 KB
✅ 保存成功: 1702876543211-def456
```

---

## 浏览器兼容性

| 浏览器 | PDF.js | Canvas toBlob | 整体支持 |
|--------|--------|---------------|---------|
| Chrome 90+ | ✅ | ✅ | ✅ 完全支持 |
| Edge 90+ | ✅ | ✅ | ✅ 完全支持 |
| Firefox 88+ | ✅ | ✅ | ✅ 完全支持 |
| Safari 14+ | ✅ | ✅ | ✅ 完全支持 |

**建议**：使用 Chrome 或 Edge 以获得最佳性能。

---

## 测试建议

### 测试场景 1：上传单张图片
1. 点击「上传」按钮
2. 选择 JPG 或 PNG 图片
3. 验证自动保存并切换座号

### 测试场景 2：上传 PDF
1. 点击「上传」按钮
2. 选择多页 PDF 文件
3. 验证只提取第一页
4. 检查控制台日志确认转换成功

### 测试场景 3：上传不支持的文件
1. 尝试上传 .txt 或 .docx 文件
2. 验证显示错误提示
3. 不应保存到数据库

### 测试场景 4：混合使用
1. 第 1 号：拍照
2. 第 2 号：上传图片
3. 第 3 号：上传 PDF
4. 验证所有记录正确保存

---

## 查看保存的数据

### Chrome DevTools 验证

```
F12 → Application → IndexedDB → RedPenDB → submissions
```

### 控制台查询

```javascript
// 查看所有提交记录
const submissions = await db.submissions.toArray()
console.table(submissions.map(s => ({
  id: s.id,
  studentId: s.studentId,
  status: s.status,
  size: `${(s.imageBlob.size / 1024).toFixed(2)} KB`,
  createdAt: new Date(s.createdAt).toLocaleString()
})))
```

---

## 未来优化

### 功能增强
- [ ] 支持多页 PDF 处理
- [ ] 拖放文件上传
- [ ] PDF 页面选择器
- [ ] 批量上传

### 性能优化
- [ ] 使用 Web Worker 处理 PDF
- [ ] 添加上传进度条
- [ ] 支持大文件分块处理
- [ ] 缓存已处理的 PDF

---

## 文件结构

```
src/
└── lib/
    ├── pdfToImage.ts         # PDF 转图片工具
    │   ├── convertPdfToImage()  # 核心转换函数
    │   ├── getFileType()        # 文件类型检测
    │   └── fileToBlob()         # 文件转 Blob
    ├── imageCompression.ts   # 图片压缩工具
    └── db.ts                 # Dexie 数据库
```

---

## License

MIT
