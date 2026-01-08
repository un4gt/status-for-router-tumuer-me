#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "[build.sh] bun not found, installing..."
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo "[build.sh] bun version: $(bun --version)"
echo "[build.sh] installing deps..."
bun install --frozen-lockfile

echo "[build.sh] building web..."
bun run build:web

echo "[build.sh] done. output: apps/web/dist"

