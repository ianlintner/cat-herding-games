import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));

/**
 * Azure Static Web Apps route rules (docs: aka.ms/swa/configuration):
 *   - a route may contain at most one '*' character;
 *   - the wildcard is supported at the end of a path, optionally followed by
 *     an extension filter such as '.html' or '.{png,jpg,gif}'.
 * The deploy validator rejects a route with two or more wildcards outright,
 * so pin that invariant here. The builder copies this file verbatim into
 * dist/, so validating the root config validates the deployed one too; also
 * check a local dist/ copy when a build has produced one.
 */
const WILDCARD_FILTER = /^(?:\.[A-Za-z0-9]+|\.\{[A-Za-z0-9,.]+\})?$/;

function assertValidRoute(route, where) {
  assert.equal(typeof route, 'string', `${where}: route must be a string`);
  assert.ok(route.startsWith('/'), `${where}: route must start with '/': ${route}`);

  const stars = [...route].filter((c) => c === '*').length;
  assert.ok(stars <= 1, `${where}: route has ${stars} wildcards (max 1): ${route}`);

  if (stars === 1) {
    const suffix = route.slice(route.indexOf('*') + 1);
    assert.match(suffix, WILDCARD_FILTER, `${where}: wildcard must end the path or precede an extension filter: ${route}`);
  }
}

function assertValidConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(Array.isArray(config.routes), `${path}: routes must be an array`);
  for (const rule of config.routes) {
    assertValidRoute(rule.route, path);
  }
  // navigationFallback.exclude entries use the same wildcard pattern syntax.
  for (const pattern of config.navigationFallback?.exclude ?? []) {
    assertValidRoute(pattern, `${path} navigationFallback.exclude`);
  }
}

test('staticwebapp.config.json routes obey the SWA one-wildcard rule', () => {
  assertValidConfig(join(ROOT, 'staticwebapp.config.json'));
});

test('deployed dist/staticwebapp.config.json obeys the SWA one-wildcard rule when present', () => {
  const deployed = join(ROOT, 'dist/staticwebapp.config.json');
  if (existsSync(deployed)) assertValidConfig(deployed);
});

test('every game slug has a one-wildcard assets cache route', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'staticwebapp.config.json'), 'utf8'));
  const routes = new Set(config.routes.map((r) => r.route));
  for (const game of manifest.games) {
    assert.ok(
      routes.has(`/${game.slug}/assets/*`),
      `missing cached assets route for ${game.slug}`,
    );
  }
});
