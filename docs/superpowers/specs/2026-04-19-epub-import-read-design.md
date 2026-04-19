# EPUB 导入与阅读功能设计

## 概述

实现本地 EPUB 文件的导入和阅读功能，用户可通过书架页面管理本地书籍。

## 用户交互流程

### 导入流程
1. 用户在书架页面点击"导入 EPUB"按钮
2. 系统弹出文件选择对话框（支持 .epub 文件）
3. 用户选择文件后，系统将文件复制到 `app_data/epub_library/` 目录
4. 系统解析 EPUB 元数据（标题、作者、封面、目录）
5. 书籍信息存入 books 表

### 阅读流程
1. 用户在书架页面切换到"本地书籍"标签
2. 点击书籍卡片进入阅读器
3. 阅读器加载本地 EPUB 内容
4. 阅读进度自动保存

## 数据模型

### Book 结构扩展
```typescript
interface Book {
  url: string;                    // "local://epub/{uuid}"
  name: string;                   // 书名
  author: string;                 // 作者
  cover_url: string | null;       // 封面路径
  source_url: string;             // "local://epub"
  toc_url: string | null;         // 保留字段
  last_read_at: string | null;    // ISO 时间戳
  group_id: number | null;        // 分组
  book_type: string | null;       // "epub"
  intro: string | null;           // 简介
  extra: {
    epub_path: string;            // 文件系统路径
    chapter_count: number;        // 章节数
  };
}
```

### ReadingProgress 结构
```typescript
interface ReadingProgress {
  book_id: string;                // Book.url
  chapter_index: number;
  chapter_title: string;
  offset: number;                 // 字符偏移
}
```

## API 设计

### Rust 后端命令

#### `import_epub`
```rust
#[tauri::command]
pub async fn import_epub(path: String) -> Result<Book, String>
```
- 输入：文件路径（通过 dialog 选择）
- 输出：导入的书籍信息
- 流程：复制文件 → 解析元数据 → 存入数据库

#### `read_local_epub`
```rust
#[tauri::command]
pub async fn read_local_epub(
    book_url: String,
    chapter_index: usize
) -> Result<String, String>
```
- 输入：书籍 URL，章节索引
- 输出：章节内容（HTML 格式）

#### `list_local_epubs`
```rust
#[tauri::command]
pub fn list_local_epubs() -> Result<Vec<Book>, String>
```
- 输入：无
- 输出：所有本地 EPUB 书籍列表

#### `delete_local_epub`
```rust
#[tauri::command]
pub async fn delete_local_epub(book_url: String) -> Result<bool, String>
```
- 输入：书籍 URL
- 输出：是否删除成功
- 流程：从数据库删除，同时删除文件

## 目录结构

```
app_data/
├── yeader.db
└── epub_library/
    ├── {uuid}.epub
    └── {uuid}_cover.{ext}
```

## 前端变更

### Bookshelf.ts
- 添加"本地书籍"标签按钮
- 筛选显示 `source_url = "local://epub"` 的书籍
- 添加"导入 EPUB"按钮

### Reader.ts 扩展
- 检测 `source_url = "local://epub"` 时调用 `read_local_epub`
- 章节列表从 EPUB 解析获取
- 不调用网络书源相关 API

### api.ts 新增
```typescript
export async function importEpub(): Promise<Book>
export async function listLocalEpubs(): Promise<Book[]>
export async function readLocalEpub(bookUrl: string, chapterIndex: number): Promise<string>
export async function deleteLocalEpub(bookUrl: string): Promise<boolean>
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 文件选择取消 | 无操作，返回 |
| EPUB 解析失败 | 显示错误 toast，提示用户选择其他文件 |
| 文件已存在 | 覆盖或询问用户 |
| 阅读加载失败 | 显示错误信息到阅读区域 |

## 实现顺序

1. Rust 层：添加 EPUB 导入命令
2. Rust 层：添加本地阅读命令
3. TypeScript API 层
4. 前端书架页面（本地书籍筛选 + 导入按钮）
5. 前端阅读器页面（支持本地阅读）
6. 测试与修复
