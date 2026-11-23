import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const { games, featured } = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));

type Failure = { url?: string; message: string };

/** Attach request/response/console failure tracking to a page. */
function track(page: import('@playwright/test').Page) {
  const failures: Failure[] = [];
  page.on('requestfailed', (r) => failures.push({ url: r.url(), message: `${r.url()} (${r.failure()?.errorText})` }));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push({ url: r.url(), message: `${r.url()} (HTTP ${r.status()})` });
  });
  page.on('console', (m) => {
    // duplicative of response tracking but catches script-injected asset loads.
    if (m.type() === 'error' && m.text().includes('Failed to load resource')) return;
    if (m.type() === 'error' && !m.text().includes('cdn.cat-herding.net')) {
      failures.push({ message: `console: ${m.text()}` });
    }
  });
  page.on('pageerror', (e) => failures.push({ message: `pageerror: ${e.message}` }));
  return failures;
}

/** True when the failure URL is a documented upstream-game asset gap, and
 *  only that: never tolerate a 404 on the game's own emitted JS/CSS chunks. */
function isAllowedUpstreamFailure(
  f: Failure,
  game: { slug: string; subpathBlocker?: { allowedMissingPrefixes: string[] } },
): boolean {
  if (!f.url) return false;
  let path: string;
  try {
    path = new URL(f.url).pathname;
  } catch {
    return false;
  }
  // Vite writes the game's compiled JS/CSS into <slug>/assets/. A 404 there
  // is a real build/smoke failure even when the upstream art assets are known
  // to be missing from the same directory. Other file types (png, ogg, json)
  // are part of the documented upstream gap and may be tolerated below.
  if (/\.(js|css|mjs)(\?|$)/i.test(path)) return false;
  const allowed = game.subpathBlocker?.allowedMissingPrefixes ?? [];
  return allowed.some((prefix) => path.startsWith(prefix));
}

function assertNoUnexpectedFailures(
  failures: Failure[],
  game: { slug: string; subpathBlocker?: { allowedMissingPrefixes: string[] } },
) {
  const unexpected = failures.filter((f) => !isAllowedUpstreamFailure(f, game));
  if (unexpected.length === 0 && failures.length) {
    console.log(
      `ℹ ${game.slug}: ${failures.length} known upstream asset 404(s) tolerated — ` +
        `see games.json subpathBlocker for the required game-repo fix`,
    );
  }
  expect(unexpected.map((f) => f.message), `${game.slug} unexpected failed requests / console errors`).toEqual([]);
}

test('index loads with a card for every game', async ({ page }) => {
  const failures = track(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Cat Herding Games');
  await expect(page.locator('article.card')).toHaveCount(games.length);
  for (const game of games) {
    await expect(page.locator(`article.card[data-slug="${game.slug}"] a.play`)).toHaveAttribute(
      'href',
      `/${game.slug}/`,
    );
  }
  await expect(page.locator(`article.card[data-slug="${featured}"] .badge`)).toContainText('Featured');
  expect(failures.map((f) => f.message)).toEqual([]);
});

for (const game of games) {
  test(`${game.slug}: play link returns 200, assets load and canvas renders`, async ({ page }) => {
    const failures = track(page);
    const url = `/${game.slug}/${game.smokePath ?? ''}`;
    const res = await page.goto(url, { waitUntil: 'load' });
    expect(res?.status(), `GET ${url}`).toBe(200);
    await expect(page.locator('canvas').first(), `canvas in ${url}`).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    assertNoUnexpectedFailures(failures, game);
  });
}

test('versions.json lists every built game with a SHA', async ({ request }) => {
  const res = await request.get('/versions.json');
  expect(res.status()).toBe(200);
  const versions = await res.json();
  for (const game of games) {
    expect(versions[game.slug], `version for ${game.slug}`).toBeTruthy();
    expect(versions[game.slug].sha).toMatch(/^[0-9a-f]{40}$/);
  }
});
