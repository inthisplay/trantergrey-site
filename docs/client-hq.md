# Client HQ local review

Client directory cards have a pixel three-dot menu. Pins and colors are personal, stored by the authenticated account's normalized email and stable client ID through `/api/admin/client-preferences` (private/no-store). The request cannot select another user. Archive/restore is shared through the existing Client HQ API and records activity; it never hides or deletes a client. The directory sorts active pinned clients first, then other active clients, then archived clients, alphabetically within each group. Archived cards use dark gray/light text; personal colors return on restore.

Migrations `0038_client_user_preferences.sql` and `0039_client_custom_colors.sql` are required for these features. They add personal preferences, custom hex colors, and the shared `client_directory.archived` flag. Apply locally for review; apply in production only with the eventual release.

Open http://localhost:3100/admin/clients with `npm run dev` running. Use Google sign-in or the existing local owner-password login. Migration 0026 extends `client_directory` (the existing master list) with stable IDs and a Drive folder reference. Migration 0027 adds existing catalog/ratio-set client names to that same list. Notes/to-dos reference the stable ID. No active/potential status is introduced. New clients from legacy selectors receive IDs automatically. Renaming preserves workspace content and updates existing production associations.

## Google Drive configuration

The Drive backend uses one organization-controlled account's refresh credential. This is separate from the website user's login session. Configure these only in the ignored `.env.local` file for local use and, after deployment approval, as Cloudflare secrets:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the OAuth application.
- `GOOGLE_REDIRECT_URI`: the existing Google login callback for this environment. Locally: `http://localhost:3100/api/auth/google/callback`. The Drive flow reuses this registered callback without changing normal login scopes.
- `GOOGLE_DRIVE_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hex characters. Keep this stable and private; replacing it requires reconnecting Drive. A local-only key has been generated in the ignored environment file. Provision a separate production secret before deployment. No manual refresh-token copying is needed.
- `GOOGLE_DRIVE_ID`: optional; defaults to the supplied TranterGrey Media Shared Drive ID `0AOX_kevBmpI_Uk9PVA`.

Enable the Drive API in that Google Cloud project and configure an internal OAuth consent screen. The authorizing account needs access to the shared drive and permission to create folders/files. The broad Drive scope is needed for browsing existing materials and uploading into existing shared-drive folders; all application operations are constrained to the configured shared drive and linked client folder. Credentials stay server-side, never in API responses or browser storage. Use **Connect Google Drive** in Client HQ or a workspace’s Docs & files panel. OAuth requests use PKCE and single-use state records bound to the initiating admin session with a ten-minute lifetime. The callback verifies the Drive scope, verified Workspace domain, and shared-drive access before storing an AES-GCM encrypted refresh credential in D1. Tokens never reach the browser. Cancellation or unsuccessful reconnection leaves an existing connection intact. Revoked refresh credentials prompt reconnection. Do not paste tokens into chat or commit them.

Every signed-in website admin can browse files accessible through this organization account. Opening a file in Google Drive still uses the viewer's own Google permissions. Disconnect removes the local application credential and pending authorizations, preserving files and folder links. It does not revoke the Google application grant, because revocation of this shared OAuth client can affect other granted scopes. To revoke that grant, use the account’s Google security settings.

Select the exact existing primary client folder via Docs & files, review the breadcrumb path, and confirm the selection. Folder names are never used to match clients. Alternatively create a new folder explicitly. Primary folder setup creates or reuses its `Client HQ` child and stores both exact folder IDs. Multiple same-named Client HQ children require a person to resolve the ambiguity. Add additional folders manually with **Add another folder**; these are browsable but uploads always target the primary folder’s Client HQ child. Removing an additional link only changes D1, never Drive files. Browse subfolders and paginated results; thumbnails are proxied through authenticated endpoints. Uploads (up to 20 MB) use the stored `Client HQ` subfolder. Folder creation is guarded by short-lived database locks, and root/ancestor checks run before reads and writes. Larger uploads can be added directly in Drive. Existing files are never renamed/deleted by this integration. Shortcuts open in Drive rather than being followed by the server. The folder picker and upload features require a real configured credential to exercise against Google.

OAuth reference: https://developers.google.com/identity/protocols/oauth2/web-server. Shared-drive reference: https://developers.google.com/workspace/drive/api/guides/enable-shareddrives.

## Checks

`node --test scripts/test-client-hq.mjs` checks identity preservation, item isolation, shared renaming, authentication, OAuth replay/session/expiry/account/scope checks, credential encryption, revocation handling, exact folder links, additional folder isolation, and upload destinations with mocked Google calls. `npm run check:cloudflare-release` validates the static export. Local migration: `npm run db:migrate:local`. Nothing here authorizes deployment or a production migration.
## To-do archive

Completion is recorded server-side in `completed_at`. To-dos completed more than 30 days ago appear in the workspace's View archive section instead of the main list. Archive membership is derived from that timestamp; no scheduled worker or deletion is needed. Open workspaces refresh the time comparison every minute. Editing a completed task preserves its completion date. Reopen clears completion and returns it to the main list; completing it again starts a new 30-day window.

Migration 0030 starts the window at migration time for previously completed tasks because their original completion dates were not recorded.

### Private Drive previews

Client HQ previews use the authenticated `client-hq-drive` endpoint with `client`, `root`, and `preview` (file ID). Every request checks the linked folder ancestry; credentials remain server-side and responses are private/no-store. PDF.js renders PDFs locally, including PDF exports of Google Docs, Sheets, Slides, and Drawings (Google limits exports to 10 MB). Raster images, supported browser audio/video, and small plain-text files preview directly. Other stored formats download as attachments; Google-only formats without a PDF export retain Open in Drive. HTML and SVG are never rendered as active same-origin documents. Download restrictions from Drive are respected.

`npm run dev` and `npm run build:site` prepare versioned PDF.js fonts, CMaps, and WASM assets from the installed package. The worker is bundled by Next; no third-party viewer or CDN receives private file content.

Card colors use the same full picker as Deck panels: presets, native color selection, hex input, preview, and reset. The selected background is displayed with automatically contrasting text. Existing personal preset colors are preserved by migration 0039.

Desktop users (fine pointer, hover, viewport at least 900px) can drag directory cards using the existing dnd-kit library. Mouse activation requires 8px of movement; touch sensors are not registered. Keyboard users can focus a card wrapper and use Space/arrows/Space or Escape. The dragged card leaves a dashed insertion placeholder; cards never combine. Orders are personal, persisted through `client-preferences` with `{action:"reorder",ids:[...]}`. Pinned/active/archived grouping takes precedence, and dragging is limited to the same group. Filtered-out cards retain their slots. Failed saves restore the previous order with an error. Migration `0040_client_card_order.sql` is also required (local only until release).

## Client logos

Client settings includes an immediately saved logo upload, replacement, and removal control. PNG, JPG, and WebP images up to 5 MB are supported. The shared logo appears in Client HQ, in the workspace heading and directory card, and above the player on enabled unbranded video pages for that client; clients without logos retain their initials. All logo displays, including the settings preview, use a 1:1 white square with padding and contain the full image without cropping or stretching. Logo changes record management activity. Reads and writes use the authenticated `/api/admin/client-logo` endpoint and existing private `PRODUCTION_ARCHIVE` storage. Removing or replacing a logo unlinks the previous object; stored originals are retained, matching the archive's retention behavior.

Migration `0049_client_logos.sql` adds the nullable logo reference to the existing client directory. Apply it before releasing this feature. The Client HQ test suite covers authentication, origin checks, format/size rejection, client isolation, persistence, replacement, and removal.

Unbranded video links serve the current logo through `/api/watch/[slug]/logo`, scoped to the project’s assigned client and only when unbranded sharing is enabled. The private admin endpoint remains authenticated. Missing logos leave the video layout unchanged; branded watch pages and collections do not display client logos.

For imported video pages without a project-level client, logo lookup falls back to saved asset metadata and the current library client assignment. All variants must resolve to the same client; mixed or unassigned groups do not guess a logo.
