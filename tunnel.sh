#!/bin/bash
# tunnel.sh — Start the cloudflared tunnel for the QR API server
# Requires: cloudflared installed, tunnel credentials in ~/.cloudflared/

TUNNEL_ID="2b0989c9-0117-4240-93ae-c4d2232bfcf1"

cloudflared tunnel \
  --credentials-file "$HOME/.cloudflared/${TUNNEL_ID}.json" \
  --url http://localhost:5010 \
  run x9-api-materalabs
