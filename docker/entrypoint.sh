#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Update or create quickpick group matching PGID
if getent group quickpick >/dev/null 2>&1; then
    groupmod -o -g "$PGID" quickpick >/dev/null 2>&1 || true
else
    groupadd -o -g "$PGID" quickpick >/dev/null 2>&1 || true
fi

# Update or create quickpick user matching PUID & PGID
if getent passwd quickpick >/dev/null 2>&1; then
    usermod -o -u "$PUID" -g "$PGID" quickpick >/dev/null 2>&1 || true
else
    useradd -o -u "$PUID" -g "$PGID" -s /bin/sh -m quickpick >/dev/null 2>&1 || true
fi

# 仅调整独立缓存卷权限；照片源卷保持只读且绝不 chown。
mkdir -p "${QUICKPICK_CACHE_DIR:-/cache}"
chown "$PUID:$PGID" "${QUICKPICK_CACHE_DIR:-/cache}"

exec /usr/bin/tini -- gosu quickpick quickpick-server "$@"
