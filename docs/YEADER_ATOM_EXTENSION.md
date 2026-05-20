# Yeader Atom 扩展标准

> Yeader Atom Extension v1.0-draft
>
> 目标:把 RSS/Atom 从"博客更新通知格式"扩展为 **任意互联网内容的 AI 可消费 + Web3 可验证** 的统一中间层。

---

## 1. 为什么选 Atom 而不是 RSS 2.0

| 维度 | Atom | RSS 2.0 |
|------|------|---------|
| 命名空间扩展 | `xmlns` 原生支持 | 有限且社区碎片 |
| 国际化 | `xml:lang` 内建 | 无 |
| 内容模型 | `type="xhtml"` / `type="text"` | 只有 `encoded` |
| entry 唯一 ID | `id` 必须 IRI | `guid` 可选 |
| 时间精度 | `published` + `updated` | 仅 `pubDate` |
| MIME type | `application/atom+xml` 标准注册 | 无统一 MIME |

Yeader 扩展 Atom 1.0 (RFC 4287),不使用 RSS 2.0 做扩展基座。

---

## 2. 核心模型:四条路径,同一出口

Yeader 用四种方式把网站变成 Atom feed,按复杂度分层:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Path 0          Path 1          Path 2          Path 3      │
│  RSS/Atom 原生    JSON 规则       JS 脚本         Wasm 插件   │
│  (零规则,直通)   (声明式提取)     (沙箱逻辑)     (原生编译)  │
│                                                              │
│  "贴 url"       "写 JSON"       "JSON + JS"     "写 Rust"   │
│                                                              │
│     │               │               │               │        │
│     │   ┌───────────┼───────────────┼───────────────┤        │
│     │   │           │               │               │        │
│     ▼   ▼           ▼               ▼               ▼        │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              Yeader Host (核心)                     │     │
│  │  - 解析 / 补全 yeader: 扩展                        │     │
│  │  - 执行 JSON 规则 (AnalyzeRule 全引擎)              │     │
│  │  - 执行 JS 沙箱脚本                                 │     │
│  │  - 托管 Wasm 插件 (wasmtime)                       │     │
│  │  - 统一输出: application/atom+xml + yeader: ns     │     │
│  │  - Inbox 聚合、已读/未读、Reader 渲染              │     │
│  │  - AI 工具链消费、Web3 签名验证                    │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│              统一出口: Yeader Atom XML                       │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 四条路径详解

#### Path 0: RSS/Atom 原生

站点已输出 RSS/Atom → 直通。Host fetch feed → 补 `yeader:media-type` / `yeader:layout` 等 metadata → 合并到 Inbox。

- 零规则编写,用户粘贴 URL 即可
- 适用:博客、新闻、Podcast、GitHub releases、YouTube 频道
- 权限:零

#### Path 1: JSON 规则

声明式 JSON 定义 HTTP 请求 + CSS/JSONPath/XPath/Regex 选择器 + 变量分页。Host 用 `AnalyzeRule` 执行提取,序列化为 Atom。

- 适用:标准 HTML 网站,无加密,无复杂登录
- 权限:零。规则是生数据提取指令
- 示例:`sources/czbooks.net.json`

#### Path 2: JS 脚本

在 JSON 规则基础上,`actions` 字段嵌入沙箱 JS:签名计算、cookie 管理、文本清洗。JS 引擎无网络、无文件、无 DOM。

- 适用:需要 token 签名或文本后处理的站点
- 权限:沙箱 JS(字符串变换 only)
- 示例:需要 MD5 签名的旧式论坛

#### Path 3: Wasm 插件

Rust → `wasm32-wasip1`,实现 `SourcePlugin` trait。通过 `HostApi` 获得 scoped 网络、cookie、存储、crypto。

- 适用:图片 descramble、AES/CBC 解密、付费墙验证
- 权限:manifest 声明显式授权,host runtime enforce
- 示例:`plugins/jm/`(漫画 descramble)

- **一个源可以产出多个 feed**:追更流、搜索结果流、周刊流——都是同一个源的多个 endpoint,都输出 Atom。

### 2.3 Book / Comic / Novel 的 Feed 模型

原生 Atom 没有 "book" 概念。Yeader 这样建模:

```
Book (ContentDetail, 不进 feed)
├─ 书名、封面、作者、总章节数、简介
│
├─ 追更 Feed (atom:feed)
│   ├─ entry: 第127章更新事件
│   │   ├─ <link rel="yeader-content" href="..."/>   ← 章节正文由此获取
│   │   ├─ <yeader:chapter index="127"/>
│   │   └─ <yeader:word-count>5200</yeader:word-count>
│   ├─ entry: 第126章更新事件
│   └─ ...
│
├─ 章节列表 Feed (atom:feed, toc)
│   ├─ entry: 第1章
│   ├─ entry: 第2章
│   └─ ... (不排序,由 chapter index 决定)
│
└─ 搜索命中 Feed (atom:feed, 临时)
    └─ entry: 每本匹配的书 = 一个 entry (不展开章节)
```

```
Comic (类比)
├─ 漫画元信息 (ContentDetail)
├─ 追更 Feed: entry = 新一话发布
├─ 话列表 Feed: entry = 一话
│   ├─ <yeader:chapter index="127"/>
│   ├─ <yeader:layout>vertical-strip</yeader:layout>
│   └─ <yeader:reading-direction>right-to-left</yeader:reading-direction>
├─ 页级 assets: 由 host 按需 fetch + transform_asset
└─ 搜索命中 Feed: entry = 每本漫画
```

关键区分:

| 实体 | 在 Atom 里是 | 生命周期 |
|------|-------------|---------|
| Book/Comic 本身 | **不是 entry**,是 `ContentDetail`(API 返回) | 持久 |
| 章节/话 | feed entry(更新事件) | 按发布时间排 |
| 单页/章节正文 | **不是 entry**,是 `<link>` 引用的外部资源 | lazy fetch |
| 搜索结果 | 临时 feed entry(不保存) | 请求即弃 |

与 OPDS (Open Publication Distribution System) 的关系:OPDS 规范用 Atom 做电子书书目和获取,Yeader 的 `ContentDetail` → feed 的映射与 OPDS 兼容。Yeader 扩展的是 OPDS 不覆盖的漫画分页/descramble/追更/搜索维度。

---

## 3. yeader: 命名空间

```
xmlns:yeader="https://yeader.app/ns/1"
```

所有扩展在该命名空间下。版本号 (`/1`) 允许未来向后不兼容的修订。

---

## 4. v1.0 必需扩展 (v1-must)

> 这些元素被 Yeader host 硬依赖。缺失则 render 分支不可用。

### 4.1 feed 级

#### `yeader:media-type` (on `<feed>` or `<entry>`)

声明 feed/entry 的媒体类别。值域:

```
article | novel | comic | video | audio | game | release | newsletter
```

- 作用:Host 据此选择 Reader 渲染策略(HTML renderer / vertical strip / 沉浸排版 / 视频播放器)。
- 可以是 feed 级默认值,entry 级覆盖。

```xml
<feed>
  <yeader:media-type>comic</yeader:media-type>
  ...
  <entry>
    <!-- 继承 comic 类型 -->
  </entry>
</feed>
```

#### `yeader:layout` (on `<entry>`)

声明内容在 Reader 中的排版方式:

```
html | vertical-strip | paginated | immersive | audio-player | video-player
```

- `html`: 标准 RSS 文章渲染(article / newsletter / release)
- `vertical-strip`: 漫画垂直长图滚动(novel 也可选此)
- `paginated`: 小说翻页模式
- `immersive`: 小说无限滚动,无分页感

```xml
<entry>
  <yeader:media-type>comic</yeader:media-type>
  <yeader:layout>vertical-strip</yeader:layout>
</entry>
```

### 4.2 entry 级

#### `yeader:chapter` (on `<entry>`)

章节/话序信息。仅当 entry 属于一个多章节作品时出现。

```xml
<yeader:chapter
  index="127"
  parent="urn:yeader:book:abc123"
  title="最后的堡垒"
  total="234"
/>
```

属性:

| 属性 | 必需 | 说明 |
|------|------|------|
| `index` | 是 | 章节序数,从 1 开始 |
| `parent` | 否 | 父级 `ContentDetail` 的 canonical ID |
| `title` | 否 | 章节标题(可覆盖 entry/title) |
| `total` | 否 | 已知总章节数(用于进度百分比) |

#### `yeader:asset` (on `<entry>`,可多个)

声明 entry 关联的媒体资源。用于漫画页/视频分P/小说插图等。

```xml
<entry>
  <yeader:asset
    index="0"
    url="https://cdn.example.com/chapter/127/page/001.webp"
    mime="image/webp"
    needs-transform="true"
    transform-hint="descramble.v3"
    width="800" height="1200"
  />
  <yeader:asset index="1" url="..." needs-transform="true"/>
</entry>
```

属性:

| 属性 | 必需 | 说明 |
|------|------|------|
| `index` | 是 | 资源序数,从 0 开始 |
| `url` | 是 | 原始 URL(host 用 HostApi 请求) |
| `mime` | 是 | 原始 MIME type |
| `needs-transform` | 否 | 是否需要 `transform_asset` |
| `transform-hint` | 否 | 传给 plugin transform 的 hint |
| `width` / `height` | 否 | 原始尺寸(用于 reader 排版预算) |

> 注意:`yeader:asset` 是 **URL 索引**,不是内联数据。host 在用户翻到该页时才请求 + transform。这是转译模型的契约(见 PHILOSOPHY §2.6)。

#### `yeader:access` (on `<entry>`)

访问控制标记。

```xml
<yeader:access
  mode="token-gated"
  attestation-required="urn:yeader:contract:0x1234"
/>
```

值域: `public` | `login-required` | `token-gated` | `subscription-gated` | `geo-restricted`

当 `mode` 不是 `public` 时,host 在展示内容前执行守卫逻辑。

#### `yeader:capabilities` (on `<feed>`)

声明此 feed 支持的交互能力。这是 `PLUGIN_SYSTEM.md` §4.2 的 manifest 字段在 Atom 层的投影。

```xml
<feed>
  <yeader:capabilities>
    feed search content toc asset login offline
  </yeader:capabilities>
</feed>
```

值:空格分隔的 capability token,必须从 `PLUGIN_SYSTEM.md` §4.4 的集合中取值。

#### `yeader:reading-direction` (on `<entry>`)

```xml
<yeader:reading-direction>right-to-left</yeader:reading-direction>
```

值域: `left-to-right` | `right-to-left` | `top-to-bottom`

漫画默认 `right-to-left`,小说默认 `left-to-right`。

---

## 5. v1.5 扩展 (可选的增强标记)

> 这些标记缺失不影响核心消费。添加后提升 AI 可消费性和用户体验。

### 5.1 AI Native 扩展

#### `yeader:semantic-type` (on `<entry>`)

比 `media-type` 更细粒度的内容语义分类,面向 LLM 和 agent 的 content routing。

```xml
<yeader:semantic-type>tutorial</yeader:semantic-type>
<yeader:semantic-type>news.breaking</yeader:semantic-type>
<yeader:semantic-type>fiction.chapter</yeader:semantic-type>
<yeader:semantic-type>changelog</yeader:semantic-type>
```

值:自由字符串,用 `.` 做层级。host 不硬编码值域,而是收束到 registry 的 known-types 列表。

#### `yeader:content-hash` (on `<entry>`)

内容指纹。同时服务 AI 训练数据溯源和 Web3 链上验证。

```xml
<yeader:content-hash
  algorithm="sha3-256"
  scope="entry-metadata"
>a1b2c3d4e5f6...</yeader:content-hash>
```

| 属性 | 说明 |
|------|------|
| `algorithm` | `sha3-256`(默认) / `sha2-256` |
| `scope` | `entry-metadata` / `full-content`(含链接资源) |

- `entry-metadata`:只对 entry 的 XML 元素做 hash,不包含外部资源。
- `full-content`:对 entry + 所有 `yeader:asset` 链接的资源字节做 Merkle 树 hash。

#### `yeader:embedding-ref` (on `<entry>`)

指向外部 embedding 向量的 URI,供 AI agent 做语义搜索和聚类。

```xml
<yeader:embedding-ref
  model="bge-m3"
  dim="1024"
  href="ipfs://bafy.../ch127.bge-m3.f16.bin"
/>
```

不把 embedding 字节放 feed 里(太大)。指向外部 blob,host 按需加载。

#### `yeader:canonical-id` (on `<feed>` or `<entry>`)

跨平台内容寻址标识,独立于 Atom 的 `<id>`。

```xml
<yeader:canonical-id scheme="yeader.book">jm-12345</yeader:canonical-id>
```

`scheme` 值: `yeader.book` | `yeader.comic` | `yeader.chapter` | `isbn` | `doi` | `ipfs-cid`

用途:
- AI agent 跨源去重:"这个章节我已经从另一个源看过了"
- Web3 链上索引:"链上合约按 canonical-id 查找内容验证状态"

#### `yeader:rating` (on `<entry>`)

内容分级,面向家长控制和 AI 内容过滤。

```xml
<yeader:rating system="adult-content">explicit</yeader:rating>
<yeader:rating system="violence">mild</yeader:rating>
```

system 值: `adult-content` | `violence` | `language` | `age-rating`

value 值: `none` | `mild` | `moderate` | `explicit`

多重 `yeader:rating` 用于不同维度。

#### `yeader:transcript` (on `<entry>`, video/audio)

视频/音频条目的文字转录,让 LLM 可检索。

```xml
<yeader:transcript lang="zh-CN" href="ipfs://bafy.../ep42.vtt"/>
```

不内嵌转录(太大),指向外部 VTT/SRT 文件。

#### `yeader:error` (on `<entry>`)

当条目获取失败时,feed 可携带错误 entry 告知下游。

```xml
<entry>
  <title>Error: Chapter 127</title>
  <yeader:error code="rate-limited" retry-after="60">Rate limit exceeded</yeader:error>
</entry>
```

### 5.2 Web3 Friendly 扩展

#### `yeader:identity-proof` (on `<feed>`)

Feed 级别的身份证明。插件作者用 EVM 私钥对 `<id>` + `<updated>` 签名。

```xml
<yeader:identity-proof
  address="0x1234..."
  chain-id="1"
  signature="0xabcd..."
  message="urn:yeader:feed:jm-comics|2026-05-20T08:00:00Z"
/>
```

Host 验证逻辑:
1. 取 `<atom:id>` + `<atom:updated>`
2. 拼成 message
3. `ecrecover(message, signature)` → 比对 address

用于:
- 插件 marketplace 的信任链:作者签名 → registry 收录 → 用户安装
- 跨设备同步的密钥派生:用户用 EVM 签名导出 E2E 加密密钥(不暴露私钥)

#### `yeader:access-attestation` (on `<feed>` or `<entry>`)

Token-gated 内容的访问证明。

```xml
<yeader:access-attestation
  contract="0xabcd..."
  chain-id="1"
  token-id="42"
  proof="0x..."
/>
```

Host 在用户持有对应 token 后,向 plugin 提供此证明。Plugin 用 contract ABI 验证 proof 后才返回内容。

隐私要点:proof 是 ZK-friendly 的 commitment,host 不向 plugin 暴露用户地址。

#### `yeader:content-verification` (on `<entry>`)

链上内容验证回执。将 `content-hash` 锚定到链上交易。

```xml
<yeader:content-verification
  tx-hash="0xdead..."
  chain-id="1"
  contract="0xdef..."
  block-number="19000000"
/>
```

表示"此 entry 的 content-hash 已在链上某合约的某交易中注册"。用于:
- 内容版权声明(链上时间戳证明"我最早发布了这个内容")
- AI 训练数据合规(模型训练者可以验证数据来源和许可)

#### `yeader:duration-estimate` (on `<entry>`)

预估消费时长。单位:秒。

```xml
<yeader:duration-estimate seconds="1200"/>
```

用于:
- 视频/音频:播放时长
- 小说:按均速阅读速度估算(词数 ÷ 300wpm)
- 漫画:按页数估算(页数 × 30s/page)

AI agent 用此做时间预算,人类用户做消费规划。

---

## 6. 搜索 Feed 的特殊约定

搜索结果是**临时 feed**,与订阅 feed 不同:

```xml
<feed>
  <title>Search: "寒武" in jm-comics</title>
  <id>urn:yeader:search:jm-comics?q=寒武</id>
  <yeader:capabilities>search</yeader:capabilities>
  <yeader:media-type>comic</yeader:media-type>
  <opensearch:totalResults>23</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>20</opensearch:itemsPerPage>
  
  <entry>
    <title>寒武再临</title>
    <id>urn:yeader:comic:jm:12345</id>
    <!-- 搜索结果 entry 不展开章节,只是书的卡片 -->
    <link rel="yeader-content" href="yeader://source/jm/comic/12345"/>
  </entry>
</feed>
```

搜索 feed 复用 OpenSearch 1.1 的分页元素 (`totalResults` / `startIndex` / `itemsPerPage`),不重新发明。

---

## 7. OPDS 兼容性

Yeader 的 Atom 扩展与 [OPDS 1.2](https://specs.opds.io/opds-1.2) 兼容但不从属于 OPDS:

- OPDS 把书建模为 `<entry type="application/epub+zip">`,Yeader 的 `<yeader:media-type>novel</yeader:media-type>` 映射等价
- OPDS 的 `<link rel="http://opds-spec.org/acquisition">` 与 Yeader 的 `<link rel="yeader-content">` 语义相容
- OPDS 不覆盖:漫画分页、descramble hint、章节追更、搜索、Web3 验证、AI metadata

Yeader 可以消费 OPDS 兼容的 feed(如 Calibre OPDS 服务),但 OPDS 消费者不能消费 Yeader 的完整命名空间。

---

## 8. Feed 生成流程

```
用户订阅源 "jm" → host 调用 Plugin.feed(limit, since)
  → Plugin 调用站点 API,解密响应
  → Plugin 构造 Atom XML (带 yeader: 扩展)
  → Host 解析 feeds → 合并到 Inbox
  → UI 渲染 (按 yeader:media-type / yeader:layout dispatch)
  → AI agent 消费同一 feed (按 yeader:semantic-type / yeader:content-hash)
```

Plugin 作者不需要理解 Atom XML 序列化细节。`yeader-sdk` 提供 `AtomFeedBuilder` / `AtomEntryBuilder` fluent API,把 struct 序列化成合法 Atom + yeader 扩展。

---

## 9. 版本迁移策略

- **v1.0-draft** (当前):命名空间 `https://yeader.app/ns/1`,按本文档定义。
- v1 的扩展可以新增,但已有元素不能删除或改语义(只加不破)。
- 如果必须 breaking change:发 `https://yeader.app/ns/2`,host 并行支持两个版本。Plugin manifest 的 `atom-ns-version` 字段控制用哪个版本输出。
