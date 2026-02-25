#!/bin/bash
# tunnel.sh — Start the cloudflared tunnel for the QR API server
# Requires: cloudflared installed, tunnel credentials in ~/.cloudflared/

cloudflared tunnel --url http://localhost:5010 run x9-api-materalabs
