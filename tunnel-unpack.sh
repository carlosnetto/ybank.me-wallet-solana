#!/bin/bash
# tunnel-unpack.sh — Unpack and install tunnel files on the DESTINATION machine
# Run this on the TARGET computer alongside x9-150-py-tunnel.zip

set -e

TUNNEL_ID="a04396d8-5ca2-40f8-9a67-d8206fbb74fe"
ZIP_FILE="x9-150-py-tunnel.zip"
CLOUDFLARED_DIR="$HOME/.cloudflared"
CREDS_DEST="$CLOUDFLARED_DIR/${TUNNEL_ID}.json"
CONFIG_DEST="$CLOUDFLARED_DIR/x9-150-py-config.yml"

echo "=== Unpacking tunnel files for x9-150-py ==="

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

# --- Install config file ---
# Update credentials-file path to match this machine
sed "s|credentials-file:.*|credentials-file: $CREDS_DEST|" "$TMPDIR/cloudflared-config.yml" > "$TMPDIR/cloudflared-config-fixed.yml"

if [ -f "$CONFIG_DEST" ]; then
  echo ""
  echo "WARNING: Config file already exists:"
  echo "  $CONFIG_DEST"
  read -p "Overwrite? (y/N): " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Skipping config file."
  else
    cp "$TMPDIR/cloudflared-config-fixed.yml" "$CONFIG_DEST"
    echo "Config file installed."
  fi
else
  cp "$TMPDIR/cloudflared-config-fixed.yml" "$CONFIG_DEST"
  echo "Config file installed: $CONFIG_DEST"
fi

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "=== Done ==="
echo ""
echo "To start the tunnel:"
echo "  cloudflared tunnel --config $CONFIG_DEST run x9-150-py"
echo ""
echo "Make sure qr_appserver.py is running on localhost:5010"
