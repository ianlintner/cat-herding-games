# Cat Herding Games

One Azure Static Web App (https://games.cat-herding.net) serving a small cat-themed index plus six games, each under its own subpath:

| Path | Game repo |
|---|---|
| `/nyan-noodle/` | [ianlintner/nyan-noodle](https://github.com/ianlintner/nyan-noodle) |
| `/monster-league-arcade/` | [ianlintner/monster-league-arcade](https://github.com/ianlintner/monster-league-arcade) |
| `/space-tycoon/` | [ianlintner/space-tycoon](https://github.com/ianlintner/space-tycoon) |
| `/primordial-swamp/` | [ianlintner/PrimordialSwamp](https://github.com/ianlintner/PrimordialSwamp) |
| `/astrolog/` | [ianlintner/Astrolog](https://github.com/ianlintner/Astrolog) (static, no build) |
| `/cat-herding/` | NES homebrew (WIP), private repo `ianlintner/cat-herding`; ROM committed here and played with [jsnes](https://github.com/bfirsh/jsnes) |

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

## Game kinds

`kind` in `games.json` selects how a game is built (default `vite`):

- `vite`: clone, `install`, `build` with `--base=/<slug>/`, copy `output`.
- `static`: clone, no install/build; copy only the paths in `include` (relative to `workdir`) to `dist/<slug>/`. Used by **astrolog** (`index.html`, `game.js`, `src/`). Its page loads `src/game.js` and ES modules by relative URL and has no root-absolute references, so it works under `/astrolog/` with no source changes.
- `nes-rom`: the ROM and its `PROVENANCE.json` are **committed in this repo**; the build never clones the source repo (private). It copies the player template (`games/<slug>/player/`), the ROM, the provenance file and `node_modules/jsnes/dist/jsnes.min.js` (+ its Apache-2.0 licence) to `dist/<slug>/`, and fails if the ROM's sha256 or size differs from `PROVENANCE.json`. Cards may set `label` (shown as a badge) and `private: true` (hides the Source link).

## Updating the cat-herding ROM

The ROM is a build artifact of the private `ianlintner/cat-herding` repo (`make` → `build/catherding.nes`). To publish a new build:

1. Build it in the source repo and note the commit (`git rev-parse HEAD`).
2. Replace `games/cat-herding/catherding.nes` with the new file.
3. Update `games/cat-herding/PROVENANCE.json` in the same commit: `sourceCommit`, `sha256` (`sha256sum catherding.nes`), `bytes`, `buildDate`.
4. Open a PR (IkitClaw App) and let CI run. `npm test` and the build both verify that file and provenance agree, and the smoke test checks the ROM fetches with HTTP 200 and the canvas is non-blank after about 3 s of emulation. The size assertion in `tests/smoke.spec.ts` (`romBytes`) must be updated if the ROM size changes.

Never clone the private repo from CI. The player (`games/cat-herding/player/`) supports keyboard (arrows, Z/X, Enter, Shift), Gamepad API, on-screen touch buttons, integer nearest-neighbour scaling, click-to-start Web Audio and pausing when the tab is hidden.

## Adding a game

1. Add one entry to `games.json` with `slug`, `title`, `repo`, `ref`, `workdir`, `install`, `build`, `output`, `thumbnail`, `blurb`, `status` and `tags`. Optionally set `env` (public build-time values), `submodules`, `baseEnv` and `smokePath`.
2. Run `npm run build` — the index page is regenerated from the manifest automatically.
3. Add a thumbnail at `site/thumbnails/<slug>.svg` (a real screenshot is preferred).
4. Commit and let CI build and smoke-test. No other code changes are needed.

## Deploy triggers

`.github/workflows/deploy.yml`:

- **Pull requests**: build all games, serve `dist/` locally, run the Playwright smoke test (index, every card link, every game's canvas, asset requests and console errors). No deploy.
- **Push to `main`** / **workflow_dispatch**: build, smoke-test, upload the tested `dist/` as an artifact, deploy that exact artifact with the SHA-pinned `Azure/static-web-apps-deploy@v1` (`app_location: dist`, `skip_app_build: true`), then smoke-test the live URL.
- **Every 30 minutes**: compare each game's SHA at its manifest `ref` against the live `versions.json`; exit early when nothing changed, otherwise build/deploy/smoke as above.

Unit tests (`npm test`) and typecheck run on every workflow trigger before the build. Deploy runs share a non-cancelling concurrency group so a scheduled tick or PR push can never kill an in-flight SWA upload or live smoke test; PR runs may cancel superseded PR pushes. Third-party actions are pinned to commit SHAs.

The legacy hosts are served by two tiny redirect SWAs, both deployed from the same `redirects/` folder (identical host map): `cat-herding-redirects` (`dinosaur.cat-herding.net` → `/primordial-swamp/`, `space-tycoon.cat-herding.net` → `/space-tycoon/`; secret `AZURE_SWA_REDIRECTS_TOKEN`) and `cat-herding-redirects-2` (RG `nekoc`, `ashy-moss-03f23a610.6.azurestaticapps.net`; `astrolog.cat-herding.net` → `/astrolog/`; secret `AZURE_SWA_REDIRECTS_2_TOKEN`). Two SWAs are needed because Free SWAs allow only two custom domains each. `staticwebapp.config.json` in `redirects/` falls back all deep paths to `/index.html` so path-preserving JS runs on any legacy URL. The job warns and skips any SWA whose secret is absent. The 30-minute upstream-change check skips `nes-rom` games (committed ROM, private source).

> **Scheduled-workflow risk:** GitHub disables scheduled workflows after 60 days of repository inactivity. Pushes (including game-version rebuilds) and manual dispatches reset that clock. If the repo goes quiet for two months, re-enable the schedule in Actions settings or run a manual dispatch.

## Known upstream subpath blockers

One game still builds under `/<slug>/` but requests some assets at root-absolute paths from its own source. The hub deliberately does **not** patch game source; this is tracked for a follow-up card in that repo and encoded as allowed-missing prefixes in `games.json` so the smoke test still catches any *new* breakage:

- **primordial-swamp**: 42 game assets live in repo-root `assets/`, which Vite does not copy (only `public/` is copied), and runtime URLs are root-absolute. Required fix: move `assets/` into `public/assets/` (or set `publicDir: 'assets'`), and load them relative to `import.meta.env.BASE_URL`.

Until that fix lands, the game's JS bundle and canvas render correctly, but some sprites/audio/images fall back or stay blank.

## Local commands

```sh
npm ci
npm run build                      # builds all six games into dist/
npm run serve                      # serves dist/ on 127.0.0.1:4173
npm test                           # manifest unit tests
npm run smoke                      # Playwright smoke (needs a server or SMOKE_BASE_URL)
SMOKE_BASE_URL=https://games.cat-herding.net npm run smoke
```
