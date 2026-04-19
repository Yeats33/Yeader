# Yeader

跨平台电子书阅读器，支持桌面端与移动端。基于 [gedoor/legado](https://github.com/gedoor/legado) 规则引擎开发。

## 功能

### 书源管理
- 导入 legado 格式书源（本地 JSON / URL 订阅）
- 书源可用性测试（并发检测，5 分钟缓存）
- 启用/禁用/批量删除书源

### 书籍搜索与阅读
- 按书源搜索书籍
- 书架管理：网络书籍与本地 EPUB 分别展示
- 阅读进度自动保存

### 本地 EPUB 阅读
- 导入本地 EPUB 文件到书架
- 自动解析目录结构（TOC）
- 章节内容与图片展示（图片以 base64 内嵌）
- 阅读进度记录

### 阅读器
- 上一章/下一章切换
- 目录导航
- 字号调节（快捷键 `+`/`-`）
- 行间距调节
- 夜间模式
- 键盘快捷键：
  - `←` / `h` — 上一章
  - `→` / `l` — 下一章
  - `t` — 目录
  - `s` — 设置面板
  - `d` — 夜间模式
  - `Home` — 第一章
  - `End` — 最后一章

### 数据导入
- 支持 legado 格式备份目录与 ZIP 包导入

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```
### Progress
- `WIP` ledago 书源/订阅源兼容 
- `TODO` so-novel Rule 兼容
- `WIP` 本地 EPUB 导入与解析
## 开源协议

[AGPL-3.0](../LICENSE)
