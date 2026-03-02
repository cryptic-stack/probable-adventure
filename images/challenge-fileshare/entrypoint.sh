#!/usr/bin/env bash
set -euo pipefail

PORT="${FILE_SHARE_PORT:-8080}"
ROOT_DIR="${FILE_SHARE_ROOT:-/srv/challenge-files}"

mkdir -p "${ROOT_DIR}"

echo "Starting challenge file share on 0.0.0.0:${PORT} serving ${ROOT_DIR}"
exec python3 -m http.server "${PORT}" --bind 0.0.0.0 --directory "${ROOT_DIR}"
