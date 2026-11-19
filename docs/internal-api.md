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
- `clients:read` (client directory, workspace notes/to-dos, and linked work)
- `clients:write` (create clients; create, edit, complete, reopen, and delete notes/to-dos)
- `associations:write`

`PRODUCTION_API_TOKEN` is accepted temporarily as a full-scope compatibility
credential for the existing production integration. Replace it with a scoped
credential before distributing MCP access.

## MCP integration

An MCP server should run outside Pages and use one scoped integration
credential. Its initial tools can map directly to `GET /videos`, `GET /cards`,
`GET /cards/:cardId/activity`, `POST /cards/:cardId/move`,
`POST /cards/:cardId/comments`, and `POST /cards/:cardId/videos`. Store the last
successful `createdAfter` timestamp or API cursor in the MCP service, not in
the site. Proposed matches should remain a human-approval step before the
association request is made.

## Client HQ

`GET /client-hq` returns `{ data: { clients } }`. Use `GET /client-hq?id=<client-id>`
for `{ data: { client, items, members } }`, including linked Drive folder IDs.
`GET /client-hq?id=<client-id>&related=1&cardsOffset=0&videosOffset=0` returns
linked Deck cards and videos, five of each per page, with next-page flags.
These reads require `clients:read`.

`POST /client-hq` requires `clients:write` and shares the admin validation,
note sanitization, completion timestamps, workspace isolation, and activity log:

- Create a client: `{ "action": "client", "name": "Client name" }` (201, `data.id`).
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
