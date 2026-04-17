# Yeader

Rust + Tauri 三端重构阅读器（移动端 / 桌面端 / Web端）。

基于 [gedoor/legado](https://github.com/gedoor/legado) 进行 Rust 重构。

## 技术栈

- **Rust** - 核心逻辑与性能关键代码
- **Tauri 2** - 跨平台桌面与移动端框架
- **TypeScript** - 前端交互层

## 项目结构

```
yeader/
├── src/                    # 前端源码
│   ├── main.ts
│   └── styles.css
├── src-tauri/              # Rust 后端源码
│   ├── src/
│   │   ├── main.rs         # 入口
│   │   └── lib.rs          # 库入口
│   ├── Cargo.toml
│   └── tauri.conf.json
├── Cargo.toml              # Workspace 配置
└── package.json
```

## 开发

### 前置依赖

- Rust TODO:最新稳定版本
- Node.js TODO:最新 LTS 版本
- npm TODO:最新版本

### 快速开始

```bash
# 安装前端依赖
npm install

# 开发模式（启动 Vite + Tauri）
npm run tauri dev
```

### 构建

```bash
# 构建桌面端
npm run tauri build

# 构建移动端（Android / iOS）
# 参考 Tauri 移动端文档
```

## 开源协议

本项目基于 [AGPL-3.0](../LICENSE) 开源。
