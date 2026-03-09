#!/usr/bin/env bash
# Starts the x9-api-materalabs Cloudflare Tunnel → localhost:5010.
# Usage: ./tunnel.sh
# Prerequisite: QR app server must already be running on port 5010.
#
# Token read from .tunnel-token (gitignored).
# Regenerate with: cloudflared tunnel token 6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/tunnel-config.yml"
TOKEN_FILE="$SCRIPT_DIR/.tunnel-token"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: $TOKEN_FILE not found."
  echo "  Regenerate with:"
  echo "  cloudflared tunnel token 6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04 > .tunnel-token"
  exit 1
fi

echo "Starting x9-api-materalabs tunnel → localhost:5010 ..."
cloudflared tunnel --config "$CONFIG_FILE" run --token "$(cat "$TOKEN_FILE")"
