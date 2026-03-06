# ybank.me-wallet-solana TODO

## Tunnel

- [ ] **Migrate to token-based tunnel auth** — current `tunnel.sh` uses the old
  `cloudflared tunnel create` approach: credentials JSON on disk + `tunnel:` and
  `credentials-file:` in the config.

  The newer approach uses a dashboard-generated token that encodes tunnel UUID +
  credentials in a single string, so the config file only needs the `ingress:` block
  and can be committed to git with no secrets.

  Steps:
  1. In the Cloudflare dashboard → Zero Trust → Networks → Tunnels → select the tunnel → configure → copy the token
  2. `echo "TOKEN" > .tunnel-token` (add `.tunnel-token` to `.gitignore`)
  3. Replace `tunnel-config.yml` content with just the ingress (no `tunnel:` or `credentials-file:`)
  4. Update `tunnel.sh` to: `cloudflared tunnel --config tunnel-config.yml run --token "$(cat .tunnel-token)"`
  5. Commit `tunnel-config.yml`; the old credentials JSON in `~/.cloudflared/` and
     the `if [ ! -f "$CONFIG_FILE" ]` creation block in `tunnel.sh` can be removed

  Reference: see `digitaltwin-app/tunnel-deploy.sh` + `tunnel-config.yml` for the working pattern.
