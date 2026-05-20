# Yeader 插件生态路线图

## 背景

废弃 Hmanga，将 jm 插件移植到 Yeader。移植过程同步完善插件系统，制定标准。

---

## 插件类型

| 类型 | 说明 | 示例 |
|------|------|------|
| **功能型** | 通用工具，跨站点复用 | `crypto`, `http`, `descramble`, `html-parser` |
| **源型** | 绑定特定网站，依赖功能型插件 | `jm`, `wnacg`, `e-hentai` |

### 依赖关系

```
功能型插件 (无依赖)
    ↑
    │
源型插件 ──────────→ 功能型插件
```

---

## 验收标准

> 全局验收清单。所有 phase 的"done"最终都要反向 trace 回这四层。

### 1. 行为层 — 与 Hmanga jm 等效
- [ ] Yeader 用户能完成 Hmanga jm 全部场景:搜索 / 详情 / 追更 / 登录 / 收藏 / 周刊 / 漫画阅读
- [ ] 漫画图像 descramble 输出与 Hmanga 二进制一致(用 Hmanga fixture 做 byte-equal diff)
- [ ] 默认体验是流式翻页(无落盘);"Pin offline" 触发后行为等效于 Hmanga 离线包

### 2. 架构层 — 插件接口经得起复用
- [ ] **第二个源型插件能在不改 core trait 的前提下接入** —— 用 `wnacg` 做反向压力测试
- [ ] 功能型插件可独立于源型插件编译/测试(`yeader-plugin-crypto` 不依赖 `yeader-plugin-jm`,反之亦然)
- [ ] 提供 `MockHostApi`,源型插件单测不依赖真实网络

### 3. 哲学层 — 不偏离 PHILOSOPHY.md
- [ ] 五问清单(`PHILOSOPHY.md` §5)每条都能答 "yes"
- [ ] 订阅流为主线、UI 不区分 pack/plugin runtime、转译为默认且 pin 为 opt-in
- [ ] 反目标(`PHILOSOPHY.md` §4)零违反

### 4. 工程层 — 可持续维护
- [ ] `cargo build` / `cargo test --workspace` / `cargo clippy` 全绿
- [ ] `npm run build` 全绿,端到端冒烟脚本可重复执行
- [ ] YeaderHub registry 有 `jm` + 至少一个第三方源真实条目
- [ ] 插件作者文档(quickstart + capability 列表 + `transform_asset` 示例)发布

---

## 阶段计划

### Phase 1: 审计 ✅

- [x] 审计 Hmanga jm 插件完整逻辑(见 `docs/PLUGIN_SYSTEM.md` §2)
  - [x] search
  - [x] comic detail
  - [x] chapter images
  - [x] login / session
  - [x] AES/MD5 解密
  - [x] descramble 逻辑

### Phase 2: 插件接口定义 ✅

- [x] 扩展 Yeader 插件 capability(`crates/yeader-plugin-core`)
  - [x] `feed`(订阅流)
  - [x] `search`
  - [x] `content` (comic detail)
  - [x] `toc` (chapter list)
  - [x] `asset` (image URLs)
  - [x] `login`
  - [x] `offline`(转译模型下的 opt-in 落盘,见 `PHILOSOPHY.md` §2.6)
- [x] 定义 HostApi
  - [x] HTTP 请求封装(`HostApi::http_request`)
  - [x] Session 管理(`Session` DTO + `SourcePlugin::login`)
  - [x] 资产消费接口(默认 stream + LRU + prefetch,opt-in pin 离线;契约见 `docs/PLUGIN_SYSTEM.md` §4.5)

### Phase 3: 功能型插件实现 ✅

- [x] `crypto` — AES-256-ECB / MD5 / base64 (`crates/yeader-plugin-crypto`)
- [x] `http` — RequestBuilder + 表单编码 + 状态校验 (`crates/yeader-plugin-http`)
- [x] `descramble` — 垂直分块还原 + 重编码 (`crates/yeader-plugin-descramble`)
- [ ] `html-parser` — HTML 解析(按需;workspace 已有 `scraper` 可直接用)

### Phase 4: 源型插件移植

> **DoD 强约束**:必须同时实现 `jm` + `wnacg` 两个源型插件,验证 core trait 不需要因新源做修改。任一不通过,则 Phase 2 接口设计要回炉。

- [ ] `jm` 插件 (`crates/yeader-plugin-jm`)
  - [ ] 依赖 `yeader-plugin-crypto`, `yeader-plugin-http`, `yeader-plugin-descramble`
  - [ ] 实现 search / content / toc / assets / transform_asset / login
  - [ ] 复用 Hmanga 加密逻辑,descramble byte-equal 通过
  - [ ] 用 fixture 做的离线集成测试通过(无网络依赖)
- [ ] `wnacg` 插件 (`crates/yeader-plugin-wnacg`)
  - [ ] 在不改 `yeader-plugin-core` 的前提下完成接入
  - [ ] 至少实现 search / content / toc / assets(login 可选)
- [ ] 通用:`MockHostApi` 提供并被两插件单测引用

### Phase 5: UI 适配

- [ ] SourcesPage 支持插件源
- [ ] 搜索结果展示
- [ ] 漫画详情页
- [ ] 章节/图片阅读
- [ ] 阅读流程(stream + prefetch);Pin for offline 入口

### Phase 6: 插件沉淀机制

- [ ] 功能型插件稳定验证后合并到主程序
- [ ] 内置 API: `crypto`, `http`
- [ ] 插件 manifest 支持 `builtin: true`

### Phase 7: 生态扩展

- [ ] 接入更多源型插件 (`wnacg`, etc.)
- [ ] 完善 YeaderHub 仓库
- [ ] 插件开发文档

---

## 目标

1. Hmanga jm 功能完整迁移到 Yeader(验收 §1 行为层)
2. Yeader 插件系统成熟可用(验收 §2 架构层 + §3 哲学层)
3. 插件生态可扩展、可沉淀(验收 §2 wnacg 双源验证 + §4 工程层)