# Yeader 插件系统设计

## 1. 背景与目标

PLUGIN_ROADMAP.md 决定将 Hmanga 的 jm 漫画插件迁入 Yeader,同时沉淀一套可复用的插件系统:

- **功能型插件 (functional)**: 无外部依赖、可被多个源型插件共享的通用能力,例如 AES/MD5、HTTP 包装、图像 descramble。
- **源型插件 (source)**: 绑定特定站点,依赖一个或多个功能型插件。例如 `jm`、`wnacg`。

第一阶段采用**原生 trait 分发**(与 Hmanga 一致),WebAssembly 沙箱作为长期目标,通过 `PluginRuntimeKind` 字段预留路径。

## 2. Hmanga jm 插件审计要点

完整代码: `~/CodeHub/Yeats/Hmanga/crates/hmanga-plugin-jm/src/lib.rs`

### 2.1 站点 API 流程

1. **签名**: 每次请求生成 `token = md5(timestamp + APP_TOKEN_SECRET)`、`tokenparam = "{ts},{APP_VERSION}"`。`/chapter_view_template` 用 `APP_TOKEN_SECRET_2` 替换 secret。
2. **AES-256-CBC 解密**: 响应体 `{ code, data, errorMsg }`,`data` 字段为 base64 加密文本。Key = `md5(timestamp + APP_DATA_SECRET)`,IV = 0,PKCS#7 截尾。
3. **descramble 调度**: 章节图片是垂直分块乱序的 WebP。
   - `chapter_id < scramble_id`(默认 220980)→ 不乱序。
   - `< 268850` → 10 条带。
   - `< 421926` → `md5("{chapter_id}{filename}")` 末位字符 mod 10,`*2+2` 条带。
   - 其余 → 同公式 mod 8。
4. **stitch_image**: 已知 `block_num` 后,将图像按高度等分,首块附加余数;按"末块→首"反向粘贴回正确顺序。

### 2.2 capability 表

| 行为 | 路径 | 备注 |
|---|---|---|
| 搜索 | `GET /search` | 翻页 80/页;命中精确 ID 时走 `RedirectRespData` |
| 详情 | `GET /album?id=` | `series` 为空时合成单章 |
| 章节图 | `GET /chapter_view_template`(取 scramble_id)→ `GET /chapter` | 解密后产出图片 URL 数组,headers 携带 scramble metadata |
| 登录 | `POST /login` | 返回 token `s`、uid、photo、level_name |
| 收藏 | `GET /favorite` | 需要登录 session |
| 周刊 | `GET /week`、`/week/filter` | 公开 |

### 2.3 关键依赖

- `aes = "0.8"`,`md5 = "0.7"`,`base64 = "0.22"`(已在 Yeader workspace),`image = "0.25"`(需新增 workspace dep)。

## 3. Yeader 插件运行时架构

### 3.1 Crate 拓扑

```
crates/
  yeader-plugin-core/         # trait + 通用 DTO + HostApi
  yeader-plugin-crypto/       # 功能型: AES/MD5/base64 helpers
  yeader-plugin-http/         # 功能型: HostApi 之上的高层 HTTP 帮助
  yeader-plugin-descramble/   # 功能型: 通用图像分块还原
  yeader-plugin-jm/           # 源型: jm 漫画,依赖以上三者 (Phase 4)
src-tauri/
  commands/plugin.rs          # Tauri 命令: list_plugins / plugin_search / ... (Phase 5)
```

依赖方向单向: `source plugin → functional plugin → plugin-core`。core 不依赖 yeader-net/library,避免循环。

### 3.2 核心 trait

```rust
// yeader-plugin-core/src/host.rs
#[async_trait]
pub trait HostApi: Send + Sync {
    async fn http_request(&self, req: HttpRequest) -> PluginResult<HttpResponse>;
    fn log(&self, level: LogLevel, message: &str);
}

// yeader-plugin-core/src/plugin.rs
#[async_trait]
pub trait SourcePlugin: Send + Sync {
    fn meta(&self) -> PluginMetaInfo;

    async fn search(&self, host: &dyn HostApi, q: SearchQuery)
        -> PluginResult<SearchResult>;
    async fn content(&self, host: &dyn HostApi, id: &str)
        -> PluginResult<ContentDetail>;
    async fn toc(&self, host: &dyn HostApi, id: &str)
        -> PluginResult<Vec<ChapterInfo>>;
    async fn assets(&self, host: &dyn HostApi, chapter_id: &str)
        -> PluginResult<Vec<AssetUrl>>;

    async fn login(&self, _h: &dyn HostApi, _u: &str, _p: &str)
        -> PluginResult<Session> { Err(PluginError::NotSupported) }
    async fn transform_asset(&self, _h: &dyn HostApi, _asset: &AssetUrl, bytes: Vec<u8>)
        -> PluginResult<ProcessedAsset> { Ok(ProcessedAsset::passthrough(bytes)) }
}
```

`transform_asset` 是字节变换钩子,由 host 在 **每次拉到资产字节后**调用 —— 既适用于 reader 翻页时的 lazy fetch,也适用于"pin for offline"的批量预热。JM 把 descramble + 重编码塞这里,普通源默认透传。
名字刻意避开 "download_post",因为转译模型下 host 的默认动作是流给 reader,不是写盘(`PHILOSOPHY.md` §2.6)。

### 3.3 capability 与 PLUGIN_ROADMAP 的对应

| PLAN 字段 | trait 方法 |
|---|---|
| `search` | `SourcePlugin::search` |
| `content` | `SourcePlugin::content` |
| `toc` | `SourcePlugin::toc` |
| `asset` | `SourcePlugin::assets` + `transform_asset` |
| `login` | `SourcePlugin::login` |
| `offline` | host 主动批量预热并落盘(用户显式 pin 触发);插件无新方法,复用 `assets` + `transform_asset` |

### 3.4 功能型插件接口

功能型插件不需要 trait,而是无状态 Rust 库,源型插件直接 `use yeader_plugin_crypto::aes256_cbc_decrypt;`。这样:

- 编译期类型安全,无运行时 lookup 开销。
- Phase 6 "内置化"零成本:`yeader-plugin-crypto` 升入 src-tauri 后直接消费。
- WASM 化时,需要在 ABI 层暴露同名 helper,签名已稳定。

### 3.5 manifest

复用 YeaderHub 仓库已经定义的 `yeader-plugin.toml`(见 `docs/manifest.md`),`provides.capabilities` 扩展集为:

```
search | content | toc | asset | login | download
```

Phase 6 增设 `builtin: true` 字段标记已沉淀的功能型插件。

## 4. UI 契约 (Phase 5 锚点)

> 本节是 UI 层与插件/书源契约的**唯一真相**。设计决策依据见 `PHILOSOPHY.md` §2.2、§2.3。

### 4.1 一个 level,一个列表

左栏 Sources 不区分书源 (rule pack) 和插件 (plugin)。两者都是"内容流来源",在同一列表平铺。差异只在两处暴露:

- **源详情页**:顶部 chip 显示 `Rule Pack` / `Plugin · Native` / `Plugin · Wasm`。
- **Marketplace**:顶部 segmented control 可按类型过滤。

主消费路径(左栏 → 中栏 → 右栏)看不到 runtime 差异。

### 4.2 capability → 交互形态映射

中栏展示什么,完全由源声明的 capability 决定。这张表是 Reader/Items 容器的 strategy dispatch 表:

| capability 组合 | 中栏形态 | 未读 badge | 备注 |
|---|---|---|---|
| `feed` (含/不含其它) | items timeline (RSS 风格) | ✅ | 默认形态;支持滚动 mark-as-read |
| `search` + `content` (无 feed) | 搜索框 + 分类入口 (Tachiyomi 风格) | ❌ | 纯目录源,无自动抓取 |
| `feed` + `search` + `content` | timeline (默认),顶部 segmented control 切 Search/Explore | ✅ | 全功能源;入口默认订阅流 |
| `asset` + `download_post` 额外 | 不影响中栏;影响 Reader 渲染分支 | — | 漫画类:右栏走 vertical-strip |
| `login` 额外 | 中栏顶部出现登录提示条 | — | 登录后才解锁完整流 |

### 4.3 catalog 源的"升级订阅"机制

只有 `search`/`content` 的 catalog 源(典型:czbooks、1024txt)默认不产生 feed,因此不出现在 Inbox、不显示未读数。**但用户可以在书详情页点"追更"**,把单本书升级为该源的订阅项:

- 此时该源开始按调度周期对"被追更的 content_id 列表"逐个抓 toc,diff 出新章节 → 产生 feed item。
- 用户视角:这个源现在也有了未读数,Inbox 也能看到。
- 实现视角:核心持有"订阅条目表",catalog 源被动响应 toc 查询;feed 源主动推。

这是把"插件即流"的哲学贯彻到底:catalog 不是另一种东西,只是流的产生方式不同,UI 不必为它造第二种范式。

### 4.4 manifest 字段约束

`yeader-plugin.toml` 的 `[provides].capabilities` 必须从下列集合取值:

```
feed | search | content | toc | asset | login | offline
```

`offline` 取代了早期草案里的 `download` —— 反映 `PHILOSOPHY.md` §2.6 的"转译,不下载"。UI 渲染时硬依赖这些字符串,新增能力必须先更新本节再发版,避免 UI 与 capability 漂移。

### 4.5 资产消费模型

> 这一节定义"插件产 AssetUrl 之后,host 怎么处理"的合约。是 reader 实现的契约,不是插件的契约。

#### 默认路径:stream(转译)

```
reader 翻到第 N 页
  → host 查 AssetCache(LRU)
    miss → HostApi::http_request(asset.url) 拿字节
         → SourcePlugin::transform_asset(asset, bytes) → ProcessedAsset
         → 写入 AssetCache
    hit → 直接拿
  → 灌进 reader 渲染
```

- **不落盘**。AssetCache 是进程内 LRU,关闭即清(或仅持久化到 `os.tmp_dir()`,系统重启清空)。
- **不预解析章节内所有资产**:`SourcePlugin::assets(chapter_id)` 返回的列表只是 URL 索引,只有真正翻到的页才会触发 fetch。
- **prefetch window**:host 在用户翻到第 N 页时,后台异步预取 N+1..N+k(k 默认 3,可配),目的是消除翻页可见延迟。预取也走完整 transform 管线,但失败静默。

#### 离线路径:pin(opt-in)

用户在内容详情页或章节列表显式点 "Pin chapter / Pin all" 才触发。host 做的是:

```
for asset in plugin.assets(chapter_id):
    bytes = HostApi.http_request(asset.url).body
    processed = plugin.transform_asset(asset, bytes)
    write_to(offline_store / source_id / content_id / chapter_id / index.ext)
```

- 离线条目独立索引,UI 上有 📥 角标。
- 即使未 pin,reader 的 AssetCache 命中也是 OK 的 —— 用户回顾刚翻过的页不需要重抓。
- 离线条目可在"Storage" 设置页统一清理。

#### 错误与限流

- transform_asset 失败 → reader 渲染占位 + 重试按钮。
- HTTP 失败(限流、网络) → host 指数退避,呈现可点击的"reload"。
- 插件不感知 host 是 stream 还是 pin 调用,语义对称。

#### 与 Hmanga 的对比

| 维度 | Hmanga | Yeader |
|---|---|---|
| 默认动作 | 章节全量下载到磁盘 | 翻页 lazy fetch,LRU 缓存 |
| Reader 输入 | 本地文件路径 | 内存字节(`ProcessedAsset.bytes`) |
| 离线 | 主路径 | opt-in("pin") |
| 插件接口 | 同(`transform_asset`) | 同 |
| 主按钮 | "下载" | "阅读"(下载是二级菜单的 "Pin offline") |

## 5. 阶段执行状态

- [x] Phase 1: Hmanga jm 审计(本文档第 2 节)
- [x] Phase 2: 接口设计(本文档第 3 节,代码见 `crates/yeader-plugin-core/`)
- [x] Phase 3: 功能型插件(`yeader-plugin-crypto`、`yeader-plugin-http`、`yeader-plugin-descramble`;`html-parser` 复用 workspace 的 `scraper`,按需推进)
- [ ] Phase 4: jm 源型插件移植
- [ ] Phase 5: 前端 UI 适配
- [ ] Phase 6: 功能型插件沉淀(`builtin: true`)
- [ ] Phase 7: 更多源型插件 + 文档
