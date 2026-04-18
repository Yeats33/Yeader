#!/bin/bash

echo "=== Yeader HTTP Client Diagnostic ==="
echo ""

echo "1. Checking Rust version..."
rustc --version
echo ""

echo "2. Checking cargo version..."
cargo --version
echo ""

echo "3. Testing HTTP client build..."
cargo run -p yeader-net --example test_client
echo ""

echo "4. Running HTTP client tests..."
cargo test -p yeader-net --quiet
echo ""

echo "5. Checking Tauri binary..."
if [ -f "target/debug/yeader" ]; then
    echo "✓ Debug binary exists"
    ls -lh target/debug/yeader
else
    echo "✗ Debug binary not found"
fi
echo ""

if [ -f "target/release/yeader" ]; then
    echo "✓ Release binary exists"
    ls -lh target/release/yeader
else
    echo "✗ Release binary not found"
fi
echo ""

echo "6. Checking reqwest features..."
cargo tree -p reqwest --features | grep -E "(rustls|native-tls)" | head -5
echo ""

echo "=== Diagnostic Complete ==="
echo ""
echo "If all tests pass but the app still shows 'builder error':"
echo "1. Run: cargo clean"
echo "2. Run: npm run tauri dev"
echo "3. Or run: npm run tauri build"
