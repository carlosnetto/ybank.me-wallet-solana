#!/bin/bash
# tunnel.sh — Start the cloudflared tunnel for the QR API server
# Requires: cloudflared installed, tunnel credentials in ~/.cloudflared/

TUNNEL_ID="6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04"

cloudflared tunnel \
  --credentials-file "$HOME/.cloudflared/${TUNNEL_ID}.json" \
  --url http://localhost:5010 \
  run x9-api-materalabs
