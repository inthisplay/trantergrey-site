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
Pages and currently exposes 23 tools across Deck, videos, Client HQ and move
reporting. It reuses scoped route handlers and shared commands in-process under
an authenticated integration actor, with a separate OAuth store and persistent
refresh-token renewal. See [the tool inventory](deck-mcp-tools.md) for current
capabilities, authentication and known gaps; `docs/deck-mcp-trial.md` is historical.
External integrations use scoped API credentials, not the MCP owner's invitation
code. Proposed video/card matches require user verification before association.

Project maintenance rules are in [AGENTS.md](../AGENTS.md). New business features
must assess UI, API and MCP support together, reuse shared commands, update the
contracts, and verify each affected deployment separately.

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
- Create a note/to-do: `{ "workspace_id": "...", "kind": "todo", "title": "Follow up", "assignee": "", "due_on": "" }`.
- Update an item: send its `id`, `workspace_id`, `title`, and full editable fields
  (`body`, `body_format`, `body_json`, `completed`, `due_on`, `assignee`). Updates
  replace these fields; use `completed: 1` to complete or `0` to reopen a to-do.
- Delete an item: `{ "action": "delete", "workspace_id": "...", "id": "..." }`.

Integration edits record the credential name in client activity. Existing scoped
credentials must explicitly receive the new scopes. Drive operations, connection
management, and client renaming continue to use the session-only admin endpoints.

The installed team PWA exposes this workspace at `/app/clients` through **C.HQ**.
Its notes and to-dos use the internal API; Drive uses the existing authenticated
admin endpoints. Client data is never cached by the service worker and requires
an online connection. The existing admin route remains `/admin/clients`.


## Personal MCP adapter

The standalone Worker now exposes 23 tools for the owner and invited teammates; see [the full tool inventory](deck-mcp-tools.md). Existing scoped route handlers are reused in-process via an authenticated request-scoped integration actor. HTTP callers retain normal bearer/session checks. MCP-specific client item commands add partial updates, optimistic concurrency and a durable retry ledger (migration 0053). Calendar reporting reads structured local edit history. These Worker changes do not deploy new main-site REST endpoints automatically.

## Owner-only AI connection management

`GET /api/admin/mcp-connections` lists team directory choices, the latest 200 invitations and latest 100 owner connections. `POST` supports `invite` (directory email and fresh UUID requestId), `revoke-invitation` (id), and `revoke-owner-connection` (id). All requests require the verified owner website session; writes also require same-origin requests. This intentionally has no MCP tool or scoped integration-token equivalent: an AI connection cannot issue invitations or administer access.

Invitation creation returns its plaintext code once. Only a digest is stored; an unused code expires after seven days and can be redeemed once. Connected grants renew until revoked. Revocation blocks access and renewal immediately. Labels attribute actions to the selected teammate but are not proof of the recipient’s ChatGPT identity. Pages and the Worker share the MCP_AUTH binding and `workers/deck-mcp/auth-schema.sql`.
