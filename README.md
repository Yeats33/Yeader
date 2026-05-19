# Yeader

Yeader 是一个跨平台阅读器，目标是用一套自有的通用内容源格式统一小说、RSS、漫画等内容来源。旧的 Legado 书源兼容能力暂时关闭，后续会作为“外部格式到 Yeader Source Pack”的翻译层，而不是应用内部的主规则格式。

## 功能

### Yeader Source Pack
- 自有 `yeader.source-pack` JSON 格式
- 面向小说、RSS、漫画等内容源的统一能力模型
- 支持把外部书源格式翻译为 Yeader Source Pack 后再导入应用
- 格式草案见 [`docs/YEADER_SOURCE_FORMAT.md`](docs/YEADER_SOURCE_FORMAT.md)

### 配套源构建工具
- 独立工具仓库：[`Yeats33/yeader-source-tools`](https://github.com/Yeats33/yeader-source-tools)
- 提供油猴脚本、CLI 本地桥接服务、Codex skill 工作流
- 可在小说网页上选择标题、目录、章节内容等字段，生成 Yeader Source Pack 草稿

### 书籍搜索与阅读
- 旧书源搜索入口已暂停，等待 Yeader Source Pack 执行管线接入
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
- 支持 Yeader Source Pack JSON 导入
- 保留 Legado 备份解析能力，用于后续迁移和兼容层开发

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
- `WIP` Yeader Source Pack 格式与导入
- `WIP` 外部书源格式到 Yeader Source Pack 的翻译层
- `PAUSED` Legado 书源直接执行兼容
- `TODO` so-novel Rule 兼容
- `WIP` 本地 EPUB 导入与解析
## 开源协议

[AGPL-3.0](../LICENSE)
