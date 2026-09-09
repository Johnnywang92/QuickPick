# ==============================================================================
# QuickPick Studio NAS Daemon - Multi-Stage Dockerfile for Synology / QNAP / Unraid
# Supports linux/amd64 and linux/arm64
# ==============================================================================

# --- Stage 1: Build Binary ---
FROM rust:1-bookworm AS builder

# 安装构建依赖与 LibRaw 开发库
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libraw-dev \
    clang \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制工程源码
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock* ./
COPY src-tauri/src ./src
COPY src-tauri/build.rs ./build.rs

# 编译无头二进制 quickpick-server
RUN cargo build --release --features server-bin --bin quickpick-server

# --- Stage 2: Minimal Runtime ---
FROM debian:bookworm-slim AS runtime

# 安装 LibRaw 动态运行时、证书与权限降权工具 gosu
RUN apt-get update && apt-get install -y --no-install-recommends \
    libraw20 \
    ca-certificates \
    tini \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# 创建基础运行用户
RUN groupadd -g 1000 quickpick && \
    useradd -u 1000 -g quickpick -s /bin/sh -m quickpick

# 从构建层拷贝二进制
COPY --from=builder /app/target/release/quickpick-server /usr/local/bin/quickpick-server
RUN chmod +x /usr/local/bin/quickpick-server

# 拷贝启动入口脚本（支持 Synology/QNAP/Unraid PUID/PGID 动态降权）
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /photos

ENV WATCH_DIRS=/photos \
    QUICKPICK_CACHE_DIR=/cache \
    SCAN_INTERVAL=30 \
    PROXY_MAX_EDGE=2048

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
