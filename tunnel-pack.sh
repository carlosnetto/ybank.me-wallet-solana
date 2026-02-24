#!/bin/bash
# tunnel-pack.sh — Package tunnel files for transfer to another computer
# Run this on the SOURCE machine (your laptop)

set -e

TUNNEL_ID="a04396d8-5ca2-40f8-9a67-d8206fbb74fe"
CREDS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
CONFIG_FILE="/Users/cnetto/Git/x9.150-py/cloudflared-config.yml"
OUTPUT="x9-150-py-tunnel.zip"

echo "=== Packing tunnel files for x9-150-py ==="

# Verify files exist
for f in "$CREDS_FILE" "$CONFIG_FILE"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f not found"
    exit 1
  fi
done

# Create a temp directory with the files
TMPDIR=$(mktemp -d)
cp "$CREDS_FILE" "$TMPDIR/"
cp "$CONFIG_FILE" "$TMPDIR/"

# Create zip
cd "$TMPDIR"
zip "$OLDPWD/$OUTPUT" "${TUNNEL_ID}.json" "cloudflared-config.yml"
cd "$OLDPWD"
rm -rf "$TMPDIR"

echo ""
echo "Created: $OUTPUT"
echo "Transfer this file to the other computer and run tunnel-unpack.sh"
