# Mux library refresh and webhooks

`POST /api/webhooks/mux` verifies Mux's `mux-signature` HMAC for Mux asset/upload events. A valid event marks the catalog stale, then rebuilds its snapshot and browse index in the background. The response returns immediately, and duplicate delivery is safe.

## Production setup

1. Create a Mux webhook for `https://trantergrey.com/api/webhooks/mux`.
2. Save the signing secret returned by Mux as `MUX_WEBHOOK_SIGNING_SECRET` in the Pages project's production and preview environment variables. Mux only returns that secret once.

No timer runs while the catalog is idle. Asset changes and the site's own Mux/project/collection mutations invalidate or rebuild the relevant catalog cache.

## MCP event delivery

The production Library webhook also records new ready assets and delivers
`mux.asset.ready` to opted-in Dot subscriptions. See [event operations](mcp-events.md).
Only transport retries use the Worker minute trigger; there is no scheduled
catalog/card check or 24-hour notification rule. Apply the separate MCP_AUTH
events schema and deploy both Pages and the MCP Worker for this capability.
