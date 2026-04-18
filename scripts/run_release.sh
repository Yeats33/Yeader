#!/bin/bash

# Yeader 启动脚本
# 使用最新构建的 release 二进制

cd "$(dirname "$0")/.."

echo "=== Yeader 启动 ==="
echo ""

# 检查二进制文件
if [ ! -f "target/release/yeader" ]; then
    echo "错误：找不到 release 二进制文件"
    echo "请先运行：cargo build --release --bin yeader"
    exit 1
fi

# 显示二进制信息
echo "二进制文件："
ls -lh target/release/yeader
echo ""

# 启动应用
echo "启动 Yeader..."
echo ""
./target/release/yeader
