# Mux library refresh and webhooks

`POST /api/webhooks/mux` verifies Mux's `mux-signature` HMAC for Mux asset/upload events. A valid event marks the catalog stale, then rebuilds its snapshot and browse index in the background. The response returns immediately, and duplicate delivery is safe.

## Production setup

1. Create a Mux webhook for `https://trantergrey.com/api/webhooks/mux`.
2. Save the signing secret returned by Mux as `MUX_WEBHOOK_SIGNING_SECRET` in the Pages project's production and preview environment variables. Mux only returns that secret once.

No timer runs while the catalog is idle. Asset changes and the site's own Mux/project/collection mutations invalidate or rebuild the relevant catalog cache.
