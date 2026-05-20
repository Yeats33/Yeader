# Yeader 设计哲学

> 这份文档是 Yeader 的"宪法":不规定 API、不列字段,只回答**为什么 Yeader 长这样**。所有功能、UI、插件、架构决策遇到分歧时,先回到这里对齐。

---

## 1. 一句话定位

> **Yeader 是互联网内容(媒体 + 文字)的 all-in-one 本地优先阅读器**。它以 RSS 三十年沉淀下来的"订阅 → 流 → 阅读"骨架为脚手架,通过插件把"什么算 feed item"无限扩展:漫画一话是 item,小说一章是 item,视频一集是 item,podcast 一期是 item,GitHub release 是 item。骨架不变,内涵无限。

关键词解读:

- **all-in-one**:互联网上的内容归根结底就是"媒体 + 文字",Yeader 的目标是同一壳消费两者。
- **RSS 骨架**:不重造订阅范式,而是把它当跳板。四条路径(RSS 原生 / JSON 规则 / JS 脚本 / Wasm 插件)统一产出 Yeader Atom,把任意能被 normalize 成 item 的内容塞进 Inbox。
- **本地优先**:数据在用户机器上;插件可以远程,但消费体验离线可用。

---

## 2. 核心信念

### 2.1 「订阅 > 搜索」 是主线交互

主流阅读器分两派:

- **搜索派**(Tachiyomi、Calibre):用户每次想看东西,先选源、再搜、再读。源是货架。
- **订阅派**(Folo、Reeder、NetNewsWire):用户一次订阅、之后被动消费 timeline。源是水龙头。

Yeader 站订阅派。理由:

- 现代用户已经不再"主动浏览十几个网站",而是"一个 Inbox 看完所有更新"。RSS 阅读器三十年的范式胜出是有道理的。
- 漫画/小说追更天然就是订阅行为(等下一话)。把它和 RSS 用同一个 metaphor 对齐,认知负担骤降。
- 插件越多,搜索派越混乱(选哪个源?);订阅派只增加左栏一行。**这是 Yeader 必须能"驾驭很多插件"的关键**。

搜索作为**第二动作**保留:跨源搜索作为"切换模式",而不是首页第一控件。

### 2.2 三栏布局是默认形态

桌面优先,三栏对齐 Folo / Reeder / Mail.app 的肌肉记忆:

```
┌──────────────┬───────────────────────┬─────────────────────────┐
│  Sources     │   Items (stream)      │   Reader                │
│              │                       │                         │
│ ▸ Inbox  142 │  ● 第127话 灼眼...    │  ┌────────────────────┐ │
│ ▸ Today      │    JM · 3min ago      │  │                    │ │
│ ▸ Starred    │                       │  │   渲染区:文章/    │ │
│ ▸ Library    │  ● Folo v0.3 更新     │  │   章节/漫画 vstrip │ │
│ ── Folders ──│    GitHub · 1h ago    │  │                    │ │
│ ▾ 漫画追更   │                       │  │                    │ │
│   📚 JM   12 │  ○ 寒武再临 Ch.45     │  │                    │ │
│   📚 wnacg 3 │    某小说源 · 6h      │  │                    │ │
│ ▾ 资讯       │                       │  │                    │ │
│   📰 HN      │                       │  │                    │ │
│   📰 v2ex    │                       │  └────────────────────┘ │
│ + Add Source │                       │                         │
└──────────────┴───────────────────────┴─────────────────────────┘
```

- **左栏(Sources)**:虚拟集合(Inbox/Today/Starred/Library)+ 用户自定义文件夹 + 启用的插件源。每行带未读计数。媒体类型用 icon 区分但不强制分 Tab —— Folo 的混看体验比硬分段更舒服。
- **中栏(Items)**:当前选中节点的条目流。顶部一行紧凑工具栏:搜索框(默认在当前作用域内)、排序、刷新、全部已读。滚动 mark-as-read。
- **右栏(Reader)**:形态由 item 的 media_type 决定(RSS→HTML 渲染,小说→沉浸排版,漫画→vertical strip),Reader 是 strategy 容器。

移动端把三栏折叠为左→中→右三屏,push navigation。

### 2.3 四条路径,同一出口

任何网站在 Yeader 里都可以变成一个源,但不同复杂度的站点走不同的接入路径。四条路径统一产出 `application/atom+xml + yeader:` namespace:

```
复杂度: 零 ───────→ 低 ────────→ 中 ────────→ 高

 RSS/Atom 原生     JSON 规则       JS 脚本      Wasm 插件
 (零规则,直通)    (声明式提取)    (沙箱逻辑)    (原生编译)
```

#### Path 0: RSS/Atom 原生 → 零规则

站点已有 RSS/Atom feed → Yeader 直接拉取 → 补 `yeader:` 扩展 metadata → 汇入 Inbox。不做 HTML 解析,不加解密,零额外逻辑。

- **适用**:博客、新闻、Podcast、GitHub releases、YouTube 频道——任何已输出标准 feed 的站点
- **用户操作**:粘贴 feed URL → 自动检测 → 订阅
- **权限**:零。纯消费公开 feed

#### Path 1: JSON 规则 → 声明式提取

用户(或社区)写一份声明式 JSON,定义 HTTP 请求 + CSS/JSONPath/XPath/Regex 选择器 + 变量分页模板。Host 执行请求后用 `AnalyzeRule` 提取结构化字段,序列化为 Yeader Atom。

- **适用**:标准 HTML 网站,无加密,无复杂登录
- **能力**:多引擎选择器 + `{{变量}}` 替换 + 分页 + `beforeRequest`/`afterExtract` JS 微调
- **权限**:零。规则只是提取指令,host 全权控制 HTTP
- **例子**:czbooks.net(小说)、1024txt.com(小说)

#### Path 2: JS 脚本 → 沙箱逻辑

JSON 规则的基础上,`actions` 字段嵌入沙箱 JS:签名计算、cookie 管理、字符串解密、内容清洗。JS 引擎无网络、无文件、无 DOM,只能操作变量和字符串。

- **适用**:需要 token 签名、简单 cookie 续期、文本后处理的站点
- **能力**:Path 1 全部 + `beforeRequest`/`beforeExtract`/`afterExtract` 沙箱 JS
- **权限**:沙箱 JS(无网络、无文件);host 审查脚本后执行

#### Path 3: Wasm 插件 → 完整控制

Rust 编译到 `wasm32-wasip1`,实现 `SourcePlugin` trait(stack)。通过 `HostApi` 获得 scoped network/cookie/storage 访问,可做图像 descramble、AES 解密、浏览器指纹对抗。

- **适用**:图片解密、AES/CBC、Cloudflare 对抗、付费墙 token 验证
- **权限**:manifest 声明显式授权——`network` scope、`cookies`、`storage`、`browser_rendering`——host 运行时 enforce
- **例子**:jm 漫画(AES + descramble)、e-hentai(登录 + 图片解密)

#### 统一约束

四条路径共享同一底线:

- **不写 UI**,只产数据。展示由核心负责,保证一致体验。
- **不持有库**,只生产事件。订阅/已读/收藏/进度是核心的领域,跨源同步。
- **不直接通信**,插件间通过共享的功能型 crate 复用(crypto/http/descramble),源型不互调。

四条路径只决定"怎么产出 Atom",不决定"Atom 怎么消费"。左栏同一列表中四种源混排,用户感知不到差异——每行只是多了一个源,不会让产品形态膨胀。

### 2.4 Marketplace 与日常消费解耦

发现/安装/启停/权限审阅 放独立 Tab。理由:

- 新用户不会被"几百个插件"压垮 —— 默认安装几个推荐源就能用。
- 老用户管理插件是低频行为,不该挤占日常路径。
- 权限/安全披露(network scope, login required, paid content)在装的那一刻显式确认,而不是埋在某个三级菜单。

### 2.5 本地优先,加密透明

- 所有数据(书架、进度、订阅、cookie、token)默认存本机。
- 同步是 opt-in,而且必须端到端加密(参考 Standard Notes、Bitwarden)。云只是"加密 blob 的中转",看不到内容。
- 插件能拿到 HostApi 受限的网络/存储,不能直接读用户主库。

### 2.6 转译,不下载

Yeader **是 reader 的 driver,不是 downloader 的 driver**。这是与 Hmanga、Tachiyomi、niuhuan/jmcomic-downloader 等"下载器派"工具的根本分野。

- 默认路径:用户翻到第 N 页 → host 按需 fetch 单页 → 插件 in-memory 解密/descramble → 灌进 reader。**不落盘**。
- 缓存:host 维护 LRU + prefetch window,翻页流畅,关闭即清。
- 离线("pin for offline"):用户显式动作触发批量预热并落盘,是退化形态,不是主路径。UI 上是二级动作,不是工具栏主按钮。
- 这条原则的回报:用户磁盘干净、版权合规姿态更柔和、与流式订阅模型(§2.1)语义自洽 —— 订阅了不等于占了硬盘。

对插件契约的影响:trait 形状不变,但 host 调用 `transform_asset(asset, bytes)` 时语义是 **per-page lazy 变换**,不是 batch 下载后处理。同一份插件代码可被 Hmanga 风格的下载器和 Yeader 风格的 reader 同时消费 —— 这反向验证了 trait 的正交性。

### 2.7 AI Native: 每条 feed 都是 prompt-ready context

Yeader 不把 AI 当外挂功能,而是让它长在数据骨架里。核心理念:

- **Feed = AI 可消费的结构化上下文**。Atom entry 携带语义类型、内容分类、阅读方向、媒体布局 —— 这些 metadata 让 LLM 无需 scraping 就能理解"这是一话漫画的第 12 页,从右向左翻,图片需要 descramble"。
- **Content provenance 是 AI 时代的刚需**。每个 entry 通过 `yeader:canonical-id` 和 `yeader:content-hash` 携带可验证的来源指纹。训练数据溯源、RAG 引用、版权声明 —— 都从 feed 层解决,不依赖外部爬虫。
- **插件输出 Atom,AI 消费 Atom**。同一个 entry 同时服务人类阅读器和 AI agent。Yeader 的 Wasm 插件解出结构化数据后,host 把它序列化成 `application/atom+xml`,AI 工具链直接消费,无需二次解析。
- **Semantic layer,不是 prompt layer**。Yeader 不硬编码 prompt 模板,而是在 Atom 扩展中提供足够丰富的语义标记(媒体类型、章节序号、翻译状态、成人内容标记、付费墙状态),让上层的 AI 应用自行决定如何 prompt-engineer。
- **用户数据是用户自己的训练语料**。本地优先 + 加密同步意味着用户的阅读历史、收藏、进度可以用作个人微调数据,而不会被平台收割。

### 2.8 Web3 Friendly: feed 是可验证的 credential

Web3 在 Yeader 里不是 token 投机,而是三件事:身份自主、内容可验证、插件可问责。

- **EVM 身份锚定,不强制登录**。用户和插件作者都用 EVM 地址作为长期身份,但核心阅读流程零登录。EVM 只用于:① 插件作者签名发布;② 用户激活付费源时提交 access attestation;③ 跨设备同步的 E2E 密钥派生。
- **Feed entry 即 verifiable credential**。每个 entry 携带 `yeader:content-hash`(sha3-256),配合插件的 EVM 身份签名,形成链上可验证的"某源于某时产出了某内容"的 proof。不依赖中心化时间戳服务。
- **Token-gated access 不泄露隐私**。付费源的 access attestation 通过 ZK proof 或简单的签名挑战完成 —— host 只向插件证明"持有某 token",不暴露地址和余额。
- **插件 marketplace 去中心化**。插件 manifest 由作者 EVM 签名,注册表只是索引而非权威。用户可以 trust-on-first-use,也可以验证链上签名后安装。Takedown 只影响注册表条目,不影响已安装插件。
- **不造链,不发票**。Yeader 自己不发 token、不做 L2、不做 consensus。它只是让 Atom feed 变成可以被链上合约引用的数据格式。

---

## 3. 设计 tradeoff 与立场

| 抉择 | Yeader 站这边 | 理由 |
|---|---|---|
| 订阅流 vs 目录搜索 | **订阅流** | 插件越多,搜索越乱;订阅可扩展 |
| 单一 Inbox vs 多媒体分 Tab | **单一 Inbox + icon 区分** | Folo 经验:混看更自然 |
| 插件可写 UI vs 只产数据 | **只产数据** | UI 一致性 > 插件灵活性 |
| 聚合搜索作主路径 vs 第二动作 | **第二动作** | 聚合搜索慢且易撞限流,不能作为日常入口 |
| Wasm 沙箱 vs 原生 trait | **现阶段原生,Wasm 是 v1.0 目标** | 先沉淀接口,沙箱后置 |
| 桌面优先 vs 移动优先 | **桌面优先,移动适配** | 三栏布局天然桌面;长内容阅读桌面体验更好 |
| 云同步默认开 vs 默认关 | **默认关,opt-in 加密** | 本地优先 = 不信任云 |
| 下载落盘 vs 转译流式 | **转译流式,离线 opt-in** | reader 的 driver,不是 downloader 的 driver(§2.6) |
| AI 外挂 vs AI 原生数据层 | **AI 原生数据层** | Feed metadata 本身就是 prompt-ready;不用额外爬取和转换(§2.7) |
| 平台账号 vs EVM 自主身份 | **EVM 自主身份,阅读零登录** | 身份用于签名/验证,不用于绑定用户(§2.8) |
| 中心化 marketplace vs 签名可验证 | **注册表索引 + EVM 签名** | 信任出在作者签名,不在平台托管(§2.8) |
| 单一接入方式 vs 多路径分层 | **四条路径,按复杂度自选** | 零规则 RSS 直通 → JSON 声明式 → JS 沙箱 → Wasm 完整控制(§2.3) |

---

## 4. 不做什么(反目标)

- **不做社交**:不评论、不点赞、不 timeline 算法推荐。阅读是个人行为,Folo 的社交我们不抄。
- **不做内容审核中心**:plugin marketplace 只做权限披露和 takedown 通道,不做内容评级。
- **不做账号中心**:核心不强制登录。EVM 登录只用于插件激活/付费校验。
- **不做自有内容池**:Yeader 不爬取、不缓存、不分发内容。源永远是插件提供的第三方站点。
- **不做"浏览器代替品"**:Reader 渲染是为长内容优化的,不是渲染任意 web app。

---

## 5. 决策清单

每次产品/技术决策前,过一遍这七问:

1. 这个功能强化了"订阅流为主"还是增加了搜索/目录路径的复杂度?
2. 这个功能能容纳"100 个插件源同时启用"而不让 UI 崩塌吗?
3. 这个功能让插件能影响 UI/数据一致性吗?如果是,有没有办法把它收回到核心?
4. 这个功能强迫用户走云端 / 联网 / 注册 吗?
5. 这个功能我能用一句话向 RSS/Reeder 用户解释吗?如果不能,大概率不该做。
6. 这个功能产出的数据能被 AI agent 直接消费吗?如果不能,缺什么 metadata?(§2.7)
7. 这个功能依赖中心化信任吗?如果是,能否用签名/证明替代?(§2.8)

---

## 6. 关联文档

- `PLUGIN_ROADMAP.md` — 插件生态迁移路线
- `docs/PLUGIN_SYSTEM.md` — 插件运行时设计与 capability/HostApi 契约
- `docs/YEADER_ATOM_EXTENSION.md` — Yeader Atom 扩展标准(AI Native + Web3 Friendly namespace)
- `CLAUDE.md` — 工程规范与构建命令
- `DESIGN.md` — 视觉风格参考(独立于交互哲学)
