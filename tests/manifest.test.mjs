import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));

test('manifest has all four expected games with unique slugs', () => {
  const slugs = manifest.games.map((g) => g.slug);
  assert.deepEqual(slugs.sort(), [
    'monster-league-arcade',
    'nyan-noodle',
    'primordial-swamp',
    'space-tycoon',
  ]);
});

test('each game has the fields required by the builder', () => {
  for (const game of manifest.games) {
    assert.match(game.slug, /^[a-z0-9-]+$/, `${game.slug}: slug must be URL-safe`);
    assert.match(game.repo, /^ianlintner\/[A-Za-z0-9._-]+$/, `${game.slug}: repo`);
    assert.ok(game.ref, `${game.slug}: ref`);
    assert.ok(game.install, `${game.slug}: install`);
    assert.ok(game.build, `${game.slug}: build`);
    assert.ok(game.output, `${game.slug}: output`);
    assert.ok(game.thumbnail?.startsWith('/thumbnails/'), `${game.slug}: thumbnail`);
    assert.ok(game.blurb, `${game.slug}: blurb`);
    assert.ok(Array.isArray(game.tags) && game.tags.length > 0, `${game.slug}: tags`);
  }
});

test('featured game exists in the manifest', () => {
  const featured = manifest.games.find((g) => g.slug === manifest.featured);
  assert.ok(featured, `featured=${manifest.featured} not found`);
  assert.equal(featured.featured, true);
});

test('site index links to every game slug with a play link and source link', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  for (const game of manifest.games) {
    assert.match(html, new RegExp(`href="/${game.slug}/"`.replaceAll('/', '\\/')), `play link for ${game.slug}`);
    assert.ok(html.includes(`https://github.com/${game.repo}`), `source link for ${game.slug}`);
    assert.ok(html.includes(game.thumbnail), `thumbnail for ${game.slug}`);
  }
});
