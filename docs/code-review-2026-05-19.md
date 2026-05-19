# Yeader 项目严格代码审核报告

- **日期**: 2026-05-19
- **分支**: main (HEAD = `daa5266`)
- **审核范围**: 整个仓库 — Rust 工作区 (8 个 crate) + Vite/React 前端 + Tauri 配置 + 未提交的脏目录
- **审核方式**: 静态阅读 + `cargo check` + `cargo clippy --workspace` + 命令注册/前端调用面对账 + 安全/可维护性人工核查
- **最终结论**: **REQUEST CHANGES** — 工作区当前**未提交**且包含若干**会在运行时立即触发的严重缺陷**（搜索功能参数名不匹配、打开 URL 命令名不匹配、nonce 永不过期等），不可在此状态发布或合入主干。

---

## 0. 一句话总览

代码风格整体克制、模块边界清晰，但当前 working tree 含有 6 项关键回归 / 安全缺陷、CSP 在 Tauri 配置中仍为 `null`、auth nonce 实际上**不过期**、SoNovel 规则导入存在**路径穿越**，并且前端 invoke 列表与 Rust 端命令名存在**至少 4 个明确不一致**。在合入主分支之前必须修复 CRITICAL 与 HIGH 项。

---

## 1. 构建与质量门快照

| 检查项 | 结果 |
|---|---|
| `cargo check -p yeader` | ✅ 通过（带 2 个 warning：未使用变量 `el`、未使用常量 `LEGACY_BOOK_SOURCE_COMPAT_DISABLED`） |
| `cargo clippy --workspace` | ⚠️ **66 个 warning** 跨 6 个 crate（其中 `-D warnings` 模式下会直接 fail） |
| `cargo fmt --all -- --check` | ⚠️ 存在尾随空行差异（未格式化） |
| `cargo test --workspace --no-run` | ✅ 编译通过 |
| Git 工作树 | ⚠️ 18 个 modified + 2 个 untracked（`sources/`、`src/pages/SourceOps.ts`）未提交 |
| 前端 invoke vs Rust command | ❌ **至少 4 个命令名/参数名不匹配**（详见 §2.2、§2.3） |
| Tauri CSP | ❌ `csp: null`（CLAUDE.md 自述「must be restricted before production」） |

---

## 2. 严重等级清单

### 🔴 CRITICAL (4)

#### C-1. `search_books` 参数名不匹配 — 在线搜索功能整体失效
- **位置**: `src/api.ts:163-173` vs `src-tauri/src/commands/search.rs:289-304`
- **现象**: 前端通过 `invoke("search_books", { sourceUrl, keyword, page })` 传入 `sourceUrl`；Rust 端 `pub async fn search_books(..., source_id: String, ...)` 期望 Tauri 自动映射为 `sourceId`。前端 → 后端调用必然在反序列化阶段抛错。
- **影响**: 在线书源搜索（产品最核心功能之一）100% 不可用。
- **修复**: 改 `src/api.ts` 调用为 `{ sourceId, keyword, page }`，并把签名 `searchBooks(sourceUrl, ...)` 重命名为 `searchBooks(sourceId, ...)`，沿链路上溯 caller。

#### C-2. `open_url` 命令未注册（注册的是 `open_url_cmd`）
- **位置**: `src-tauri/src/lib.rs:73` (`integration::open_url_cmd`) vs `src/api.ts:289-291` (`invoke("open_url", ...)`)
- **现象**: 前端 `openUrl()` 任何调用都会触发 “command not found”。
- **修复**: 把后端 `open_url_cmd` 改回 `open_url`（推荐：Tauri 命令名必须与前端一致；`_cmd` 后缀是 anti-pattern），或者前端改为 `invoke("open_url_cmd", ...)`。

#### C-3. Auth nonce 永不过期 — 重放攻击窗口被无限放大
- **位置**: `src-tauri/src/commands/auth.rs:35` ↔ `crates/yeader-library/src/auth_repo.rs:66-81`
- **现象**:
  ```rust
  repo.save_nonce(&nonce, "5 minutes")   // 字符串 "5 minutes" 直接写入 TEXT 列
  ```
  SQL 比较 `expires_at > datetime('now')` 将进行**字典序比较**：`datetime('now')` 形如 `2026-05-19 ...` 以 `'2'` 开头；`'5 minutes'` 以 `'5'` 开头，`'5' > '2'` 恒为真 → **nonce 永远 valid**。
- **影响**: 钱包签名 nonce 完全无 TTL。配合 C-4 的 nonce 缺失绕过，可彻底破坏 SIWE 防重放。
- **修复**: `save_nonce(&nonce, &(now + Duration::minutes(5)).format("%Y-%m-%d %H:%M:%S").to_string())`，并加单元测试验证字面字符串 `"5 minutes"` 不能通过 `consume_nonce`。

#### C-4. `verify_evm_auth` 在 nonce 提取失败时**仍然颁发 session**
- **位置**: `src-tauri/src/commands/auth.rs:65-83`
- **现象**:
  ```rust
  if let Some(nonce) = extract_nonce(&message) {
      repo.consume_nonce(&nonce)?;
  }
  // 继续 save_session(...) ← 即便 message 里没有 "Nonce:" 行也会建会话
  ```
  攻击者只要拿到一次有效 EOA 签名（任何场景下被诱签的消息），就能去掉 `Nonce:` 行后重放并获得 7 天 session。
- **修复**: `let nonce = extract_nonce(&message).ok_or("Missing nonce")?;` 并强制 `consume_nonce` 必须返回 `true`，否则 `verified = false`。

---

### 🟠 HIGH (7)

#### H-1. `import_so_novel_rule` / `delete_so_novel_rule` 存在路径穿越
- **位置**: `src-tauri/src/commands/integration.rs:390-411`
- **现象**:
  ```rust
  let rule_path = rules_dir.join(format!("{}.json", name));
  std::fs::write(&rule_path, content)
  ```
  `name` 由前端任意传入，未做 `Path::components()` 校验。`name = "../../../tmp/pwn"` 会把渲染内容写到 rules_dir 外，`delete` 同理可删除任意可达 `.json` 文件。
- **修复**: 拒绝包含 `/`、`\`、`..` 的 name；或仅允许 `[A-Za-z0-9_-]+`。

#### H-2. Tauri CSP = `null`
- **位置**: `src-tauri/tauri.conf.json:24-26`
- **现象**: 项目 CLAUDE.md 自述「CSP is currently null (testing) — must be restricted before production」，但仍未启用。前端 `dangerouslySetInnerHTML`、超过 20 处 `.innerHTML = ...` 直接注入（见 H-3），加上 `run_command` / `open_url_cmd` 等高权命令，一旦书源解析阶段把含恶意 HTML 的远端字符串渲染到 DOM，攻击面被显著放大。
- **修复**: 至少声明 `default-src 'self'; img-src * data:; connect-src https: http: data:`，禁用 inline script。

#### H-3. 前端 25+ 处 `innerHTML` 注入，且 `escapeHtml` 不全局覆盖
- **位置**: 摘录：`src/pages/SourceOps.ts:80,98,162,168,172,181,190,227`、`src/pages/SoNovelRules.ts:145,180-188`、`src/components/NavBar.tsx:70` 的 `dangerouslySetInnerHTML`、`src/legacy/LegacyPage.tsx:26`。
- **现象**: 大量 `innerHTML = \`…${value}…\`` 模板字符串注入。部分位置（如 `SourceOps.ts`）调用了本地 `escapeHtml`，但**该函数没有转义单引号**，且在 `<a href="${escapeHtml(s.homepage)}">` 这种**属性插值**里仍有风险；其它如 `e.message` 直接拼接（line 181）则完全未转义。
- **修复**: 统一使用一个 `escapeAttribute` / `escapeText` 工具（也要转义 `'`），并审计每一处 `innerHTML`。最稳的方案是逐步迁移到 React 节点渲染（项目正在 React 化）。

#### H-4. `run_command` 是无差别远端命令执行入口
- **位置**: `src-tauri/src/commands/integration.rs:73-80`，`capabilities/default.json` 通过 `core:default` 默认开放所有自定义命令。
- **现象**: 前端可调用 `runCommand("rm", ["-rf", "/Users/.../Documents"])`。结合 H-2 (CSP=null) + H-3 (innerHTML 注入面)，任何被攻陷的远端书源 HTML 都能借此发起本地命令执行。
- **修复**: 至少加白名单（如 `which`, `java`），或要求该命令仅在 dev 模式下注册。把 `run_command` 从 release build 中 `#[cfg(debug_assertions)]` 隔离。

#### H-5. `save_bookmark` / `get_bookmark` 接受任意 `book_path`，写到磁盘
- **位置**: `src-tauri/src/commands/reader.rs:563-593` → `src-tauri/src/bookmark.rs`（未读，但据 API 推断）
- **现象**: `book_path: String` 来自前端，被作为文件系统路径使用且无 prefix 校验。
- **修复**: 在 backend 里强制 `book_path` 必须以 `app_dir.join("epub_library")` 为前缀，或者完全改用 `book_id` 作为 key 走 DB。

#### H-6. 极多 `.unwrap()` on `db.lock()` — mutex poisoning 一发即雪崩
- **位置**: 至少 20 处，集中在 `src-tauri/src/commands/{library,reader,search}.rs`、`logging.rs:109,116,142,145,195,202`、`lib.rs:39,48,62`。
- **现象**: 任意一次锁内 panic（rusqlite 解析 extra TEXT 失败、I/O 中断等）都会把 `Mutex<Database>` 标记为 poisoned，之后**每一个** Tauri 命令都直接 panic。在 release 模式 `panic=abort`（Cargo.toml:46）下整个 app 立即崩溃。
- **修复**: 用 `.map_err(|e| e.to_string())?` 替换 `.unwrap()`；或者引入一个统一 helper `state.db()? -> MutexGuard`。

#### H-7. 前端调用了大量未注册的 Tauri 命令
- **位置**: `src/api.ts` ↔ `src-tauri/src/lib.rs:67-122`
- **不在 invoke_handler 里的前端调用**:
  - `import_backup` (api.ts:259)
  - `get_log_lines` (api.ts:273)
  - `open_log_file` (api.ts:277)
  - `open_url` (见 C-2)
- **影响**: 任意触发都会 “command not found”。即使是 dead-but-still-exported API，也会污染 IDE/类型生态。
- **修复**: 要么注册要么删除前端导出函数。

---

### 🟡 MEDIUM (10)

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| M-1 | `src-tauri/src/lib.rs:39` | `db_path.to_str().unwrap()` —— 非 UTF-8 路径直接 panic 阻塞启动 | 改用 `rusqlite::Connection::open(&PathBuf)` 重载，或 `to_string_lossy()` |
| M-2 | `src-tauri/src/commands/integration.rs:419` | `line.split('=').nth(1).unwrap()` 解析 `active-rules` 时若行无 `=` 会 panic | 用 `?`、`unwrap_or("")` |
| M-3 | `src-tauri/src/commands/reader.rs:343,349` | `temp_path.parent().unwrap()` 在异常路径下 panic | 用 `ok_or` |
| M-4 | `src-tauri/src/commands/search.rs:254` | `extract_field` 参数 `el` 标记为未使用（warning），说明 CSS field 解析的实现在**重新走 analyzer.get_elements(&format!("{}@{}", ...))**，并未使用 `el` 上下文 — search 提取很可能整体走错路径 | 重构为真正在 `el` 子树上做 selector |
| M-5 | `sources/czbooks.net.json:38-41` | 字段查询写成 `"a.1@text"`、`"a.2@text"` —— `.1`/`.2` 不是合法 CSS class（数字开头）；运行时 `Selectors::parse` 会失败 | 用 `nth-of-type` 或纯 CSS 合法类名 |
| M-6 | `crates/yeader-library/src/repo.rs` (1579 行) | 单文件超过项目 800 行硬上限，违反 CLAUDE.md 文件组织准则 | 拆分为 `book_source_repo.rs`、`rss_source_repo.rs`、`replace_rule_repo.rs`、`reading_progress_repo.rs` |
| M-7 | `crates/yeader-rules/src/analyzer.rs:920,1057,1070` | 测试代码外的 `panic!` 用在 production 路径分支（Match arm） | 改用 `Result` 或 `unreachable!` 仅在不变量保证处 |
| M-8 | `src-tauri/src/commands/reader.rs:40-94 / 116-152 / 175-207` | 三个 `*_legacy` 函数被 `#[allow(dead_code)]` 永久留存，注释说「legacy 已关闭」 | 删除 dead code；不需要的迁移代码不应留在主分支 |
| M-9 | `src-tauri/src/commands/search.rs:228-238` | `fetch_content_yeader` 用 `content_selector` 选择器后调用 `analyzer.get_string()`，无任何 HTML 清理 / `nextContentUrl` 翻页处理 | 与源格式声明的 `nextContentUrl` 字段对齐，至少实现 1 级翻页 |
| M-10 | `src/api.ts:218,131,138,150,256` 等 | 多处 `try { ... } catch { return null/[] }` 吞掉错误 | 至少 `console.warn(err)`；用户报障时无证据 |

---

### 🔵 LOW (8)

- **L-1** 31 处 `console.log/warn/error` 留存（policy 要求 release 前清理）。
- **L-2** 66 个 clippy warning（含 `ptr_arg`、`needless_borrow`、`collapsible_if`、`redundant_clone` × 14 处 `ElementRef.clone()` 等）。运行 `cargo clippy --fix` 可自动解决 ≈50 个。
- **L-3** `cargo fmt --check` 失败：`src-tauri/src/commands/integration.rs` 等存在未格式化变更。
- **L-4** Tauri 默认能力 `core:default` 范围过宽；`dialog:allow-ask/confirm/message/open` 全开但 `shell:` 仅 `allow-open` —— 权限粒度颗粒不一致，建议显式列出 capability 而非 `core:default`。
- **L-5** `tracing::warn!("Failed to init built-in sources: {}", e)`（lib.rs:51）打印路径但是没有 propagation 给前端；setup 失败时用户无任何提示。
- **L-6** `eip191_hash` 中 `v - 27` 可能下溢（`u8`）：若 `v == 0`/`1`（EIP-155 风格的 v）会触发 panic（debug）或 wraparound（release）。
- **L-7** `src/pages/Settings.ts` 单文件 1556 行 / `src/pages/Reader.ts` 614 行 — 超长且与 `src/pages/Reader/index.ts`（已存在的拆分版本）共存，疑似 dead duplicate。
- **L-8** `index.html` 未读，但 vite 配置 (`vite.config.ts`) 未列入 review；建议补一次配置 audit。

---

## 3. 架构维度（架构师视角）

**状态: WATCH** — 设计方向合理（多 crate 工作区 + 显式 source-pack 格式），但当前存在三个长期风险点。

### A-1. 「Legado 兼容」与「Yeader native」并行未收敛
- 同一份命令文件里同时存在 `fetch_book_info`（native）和 `fetch_book_info_legacy`（dead_code）。`yeader_models::source_format::From<&LegacyBookSource> for YeaderSource` 仍是 production code 的一部分，意味着兼容层从未被真正移除，只是「隐藏」。
- **风险**: 双轨制下任何 source pack 格式微调都需要同时维护两条路径，且 dead 函数掩盖了真正的接口契约。
- **建议**: 立即决定：要么彻底删 legacy（包括 `parse_legado_import_uri`、所有 `*_legacy`、`LegacyBookSource`），要么明确支持兼容并补完测试；不要继续「半禁用」。

### A-2. 命令注册表与前端 API 没有契约层
- `src-tauri/src/lib.rs:67-122` 是手写枚举，没有任何机制保证它与 `src/api.ts` 同步（见 H-7、C-1、C-2）。
- **建议**: 引入 `specta` + `tauri-specta`（项目 `Cargo.toml` 暗示已尝试用 `#[specta(rename = ...)]` 但未生成 binding），把命令签名自动导出到 `src/types.ts`，把 invoke 名做成枚举。

### A-3. State 共享用 `Arc<Mutex<Database>>` 同步锁包裹整个数据库
- 所有 Tauri 命令都是 async，但 DB 访问全在同步 mutex 后；任何长查询会阻塞其他命令。
- 并 H-6 一起看：一次 panic → mutex poison → 全局崩溃。
- **建议**: 短期改 `parking_lot::Mutex`（不会 poison），长期把 SQLite 操作下沉到一个独立 actor / `tokio::task::spawn_blocking` 包装层。

---

## 4. 按模块分述

### `src-tauri/`
- **lib.rs** — 启动顺序合理（先 logging 再 db），但 6 处 `.unwrap()` 不应出现在启动主流程。built-in source pack 用 `include_str!` 在编译期捆绑 `sources/czbooks.net.json` ↔ 该 JSON 仍未 git add（脏文件），意味着别人 clone 主分支会 **编译失败**。
- **commands/auth.rs** — 见 C-3、C-4、L-6。`recover_evm_address` 实现整体正确（EIP-191 前缀 + Keccak256 + 取后 20 字节）。
- **commands/integration.rs** — 见 H-1、H-4、M-2。`get_so_novel_dir()` 硬编码 macOS Homebrew Cellar 路径 `/opt/homebrew/Cellar/so-novel/1.10.1`，含写死版本号，brew 升级即失效。
- **commands/library.rs** — 干净，但全是 `db.lock().unwrap()`（H-6）。`list_book_sources` 已永久返回空 `Vec` —— 应该在 invoke_handler 中下线，或在前端隐藏。
- **commands/reader.rs** — `import_epub` / `import_epub_url` 把封面同时编码成 base64 data URL **又**写一份磁盘文件，浪费 IO 与 DB 大小（cover_url 字段会膨胀到几百 KB）。建议二选一。

### `crates/yeader-models/`
- `source_format.rs` 设计扎实（capabilities + selectors + fallbacks），但 `parse_legacy_headers` 用 `unwrap_or_default()` 静默吞错。`From<&LegacyBookSource>` 的标签拆分允许 `，`（中文逗号）——很好。
- `LegacyLegado` engine 名仍是 first-class enum 值，确认 A-1 风险。

### `crates/yeader-library/`
- `db.rs` 迁移逻辑简单但**不可逆**：`ensure_column` 只针对 `book_sources.source_json` 单列，未来加列时易遗忘 → 已 fielded 用户会跑 schema mismatch。建议引入 `user_version` PRAGMA。
- `auth_repo.rs` 单测覆盖 6 个用例（session save/upsert/expired/clear、nonce consume/expired）——但 **测试用了合法 ISO 时间戳**，所以 C-3 的 bug 在测试里被掩盖了。补一个 `"5 minutes" string is rejected` 用例可立即暴露。

### `crates/yeader-net/`
- `client.rs` 干净：`HttpClient::new()` 启用 cookie store 和 gzip；解码走 charset 嗅探，支持 GBK 源。
- 但 `HttpClient::new()` 每次调用都新建 `reqwest::Client`（`commands/search.rs` 内 `search_with_yeader_source` 每次搜索都 new 一次）—— 浪费连接池。改为 `OnceLock<HttpClient>`。

### `crates/yeader-rules/`
- 解析引擎丰富（css/xpath/jsonpath/regex/js_engine），但 `analyzer.rs` 1082 行单文件 + 3 处 `panic!` 在非测试分支。

### `src/`（前端）
- **App.tsx** —— `dangerouslySetInnerHTML` 仅在 `NavBar` 的 SVG 内联使用（icon 字符串受信任），但仍建议改为静态 import。
- `pages/Reader.ts` 与 `pages/Reader/index.ts` 并存（一个 614 行、一个被 App.tsx 真正引用）。**强烈怀疑** `pages/Reader.ts` 是 dead code。
- **api.ts** 类型注解齐备，但 35 个 export function 中至少 4 个绑定的命令名错误（见 C-1、C-2、H-7）。

### `sources/`
- 仅 1 个未提交的 `czbooks.net.json`，被 `lib.rs:16` 编译期 include。立即 git add，否则其他 clone 必然 compile fail。
- 内部规则字段（M-5）写法不规范。

---

## 5. 与项目自身规则的偏离

| 准则（来自 CLAUDE.md / 私有 rules） | 当前状态 |
|---|---|
| 每次变更需通过 `npm run build` 与 `cargo test --workspace` | ❌ 工作树有 18 个 modified 文件未确认通过门 |
| 文件 < 800 行硬上限 | ❌ `repo.rs` 1579 / `Settings.ts` 1556 / `analyzer.rs` 1082 / `pipeline.rs` 729 |
| 函数 < 50 行 | ⚠️ `commands/search.rs::test_book_sources_availability_legacy` 100+ 行（待删） |
| 无 console.log | ❌ 31 处 |
| 严格输入校验（用 zod 等） | ❌ Tauri 前端零校验直接 invoke |
| CSP 必须收紧 | ❌ 仍 null |
| 测试覆盖 80%+ | ❌ 前端无 vitest/jest，只在 `src/api.test.ts` 等几个 ad-hoc 文件用 node:test |

---

## 6. 行动清单（按优先级）

### 必须在合入前完成（CRITICAL/HIGH）
1. [ ] 修复 `search_books` 参数命名（C-1）
2. [ ] 修复 `open_url`/`open_url_cmd` 命名（C-2）
3. [ ] 修复 nonce TTL 字符串 → 实际时间戳（C-3）
4. [ ] `verify_evm_auth` 强制 nonce 必须存在并消费成功（C-4）
5. [ ] `import_so_novel_rule` 白名单文件名（H-1）
6. [ ] 启用最小 CSP（H-2）
7. [ ] 审计所有 `innerHTML` 注入点并补 `escapeAttribute`（H-3）
8. [ ] `run_command` 加白名单或限于 debug build（H-4）
9. [ ] `book_path` prefix 校验（H-5）
10. [ ] 把 `db.lock().unwrap()` 换成可恢复错误（H-6）
11. [ ] 删除或注册 4 个未注册的 Tauri 命令（H-7）
12. [ ] `git add sources/` 或调整 `include_str!` 路径

### 紧接着完成（MEDIUM）
13. [ ] 替换全部 `.unwrap()` 在 production code 中
14. [ ] 修 `czbooks.net.json` 的非法 CSS 选择器
15. [ ] 拆分 `repo.rs` / `Settings.ts` / `analyzer.rs`
16. [ ] 删除全部 `*_legacy` dead code 和 `parse_legado_import_uri`
17. [ ] `extract_field` 在 `el` 子树上 scope，而不是再次全局 search

### 收尾（LOW）
18. [ ] `cargo clippy --fix` + `cargo fmt --all`
19. [ ] 清理 31 处 `console.*`
20. [ ] 收紧 Tauri capability 配置
21. [ ] 引入 `specta` 自动同步命令契约
22. [ ] 评估 `pages/Reader.ts` 是否为 dead duplicate

---

## 7. 关于本次审核

- **审核员**: Claude (Opus 4.7)，无外部 ask/Codex 复核可用
- **置信度**:
  - C-1, C-2, H-7：100% — 通过 `comm` 对账直接证明
  - C-3, C-4：95% — 已读源码并模拟 SQLite 字典序比较
  - H-1：100% — 路径拼接代码可直接复现
  - H-2 ~ H-6：85% — 静态分析为主，未做动态 PoC
  - M / L：基于代码阅读 + clippy 输出
- **未覆盖**:
  - `crates/yeader-reader/` 的 EPUB / TXT 解析未深入读
  - `auth/appkit.ts`（依赖 `@reown/appkit`）未审 WalletConnect projectId 是否硬编码
  - 未运行实际前端 e2e 验证 C-1/C-2

**最终意见: REQUEST CHANGES。**
