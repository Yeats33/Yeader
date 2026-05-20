# Yeader Source Format v0

Yeader's native source format is the app's canonical rule contract. External
formats such as Legado should be translated into this format before storage or
execution.

## Goals

- Keep Yeader execution independent from any single upstream source format.
- Support several content families through one rule vocabulary: novels, RSS,
  comics, audio, video, short drama, and generic sources.
- Make compatibility import a one-way translation step:
  `external format -> YeaderSource -> app storage/execution`.
- Preserve imported rules without requiring every executor feature on day one.

## Non-Goals For v0

- v0 does not execute every selector engine yet.
- v0 does not promise lossless export back to external formats.
- v0 does not keep Legado field names as the app's internal model.

## Source Pack

```json
{
  "format": "yeader.source-pack",
  "version": 1,
  "name": "Example pack",
  "sources": []
}
```

## Source

```json
{
  "id": "example-novel",
  "name": "Example Novel",
  "mediaType": "novel",
  "version": "2026-05-19",
  "homepage": "https://example.com",
  "tags": ["novel", "demo"],
  "enabled": true,
  "auth": {
    "loginUrl": "https://example.com/login",
    "cookieJar": true
  },
  "compatibility": {
    "originFormat": "legado.bookSource",
    "originVersion": "0",
    "features": ["search", "detail", "toc", "content", "explore"],
    "requires": ["javaScript", "cookieJar"]
  },
  "requestDefaults": {
    "headers": {
      "User-Agent": "Yeader"
    },
    "encoding": "utf-8",
    "timeoutMs": 10000,
    "cookieJar": true
  },
  "variables": {
    "query": "",
    "page": "1"
  },
  "capabilities": []
}
```

## Capabilities

A capability is one executable action the app can perform against a source.

Supported v0 capability kinds:

- `search`: search items by keyword/page.
- `detail`: fetch metadata for one item.
- `toc`: fetch a chapter/episode list.
- `content`: fetch readable content for one chapter/page.
- `feed`: fetch RSS-like article streams.
- `list`: fetch browse/ranking/list pages.
- `review`: fetch comments, paragraph reviews, ratings, or related discussion.
- `asset`: fetch binary or media assets.

```json
{
  "kind": "search",
  "request": {
    "method": "GET",
    "url": "https://example.com/search?q={{query}}",
    "pagination": {
      "variable": "page",
      "firstPage": 1,
      "step": 1
    }
  },
  "item": {
    "engine": "css",
    "query": ".result"
  },
  "fields": {
    "title": {
      "engine": "css",
      "query": ".title",
      "output": "text"
    },
    "url": {
      "engine": "css",
      "query": "a",
      "output": "href"
    }
  }
}
```

## Selector Engines

Supported v0 selector engine names:

- `css`
- `jsonPath`
- `xPath`
- `regex`
- `text`
- `javaScript`
- `legacyLegado`

`legacyLegado` is a compatibility-preservation engine. Importers may emit it
when they cannot yet translate a foreign rule into a first-class Yeader selector.
Executors should treat it as a compatibility lane, not as the native target.

## Compatibility Import Pipeline

The intended import path is:

1. Parse the external source format into its existing external model.
2. Translate that model into `YeaderSource`.
3. Store and execute only the `YeaderSource`.
4. Keep optional provenance metadata for diagnostics, not for runtime coupling.

Initial implemented translators:

- `LegacyBookSource -> YeaderSource`
- `LegacyRssSource -> YeaderSource`

The translator keeps Legado extraction rules under `legacyLegado` selectors so
the app can later either execute them through a compatibility executor or
incrementally normalize them into native `css`/`jsonPath`/`regex` selectors.

## Book Source Compatibility Standard

The public yckceo book-source repository
(`https://www.yckceo.com/yuedu/shuyuan/index.html`) shows that real-world book
sources are not just static novel-site selectors. Yeader compatibility import
must preserve the following dimensions even before every dimension has a
first-class executor:

- **Version and capability badges**: source repositories commonly mark 2.x/3.x
  compatibility and capability labels such as discovery, search, image/comic,
  and audio. Yeader stores this in `compatibility.features` and
  `compatibility.originVersion`.
- **Media scope**: a single source may switch between novel, audio, comic, and
  short-drama modes through variables or search prefixes. Native `mediaType`
  should describe the primary family, while `compatibility.features` records
  mixed-mode support until split-source generation exists.
- **Discovery as a first-class flow**: many sources expose `exploreUrl` and
  `ruleExplore`, sometimes without normal search. Import them as `list`
  capabilities rather than treating discovery as secondary metadata.
- **Login and cookie state**: `loginUrl`, `loginUi`, `loginCheckJs`, and
  `enabledCookieJar` must survive import. Yeader maps these to `auth` and
  `requestDefaults.cookieJar`.
- **JavaScript lifecycle**: `<js>` URL templates, `jsLib`, pre-update scripts,
  formatting scripts, and web scripts are compatibility requirements. Mark them
  in `compatibility.requires` and keep raw scripts until a safer plugin/runtime
  execution path exists.
- **Reviews and paragraph comments**: sources may include `enabledReview` and
  `ruleReview`. Preserve these as `review` capabilities.
- **Request options embedded in URLs**: Legado-style `url,{...options...}` forms
  can carry method, body, charset, headers, and cookies. Yeader import must not
  discard them even when the native request parser cannot yet normalize them.
- **Ranking and health metadata**: fields such as `respondTime`, `weight`, and
  `customOrder` are useful for source selection and diagnostics; keep them in
  source `extra` with `legacy*` keys during import.

Compatibility import is therefore a two-layer design:

1. Normalize the common path into native capabilities (`search`, `detail`,
   `toc`, `content`, `list`, `review`).
2. Preserve unsupported behavior explicitly in `auth`, `compatibility`, and
   `extra`, so future plugin/source tooling can upgrade it without losing user
   data.

## App Integration Status

Implemented storage/API surfaces:

- SQLite table: `yeader_sources`
- Rust repository: `YeaderSourceRepo`
- Tauri commands:
  - `list_yeader_sources`
  - `import_yeader_source_pack_json`
- Frontend API:
  - `listYeaderSources()`
  - `importYeaderSourcePackJson(json)`

The next implementation step is the executor: search, detail, TOC, content,
feed, and asset commands should read `YeaderSource` capabilities instead of
`LegacyBookSource` rules.

## Source Builder Userscript

The companion userscript lives at:

- `userscripts/yeader-source-builder.user.js`

Install it in Tampermonkey, open a target novel/RSS/comic page, then use the
floating panel to pick page elements. The script generates a
`yeader.source-pack` draft with CSS selectors. It is intentionally a drafting
tool: generated selectors should still be reviewed, especially on sites with
generated class names or pagination-specific URLs.
