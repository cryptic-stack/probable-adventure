#!/usr/bin/env bash
set -euo pipefail

git config core.hooksPath .githooks
echo "Configured git hooks path to .githooks"
echo "Pre-commit leak scan is now enabled."
