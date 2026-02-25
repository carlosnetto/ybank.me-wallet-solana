#!/bin/bash
# tunnel.sh — Start the cloudflared tunnel for the QR API server
# Requires: cloudflared installed, tunnel credentials in ~/.cloudflared/
# Uses --config to avoid conflicts with other tunnels' config.yml

TUNNEL_ID="6eb8781a-6b88-4fc9-aa8b-195f4e9e2d04"
CONFIG_FILE="$HOME/.cloudflared/x9-api-materalabs.yml"

# Create config file if it doesn't exist
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: x9-api.materalabs.us
    service: http://localhost:5010
  - service: http_status:404
EOF
  echo "Created config: $CONFIG_FILE"
fi

cloudflared tunnel --config "$CONFIG_FILE" run
