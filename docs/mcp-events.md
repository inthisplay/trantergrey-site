# Mux → MCP Events → Dot

One event is available: `mux.asset.ready`, emitted from a verified Mux
`video.asset.ready` webhook. It means a new asset is ready for playback, not that
it has a client, matches a card, or needs a notification. Dot retrieves current
data and applies the user's instructions. There is no fixed grace period,
matching logic, notification recipient, or card-monitoring timer on the server.

## Connect

Rescan the TranterGrey plugin/server so events appear alongside its 26 tools.
Then ask Dot to subscribe to `mux.asset.ready` and describe the desired behavior.
Installing/rescanning alone does not subscribe. For example: “Subscribe to new
Mux assets. Confirm the subscription, and let me decide the follow-up rules.”
Dot calls `events/subscribe` with its callback URL/signing secret. Never paste
those secrets into chat. A successful server response proves registration, not
that a particular future event was processed by Dot. Check a real new upload
in Dot after subscription. The existing OAuth `tg:personal` scope suffices.

## Wire contract

The existing authenticated Streamable HTTP `/mcp` endpoint advertises
`capabilities.events: {}`. Methods:

- `events/list`: returns one event with `delivery: ["webhook"]`, an empty-object
  `inputSchema` (no filters), and a payload schema containing `assetId`.
- `events/subscribe`: `name: "mux.asset.ready"`, `arguments: {}`, and
  `delivery: {mode: "webhook", url, secret}`. Optional `ttlMs`; `cursor` must be
  omitted or null. Returns `id`, `refreshBefore`, `cursor: null`, `truncated: false`.
- `events/unsubscribe`: same name, arguments and delivery URL (no secret needed).
  Returns `{}` and is idempotent. Another OAuth connection cannot unsubscribe it.

Each event body contains `eventId`, `name`, the Mux event occurrence `timestamp`,
`data: {assetId}`, and `cursor: null`. Payloads contain no titles, signed media
URLs, client records, comments or instructions. Dot can call `get_video`,
`search_deck_cards`, and `get_deck_card_comments` to investigate.

## Security and lifecycle

Subscriptions bind to the exact OAuth session family, not just the owner actor.
Access-token renewal preserves that family; connection revocation, invitation
revocation or expired authorization stops delivery. Persistent OAuth is unchanged.
Each connection may hold ten subscriptions; creation/refresh has a 20/minute
limit in addition to existing request limits.

Only the exact trusted origins `https://chatgpt.com` and
`https://connectors.api.openai.com` are accepted for callbacks.
Arbitrary DNS hosts, subdomains/lookalikes, IP literals, credentials, nonstandard
ports, URL fragments and redirects are rejected. This deliberate ChatGPT-only
allowlist avoids user-controlled DNS/rebinding targets; it is not a general
webhook sender. A different callback host fails closed and requires explicit
review of the platform's actual destination before an allowlist change.

Before activation, send a random, signed verification challenge and require its
exact echo. Timeout is ten seconds and verification responses are limited to
4 KiB. Cache verification for five minutes for the same session/URL/key. Keys
are `whsec_` plus base64 for 24–64 bytes. Delivery uses Standard Webhooks headers
and HMAC-SHA256 over `id.timestamp.exactBody`, with a fresh signature per retry.
Key rotation verifies the new key and signs with both keys for five minutes.
Signing keys/URLs are stored only in MCP_AUTH, never returned, logged or bundled.

Default lifetime is seven days, renewable by ChatGPT; requested lifetimes are
clamped to one minute–30 days. `ttlMs: null` receives a finite 30-day grant,
not infinite retention. Follow the returned refreshBefore. Expired subscriptions
stop delivery and are removed, including pending deliveries. This version has
no replay cursor or backfill: assets before subscription or during an expired
subscription must be checked separately using the read tools.

## Delivery and persistence

Apply `workers/deck-mcp/events-schema.sql` to **MCP_AUTH only** before deploying
Pages or the MCP Worker. It adds subscriptions, an asset deduplication ledger,
and delivery outbox; no TG_DATA migration.

The Pages `/api/webhooks/mux` handler verifies Mux's HMAC and five-minute timestamp
tolerance, limits input to 1 MiB, and atomically inserts the ready event plus
fan-out before acknowledgment. Storage failures return 503 so Mux can retry.
Each asset has one durable ready event even if Mux repeats it with a new webhook
ID. Only subscribers active when first received are included. The small ledger
of asset IDs/timestamps is retained for deduplication; terminal delivery records
are pruned after 30 days. Existing catalog invalidation/refresh remains active.

Immediate delivery runs in Pages waitUntil with a five-delivery bound. The MCP
Worker's every-minute trigger drains up to twenty due deliveries (five at a time)
and retries interrupted work. This timer transports events only; it does not
scan assets/comments or decide when Dot should check anything. The existing
nightly OAuth/health cleanup remains separate. Atomic two-minute leases avoid
concurrent sends; an interrupted/ambiguous send can repeat, always with the same
eventId. Delivery is at least once, not exactly once.

Retry network errors, 408, 429 and 5xx with exponential backoff (30 seconds up
to one hour), at most ten attempts. Other failures are terminal; 410 removes the
subscription and its pending deliveries, 413 is not retried. A 2xx acknowledges
receipt, not completion of a Dot task. Events can arrive out of order. No
historical replay or exactly-once processing is promised.

Verification/delivery/storage errors appear in owner-only Connection health.
Only operation labels, status and reference IDs are recorded; never raw callback
URLs, secrets, bodies or exception text. Already-in-flight delivery cannot be
retracted by unsubscribe/revocation.

## Operations and validation

Configure the production Mux Library environment webhook to
`https://trantergrey.com/api/webhooks/mux` and store its signing secret in Pages
as `MUX_WEBHOOK_SIGNING_SECRET`. This deployment configures production only;
preview secrets/endpoints must be configured separately, never pointed at a
production callback receiver for tests.

Run `node scripts/test-deck-mcp.mjs`, `npx tsc --noEmit`,
`npm run check:cloudflare-release`, Worker dry run, then deploy both services.
`node scripts/check-deck-mcp-live.mjs` verifies production OAuth, discovery and
read tools without creating a subscription or fake business event. Isolated
SQLite tests exercise signed verification/delivery, malformed requests,
revocation/expiry, retries, atomic fan-out, deduplication and input limits.
A final real-Dot check requires its subscription and a new matching Mux upload.

References: [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events),
[Mux webhooks](https://www.mux.com/docs/core/listen-for-webhooks).

## Release verification — November 22, 2026

Applied the event schema to production MCP_AUTH. Configured and enabled the Mux
Library webhook and saved its signing secret in production Pages settings.
Worker version `62b729a3-0a11-456f-8070-47b73a198a9b` passed live OAuth refresh,
revocation, all read-tool checks, and raw event capability/discovery checks.
All 36 isolated integration tests, TypeScript, website release checks and Worker
dry run passed. Refreshed the owner's existing TG Site – Personal plugin in
ChatGPT and visually verified `mux.asset.ready` under Events alongside 24 tools.
No Dot subscription, business-check timing, or notification rule was created.
Actual Dot callback delivery remains to be checked after the user subscribes.

### Diagnosing task-service subscription failures

The Worker emits privacy-safe `mcp_events` console diagnostics for MCP transport
arrival (allowlisted protocol method only), authentication rejection, and
subscription received/identity-validated/stored/rejected stages. Rejections log
only the numeric JSON-RPC error code. No request bodies, callback URLs, signing
keys, authorization headers or identity IDs are included. These diagnostics are
in Workers Logs, not the Connection health error totals. A generic ChatGPT task
error does not identify the failing side; correlate a controlled attempt with
these stages before changing validation or callback restrictions.


### Dot callback compatibility fix — November 22, 2026

A controlled real Dot subscription reached our handler but failed the exact-host
callback allowlist. The receiver supplied by Dot is `connectors.api.openai.com`.
Both `https://chatgpt.com` and `https://connectors.api.openai.com` are now allowed
for verification and delivery. No wildcard domains, arbitrary callback hosts,
non-HTTPS addresses, alternate ports, credentials, fragments or redirects are
allowed. Signed challenge verification remains required before saving a
subscription. Regression coverage exercises the connector hostname through
subscription, signed asset delivery and unsubscribe, plus lookalike-host rejection.
Temporary hostname logging was removed once the destination was identified.
Diagnostics retain only allowlisted field names/types, stages and numeric errors.

Callback verification failures additionally record a fixed phase (`request`,
`http_status`, `response_json`, or `challenge`), HTTP status when available, and
`timeout` or `challenge_failed`. Response bodies, headers, challenges and raw
exceptions are never logged. This distinguishes a receiver HTTP rejection from
a network failure or invalid challenge response without exposing credentials.

The subsequent verification failure exposed a Workers runtime mismatch:
`redirect: 'error'` throws before sending in Workers, despite working in Node.
Signed callback POSTs now use `redirect: 'manual'`; non-2xx responses remain
rejected and redirects are never followed. A Miniflare/workerd regression test
executes the actual shared sender and checks successful signed requests plus
unfollowed redirects, in addition to the Node integration suite.
