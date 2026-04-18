# HTTP 客户端修复说明

## 问题描述

错误信息：`获取目录失败：HTTP request failed: Request failed: builder error`

## 根本原因

`reqwest::Client::builder().build()` 失败，因为缺少 TLS 支持。默认情况下，reqwest 需要 TLS backend 才能进行 HTTPS 请求。

## 修复内容

### 1. 添加 TLS 支持

**文件：** `crates/yeader-net/Cargo.toml`

```toml
reqwest = { 
    version = "0.12", 
    features = ["cookies", "gzip", "json", "rustls-tls"], 
    default-features = false 
}
```

- 添加 `rustls-tls` feature 提供 TLS 支持
- 禁用 `default-features` 避免与系统 TLS 冲突

### 2. 改进错误处理

**文件：** `crates/yeader-net/src/client.rs`

- `HttpClient::new()` 现在返回 `Result<Self>` 而不是直接 panic
- 添加 `HttpError::ClientBuild` 错误类型
- 提供 `new_or_default()` 作为后备方案

### 3. 增强客户端配置

```rust
Client::builder()
    .cookie_store(true)
    .gzip(true)
    .user_agent("Mozilla/5.0 ...")  // 模拟浏览器
    .timeout(Duration::from_secs(30))  // 30秒超时
    .build()
```

### 4. 更新所有调用点

- `src-tauri/src/commands/reader.rs`
- `src-tauri/src/commands/search.rs`
- `src-tauri/src/commands/library.rs`

所有 `HttpClient::new()` 调用现在都正确处理错误：

```rust
let client = HttpClient::new()
    .map_err(|e| format!("HTTP client error: {}", e))?;
```

## 测试验证

创建了两个测试文件：

1. **client_test.rs** - 验证客户端构建
2. **integration_test.rs** - 验证 HTTP 请求功能

运行测试：
```bash
cargo test -p yeader-net
```

## 重新构建应用

```bash
# 清理旧的构建产物
cargo clean

# 开发构建
npm run tauri dev

# 生产构建
npm run tauri build
```

## 错误信息改进

- **之前：** `HTTP request failed: Request failed: builder error`
- **现在：** `HTTP client error: Failed to build HTTP client: [具体原因]`

## 注意事项

1. 如果遇到依赖编译错误，运行：
   ```bash
   cargo clean
   rm -rf ~/.cargo/registry/cache/*
   cargo update
   ```

2. 确保使用最新的 Rust 工具链：
   ```bash
   rustup update
   ```

3. macOS 用户可能需要安装 Xcode Command Line Tools：
   ```bash
   xcode-select --install
   ```
