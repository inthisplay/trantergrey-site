# Video archive

The Mux library's Thumbnail filter group is replaced by **View archive**. The archive is an authenticated catalog backed by the Vimeo CSV and a completed scan of the exact Vimeo Archive Drive folder. Results default to verified videos, show the Drive folder path and original Vimeo upload date, and offer preview, Open in Drive, and Import to Mux. Unavailable and ambiguous records remain visible through an optional filter.

## Local setup

1. Apply migrations with `npm run db:migrate:local`.
2. Import metadata with `node scripts/import-video-archive.mjs /path/to/export.csv /path/to/video_library_dates.csv`. This command only targets **local D1**. Reimports update source metadata but preserve Drive links, import jobs and Mux edits. CSV files and generated SQL stay in ignored `data/`; the source exports are not committed. The older export supplies client assignments and full nested folder paths when its final folder agrees with the newer export.
3. Keep the existing organization Drive connection configured in Client HQ. The connected account must be able to read/download the archive files.
4. Configure a random `ARCHIVE_WORKER_SECRET` of at least 32 characters in ignored `.env.local`, then restart `npm run dev`. The dev launcher starts `scripts/archive-worker.mjs` automatically. An additional instance is safe because D1 holds a single worker lease.
5. Open `/app/mux` or `/admin/mux`, choose **View archive**, and **Refresh archive**. The scan continues when the panel is closed. The local development server/computer must remain running. A hot reload or process interruption can pause work until its two-minute lease expires, then the saved cursor resumes.

## Matching and verification

- Key CSV records by Vimeo ID. Prefer an existing saved Drive file ID, then a filename's explicit `[Vimeo ID]`, then a unique normalized full folder path plus title. Preserve numbers, version suffixes, and word boundaries. `My library` represents the export's empty top-level folder.
- A duration disagreement over three seconds requires review. Missing duration metadata does not disqualify an otherwise unique match. Duplicate title/path matches and two CSV records claiming one file require review, even when duration might identify a likely candidate.
- Explicit manual selection rechecks archive ancestry, download permissions and the latest complete scan. A renamed file keeps its ID-based association. A missing linked file is not silently replaced by another same-named video.
- Scans paginate every discovered folder. Shortcuts are not followed. A new snapshot becomes visible only after the complete scan succeeds; connection errors preserve the previous completed snapshot and never mark all files missing. Refresh resumes a failed scan.
- “Verified” means a uniquely associated accessible Drive file in the last successful scan, not a byte-for-byte quality audit of this2that. Preview/import recheck current access. Import also checks size and the binary content revision (headRevisionId) to avoid combining bytes from a changed file.

## Imports

Jobs are persisted in `archive_imports` and unique by both Vimeo ID and Drive file ID. The worker checks live Mux IDs before creating an upload. Existing Mux assets are reused without rewriting their metadata. A created upload has public playback, `plus` quality (matching current uploads), the Vimeo ID in `meta.external_id`, and the archive job ID in passthrough.

Uploads use 4 MiB byte-range reads from private Drive files and resumable Mux PUTs. The worker queries the receiver's accepted range before each chunk, so a lost acknowledgement or restart does not duplicate transferred bytes. The signed upload URL is encrypted at rest with the existing Drive encryption key and is never returned to the browser. Temporary failures back off and stop after three attempts; Retry resumes the same upload when its content revision still matches. Metadata-only Drive version changes no longer stop new imports. The source is checked before and after each chunk download, including the final chunk. Existing jobs retain their conservative legacy version check until explicitly retried. For a changed source or a legacy job without a content revision, Retry revalidates the source and cancels the incomplete Mux upload before restarting from zero. Already-created assets are reconciled instead of replaced; uncertain cancellation leaves the job stopped. Retry and the worker share the same lease. No database migration is needed: source_version stores tagged revision IDs for new jobs. Expired uploads and processing errors still require review.

Ready assets receive an explicit `unreviewed` library status: link-accessible like other Mux assets, not automatically listed in Our Work. Importing does not create collections or public project listings. Historic title, upload date, client and folder are joined from the archive catalog for the Mux library. The creation date in Mux remains its actual import date. Existing edited Mux metadata is preserved.

## Verification and release boundary

`node --test scripts/test-video-archive.mjs scripts/test-client-hq.mjs` covers conservative matching, CSV quoting, authorization, origin checks, archive ancestry, scan recovery, duplicate jobs, changed source detection, multipart resume after lost acknowledgements, encrypted upload URLs, existing asset reuse and unpublished import defaults. `npm run check:cloudflare-release` checks the static build.

Production uses `workers/archive-driver/wrangler.jsonc`: a Cloudflare cron runs each minute and awaits bounded calls to `/api/internal/archive-worker` for up to 45 seconds (at most 40 steps). D1 leases and cursors allow overlapping invocations and retries to resume safely. Provision the same independent `ARCHIVE_WORKER_SECRET` in the Pages project and driver Worker. The driver exposes no public HTTP endpoint. Its fetches use Cloudflare-supported `redirect: manual`; non-success responses, including redirects, stop the run. `global_fetch_strictly_public` routes Worker-to-Pages requests through the public endpoint. Invocation logging is enabled for diagnosing scheduled failures. Deploy with `npx wrangler deploy --config workers/archive-driver/wrangler.jsonc`. Deploy Pages separately after applying archive migrations and seeding the catalog.

The runtime uses the configured Mux account; local UI import clicks also create real Mux assets unless separate test credentials are configured. Automated tests simulate resumable transfers; a real end-to-end Mux transfer has not yet been validated.

Production migration bookkeeping for 0043–0045 predates this release and is inconsistent with the existing schema. This release applies and records only 0046 and 0047, leaving the older migrations untouched. Seed archive records, label overrides/history and saved Drive associations only; never copy local credentials, sessions or import jobs. Run a fresh production Drive scan after deployment.

Sources: [Mux resumable direct uploads](https://www.mux.com/docs/guides/upload-files-directly), [Drive file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

## Archive client cleanup

**Edit clients** reveals row checkboxes, Select page and Select all matching videos. Search/filter first, then assign an existing or new archive label, or clear it. Selection resets when filters change; selecting all captures the matching IDs, including across pages. **Manage archive clients** shows a searchable checkbox list with video counts. Select multiple labels, then enter an existing or new destination name to combine all their videos in one undoable edit, regardless of video filters. Selections persist while searching. A successful merge clears the selection and destination so the next group can be cleaned up immediately. Each action shows its affected count.

Archive overrides live in `archive_videos.archive_client`; CSV `client` values remain separate. CSV reimports and Drive scans do not overwrite overrides. These actions never write to the shared client directory, Mux metadata, Deck or HQ. Import to Mux uses a separate dropdown of existing main-directory clients (or Unassigned), validated by the server.

**Undo last client edit** persists across reopening and is scoped to the signed-in user. Undo restores the prior overrides as a group; if any affected video has subsequently been edited, it refuses the entire undo rather than overwriting later work. Undoing the latest edit makes the previous edit available again.

Archive import/retry remains an authenticated admin operation because it ingests media and creates public Mux playback. The scoped internal API and personal MCP intentionally do not expose uploads or archive retries; their contracts/scopes are unchanged. The fix runs in Pages functions; the cron driver and MCP Worker need no deployment.

## Import recovery — November 24, 2026

Production Pages deployment `2d392a68` contains the content-revision guard and safe retry recovery. Released from an isolated copy of `8afb23c` plus the archive fix, excluding unrelated local card-editor changes. No migrations or separate Worker deployments were required. Validation: 18 archive tests, 51 MCP/integration tests, TypeScript and Cloudflare release checks passed. The production TSA Faces job (Vimeo `816980733`, 1,054,987,248 bytes) was observed failed at 352,321,536 bytes with legacy source version `8`; no live job was reset during validation. The user must explicitly Retry import to cancel its incomplete upload and restart under the new content-revision check. This verifies the failure path and release, not completion of the real video transfer.
