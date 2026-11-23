# Private Deck and Rolodex previews

This Worker has no public route. Pages calls it through `MEDIA_OPTIMIZER` after storing an upload. Authenticated media GET routes can also request a missing preview. Original objects, database URLs and download links remain unchanged.

Images receive a 480px WebP thumbnail and a 1600px WebP preview (fit inside these bounds, without upscaling). Videos receive a 640px JPEG poster; playback uses the original movie. An image derivative larger than its original reuses the original. Animated image previews are static; the original retains animation.

D1 records each source key and variant. A conditional lease prevents duplicate work, including concurrent requests through different profiles that share a file. Results are stored in R2 under `media-previews/v1/`. Private media routes authenticate and check source availability before serving variants, with a one-day private browser cache. Nothing is added to a public CDN cache.

The Worker reserves a budget slot before each transformation, including failed attempts, and stops at **4,500 attempts per UTC calendar month** across images and posters. This leaves 500 of Cloudflare's shared 5,000 allowance for other use, but does not track transformations initiated by other apps. No paid plan is enabled by this configuration. Budget deferrals retry the following month; failures retry after 24 hours. Originals remain available if processing cannot complete. Images over 20 MiB, videos over 100 MiB, or unsupported codecs may require an offline derivative. New app uploads are already limited to 90 MiB.

Deploy the database migration and Worker before deploying Pages:

```sh
npx wrangler d1 execute trantergrey-site-data --remote --file migrations/0043_media_previews.sql
npx wrangler deploy --config workers/media-optimizer/wrangler.jsonc
npm run check:cloudflare-release
npx wrangler pages deploy out --project-name trantergrey-site-git --branch main
```

The migration is one-time; don't execute it again after its tables exist. Worker bindings use the same private D1 database and R2 bucket as Pages. For an authorized bulk backfill, use a temporary authenticated Wrangler remote dev session and POST `{ "key": "original-r2-key", "variant": "thumb|preview|poster" }` to its localhost endpoint. Only source keys referenced by stored attachments or active media records are accepted. Stop the remote dev session when finished. Keep source manifests and personal media outside the repository.

Validation: `node scripts/test-media-previews.mjs`, `node scripts/test-rolodex.mjs`, `node scripts/test-card-gallery.mjs`, and `node scripts/test-comment-media.mjs`.
