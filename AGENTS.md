<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep UI, API and MCP capabilities aligned

This app has three interfaces: the website/PWA, the scoped internal API, and the
personal MCP server. When adding or changing a business capability, assess all
three. Routine operations on cards, videos, clients, notes and to-dos should be
available through the API and an appropriate MCP tool as part of the feature.
For an intentionally UI-only or admin-only operation, record the reason and the
remaining gap in the capability documentation; do not silently omit integration
support. Presentation-only changes do not need new endpoints or tools.

- Read `docs/internal-api.md` and `docs/deck-mcp-tools.md` before changing these
  interfaces. Keep their contracts, inventory, examples and limitations current.
- Put reusable validation and business commands in shared server modules. UI/API
  and MCP adapters should call the same commands instead of duplicating database
  writes or relying on browser automation. Existing MCP-specific item commands
  are a known exception; reuse/extract them when adding equivalent REST behavior.
- Production HTTP endpoints live in Cloudflare Pages `functions/api`, not the
  Next.js `app/api` routes excluded from the static export. MCP is a separate
  Worker in `workers/deck-mcp`; deploying one does not deploy the other.
- Preserve existing endpoint paths, tool names, field meanings and OAuth scopes.
  Prefer additive changes. Document migrations and client refresh/reconnection
  steps for breaking changes; never broaden an existing grant silently.
- Enforce authorization on the server for every operation. Declare precise API
  scopes and accurate MCP read/write/destructive/idempotent annotations. Keep
  credentials out of tool results, client bundles and logs. `withApiActor` is for
  already-authenticated in-process callers only, never HTTP-supplied identity.
- Keep persistent OAuth renewal, resource/client binding, refresh rotation and
  revocation working. Do not reintroduce a trial deadline or periodic manual
  sign-in. Teammate invitations carry separate revocable identities; their labels do not verify the recipient’s ChatGPT email. Keep invitation management owner-only and outside MCP.
- New create/append operations need durable retry IDs, atomic writes and audit
  records. Existing non-idempotent operations must say so explicitly. Partial
  edits must preserve omitted fields and detect conflicting concurrent edits.
- Resolve real IDs; do not guess client/card matches. Exclude deleted records
  from ordinary reads. Provide pagination for collections and state how totals
  are counted. Historical reports use event history, explicit time zones and
  disclosed coverage, not current state or generic updated timestamps.
- Public video links must not change playback visibility. Destructive actions,
  permission changes and automatic associations need explicit user intent.

### Integration release checks

For API/MCP changes, run `node scripts/test-deck-mcp.mjs` and `npx tsc --noEmit`.
Add meaningful coverage for new behavior, especially authorization, retries,
partial updates, pagination or date boundaries as applicable. Update the tool
inventory assertions when the intentional tool count changes.

For Worker changes, verify `npx wrangler deploy --dry-run --config
workers/deck-mcp/wrangler.jsonc`. For website/Pages changes, run
`npm run check:cloudflare-release`. Apply only the required database migrations;
do not bulk-run historical migrations against production. Deploy each affected
service, and distinguish local implementation from deployed availability in the
handoff. After an authorized Worker deployment, run
`node scripts/check-deck-mcp-live.mjs` for read-only OAuth/renewal/revocation and
MCP checks. Test business mutations in isolated fixtures, not live records.

Changes to MCP tool schemas/descriptions may require a plugin metadata refresh
and a new chat. Scope/authentication changes may require reconnecting. Explain
these steps rather than treating server deployment as proof the user's existing
chat has received the updated tools.
