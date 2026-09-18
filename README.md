# Frame

A small, self-hosted video library that runs entirely on Cloudflare. Upload videos, organize them into folders, and share a single video or a whole folder with a link. No account is needed to watch.

Frame is built for one owner: you sign in with a single password, and everything stays private until you create a share link.

## Features

- **Uploads**: drag-and-drop multiple videos with progress, cancel, and per-chunk retries (10 MiB multipart chunks, up to 5 GiB per video)
- **Library**: folders with colors, rename and move videos without copying files, search, sort, and grid or list views
- **Playback**: browser-generated thumbnails and durations; streaming with HTTP range support for seeking; originals always downloadable
- **Sharing**: public video pages at `/s/:token` and folder pages at `/f/:token`; links can be revoked at any time, and a new link after revocation gets a new token
- **Security**: one owner password, signed HttpOnly session cookies, login throttling, and a private R2 bucket reachable only through the Worker

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix) |
| API and hosting | Cloudflare Workers |
| Video and thumbnail storage | Cloudflare R2 |
| Folders, metadata, share links | Cloudflare D1 |

The frontend self-hosts its font and calls no external services.

## Quick start (local)

Requires Node.js 22.12 or newer. You don't need a Cloudflare account for local development.

```sh
npm install
npm run setup
npm run dev
```

Open the URL printed by Vite. `npm run setup` creates `.dev.vars` from `.dev.vars.example`, generates Worker types, and applies the database migrations locally. Local R2 and D1 data persist under `.wrangler/state`.

By default, `DEV_MODE=true` in `.dev.vars` opens the library without signing in. To test sign-in, set `DEV_MODE=false` and give `ADMIN_PASSWORD` at least 8 characters, then restart the dev server. `.dev.vars` is gitignored; never commit it.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | `.dev.vars` locally, a Worker secret in production | Owner password (8+ characters). Also signs session cookies, so changing it signs everyone out. |
| `DEV_MODE` | `.dev.vars` only | `true` skips sign-in on localhost. **Never set in production.** |

If no valid password is configured, the Worker fails closed.

## Deploy to your Cloudflare account

`wrangler.jsonc` points at the original author's D1 database. Create your own resources first:

1. **Log in and create storage**

   ```sh
   npx wrangler login
   npx wrangler d1 create frame-library
   npx wrangler r2 bucket create frame-videos
   ```

2. **Update `wrangler.jsonc`**: paste the `database_id` printed by the D1 command. If any names are already taken in your account, change the Worker `name`, `database_name`, or `bucket_name`. If you rename the database, update the `db:migrate` scripts in `package.json` too.

3. **Apply the schema and set the password**

   ```sh
   npm run db:migrate:remote
   npx wrangler secret put ADMIN_PASSWORD
   ```

4. **Build and deploy**

   ```sh
   npm run deploy
   ```

   Open the `workers.dev` URL printed by Wrangler. Keep the R2 bucket private so all access goes through the Worker.

### Deploying from Git (Workers Builds)

If you connect the repository in the Cloudflare dashboard, go to your Worker's **Settings → Builds → Build configuration** and set:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory | `/` |

A fresh checkout contains neither `dist/client` nor the generated Worker config, so the build command is required. If you leave it empty, use `npm run deploy` as the deploy command instead. That builds and deploys, but preview branches still need a build step before `wrangler versions upload`. Workers Builds ignores Wrangler's custom `build.command`; see [Cloudflare's build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

**Troubleshooting:** if a deployment reports that `dist/client` does not exist, check the build command. Don't commit `dist` or point the asset directory at the source files. The npm `allow-scripts` warnings in the install log are unrelated.

## How sharing works

- New uploads are private until you create a share link.
- A **video link** plays and downloads that video until you revoke it, even if you move the video to another folder.
- A **folder link** shows the ready videos currently in that folder, including ones you add later. Moving a video out removes it from the folder page.
- **Deleting a folder** keeps its videos in the library and turns off the folder link.
- **Deleting a video** removes the original file and thumbnail and revokes its link.

## Testing

```sh
npm test
```

This type-checks and builds the project, then runs integration tests against isolated local Cloudflare storage. The tests never touch your library or your Cloudflare account. Run `npm run typecheck` or `npm run build` on their own for just those checks.

## Limits

- One owner and flat folders only: no team accounts and no nested folders.
- Accepts MP4, MOV, WebM, M4V, and OGV. Files are served as uploaded, with no transcoding or adaptive streaming, so playback depends on the browser's codec support. H.264/AAC MP4 is the safest choice for sharing.
- A failed chunk retries while the page stays open, but reloading the page doesn't resume an upload. R2 aborts incomplete multipart uploads after its lifecycle period (seven days by default).

## References

- [Cloudflare React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [R2 multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2 Worker bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [shadcn/ui with Vite](https://ui.shadcn.com/docs/installation/vite)

## License

[MIT](LICENSE)
