# PostPilot

A social media manager: write a post once, adjust it for each network, preview it as it will look, and publish now or schedule it. It supports Facebook, Instagram, TikTok, X, LinkedIn and YouTube Shorts, and teams can manage several brands or clients.

> **Demo mode.** Publishing is simulated by mock connectors, so nothing is sent to the real networks. Every connector implements the same interface (`src/lib/connectors/types.ts`), so real APIs can replace the mocks later without changing the UI.

## Getting started

Requires Node.js 20 or newer and a `.env` file (see **Database** below).

```bash
npm install
npm run setup     # applies migrations to the dev schema and loads demo data
npm run dev       # http://localhost:3000
```

Demo logins (local only, created by `prisma/seed.ts`):

| Email | Password | Role |
| --- | --- | --- |
| owner@demo.test | password123 | Owner of both demo workspaces |
| viewer@demo.test | password123 | Viewer (read-only) |

Or sign up to create your own account and workspace.

## Database

The app uses Postgres on Neon. One database holds three separate schemas:

| Schema | Used by | Contents |
| --- | --- | --- |
| `public` | Production | Your team's real data. Never seeded or wiped. |
| `dev` | `npm run dev` on your computer | Demo data; `npm run db:seed` resets it. |
| `postpilot_test` | `npm test` | Wiped by the tests. |

`.env` (never committed) holds:

```
DATABASE_URL="<Neon pooled URL>&connect_timeout=15&schema=dev"   # app connections
DIRECT_URL="<Neon direct URL>&connect_timeout=15&schema=dev"     # migrations
SESSION_SECRET="<random 64 hex characters>"
```

The direct URL is the pooled one without `-pooler` in the host name. `connect_timeout` gives Neon time to wake a suspended database. For production, use the same URLs **without** `&schema=dev`.

- To change the data model, edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` against the dev schema, and commit the new migration folder.
- To apply migrations in any environment, run `npm run db:migrate`.
- The seed refuses to run against `public`.

Host the app in the same region as the database (currently AWS us-east-1). Every page makes several queries, and from far away each one takes about 0.3 s.

## Features

- **Workspaces** for each brand or client, with a switcher in the sidebar. Roles: *owner* (accounts and team), *editor* (create and schedule), *viewer* (read-only). Invite teammates with a link from Team & settings.
- **Accounts:** connect simulated accounts for each network.
- **Composer:** one caption for every network, with optional custom captions per network. Upload images and videos, then choose which media each network gets (e.g. the photo for Instagram, the video for TikTok). Per-network crop (1:1, 4:5, 9:16, 16:9, 1.91:1) with a focal point, and settings such as the YouTube title, TikTok privacy, comments and duet, LinkedIn visibility, Instagram Feed or Reel, and a first comment. It also has an emoji picker, your most-used hashtags, and character counters for each network.
- **Live previews** styled like each network's feed, including caption truncation ("...more").
- **Validation** against each network's rules (caption length, hashtags, media count and type, video length, aspect ratio, required fields) before anything can be scheduled.
- **Scheduling** with a time zone picker, publish now, or save as a draft. Tick "Post at a different time on each network" to give each network its own date and time (e.g. Facebook today 5:00 PM, Instagram tomorrow 7:00 AM).
- **Calendar** with month and week views: drag posts to reschedule, drag drafts onto a day, click a day to start a post, and filter by network or account. A post with several times shows one chip per time (marked ⧉), and dragging a chip moves only those networks.
- **Post bank:** a library of reusable posts that aren't tied to a time. Save from the composer with **Save to bank**, or add one on the Post bank page. **Use** starts a new post pre-filled with its caption, media, network tweaks and suggested accounts, and the bank copy stays. Each item shows how often it's been used.
- **Posts list** with status filters, retry for failed posts, unschedule, duplicate and delete.
- **Dashboard** showing counts, upcoming posts, connected accounts and recent activity.

## How publishing works

`src/server/publisher.ts` runs inside the Next.js server and is started from `src/instrumentation.ts`. Every 60 seconds (set with `SCHEDULER_INTERVAL_MS`) it wakes up, but it only reads the database when a post is due, after a post was changed, or once an hour as a safety check. That lets a free Neon database sleep, because a check every minute would use up its monthly compute. When posts are due, it claims each version atomically, so no version is published twice. It then calls that network's connector. A failure is retried after 1 minute and then after 2 more; the third failure marks the version FAILED. The post's status (Published, Partial, Failed...) is derived from its versions.

To test failures, put `#fail` in a caption, or set `MOCK_FAIL_RATE` in `.env` (0 to 1).

## Deploying on Render

Create a **Web Service** from this repository in the **Virginia (US East)** region, next to the database:

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npx prisma migrate deploy && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Set the variables from `.env.example`, with these differences:
- Leave `&schema=dev` out of the database URLs.
- Leave `R2_PREFIX` unset.
- Use a new `SESSION_SECRET` and a new `TOKEN_ENCRYPTION_KEY`.
- Set `APP_URL` to the service's https address.
- Set `MOCK_FAIL_RATE` to `0`.

**Free plan:** Render stops a free service after 15 minutes without traffic, and scheduled posts can't go out while it's stopped. To keep it awake, create a job at [cron-job.org](https://cron-job.org) that calls `https://YOUR-APP.onrender.com/api/health` every minute. That address never touches the database. **To upgrade later,** change the instance type to Starter and delete the cron job; nothing else changes.

## Media storage (Cloudflare R2)

Browsers upload straight to R2 using a short-lived signed link, so large videos don't pass through the server's memory.

1. In the bucket's **Settings**, turn on public access (Public Development URL or a custom domain) and use that address as `R2_PUBLIC_URL`. The networks fetch media from it.
2. Add this CORS policy in the same place, using your own app address:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://YOUR-APP.onrender.com"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
3. Create an **R2 API token** with Object Read & Write access to this bucket only, and set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

Without these settings, local development saves uploads to the `uploads/` folder, and production refuses uploads.

## Project layout

```
prisma/schema.prisma        data model (Postgres)
prisma/migrations/          database migrations
prisma/seed.ts              demo data
src/lib/platforms.ts        rules for each network (limits, crops, options)
src/lib/validation.ts       validateVariant(): errors and warnings for each network
src/lib/connectors/         connector interface, mock and Meta connectors, registry
src/lib/meta.ts             Meta Graph API and Facebook sign-in
src/server/publisher.ts     scheduler, publishing, retries
src/lib/r2.ts               Cloudflare R2 storage (signed uploads)
src/app/actions/            server actions (auth, workspaces, accounts, posts)
src/app/w/[slug]/           dashboard, compose, calendar, posts, accounts, settings
src/components/previews/    network previews
src/components/composer/    composer and media uploader
tests/                      Vitest tests (validation and scheduler)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Runs tests against the `postpilot_test` schema |
| `npm run lint` | ESLint |
| `npm run db:seed` | Resets the dev schema to demo data |
| `npm run db:migrate` | Applies migrations |

## Going live with real networks

### Facebook and Instagram (built)

Owners connect real accounts on the Accounts page with **Connect with Facebook**: Facebook's sign-in asks which Pages to share, then PostPilot's page picker saves the chosen Pages and their linked Instagram professional accounts. Page tokens are stored encrypted with `TOKEN_ENCRYPTION_KEY`. Code: `src/lib/meta.ts` (Graph API and sign-in), `src/app/api/connect/meta/`, `src/app/w/[slug]/accounts/meta/` (page picker) and `src/lib/connectors/meta.ts` (publishing).

1. In the Meta app, add the use cases **Manage everything on your Page** and **Manage messaging & content on Instagram**, with `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `business_management`, `instagram_basic` and `instagram_content_publish`.
2. Under **Facebook Login for Business**, add `APP_URL/api/connect/meta/callback` to **Valid OAuth Redirect URIs**, and create a **Configuration** with those permissions and the Pages and Instagram assets.
3. Set `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `APP_URL` and `TOKEN_ENCRYPTION_KEY`.

While the Meta app is in development mode, only people listed under its **App roles** can connect. Anyone can after App Review approves the permissions. Media must be in R2, because Meta downloads it from its URL. Instagram publishes the original image, so its aspect ratio must be between 4:5 and 1.91:1; the composer's crop is only a preview. First comments need `pages_manage_engagement` (Facebook) and `instagram_manage_comments` (Instagram); without them the post still goes out and the comment is skipped.

### Other networks

1. Create developer apps: TikTok (Content Posting API), X API (posting requires a paid tier), LinkedIn (Community Management API) and Google (YouTube Data API). TikTok reviews apps before they can publish publicly.
2. Write a connector for each network that implements `PlatformConnector` with its own `provider`, add a sign-in flow like Meta's, and return it from `getConnector()` in `src/lib/connectors/index.ts`.
3. For production, set a strong `SESSION_SECRET`, and run the scheduler as one dedicated process if you run several web servers.

## Known limits (v1)

- Uploaded files are public at unguessable URLs, because the networks must be able to fetch them.
- Invites are shown as a link; no email is sent.
- Media dimensions are measured in the browser; the server doesn't re-encode or check the files.
