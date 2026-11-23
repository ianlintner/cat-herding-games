#!/usr/bin/env npx tsx
/**
 * Build every game in games.json into a single dist/ bundle for Azure SWA.
 *
 * Each game stays in its own repo: we shallow-clone its ref into .build/<slug>,
 * install deps, then run Vite with an explicit --base=/<slug>/ so no source
 * change is needed in the game repo. Output is copied to dist/<slug>/.
 *
 * A failing game aborts the whole build; no partial bundle is left behind.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Keep the checked-in index in sync with games.json on every build.
execFileSync(process.execPath, [join(ROOT, 'scripts/generate-site.mjs')], { stdio: 'inherit' });
const BUILD_DIR = join(ROOT, '.build');
const DIST = join(ROOT, 'dist');
const SITE = join(ROOT, 'site');
const MANIFEST = join(ROOT, 'games.json');

/** SWA Free plan app limit, in bytes. Leave a little slack for platform metadata. */
const SWA_FREE_LIMIT_BYTES = 250 * 1024 * 1024;

type Game = {
  slug: string;
  title: string;
  repo: string;
  ref: string;
  workdir: string;
  install: string;
  build: string;
  baseEnv?: string | null;
  output: string;
  submodules?: boolean;
  env?: Record<string, string>;
};

type Manifest = { featured: string; games: Game[] };

function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const display = [cmd, ...args].join(' ');
  console.log(`\n$ (${cwd}) ${display}`);
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw new Error(`${display}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${display} exited with status ${result.status}`);
}

function dirSizeBytes(path: string): number {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += statSync(full).size;
    else if (entry.isSymbolicLink()) total += statSync(full).size;
  }
  return total;
}

function formatBytes(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MiB (${n} bytes)`;
}

/** Clone (or fast-forward) the game repo at the manifest ref. */
function prepareSource(game: Game): string {
  const target = join(BUILD_DIR, game.slug);
  const url = `https://github.com/${game.repo}.git`;
  mkdirSync(BUILD_DIR, { recursive: true });

  if (existsSync(join(target, '.git'))) {
    console.log(`↻ Reusing .build/${game.slug}; fetching ${game.ref}`);
    run('git', ['fetch', '--depth', '1', 'origin', game.ref], target);
    run('git', ['checkout', '--force', 'FETCH_HEAD'], target);
  } else {
    rmSync(target, { recursive: true, force: true });
    console.log(`↓ Shallow-cloning ${game.repo}@${game.ref}`);
    run('git', ['clone', '--depth', '1', '--branch', game.ref, url, target], ROOT);
    if (game.submodules) {
      run('git', ['submodule', 'update', '--init', '--recursive', '--depth', '1'], target);
    }
  }

  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim();
  return sha;
}

function buildGame(game: Game): number {
  const repoRoot = join(BUILD_DIR, game.slug);
  const workdir = join(repoRoot, game.workdir);
  const base = `/${game.slug}/`;

  const [installCmd, ...installArgs] = game.install.split(' ');
  run(installCmd, installArgs, workdir);

  // Override Vite's configured `base` on the command line. All four games use
  // Vite, whose CLI --base takes precedence over vite.config.ts, so no game
  // source needs editing. Nyan Noodle additionally honours VITE_BASE in its
  // config; set both belt-and-braces.
  const env: Record<string, string> = { ...(game.env ?? {}) };
  if (game.baseEnv) env[game.baseEnv] = base;
  const buildArgs = game.build.split(' ');
  run(buildArgs[0], [...buildArgs.slice(1), '--', '--base=' + base], workdir, env);

  const outDir = join(repoRoot, game.output);
  if (!existsSync(join(outDir, 'index.html'))) {
    throw new Error(`Build for ${game.slug} produced no index.html in ${outDir}`);
  }

  const dest = join(DIST, game.slug);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(outDir, dest, { recursive: true });

  const bytes = dirSizeBytes(dest);
  console.log(`✓ ${game.slug}: ${formatBytes(bytes)} → dist/${game.slug}/`);
  return bytes;
}

function main() {
  const only = process.argv.slice(2);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  const games = only.length
    ? manifest.games.filter((g) => only.includes(g.slug))
    : manifest.games;
  if (games.length === 0) throw new Error(`No games matched: ${only.join(', ')}`);

  // Start from a clean dist so a failed game can never leave a half site.
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // Static site assets (index, CSS, thumbnails, favicon, 404).
  cpSync(SITE, DIST, { recursive: true });
  cpSync(join(ROOT, 'staticwebapp.config.json'), join(DIST, 'staticwebapp.config.json'));

  const versions: Record<string, { sha: string; builtAt: string; title: string }> = {};
  let total = dirSizeBytes(DIST);

  for (const game of games) {
    console.log(`\n════════ ${game.title} (${game.slug}) ════════`);
    const sha = prepareSource(game);
    total += buildGame(game);
    versions[game.slug] = { sha, builtAt: new Date().toISOString(), title: game.title };
  }

  writeFileSync(join(DIST, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');

  const finalSize = dirSizeBytes(DIST);
  console.log(`\nTotal dist size: ${formatBytes(finalSize)} (limit ${formatBytes(SWA_FREE_LIMIT_BYTES)})`);
  if (finalSize > SWA_FREE_LIMIT_BYTES) {
    throw new Error(
      `Bundle is ${formatBytes(finalSize)} which exceeds the SWA Free 250 MiB app limit. ` +
        `Trim game assets (public/ directories) before deploying.`,
    );
  }

  console.log(`\n✅ Built ${games.length} game(s) into ${DIST}`);
}

try {
  main();
} catch (err) {
  console.error('\n❌ BUILD FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}
