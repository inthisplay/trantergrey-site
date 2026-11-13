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
