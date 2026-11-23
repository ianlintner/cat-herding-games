# Cat Herding Games

One Azure Static Web App (https://games.cat-herding.net) serving a small cat-themed index plus four games, each under its own subpath:

| Path | Game repo |
|---|---|
| `/nyan-noodle/` | [ianlintner/nyan-noodle](https://github.com/ianlintner/nyan-noodle) |
| `/monster-league-arcade/` | [ianlintner/monster-league-arcade](https://github.com/ianlintner/monster-league-arcade) |
| `/space-tycoon/` | [ianlintner/space-tycoon](https://github.com/ianlintner/space-tycoon) |
| `/primordial-swamp/` | [ianlintner/PrimordialSwamp](https://github.com/ianlintner/PrimordialSwamp) |

The games remain in separate repositories — this hub is a build-and-deploy orchestrator, not a monorepo.

## Architecture

```
games.json  ──▶ scripts/build-all.ts ──▶ dist/<slug>/   (one bundle)
     │                                        │
     └──▶ scripts/generate-site.mjs ──▶ dist/index.html
                                              │
                         Azure SWA deploy ◀───┘  (app_location: dist)
```

`scripts/build-all.ts` shallow-clones each game's `ref` (default `main`) into `.build/<slug>`, runs its `install` and `build` commands, passes `--base=/<slug>/` to Vite so no game repo needs editing for subpath hosting, then copies the declared `output` directory into `dist/<slug>/`. It writes `dist/versions.json` with each game's commit SHA and build time. Any failure aborts immediately — no half-built site is ever deployed. The total bundle size is checked against the SWA Free 250 MiB app limit (currently ~108 MiB).

`staticwebapp.config.json` supplies security headers, cache rules, a 404 page, and immutable caching for hashed assets. All game repos use real static files rather than history-based client routing, so no per-game SPA fallback rewrite is needed.

## Adding a game

1. Add one entry to `games.json` with `slug`, `title`, `repo`, `ref`, `workdir`, `install`, `build`, `output`, `thumbnail`, `blurb`, `status` and `tags`. Optionally set `env` (public build-time values), `submodules`, `baseEnv` and `smokePath`.
2. Run `npm run build` — the index page is regenerated from the manifest automatically.
3. Add a thumbnail at `site/thumbnails/<slug>.svg` (a real screenshot is preferred).
4. Commit and let CI build and smoke-test. No other code changes are needed.

## Deploy triggers

`.github/workflows/deploy.yml`:

- **Pull requests**: build all games, serve `dist/` locally, run the Playwright smoke test (index, every card link, every game's canvas, asset requests and console errors). No deploy.
- **Push to `main`** / **workflow_dispatch**: build, smoke-test, upload the tested `dist/` as an artifact, deploy that exact artifact with `Azure/static-web-apps-deploy@v1` (`app_location: dist`, `skip_app_build: true`), then smoke-test the live URL.
- **Every 30 minutes**: compare each game's current `main` SHA against the live `versions.json`; exit early when nothing changed, otherwise build/deploy/smoke as above.

The legacy hosts are served by a second tiny SWA deployed from `redirects/` (`dinosaur.cat-herding.net` → `/primordial-swamp/`, `space-tycoon.cat-herding.net` → `/space-tycoon/`). It needs a `AZURE_SWA_REDIRECTS_TOKEN` repository secret; the job warns and skips when absent.

> **Scheduled-workflow risk:** GitHub disables scheduled workflows after 60 days of repository inactivity. Pushes (including game-version rebuilds) and manual dispatches reset that clock. If the repo goes quiet for two months, re-enable the schedule in Actions settings or run a manual dispatch.

## Known upstream subpath blockers

Two games build under `/<slug>/` but still request some assets at root-absolute paths from their own source. The hub deliberately does **not** patch game source; these are tracked for follow-up cards in those repos and encoded as allowed-missing prefixes in `games.json` so the smoke test still catches any *new* breakage:

- **monster-league-arcade**: `index.html` links `/football/` and `/hockey/` and the football game loads `/assets/atlas.json`, `/assets/sprites/*` and `/assets/arenas/*`. Required fix: use `import.meta.env.BASE_URL` for asset URLs and prefix internal links with the Vite base path (or set `VITE_BASE` as nyan-noodle already does).
- **primordial-swamp**: 42 game assets live in repo-root `assets/`, which Vite does not copy (only `public/` is copied), and runtime URLs are root-absolute. Required fix: move `assets/` into `public/assets/` (or set `publicDir: 'assets'`), and load them relative to `import.meta.env.BASE_URL`.

Until those fixes land, the games' JS bundles and canvas render correctly, but some sprites/audio/images fall back or stay blank.

## Local commands

```sh
npm ci
npm run build                      # builds all four games into dist/
npm run serve                      # serves dist/ on 127.0.0.1:4173
npm test                           # manifest unit tests
npm run smoke                      # Playwright smoke (needs a server or SMOKE_BASE_URL)
SMOKE_BASE_URL=https://games.cat-herding.net npm run smoke
```
