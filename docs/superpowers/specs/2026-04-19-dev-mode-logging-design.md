# Dev Mode + Logging Design

## Overview

Add persistent JSON Lines logging to the Rust backend and a dev mode panel in the Settings UI. The dev mode UI only appears when running via `npm run tauri dev`.

## Log Format

JSON Lines file, one JSON object per line:

```json
{"timestamp":"2026-04-19T10:30:00.123Z","level":"INFO","module":"yeader_lib::run","message":"Yeader initialized successfully"}
```

Fields:
- `timestamp`: ISO 8601 with timezone
- `level`: trace | debug | info | warn | error
- `module`: Rust module path
- `message`: log content

## Log File Management

- **Path**: `{app_data_dir}/logs/YYYY-MM-DD.log`
- **Rotation**: daily file, no history cleanup
- **dev mode**: log level = debug, also writes to stderr
- **release mode**: log level = info, file only

## Dev Mode Detection

```rust
const IS_DEV_MODE: bool = cfg!(debug_assertions);
```

- `npm run tauri dev` → debug build → dev mode available
- `npm run tauri build` → release build → dev mode unavailable

## Tauri Commands

| Command | Args | Returns |
|---------|------|---------|
| `get_dev_mode_status` | none | `{ enabled: bool, available: bool }` |
| `toggle_dev_mode` | `enabled: bool` | `bool` (new state) |
| `get_log_lines` | `limit: Option<usize>` (default 200) | `Vec<LogLine>` |
| `open_log_file` | none | `()` |

## Frontend (Settings.ts)

Only renders dev mode panel when `get_dev_mode_status().available === true`:

- Toggle switch for `toggle_dev_mode`
- "View Logs" button → expands inline log viewer (last 200 lines)
- "Open Log File" button → calls `open_log_file`

## Components

| File | Purpose |
|------|---------|
| `src-tauri/src/logging.rs` | tracing subscriber, JSON Lines file appender |
| `src-tauri/src/commands/dev.rs` | dev mode commands |
| `src-tauri/src/commands/mod.rs` | add `dev` module |
| `src-tauri/src/lib.rs` | init logging, register commands |
| `src/pages/Settings.ts` | add dev mode UI |
| `yeader-models/src/lib.rs` | add `LogLine` type |

## Dependencies

- `tracing-subscriber` (replaces `env_logger`)
- `tracing-appender` (non-blocking file writer)

## Implementation Steps

1. Add `tracing-subscriber` + `tracing-appender` to `Cargo.toml`
2. Create `src-tauri/src/logging.rs`
3. Create `src-tauri/src/commands/dev.rs`
4. Update `src-tauri/src/commands/mod.rs`
5. Update `src-tauri/src/lib.rs`
6. Add `LogLine` to `yeader-models`
7. Update `Settings.ts` with dev mode panel
