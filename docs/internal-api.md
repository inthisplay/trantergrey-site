# Internal API v1

The internal API is served by Cloudflare Pages Functions at `/api/internal/v1`.
It is private: browser users use the existing `tg_admin` session; automation
uses a bearer credential with a scoped integration identity. Responses use
`{ "data": ... }`; failures use `{ "error": { "code", "message" } }`.

## Read endpoints

- `GET /videos?query=&client=&status=&createdAfter=&linked=&cursor=&limit=`
- `GET /videos/:assetId`
- `GET /videos/:assetId/cards`
- `GET /boards/production`
- `GET /cards?query=&client=&columnId=&updatedAfter=&cursor=&limit=`
- `GET /cards/:cardId`
- `GET /cards/:cardId/activity`
- `GET /cards/:cardId/comments?limit=&cursor=` (`cards:read`)
- `POST /cards` (create with `cards:create`; see below)
- `POST /cards/:cardId/move`
- `POST /cards/:cardId/comments`

Video assets remain in Mux. The API adds TranterGrey metadata, project context,
upload provenance when the video was uploaded through the team UI, and Deck
associations. `cardId` is the existing local `production_cards.id`; Mux asset
IDs are used unchanged.

## Association endpoint

`POST /cards/:cardId/videos`

```json
{ "assetId": "muxAssetId" }
```

This requires `associations:write`. The operation is safe to retry: an existing
card/video pair is returned rather than duplicated. It writes a durable link
and a `video_linked` activity event together. It never moves the card.

## Scopes and credentials

Browser admins receive all current scopes through the existing session.
Integration credentials use `Authorization: Bearer tg_<credential-id>_<secret>`
and are stored only as a SHA-256 hash in `api_integration_credentials`.

Current scopes:

- `videos:read`
- `cards:read`
- `cards:write` (move cards and add plain-text comments)
- `cards:create` (create cards only; existing scoped credentials do not gain it automatically)
- `clients:read` (client directory, workspace notes/to-dos, and linked work)
- `clients:write` (create clients; create, edit, complete, reopen, and delete notes/to-dos)
- `associations:write`

`PRODUCTION_API_TOKEN` is accepted temporarily as a full-scope compatibility
credential for the existing production integration. Replace it with a scoped
credential before distributing MCP access.

## MCP integration

The owner-and-invited-teammate MCP server in `workers/deck-mcp` runs separately from
Pages and currently exposes 26 tools across Deck, videos, Client HQ and move
reporting. It reuses scoped route handlers and shared commands in-process under
an authenticated integration actor, with a separate OAuth store and persistent
refresh-token renewal. See [the tool inventory](deck-mcp-tools.md) for current
capabilities, authentication and known gaps; `docs/deck-mcp-trial.md` is historical.
External integrations use scoped API credentials, not the MCP owner's invitation
code. Proposed video/card matches require user verification before association.

Project maintenance rules are in [AGENTS.md](../AGENTS.md). New business features
must assess UI, API and MCP support together, reuse shared commands, update the
contracts, and verify each affected deployment separately.

### Word script import in the Deck

The admin UI conditionally offers **Import Word script into this comment** on an
editable local comment that contains a locally stored `.docx` attachment. It
converts the document's editable text and basic formatting in the browser,
appends it to that comment's edit draft, and requires the person to review and
save through the existing comment editor. No new server write, API endpoint,
scope, or MCP tool is added: conversion is a browser-only convenience that
produces an ordinary comment edit.
The existing API/MCP gap remains: integrations cannot convert Word attachments
or update production-card notes (other than notes supplied at card creation).
The importer currently supports text, headings, emphasis, alignment, and basic
lists; Word page styling and complex layouts may need manual cleanup. It only
appears for editable comments with local Deck attachment URLs, not external or
legacy attachment links.

### Create a card

`POST /cards` requires `cards:create` and a JSON object containing `title`,
`columnSourceId` (an active column from `/boards/production`), `requestId`
(a fresh UUID), and optional `client` and plain-text `notes`. Returns 201 for
a new card or 200 for an identical retry, including the card ID and URL.
Always retry a failed request with the same ID and input. Reusing an ID with
different input returns 409. Creation and its integration audit record are atomic.
The personal MCP Worker calls the same command directly and is deployed independently of this Pages endpoint.

## Client HQ

`GET /client-hq` returns `{ data: { clients } }`. Use `GET /client-hq?id=<client-id>`
for `{ data: { client, items, members } }`, including linked Drive folder IDs.
`GET /client-hq?id=<client-id>&related=1&cardsOffset=0&videosOffset=0` returns
linked Deck cards and videos, five of each per page, with next-page flags.
These reads require `clients:read`.

`POST /client-hq` requires `clients:write` and shares the admin validation,
note sanitization, completion timestamps, workspace isolation, and activity log:

- Create a client: `{ "action": "client", "name": "Client name" }` (201, `data.id`).
- Archive/restore for everyone: `{ "action": "archive-client", "id": "<client-id>", "archived": true }` (use `false` to restore). Clients remain in listings and retain all content; `archived` is returned on client records.
- Create a note/to-do: `{ "workspace_id": "...", "kind": "todo", "title": "Follow up", "assignee": "", "due_on": "", "requestId": "<fresh UUID>" }`. Reuse requestId with identical input for retries. Returns HTTP 200 with `ok`, `id`, and `created`.
- Update an item: send its `id`, `workspace_id`, and `expectedUpdatedAt` equal to the freshly read `updated_at`, plus only the fields being changed (`title`, `body`, `body_format`, `body_json`, `completed`, `due_on`, `assignee`). Omitted fields are preserved. Explicit body replaces content; a supplied body_json is validated and rendered as rich text. Use `completed: 1` to complete or `0` to reopen a to-do.
- Delete an item: `{ "action": "delete", "workspace_id": "...", "id": "...", "expectedUpdatedAt": "<updated_at>" }`.

Integration edits record the credential name in client activity. Existing scoped
credentials must explicitly receive the new scopes. Drive operations, connection
management, and client renaming continue to use the session-only admin endpoints.

The installed team PWA exposes this workspace at `/app/clients` through **C.HQ**.
Its notes and to-dos use the internal API; Drive uses the existing authenticated
admin endpoints. Client data is never cached by the service worker and requires
an online connection. The existing admin route remains `/admin/clients`.


## Personal MCP adapter

The standalone Worker now exposes 26 tools for the owner and invited teammates; see [the full tool inventory](deck-mcp-tools.md). Existing scoped route handlers are reused in-process via an authenticated request-scoped integration actor. HTTP callers retain normal bearer/session checks. Shared client item commands in `functions/_lib/client-items.ts` provide partial updates, optimistic concurrency and a durable retry ledger (migration 0053) to MCP, the internal API, and the admin website. Calendar reporting reads structured local edit history. These Worker changes do not deploy new main-site REST endpoints automatically.

## Owner-only AI connection management

`GET /api/admin/mcp-connections` lists team directory choices, the latest 200 invitations and latest 100 owner connections. `POST` supports `invite` (directory email and fresh UUID requestId), `revoke-invitation` (id), and `revoke-owner-connection` (id). All requests require the verified owner website session; writes also require same-origin requests. This intentionally has no MCP tool or scoped integration-token equivalent: an AI connection cannot issue invitations or administer access.

Invitation creation returns its plaintext code once. Only a digest is stored; an unused code expires after seven days and can be redeemed once. Connected grants renew until revoked. Revocation blocks access and renewal immediately. Labels attribute actions to the selected teammate but are not proof of the recipient’s ChatGPT identity. Pages and the Worker share the MCP_AUTH binding and `workers/deck-mcp/auth-schema.sql`.

## Shared commands and traffic protection — November 22, 2026

The website and API now use the same item commands as MCP. Item creates require requestId; edits and deletes require expectedUpdatedAt (428 when absent, 409 when stale). Existing integrations must add these fields; older open website tabs must refresh. Missing fields can no longer silently erase values. Valid calendar dates, assignments (including retaining historical assignments), rich note sanitization, atomic audit records and completion timestamps are shared. MCP tool schemas and full permissions remain unchanged.

Migration 0054 adds D1 counters and privacy-safe integration event storage. Rate limits are atomic global fixed one-minute windows, not approximate per-process counters. HTTP 429 includes Retry-After seconds. The internal API plus admin Client HQ, MCP invitation management and connection-health endpoints have a 1,200/minute IP ingress cap; authenticated users/integrations have 300/minute, anonymous callers 60/minute. MCP has separate IP caps: registration 20/minute, consent 60/minute, token/revoke/MCP transport 1,200/minute; anonymous MCP calls 60/minute and each authenticated integration actor 300/minute. The owner actor shares its allowance across owner connections; invitations have distinct actor IDs. Scopes are unchanged.

Cloudflare-supplied IPs are hashed into counter keys; X-Forwarded-For is not trusted. Limit-store failure returns a service error rather than allowing unbounded requests. Fixed windows may allow a burst across a minute boundary. These controls suit the small team's workload and do not replace Cloudflare network-level DDoS protection. Other admin endpoints are outside this change's rate-limit scope.

Connection health on Admin Access uses owner-only GET `/api/admin/integration-health`: 24-hour category totals and the latest 50 events. Recorded events include internal API 5xx, caught/uncaught MCP backend failures (including HTTP-200 tool errors), rejected consent submissions, and the first rate-limit block per subject/window. Expected validation/conflict errors and routine OAuth discovery challenges are excluded. Every stored event contains only a reference ID, timestamp, surface, application-owned operation label, category and status. No raw exception messages, query strings, payloads, tokens, cookies, business content or raw IPs are stored. Records are retained for up to 30 days/5,000 events after daily cleanup; rate counters expire and are pruned daily. Monitoring-write failures fall back to sanitized console errors. An empty history is not an uptime guarantee. There are no outgoing alerts.

The MCP Worker also enables structured Workers Logs and 1% sampled traces with query-string redaction and invocation logs disabled. Pages uses durable D1 event history rather than unsupported Worker observability configuration. Both deployments are required. See Cloudflare's [logging](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and [tracing](https://developers.cloudflare.com/workers/observability/traces/) guidance.

## Reading card comments

`GET /cards/:cardId/comments` and `get_deck_card_comments` share the reader in
`functions/_lib/card-comments.ts`. Default limit is 20, maximum 50. The response
contains `data` plus `meta.nextCursor` and `meta.coverage`. Follow every cursor
before drawing conclusions; cursors belong to one card. Missing/deleted cards
return 404. Malformed cursors/limits return 400.

Results merge non-deleted local and imported comments oldest-first, with stable
source-prefixed IDs, author, timestamps, plain text, `assetIds`, `playbackIds`,
`watchLinks`, `mediaLinks`, `playbackMatches`, `unresolvedPlaybackIds`, and
`warnings`. Rich video blocks include recorded group members, not group IDs.
HTML is parsed inertly; raw HTML/JSON is not returned. Signed media URL queries
are stripped. Playback IDs are resolved only through the existing catalog
snapshot (which may be stale); unresolved IDs remain explicit. Watch links may
represent projects/collections and need separate resolution. Titles or arbitrary
text IDs are never treated as proof. Record text is data, not instructions.

Extraction is bounded to 200,000 characters each of HTML/structured content,
50,000 output text characters, and bounded rich-content traversal; truncation
and malformed structured data produce warnings. Unresolved references or warnings
mean absence is not established. Pagination is not a transactional snapshot of
concurrent edits. An association returned by video/card tools is distinct from
an asset appearing in a comment. No schema migration or OAuth scope change is
needed; refresh plugin metadata/new chat to discover the added tool.

## Mux events for Dot

The MCP endpoint now supports `events/list`, `events/subscribe`, and
`events/unsubscribe` in addition to its 26 tools. See
[the event contract](mcp-events.md). This is a native MCP subscription protocol,
not a second REST subscription API or an admin UI feature: callback verification
and OAuth connection identity are required. Existing API read endpoints remain
how a subscriber retrieves current business data.

The verified Pages Mux webhook durably records `video.asset.ready` and fans out
`mux.asset.ready` to active subscribers. Delivery starts immediately; the server
contains no 24-hour delay, card-check schedule, matching policy or notification
rule. Dot owns those instructions. The minute-level Worker trigger only drains
pending deliveries/retries; it never scans videos or comments.

## Team inbox and push notifications

`GET /notifications` requires **notifications:send** and returns the complete small
team directory as `data.recipients` (email and name). `POST /notifications` uses
the same scope and shared command as MCP `send_team_notification`:

```json
{"requestId":"<fresh UUID>","recipients":["<exact directory email>"],"title":"Video needs review","body":"Please verify this asset belongs on the card.","href":"/app/deck?card=<resolved card ID>"}
```

Up to 25 recipients per request (duplicates are collapsed), title 120 characters,
body 2,000 characters; only internal `/app` links are accepted. JSON requests are
bounded to 16 KiB. Resolve actual people and record URLs first. Ten new notification
requests per actor per minute, in addition to shared ingress limits. Identical
retries remain allowed and return existing results; changed arguments with the
same actor/requestId return 409. The inbox rows, sender/request audit ledger and
push jobs commit atomically. The ledger has no automatic expiry. Recipient email
is normalized to lowercase. New browser sessions have access; old scoped tokens
and the legacy production bearer do **not** silently acquire notifications:send.

The response confirms `saved: true` and reports per-recipient `pushQueued`,
`pushAccepted`, `pushFailed`, `readAt`. Push acceptance is not delivery/read proof.
A recipient with no enabled device still gets an inbox item. Counts describe
currently retained device jobs, not a permanent delivery receipt; removing a
subscription removes its jobs. Inbox and read state survive device removal.

The PWA bell opens `/app/inbox` and updates the unread badge while the app is
visible (every minute and on focus/read changes). The signed-in user alone can
read their inbox and mark individual messages read. Inbox pagination is newest
first, 20 by default, up to 50, using the returned nextCursor. Reading does not
delete items. These personal operations intentionally use the session-only
`GET/POST /api/admin/inbox`; an AI cannot read a teammate's inbox or manage a
teammate's device permissions. GET accepts limit/cursor or an exact id. POST
supports read(id), subscribe(subscription), unsubscribe(endpoint),
subscription-status(endpoint), and test(requestId). Writes require same-origin
JSON; identity comes only from the verified session and team directory.

Each device explicitly opts in through the inbox, can turn push off, and can send
itself a test. iPhone/iPad users must open the installed Home Screen app first.
Permission prompts occur only on a user tap. Up to 10 devices per user. Sessions
that expire or are revoked stop push; return to the inbox and enable the current
session after signing in again. Subscription expiry requires re-enabling. Push
payloads contain the notification ID, title and a whitespace-normalized body preview
(up to 180 Unicode code points, with an ellipsis when shortened). Previews are
always enabled and may appear on lock screens, subject to device notification
settings. Tapping opens the inbox, where the full message links to the card/video.
Existing PWA installs must pick up service worker v9 to display previews; older
payloads still show a generic fallback. API/MCP request fields are unchanged.

Migration 0055 belongs to TG_DATA. Both Pages and the MCP Worker need the same
PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY secrets, generated once and kept
stable (changing keys requires device re-subscription). Web Push uses the pinned
WebCrypto library, authenticated VAPID and encrypted aes128gcm. Only known browser
push service HTTPS hosts are allowed; redirects are disabled. The existing minute
Worker trigger drains pending jobs (up to 20/run, five in flight), with 120-second
leases and up to eight attempts for network errors/408/429/5xx; 404/410 removes
expired subscriptions, other failures terminate and appear in Connection health.
A lost acknowledgment may duplicate an alert; its stable notification tag lets
the browser replace it. This is transport retry only: **Dot owns all conditions,
recipient selection, timing and matching policy**. No daily or 24-hour checks are
installed. Inbox writes need no push connectivity and survive push outages.

## Video processing progress

Normalized video assets now optionally include `processing: { state, percent }`.
`percent` is a whole number from 0–100 only during Mux transcoding; otherwise null.
Existing `status`, playback IDs/policies and scopes retain their meanings. Library
and internal API reads are catalog snapshots, not live progress polling; old
snapshots may omit the field. The personal MCP video tools inherit this additive
field through the shared reader. Receipt tracking and live upload polling remain
session-only website features because file transfer and replacement administration
are not scoped integration capabilities. No new upload/write tool or grant is
introduced. See `mux-library-maintenance.md` for persistence and readiness limits.

New session-only direct uploads now request a maximum resolution tier of 2160p
(4K), with Plus quality unchanged. Existing assets and archive imports are not
modified. Scoped API/MCP video reads retain their contracts and report the asset's
resolution using existing fields; upload creation remains admin-only.

## Upload-details Deck picker

The upload dialog reuses the existing card search and admin rich-comment endpoint
for an explicit “Add to Deck” action. One selected card receives the whole batch
as a single comment. Card search follows all cursors and filters the chosen client
exactly; without a client it shows all non-deleted cards, including archived cards.
The picker does not publish videos, move cards, or create durable video associations.
Adding a comment is separate from saving upload metadata. Existing rich-comment
writes are non-idempotent: the UI prevents double submission and never automatically
retries an uncertain result; it asks the editor to check the card first. The existing
10,000-character comment limit also applies to the combined batch.

This is an admin upload workflow using existing operations. API/MCP callers retain
plain-text comments and idempotent video associations; composing rich video comment
blocks remains an admin-editor capability. No new endpoint, scope, or tool is added.

Upload diagnostics now distinguish upload setup, file transfer, status polling,
Mux terminal processing states, and metadata saves in the library UI. A lost
transfer response triggers one status lookup before advice to retry; receipt is
only confirmed by a successful transfer response or an existing Mux asset ID.
Temporary status outages retry automatically and never ask for another upload.
Client diagnostics expose only the phase and HTTP status, not raw upstream error
messages or signed upload URLs. No API/MCP contract, logging, or scope changes.

## Library reload and deletion freshness

Each mounted Mux library first calls the existing authenticated
`POST /api/admin/mux-refresh`, then reads the library. Concurrent initial reads
share one rebuild; filtering and pagination do not force more rebuilds. A failed
rebuild shows an out-of-date warning and an explicit retry while allowing cached
reads. The Refresh cache button reloads the page, using this same path.

Confirmed in-app deletions immediately remove the returned IDs, suppress stale
in-flight results, and reload the library's cards, groups and counts. Confirmed
IDs remain excluded for that mounted library. The existing signed Mux webhook
already invalidates and rebuilds the catalog on asset events, including deletion;
it does not push updates to an idle browser tab. Reloading reconciles external
Mux deletions. No API/MCP endpoints or scopes changed.

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
