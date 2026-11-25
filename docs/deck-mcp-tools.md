# TranterGrey personal MCP — 26 tools

This is the implemented tool inventory, not a platform tool-count limit. It exposes the existing scoped API plus focused commands for client items and calendar reporting. Admin-only destructive video operations, uploads, and identity administration are not exposed.

## Deck — 10 tools

| Tool | What it does |
| --- | --- |
| `list_deck_columns` | Lists active column names and IDs. |
| `create_deck_card` | Creates a card with client, column and plain-text notes; durable requestId prevents retry duplicates. |
| `search_deck_cards` | Searches by title/client, column or modified-after timestamp; paginated; excludes deleted cards. |
| `get_deck_card` | Reads notes, assignees, due date, current column and video links. |
| `get_deck_card_activity` | Reads edits, link events, imported events and comment metadata. |
| `get_deck_card_comments` | Reads paginated local/imported comment text and exact video references; flags unresolved playback IDs and incomplete extraction. |
| `move_deck_card` | Moves a card to a column, optionally before another card. |
| `add_deck_comment` | Adds a comment with a required UUID requestId; identical retries return the original comment. |
| `link_video_to_card` | Links an existing asset after a requested/verified match; duplicate links are prevented. |
| `report_deck_moves` | Counts recorded transitions into a column within a calendar date range, with move count and unique-card count. |

Reporting defaults to this calendar month in America/New_York. Explicit ranges are start-inclusive/end-exclusive local dates; IANA time zones are supported. Current column is not used to infer historical movement. Reorders and initial creation are excluded; cards later deleted remain in historical counts. Coverage is limited to local edit records with structured before/after column IDs. Imported history may not record comparable transitions. Earliest local edit and malformed-record count accompany the answer. Titles shown are current titles. Detail pagination does not affect totals.

Example: “How many Deck cards moved to Done this month?” Resolve Done with `list_deck_columns`, then call `report_deck_moves`; report uniqueCardCount, with moveCount if different and the coverage caveat.

## Videos — 5 tools

| Tool | What it does |
| --- | --- |
| `search_videos` | Filters title/tags/client, status, upload date and whether linked; paginated, newest upload first. |
| `get_video` | Reads full asset metadata, project, uploader provenance and associations. |
| `list_video_cards` | Lists linked non-deleted cards. |
| `get_video_workspace` | Reads collections, projects, variants and ungrouped assets. |
| `get_video_share_link` | Produces branded/unbranded watch URLs only for already-public playback. |

“Latest” means Mux creation/upload time, not historical production date or approval. The tool never enables public playback. Client abbreviations such as VGA must be resolved from actual results rather than invented aliases. Mux credentials stay only in Worker secrets. Search uses the shared catalog cache; public-link checks fetch the asset from Mux.

## Client HQ — 11 tools

| Tool | What it does |
| --- | --- |
| `list_clients` | Lists clients, IDs, archived status and open to-do counts. |
| `get_client_workspace` | Reads to-dos, notes, update timestamps, valid assignees and folder references. |
| `get_client_related` | Lists associated cards/videos with offset pagination. |
| `create_client` | Creates a Client HQ workspace. |
| `set_client_archived` | Archives or restores a client. |
| `create_client_item` | Creates a to-do or plain-text note with optional assignee/due date; durable requestId. |
| `update_client_item` | Changes only specified fields, retaining others; explicit body replacement becomes plain text. |
| `set_client_todo_completed` | Completes/reopens a to-do without losing its other fields. |
| `preview_client_deletion` | Read the exact workspace deletion counts, linked Mux/card counts, name and expectedVersion before confirmation. |

Item updates/deletes require the exact `expectedUpdatedAt` from a fresh workspace read. A concurrent modification rejects the operation. Item creation and its retry ledger/audit commit atomically. A retry after deletion cannot recreate the item. Empty dueOn/assignee explicitly clears those fields. Dates are validated as real calendar dates; assignments use existing team nicknames.

## Authorization and deployment

The base OAuth scope is `tg:personal`; the two notification tools additionally require `notifications:send`. Old `deck:create` tokens, codes and pending consent transactions cannot gain expanded access. Reconnect after refreshing tool metadata; recreate the custom connection if it retains old scopes. Server instructions and the consent page describe the expanded capabilities. Read/write/destructive/idempotent hints are present on every tool.

The owner can issue teammate invitations from Admin Access. There is no trial deadline; one-hour access tokens renew through persistent, rotating refresh tokens. Reconnect once when upgrading from the old access-token-only connection. There are no per-client restrictions or verified Google/ChatGPT identities; each invitation grants the original 24 tools with its own attribution and revocation.

Read handlers and established card commands are reused in-process under a scoped integration actor. `withApiActor` binds identity to one exact Request in a WeakMap, clears it in finally, and is never populated from incoming HTTP data. No admin cookie or broad API token is synthesized. External REST callers still pass the normal authentication checks. API errors at 5xx are redacted at the MCP boundary.

Apply `migrations/0053_mcp_item_requests.sql` to TG_DATA before this Worker version. The existing card ledger migration 0052 and separate MCP_AUTH OAuth schema remain prerequisites. Add MUX_TOKEN_ID and MUX_TOKEN_SECRET as Worker secrets. Deploy the standalone Worker for tool changes. Invitation management also requires deploying Pages with its MCP_AUTH binding; changing bundled internal handlers does not deploy the main website.

## Not included yet

- Editing card titles/assignees/due dates, archiving/deleting cards, attachments and card checklist steps.
- Uploading/editing/deleting videos or enabling public playback.
- External calendar event creation, calendar synchronization, or general business analytics beyond recorded card moves.
- Server-owned matching rules, delayed verification requests and background card checks. Dot can subscribe to new-asset events and send user-directed notifications using the tools below.
- Per-user Google sign-in and team permissions.

## Verification

`node scripts/test-deck-mcp.mjs`, `npx tsc --noEmit`, `npm run check:cloudflare-release`, and Worker dry-run build. Tests exercise the real MCP SDK against isolated SQLite; no production writes are needed to validate mutation behavior. Production smoke checks should authenticate and use read-only tools.

## Deployment record — November 21, 2026

Worker version `ad2d6e57-0223-4137-95dc-03125286fcb3` deployed to the existing trial endpoint. Migration 0053 applied to the site D1 database; Mux credentials configured as Worker secrets. Thirteen automated tests passed, TypeScript passed, Cloudflare website release checks passed, and authenticated production smoke passed for all 13 read tools. Business mutations were tested only against isolated fixtures; the live smoke did not create cards/comments/items or modify video associations. The main Pages website was not deployed.


## Persistent authentication — v0.3

The November 28 deadline is removed from code and Worker configuration. The existing owner code remains the initial sign-in mechanism. `authorization_code` and `refresh_token` grants are advertised; successful code exchange issues both tokens. OAuth clients and connection grants persist until revoked. Access tokens remain valid for one hour; refresh tokens do not have a calendar or inactivity expiry.

Refresh tokens are stored only as SHA-256 digests, bound to one OAuth client, resource, scope and connection family, and rotated atomically. A used refresh token cannot mint another token; reuse revokes the connection family. Storage failure rolls back the rotation so the original refresh token remains usable. Access checks verify both expiry and the active connection family, so revocation takes effect immediately. Old access tokens without refresh support retain only their original short lifetime; they cannot be upgraded without a fresh consent flow.

The `/revoke` endpoint accepts a form POST with `token` and `client_id`. Either a current access token or a refresh token revokes the whole connection. Unknown tokens receive a success response without revealing state. The daily cleanup deletes expired records and orphaned refresh/access records belonging to revoked families.

Owner emergency revocation (does not delete cards or other business records):

```sh
npx wrangler d1 execute MCP_AUTH --remote --config workers/deck-mcp/wrangler.jsonc --command "DELETE FROM oauth_records WHERE kind IN ('session','token','code','pending')"
```

To stop new connections too, remove/rotate the owner invitation secret `TEST_ACCESS_CODE`. Rotating it alone does not revoke existing grants. Keep the legacy secret name and endpoint URL for compatibility; they no longer imply an expiring trial.

Validation: 17 automated tests, including refresh after 400 simulated days, rotation, scope/client/resource binding, replay revocation, connection isolation and atomic rollback. `scripts/check-deck-mcp-live.mjs` additionally exchanges and rotates a production refresh token, exercises read tools, then revokes its own smoke connection and verifies access is denied.

Deployed v0.3 Worker version `f08ba71e-00e0-473b-8d75-d00390d5fb9c` on November 21, 2026. Production verification passed for refresh issuance/rotation, all read tools, and immediate revocation. TypeScript and the Worker build passed. No database migration was needed for persistent OAuth.

## Teammate invitations — v0.4

Admin Access includes owner-only AI connection management: choose a directory member, generate and copy a code, copy a separate setup prompt, inspect connection status/last use, and revoke access. No email or messaging service is involved. The code is shown once, stored only as a digest, valid for seven days before redemption, and single-use. Once redeemed, its connection persists with rotating refresh tokens until revoked. Anyone holding the unused code can connect as its named recipient, so the label is attribution rather than verified identity.

The original owner code and connections remain valid. Teammate actions use a separate invitation actor; creation retry IDs are isolated by that actor. Revocation blocks outstanding authorization codes, access tokens, and refresh tokens for that invitation without affecting other connections. Apply the additive `mcp_invitations` table from `workers/deck-mcp/auth-schema.sql` before deploying both services. The owner API deliberately is not exposed through MCP.

Validation: 20 isolated tests cover owner-only management, single-use redemption, expiry, named audit attribution, renewal and revocation isolation. TypeScript, website release checks, browser copy controls, and Worker dry-run pass.

Deployed v0.4 Worker `f41a3175-b874-4690-b017-66c13fa57a79` and production Pages `c06a0d19` on November 21, 2026. The additive invitation schema is applied. Production OAuth renewal, all 13 read tools, and smoke-session revocation passed; no live business records were changed. Anonymous management API access returns 401 and Admin Access redirects to login.

The copied setup prompt includes a stepwise walkthrough, exact OAuth settings, code lifecycle and permissions, all 23 tool names and limits, symptom-specific troubleshooting, and a redacted escalation checklist. ChatGPT UI/eligibility guidance links to official sources and requires verification when uncertain; it does not promise plan availability or automatic installation. The prompt contains no invitation secret.

## Shared commands and monitoring — v0.5

All 23 tools and full teammate permissions remain intact. Client item mutations now live in `functions/_lib/client-items.ts`, shared with admin and internal HTTP handlers. HTTP clients must provide a create requestId or edit/delete expectedUpdatedAt; the website supplies them. Existing MCP inputs, retry records and connections remain compatible. Rich-text website notes survive partial MCP edits. Explicit MCP body replacement remains plain text.

Migration 0054 in TG_DATA enables shared rate limits and sanitized error history. Admin Access → Connection health shows recent API/MCP failures and rate-limit events. Limits, retention, privacy boundaries and HTTP migration details are documented in `docs/internal-api.md`. Deploy both Pages and the Worker; no reauthorization or permission changes are required. Monitoring does not send notifications or continuously probe uptime.

Deployed November 22, 2026: Worker `3ec42532-f14f-441e-ae8f-cef7bc88cc03`, production Pages `4ab02b2d`, and TG_DATA migration 0054. All 26 MCP/integration tests and 26 Client HQ tests passed, along with TypeScript, website release checks, Worker dry-run and health-panel browser checks. Production OAuth renewal, all 13 read tools, and smoke-connection revocation passed. Anonymous API/health access is denied; no production business mutations were used for testing.

## Comment reader release — November 22, 2026

Added `get_deck_card_comments` and `GET /api/internal/v1/cards/:cardId/comments`;
24 tools total. Both use the same paginated reader for local/imported comments,
structured asset references and inert HTML extraction. See the comment contract
in `internal-api.md` for coverage limits and unresolved references. No new OAuth
scope or database migration; refresh tool metadata and start a new chat if the
tool is absent from an existing connection.

Worker version `bd1146e4-5532-4f0d-b092-eed4f01c4d8b` passed authenticated live
read-only checks, including comment reads, refresh rotation and revocation.
All 28 integration tests, TypeScript, Worker dry run and website release checks
passed. The signed event subscription/delivery layer and 24-hour verification
queue are a documented follow-up, not part of this comment-reader release.


## New asset event connection — v0.7

The 24 tools are unchanged. One MCP event, `mux.asset.ready`, is advertised
alongside tools. Rescan the plugin/server to discover it, then ask Dot to
subscribe and specify its behavior. Installing or rescanning does not itself
subscribe. Existing `tg:personal` connections work; no scope expansion.
See [MCP event contract and operations](mcp-events.md) for lifetime, callback
verification, revocation, retry limits and deployment prerequisites.


## Team notifications — 2 tools

| Tool | What it does |
| --- | --- |
| `list_notification_recipients` | Lists the complete small team directory with exact emails and names. |
| `send_team_notification` | Saves recipient inbox messages and queues push for opted-in devices; durable UUID requestId deduplicates retries. |

These tools require the **additional OAuth scope notifications:send** alongside
`tg:personal`. Existing grants keep their 24 original capabilities. Refresh plugin
metadata and reconnect with both scopes to enable sending; the consent page must
explicitly mention team notifications. Existing refresh tokens cannot gain it.
A teammate who must reconnect needs a fresh one-use invitation from Admin Access.
The owner may use their existing owner access code. Do not revoke an old connection
until the replacement is working. The two new tool definitions advertise their
required scopes and return an insufficient-scope challenge when needed.

Dot must resolve recipients, obtain a user request or explicit standing rule,
then supply requestId, recipients, title, body and an internal /app href. Retry
with identical details and the same requestId; a changed retry returns conflict.
Report saved/queued/accepted accurately, never “delivered” without evidence.
Dot owns conditions and timing; no server matching or notification schedule is
created. Device permission and inbox management remain personal PWA controls,
not AI tools. See [the API contract](internal-api.md#team-inbox-and-push-notifications)
for limits, migration, deployment and device setup.

Video reads may include optional `processing: { state, percent }` from the catalog
snapshot. This does not turn `search_videos` or `get_video` into live progress
pollers. Only transcoding has a numeric percentage; other phases return null.
Upload receipt tracking remains session-only UI functionality alongside the
existing admin-only uploads/replacements. Tool inventory, scopes and authentication
are unchanged; no plugin refresh or reconnect is required for this additive output.

Future website direct uploads allow up to 4K (2160p), retaining Plus quality.
No MCP tool, scope or read contract changes; existing assets are untouched.

## Playable video comments — November 24, 2026

`link_video_to_card` now requests both the association and a normal rich Mux
comment using the card editor's renderer. Its arguments and OAuth scopes are
unchanged; `tg:personal` already includes both required capabilities. Refresh
plugin metadata/start a new chat to receive the updated description; server
behavior applies immediately to existing calls. Attribution remains the actual
authenticated integration identity, not an impersonated human.

HTTP `POST /cards/:cardId/videos` accepts additive `addComment: true`, requiring
both `associations:write` and `cards:write`. Omitted/false preserves association-only
behavior and permissions. Existing grants are not broadened. The shared command
atomically commits the association, comment and audit events. The card/asset pair
is the durable retry key; the comment ID derives from the stored link ID. Retries
return the same comment and preserve edits/deletions. `data.comment` contains
`id` and `deleted` (or null for association-only requests); `created` retains its
existing meaning of a newly created association. A deleted comment is not restored.
An old association receives its missing comment on an explicit repeat request;
there is no automatic historical backfill. Signed/private or unready assets
without public playback are rejected for comment creation without changing their
visibility. Missing/deleted cards are rejected. No database migration is required.
Both Pages and the separate MCP Worker must be deployed. The website continues
using its existing rich-comment editor; this change reuses its rendering format.

### Video links submitted through plain comments

The existing comment POST / `add_deck_comment` path also embeds exact first-party
`/watch/:assetId` and `/watch/u/:assetId` URLs (up to five distinct assets). It
resolves each asset through Mux and uses the same rich block renderer as the
editor, preserving accompanying text. External URLs and project/collection
slugs are not automatically embedded. Private/unplayable assets reject the
comment without changing visibility. No association is silently created and
`cards:write` remains sufficient. This append operation remains non-idempotent;
check comments before retrying uncertain writes. Prefer `link_video_to_card`
for an explicit asset attachment with durable retry protection. Existing MCP
arguments and OAuth grants remain unchanged; refresh tool metadata for updated
guidance. Both Pages and MCP deployments are required.

## Deck update chip data

`search_deck_cards` inherits the additive signal fields documented in
[the internal API](internal-api.md#pwa-deck-update-chips): attention, filming dates,
dismissal time, unresolved question summary, recent Mux/gallery timestamps and
completion time. Deleted updates are excluded. These are current card summaries,
not event-history reports. No tool/schema/scope changes or reconnection are needed.
Deploy Pages and the MCP Worker to expose the same fields on both surfaces.


## Client HQ Drive trash boundary

Client HQ now offers confirmed, recoverable Drive file deletion through the
session-only `POST /api/admin/client-hq-files`. This is deliberately outside scoped
API/MCP grants: the organization-wide Drive connection and shared file deletion
require separate consent before exposing them to integrations. Existing
`clients:write` and `tg:personal` grants remain unchanged. The website and PWA share
the command and UI; folders/shortcuts cannot be trashed. No tool is added. File
listing/trashing remains an integration gap. See [Client HQ](client-hq.md#delete-docs-and-files)
for retry/audit behavior, version checks, permissions and migration 0056. Shared
rate limiting and Connection health cover the session endpoint; monitoring contains
only operation/status metadata. Deploy Pages after the targeted TG_DATA migration.


## Deletion is unavailable through MCP

`delete_client` and `delete_client_item` have been removed. `preview_client_deletion`
remains read-only and reports counts for a deletion the user can perform on the
website. Shared deletion commands reject MCP actors, and historical `clients:delete`
grants no longer confer deletion permission. Historical grants still renew without
reconnection; discovery no longer advertises this scope. Completing a to-do and
archiving a client remain available because they are reversible, non-deletion actions.

Refresh plugin metadata and start a new chat to see the revised 26-tool inventory
and the required `requestId` on `add_deck_comment`. Even stale chats cannot invoke
removed deletion tools. No new OAuth consent is required.

## Media safety — November 25, 2026

Session-only attachment/gallery uploads stream to R2 and enforce the actual byte
count (maximum 90 MiB). New SVG attachments are rejected; existing active-content
attachments download with a sandbox and nosniff headers. Ordinary media/PDF previews
remain inline. Upload routes remain admin-only because they transfer private files;
there are no new integration scopes or MCP tools.

The session-only video replacement endpoint now rejects identical IDs, requires a
ready public replacement, and atomically updates affected share pages, metadata,
Deck associations, cache invalidation and a durable audit/retry ledger. Retry with
the same assetId/replacementAssetId. A different replacement for an already-replaced
source returns 409. The original Mux asset is retained for recovery and may be
deleted separately through the existing explicit delete action. Historical comment
embeds and activity asset IDs remain historical; only canonical Deck associations
move. Replacement remains admin-only; scoped API/MCP tools can read the updated
associations but cannot upload, replace or delete Mux assets.

Apply only TG_DATA migration 0058_media_safety.sql before deploying Pages and the
MCP Worker. Refresh website tabs for the updated replacement wording. OAuth scopes
and MCP schemas are unchanged; no reconnection or metadata refresh is needed.

## Concurrent edits and retries — November 25, 2026

`move_deck_card` accepts optional `expectedUpdatedAt` from `get_deck_card`. All moves
validate the active destination and snapshot inside one transaction with their audit;
concurrent changes reject instead of leaving half a reordered column. Deleted cards
are excluded from moves, comments and board counts. `add_deck_comment` now requires
a UUID `requestId`; reuse it and identical content after uncertainty. Changed reuse
fails. Comment, optional signals, audit triggers and retry ledger commit atomically.
Event subscriptions check scope membership rather than a fixed serialized scope
string; legacy optional grants do not break subscriptions.

Owner access management remains intentionally website-only. Disabling a teammate
signs out their website sessions and revokes all invitations/connections labeled
with their email. Invitation labels still do not verify the recipient's ChatGPT email.

Production release verified November 25, 2026: Pages deployment
`b3c82dc1.trantergrey-site-git.pages.dev` on the production `main` branch; MCP Worker
version `714010ec-0189-4639-bc36-23dcb0fb3c36`. Only TG_DATA migrations 0059 and 0060
were required for this release. TypeScript, Cloudflare release/Worker build checks,
regression suites and the Chrome live-refresh/draft-preservation fixture passed.
Live origin checks confirmed unlisted crawler headers and an indexable homepage;
authenticated MCP smoke verified the 26-tool inventory, renewal and revocation
without changing business records.

### Background resource maintenance

The daily Worker job also prunes unused OAuth registrations (30-day grace; completed authorizations and live grants protected; 100 registrations/run) and old unreferenced app-generated logos (7-day grace; 100 objects/run with a persistent cursor). Legacy OAuth registrations receive a fresh grace period. The Worker binds the existing `PRODUCTION_ARCHIVE` R2 bucket solely for this maintenance. These are bounded internal housekeeping operations, not MCP tools or user-requested record deletions. MCP business deletion remains disabled. Tool names/count, scopes, persistent renewal and revocation are unchanged; no plugin refresh or reconnect is needed.

Drive token reuse and archive progress polling are internal optimizations. The collection website now offers separate MP4 links using the existing download endpoint instead of browser ZIP assembly; this presentation-only change adds no API/MCP capability gap. Schema prerequisites and exact retention behavior are in `docs/internal-api.md` under Resource maintenance and collection downloads.
