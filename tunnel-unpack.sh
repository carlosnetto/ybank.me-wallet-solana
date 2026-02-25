#!/bin/bash
# tunnel-unpack.sh — Unpack and install tunnel files on the DESTINATION machine
# Run this on the TARGET computer alongside x9-api-materalabs-tunnel.zip

set -e

TUNNEL_ID="6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04"
TUNNEL_NAME="x9-api-materalabs"
ZIP_FILE="x9-api-materalabs-tunnel.zip"
CLOUDFLARED_DIR="$HOME/.cloudflared"
CREDS_DEST="$CLOUDFLARED_DIR/${TUNNEL_ID}.json"

echo "=== Unpacking tunnel files for $TUNNEL_NAME ==="

# Check zip exists
if [ ! -f "$ZIP_FILE" ]; then
  echo "ERROR: $ZIP_FILE not found in current directory"
  exit 1
fi

# Check cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
  echo "ERROR: cloudflared is not installed"
  echo "Install with: brew install cloudflared (macOS) or see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

# Create .cloudflared directory if needed
mkdir -p "$CLOUDFLARED_DIR"

# Extract to temp directory first
TMPDIR=$(mktemp -d)
unzip -o "$ZIP_FILE" -d "$TMPDIR"

# --- Install credentials file ---
if [ -f "$CREDS_DEST" ]; then
  echo ""
  echo "WARNING: Credentials file already exists:"
  echo "  $CREDS_DEST"
  read -p "Overwrite? (y/N): " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Skipping credentials file."
  else
    cp "$TMPDIR/${TUNNEL_ID}.json" "$CREDS_DEST"
    echo "Credentials file installed."
  fi
else
  cp "$TMPDIR/${TUNNEL_ID}.json" "$CREDS_DEST"
  echo "Credentials file installed: $CREDS_DEST"
fi

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "=== Done ==="
echo ""
echo "To start the tunnel:"
echo "  cloudflared tunnel --url http://localhost:5010 run $TUNNEL_NAME"
echo ""
echo "Make sure qr_appserver.py is running on localhost:5010"
