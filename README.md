# Frame

A small, private video library. Upload videos, organize them into folders, rename or move them, and share individual videos with a link.

## Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui components built on Radix
- Cloudflare Workers for the API and frontend hosting
- Cloudflare R2 for original videos and thumbnails
- Cloudflare D1 for folders, video metadata, and share links
- Self-hosted Inter font; no external frontend services

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run setup
npm run dev
```

Open the URL printed by Vite. `setup` creates `.dev.vars`, generates Worker types, and applies the local database migration. Local R2 and D1 data persist under `.wrangler/state`; a Cloudflare account is not needed for local development.

Localhost uses `DEV_MODE=true` from `.dev.vars` to open the library directly. To test sign-in locally, set `DEV_MODE=false` and give `ADMIN_PASSWORD` a password of at least 12 characters in `.dev.vars`, then restart the dev server. Never commit `.dev.vars`.

## What works

- Multiple video uploads with drag-and-drop, progress, canceling, and retries
- 10 MiB multipart chunks; application limit of 5 GiB per video
- Browser-generated thumbnails and duration metadata
- Create, rename, and delete folders; choose a folder color
- Rename and move videos without copying the underlying files
- Search, sort, and grid/list views
- Private playback and downloads with HTTP range support for seeking
- Public watch pages at `/s/:token`, with download links
- Create and revoke share links; creating a new link after revocation uses a new token
- One password for the library owner; signed, HttpOnly session cookies and login throttling

Deleting a folder keeps its videos in the library. Deleting a video removes its original file and thumbnail and revokes its link. Uploads are private until you explicitly create a share link.

## Deploy to Cloudflare

The project is ready for deployment, but its placeholder D1 ID must first be replaced. Resource creation and deployment use your Cloudflare account.

1. Authenticate and create storage:

   ```sh
   npx wrangler login
   npx wrangler d1 create frame-library
   npx wrangler r2 bucket create frame-videos
   ```

2. Copy the returned D1 `database_id` into `wrangler.jsonc`. Adjust the Worker and bucket names if those names are already in use in your account.

3. Apply the production schema and configure the password:

   ```sh
   npm run db:migrate:remote
   npx wrangler secret put ADMIN_PASSWORD
   ```

   Use a unique password with at least 12 characters. It is also the session signing secret; changing it signs out existing sessions. Do not set `DEV_MODE` in production. The Worker fails closed when no valid password is configured.

4. Build and deploy:

   ```sh
   npm run deploy
   ```

   Open the `workers.dev` URL printed by Wrangler. The library uses one private R2 bucket; folders are logical collections stored in D1. Keep the R2 bucket private so all access goes through the Worker.

## Validation

```sh
npm test
```

`npm test` type-checks and builds the project, then runs integration tests against isolated local Cloudflare storage. Tests do not touch your library or Cloudflare account. Use `npm run typecheck` or `npm run build` to run those checks separately.

## Scope and limits

This is a single-owner library with flat folders. MP4, MOV, WebM, M4V, and OGV uploads are accepted. Original files are served directly from R2; there is no transcoding. Playback depends on browser codec support. H.264/AAC MP4 is a good choice for sharing, and originals are always downloadable.

Uploads can retry individual chunks while the page stays open; reloading the page does not resume an upload. R2 automatically aborts incomplete multipart uploads after its configured lifecycle period (seven days by default). The app does not provide team accounts, nested folders, or adaptive streaming.

## Reference docs

- [Cloudflare React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [R2 multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2 Worker bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [shadcn/ui with Vite](https://ui.shadcn.com/docs/installation/vite)
