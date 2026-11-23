# Historical card-creation trial

Superseded by the owner-only personal expansion in [deck-mcp-tools.md](deck-mcp-tools.md). The sections below describe the original v0.1 trial, not the current v0.2 permissions.

# Deck MCP trial

The standalone Cloudflare Worker in `workers/deck-mcp` exposes authenticated Streamable HTTP at `/mcp`. It uses the official TypeScript MCP SDK and shares the card-creation command with the optional Pages API endpoint. This lets us test ChatGPT without deploying a new main website release.

## Boundaries

- `list_deck_columns`: active IDs and names only; no card counts or contents.
- `create_deck_card`: title, client, active column, plain-text notes, and a retry key. Returns a real `/app/deck?card=...` link.
- A separate D1 database stores dynamic OAuth clients, ten-minute consent transactions, two-minute codes, and one-hour access tokens. Code/token values are stored hashed. PKCE S256, exact redirect allowlisting, resource/audience checks, and browser consent CSRF checks are enforced.
- The trial uses an invite secret instead of the team's Google sign-in. It identifies an integration, not an individual person. Do not expand this into general team access without per-user login/authorization.
- Only ChatGPT's documented stable and callback-specific HTTPS redirect paths are accepted. Other MCP hosts may require a separately reviewed redirect allowlist.
- The entire service fails closed when `TEST_ACCESS_CODE` is absent or `TEST_EXPIRES_AT` has passed. There are no refresh tokens. The daily cron removes expired OAuth records.
- Server credentials are never bundled in the plugin. The invitation is stored in ignored `data/deck-mcp-trial-access.txt`, file mode 0600, for the owner to share privately with the tester.

## Storage and deployment

Production card writes use a single D1 batch: retry ledger, new card, overrides, audit record, and optional client directory entry. Same actor/request ID and identical input return the original result; changed input returns a conflict. A failed batch rolls back all writes. Existing card-creation UI remains unchanged.

Apply only `migrations/0052_card_creation_requests.sql` to the site database; do not bulk-run historical migrations. Apply `workers/deck-mcp/auth-schema.sql` to the separate `MCP_AUTH` database. The new Worker has no public website routes and does not replace the Pages deployment.

```sh
npx wrangler d1 execute TG_DATA --remote --config workers/deck-mcp/wrangler.jsonc --file migrations/0052_card_creation_requests.sql
npx wrangler d1 execute MCP_AUTH --remote --config workers/deck-mcp/wrangler.jsonc --file workers/deck-mcp/auth-schema.sql
npx wrangler secret put TEST_ACCESS_CODE --config workers/deck-mcp/wrangler.jsonc
npx wrangler deploy --config workers/deck-mcp/wrangler.jsonc
```

To stop early, delete the `TEST_ACCESS_CODE` Worker secret. To revoke existing OAuth connections while allowing new invitations, clear `oauth_records` where `kind` is `token`, `code`, or `pending`. Rotating the invitation alone does not revoke already-issued tokens. The card audit and retry ledger remain intact.

## Validation

Run `node --test scripts/test-deck-mcp.mjs`, `npx tsc --noEmit`, and `npm run check:cloudflare-release` for website compatibility. Tests use isolated SQLite with the actual D1 migrations and exercise the Worker through a real SDK client, including OAuth, single-use codes, expired tokens, scopes, input validation, atomic rollback, retries, and hostile origins. `npx wrangler deploy --dry-run --config workers/deck-mcp/wrangler.jsonc` verifies the Worker bundle.

The teammate's steps and evaluation checklist are in `plugins/deck-trial/README.md`. Free-personal-account eligibility remains unverified until a teammate completes that flow; passing protocol tests does not prove ChatGPT plan access.

Official references: [connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt), [plugin packaging](https://developers.openai.com/plugins/build/plugins), [OAuth](https://developers.openai.com/plugins/build/auth).
