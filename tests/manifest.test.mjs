import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));
const kindOf = (g) => g.kind ?? 'vite';

test('manifest has all six expected games with unique slugs', () => {
  const slugs = manifest.games.map((g) => g.slug);
  assert.deepEqual(slugs.sort(), [
    'astrolog',
    'cat-herding',
    'monster-league-arcade',
    'nyan-noodle',
    'primordial-swamp',
    'space-tycoon',
  ]);
});

test('each game has the fields required by the builder for its kind', () => {
  for (const game of manifest.games) {
    assert.match(game.slug, /^[a-z0-9-]+$/, `${game.slug}: slug must be URL-safe`);
    assert.match(game.repo, /^ianlintner\/[A-Za-z0-9._-]+$/, `${game.slug}: repo`);
    assert.ok(game.ref, `${game.slug}: ref`);
    assert.ok(['vite', 'static', 'nes-rom'].includes(kindOf(game)), `${game.slug}: kind`);
    assert.ok(game.thumbnail?.startsWith('/thumbnails/'), `${game.slug}: thumbnail`);
    assert.ok(game.blurb, `${game.slug}: blurb`);
    assert.ok(Array.isArray(game.tags) && game.tags.length > 0, `${game.slug}: tags`);
    if (kindOf(game) === 'vite') {
      assert.ok(game.install, `${game.slug}: install`);
      assert.ok(game.build, `${game.slug}: build`);
      assert.ok(game.output, `${game.slug}: output`);
    }
  }
});

test('astrolog is a static game with no build step and an explicit file list', () => {
  const g = manifest.games.find((x) => x.slug === 'astrolog');
  assert.equal(g.kind, 'static');
  assert.ok(!g.install && !g.build, 'no install/build');
  assert.deepEqual(g.include, ['index.html', 'game.js', 'src']);
});

test('cat-herding is an nes-rom game whose committed ROM matches PROVENANCE.json', () => {
  const g = manifest.games.find((x) => x.slug === 'cat-herding');
  assert.equal(g.kind, 'nes-rom');
  assert.equal(g.label, 'NES homebrew (WIP)');
  assert.equal(g.private, true);
  const rom = readFileSync(join(ROOT, g.rom));
  const prov = JSON.parse(readFileSync(join(ROOT, g.provenance), 'utf8'));
  assert.equal(createHash('sha256').update(rom).digest('hex'), prov.sha256);
  assert.equal(rom.length, prov.bytes);
  assert.match(prov.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(prov.sourceRepo, 'ianlintner/cat-herding');
  assert.ok(prov.buildDate);
  for (const f of ['index.html', 'player.js', 'player.css']) {
    assert.ok(existsSync(join(ROOT, g.player, f)), `player/${f}`);
  }
});

test('featured game exists in the manifest', () => {
  const featured = manifest.games.find((g) => g.slug === manifest.featured);
  assert.ok(featured, `featured=${manifest.featured} not found`);
  assert.equal(featured.featured, true);
});

test('site index links to every game slug with a play link, thumbnail and (public) source link', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  for (const game of manifest.games) {
    assert.match(html, new RegExp(`href="/${game.slug}/"`.replaceAll('/', '\\/')), `play link for ${game.slug}`);
    assert.ok(html.includes(game.thumbnail), `thumbnail for ${game.slug}`);
    assert.ok(existsSync(join(ROOT, 'site', game.thumbnail)), `thumbnail file for ${game.slug}`);
    const hasSource = html.includes(`href="https://github.com/${game.repo}"`);
    assert.equal(hasSource, !game.private, `source link for ${game.slug} (private=${!!game.private})`);
  }
  assert.ok(html.includes('NES homebrew (WIP)'), 'index card label');
});

test('redirects page maps every legacy host to its game slug', () => {
  const html = readFileSync(join(ROOT, 'redirects/index.html'), 'utf8');
  for (const [host, slug] of [
    ['dinosaur.cat-herding.net', 'primordial-swamp'],
    ['space-tycoon.cat-herding.net', 'space-tycoon'],
    ['astrolog.cat-herding.net', 'astrolog'],
  ]) {
    assert.ok(html.includes(`'${host}': '/${slug}/'`), `${host} -> /${slug}/`);
  }
});

test('deploy workflow deploys the same redirects folder to both redirect SWAs', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.ok(yml.includes('AZURE_SWA_REDIRECTS_TOKEN'));
  assert.ok(yml.includes('AZURE_SWA_REDIRECTS_2_TOKEN'));
  assert.equal((yml.match(/app_location: redirects/g) ?? []).length, 2);
});
