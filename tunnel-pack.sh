#!/bin/bash
# tunnel-pack.sh — Package tunnel files for transfer to another computer
# Run this on the SOURCE machine (your laptop)

set -e

TUNNEL_ID="2b0989c9-0117-4240-93ae-c4d2232bfcf1"
TUNNEL_NAME="x9-api-materalabs"
CREDS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
OUTPUT="x9-api-materalabs-tunnel.zip"

echo "=== Packing tunnel files for $TUNNEL_NAME ==="

# Verify credentials file exists
if [ ! -f "$CREDS_FILE" ]; then
  echo "ERROR: $CREDS_FILE not found"
  exit 1
fi

# Create a temp directory with the files
TMPDIR=$(mktemp -d)
cp "$CREDS_FILE" "$TMPDIR/"

# Create zip
cd "$TMPDIR"
zip "$OLDPWD/$OUTPUT" "${TUNNEL_ID}.json"
cd "$OLDPWD"
rm -rf "$TMPDIR"

echo ""
echo "Created: $OUTPUT"
echo "Transfer this file to the other computer and run tunnel-unpack.sh"
