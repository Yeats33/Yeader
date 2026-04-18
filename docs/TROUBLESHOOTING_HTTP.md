# HTTP 客户端 "builder error" 问题解决方案

## 问题现象

错误信息：`获取目录失败：HTTP request failed: Request failed: builder error`

## 根本原因

这个错误表明应用正在使用**旧版本的二进制文件**，该版本中 HTTP 客户端缺少 TLS 支持。

## 已完成的修复

✅ 添加 rustls-tls 支持到 reqwest
✅ 改进错误处理
✅ 所有测试通过
✅ HTTP 客户端可以正常构建和运行

## 解决步骤

### 方案 1：重新构建应用（推荐）

```bash
# 1. 清理旧的构建产物
cargo clean

# 2. 重新构建并运行
npm run tauri dev
```

### 方案 2：使用最新的 release 版本

```bash
# 1. 清理并构建 release 版本
cargo clean
npm run tauri build

# 2. 安装新版本
open target/release/bundle/dmg/Yeader_0.1.0_aarch64.dmg
```

### 方案 3：直接运行 release 二进制

```bash
# 确保使用最新构建的二进制
./target/release/yeader
```

## 验证修复

运行诊断脚本：

```bash
./scripts/diagnose_http.sh
```

应该看到：
- ✓ HTTP client built successfully
- ✓ All tests pass
- ✓ Binary exists and is recent

## 如果问题仍然存在

1. **检查是否有多个实例在运行**
   ```bash
   pkill -f yeader
   pkill -f "tauri dev"
   ```

2. **完全清理并重建**
   ```bash
   cargo clean
   rm -rf target/
   npm run tauri build
   ```

3. **检查二进制文件时间戳**
   ```bash
   ls -lh target/release/yeader
   ls -lh target/debug/yeader
   ```
   
   确保时间戳是最近的（在修复之后）。

4. **查看详细错误信息**
   
   如果错误信息不再是 "builder error" 而是其他错误（如网络错误、URL 错误等），说明 HTTP 客户端已经修复，问题出在其他地方。

## 测试 HTTP 客户端

单独测试 HTTP 客户端：

```bash
cargo run -p yeader-net --example test_client
```

应该输出：`✓ HTTP client built successfully`

## 技术细节

### 修复前
```toml
reqwest = { version = "0.12", features = ["cookies", "gzip", "json"] }
```

### 修复后
```toml
reqwest = { 
    version = "0.12", 
    features = ["cookies", "gzip", "json", "rustls-tls"], 
    default-features = false 
}
```

### 错误处理改进

```rust
// 修复前：panic
let client = HttpClient::new();

// 修复后：返回 Result
let client = HttpClient::new()
    .map_err(|e| format!("HTTP client error: {}", e))?;
```

## 预期行为

修复后，如果获取目录失败，错误信息应该更具体：
- ❌ `builder error` （旧版本）
- ✅ `HTTP client error: ...` （新版本，如果构建失败）
- ✅ `Request failed: timeout` （网络超时）
- ✅ `HTTP error 404: Not Found` （URL 错误）
- ✅ `Failed to parse ...` （解析错误）

## 最后更新

- 日期：2026-04-18
- 版本：0.1.0
- 状态：已修复并测试通过
