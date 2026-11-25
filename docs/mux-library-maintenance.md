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

## Upload progress and playback readiness

Direct uploads distinguish browser transfer (bytes uploaded) from confirmed Mux
receipt and playback readiness. `GET /api/admin/mux-uploads?uploadId=...` retains
`assetId`, `ready`, `status`, and adds optional `processing: { state, percent }`.
Only Mux's `transcoding` percentage is displayed; ingestion has no meaningful
percentage and uses an indeterminate indicator. A received file can have details,
collections and ratio groups saved while encoding continues. No encoding quality,
playback policy, download policy or automatic association is changed.

Processing checks no longer fail after five minutes (or 90 seconds for management
page replacements). Network/5xx failures retry; explicit processing failure and
expired authentication remain distinct. Upstream status failures return sanitized
502 responses. `?assetId=...` is an authenticated read used by the management page
to wait for readiness. It never changes visibility. Public watch responses include
variant status/progress and are not cached while preparing. Players wait for ready;
watch pages and collection previews refresh pending variants automatically.

The library remembers received upload IDs, filenames and receipt timestamps for
up to seven days in localStorage, keyed by the verified team email. It resumes
status checks in the same browser and account, even after upload details are saved.
Dismiss only removes the status entry, not the asset. Browser storage failure is
shown explicitly. Unsaved form details and file bytes are **not** persisted:
users must save details before leaving. Transfers and unsaved details trigger a
leave-page warning. Replacements still require the tab to stay open through the
existing swap; automatic destructive swaps are never resumed on reopening.

Validation: `node scripts/test-mux-upload-progress.mjs`, the MCP integration suite,
TypeScript and the Cloudflare release check. No database migration is required.

Released November 23, 2026: production Pages `800f8041` and MCP Worker
`b0cb42fb-82e0-49a4-98ae-972e070d1e68`. Ten focused upload tests and all 49
API/MCP tests passed, along with TypeScript, static release checks and Worker dry
run. An isolated browser fixture verified receipt confirmation, percentage and
indeterminate states, reload recovery, temporary outages and automatic readiness.
Live library bundle hashes matched the isolated build; anonymous progress reads
were denied. Read-only production MCP/OAuth renewal and revocation checks passed.
No live business mutations or full-length production upload were used for testing.

## New direct uploads: up to 4K

New destinations created by `/api/admin/mux-uploads` explicitly request
`max_resolution_tier: "2160p"`, retaining Plus quality and the existing public
playback policy. This includes new files uploaded through the replacement flow;
no existing asset is upgraded or replaced automatically. Lower-resolution sources
retain their available resolution. Archive imports use a separate path and retain
their existing settings. No migration is needed. This enables organic timing tests;
it does not guarantee faster processing for every source format.

## Snapshot retention and safe replacement

Migration 0058 registers catalog generations, including existing snapshots. After
a successful refresh, bounded cleanup removes expired inactive snapshot, browse
and FTS rows (at least 2,000 and at most 10,000 per table per refresh). The daily
MCP maintenance job also removes up to 10,000 per table, including abandoned builds.
Active generations are excluded at deletion time, and generations younger than
24 hours remain available to in-flight readers. Existing generations receive their
24-hour grace period when migration 0058 runs; a large historical backlog drains
over successive cleanup runs rather than one unbounded production deletion.

The stale timestamp now correctly invalidates an otherwise indefinitely cached
snapshot. Refresh failures do not delete the previously active generation.

Replacement commits share-page changes, metadata, Deck associations and its retry
ledger in one D1 transaction. It no longer automatically deletes the old Mux asset.
The original remains playable under its existing playback policy and continues to
incur Mux storage charges until explicitly deleted. Old hardcoded comment embeds
are intentionally retained; share-page URLs point to the revision.

Local development uses Wrangler's persisted local D1/R2 state. External Mux/Google
requests still use the credentials configured locally, so fixture-based tests must
mock those providers. Preview bindings have not been changed.

Released November 25, 2026: production Pages `e7d9b436-32fb-4448-9270-7bbb27b8e200`
and MCP Worker `915ebe7b-9418-4451-a7cd-77cb9e226651`. Migration 0058 is applied
and recorded in local and production TG_DATA. Seven media-safety tests (including
actual Workers/R2 streaming), 53 MCP tests, gallery/security/media/client regression
suites, TypeScript, Pages release checks and Worker dry run passed. Live production
OAuth renewal/rotation/revocation and 28-tool discovery/read checks passed without
business-record mutations. No preview configuration changed.
