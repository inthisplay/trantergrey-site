# Production card updates

Local preview: http://localhost:3100/admin/production. Open a card and write a comment. Full numeric/ISO dates and English month dates produce small date chips. Click a chip to open a tooltip-style confirmation: Filming date, Due date, or Just a reference. Dates without years use the current New York calendar year, shown explicitly. No date is applied without choosing its meaning and posting the comment. Use **Add a card tag** beneath the composer for a shared attention message (80 characters maximum). Comment and chosen fields save atomically. **Manage card tag** is collapsed within Comments for corrections and resolution. Existing comments are not rescanned; editing/deleting a posted comment does not change previously confirmed card fields—use Manage card tag or the Due on property to correct these. **Mark addressed** clears the attention message; clear the date field and save to remove a filming date. **Clear recent additions** dismisses additions through the current time. Opening a card never resolves an update.

One tag is selected in this order:

1. Filming today or within two calendar days.
2. Explicit attention message.
3. Most recent unaddressed question.
4. Filming within 14 calendar days.
5. Latest Mux attachment in a non-deleted local comment or gallery addition from the last seven days, newer than the dismissal time.

Archived cards, completed cards, and cards in the Done column show no tag. Calendar comparisons use America/New_York. Tags open the card at its update panel, comments, or gallery. Existing imported comments are not scanned for Mux additions. Text is never interpreted to infer casting or approval status; use the attention field for these.

The board reads the small signal row with its existing query. Mux detection extends the existing comment aggregate; gallery timestamps use the existing card/deletion/date index. No external API calls, per-card HTTP requests, background jobs, AI inference, or polling are introduced. Saves add one small database upsert and refresh the existing board/detail data. Date and age rules are evaluated when cards render; this is not a live notification feed.

Release migrations are `0050_production_card_signals.sql` and `0051_comment_questions.sql`, following the already deployed `0049_client_logos.sql`. They replace the unreleased local names `0048_production_card_signals.sql` and `0049_comment_questions.sql`. Existing local databases need their migration ledger names updated, not the schema reapplied. For production, apply only these two migrations after verifying they are absent; older migration bookkeeping is incomplete and must not be replayed wholesale.

Validation: `node --test scripts/test-card-signals.mjs`, `npx tsc --noEmit`, and `npm run check:cloudflare-release`. Tests cover priority, expiry, calendar boundaries, dismissal, authorization, origin checks, input validation, deleted cards, and card isolation.

## Dates in notes

Saved notes also show date chips below their content, using the same browser-only parser as comments. Save a notes edit to refresh these suggestions. Choosing Filming date or Due date applies immediately because the notes are already saved; Just a reference leaves card fields unchanged. No background scan or extra read request is needed. References are remembered only while this card is open. Dates in HTML attributes and links are not scanned, only visible note text.

## Multiple filming dates

Confirming filming dates in comments or notes adds to the existing set, deduplicated and sorted. Manage card tag supports adding, editing, and removing individual dates. The board still shows at most one status chip: for example, **Filming Nov 21 +2** for three upcoming dates; hover for the complete saved date list. Past dates remain stored but do not count toward upcoming dates or priority. The nearest upcoming filming date controls the existing 14-day/2-day priority windows. Legacy single dates remain compatible; the existing filming_on field now also accepts JSON arrays, so no new migration or polling is required.

## Questions in comments

New or edited local comments with a visible question mark are flagged at save time. URL query strings, HTML attributes, code blocks, and blockquotes do not count. This is a punctuation heuristic, not language understanding; questions without question marks are not detected. Existing comments are not backfilled.

The most recent unaddressed, non-deleted question produces “Greyson asked a question” using the author's first name, and opens that exact comment. It ranks below imminent filming and explicit attention messages, but above other filming dates and recent additions. It does not expire. Any signed-in team member can mark a question addressed or reopen it on the comment. Resolving the latest question reveals any older outstanding question. Opening the card, posting a reply, and clearing recent additions do not resolve questions. Editing away the question or deleting the comment removes it from eligibility. Editing an already addressed question does not automatically reopen it.

Migration 0051 adds two small comment fields and a partial index; apply it with 0050 before deploying the Deck release. Detection runs during the existing comment write; the existing board request returns an indexed question summary, with no new per-card HTTP requests, polling, or external AI calls. Validation: `node --test scripts/test-comment-questions.mjs scripts/test-card-signals.mjs`.
