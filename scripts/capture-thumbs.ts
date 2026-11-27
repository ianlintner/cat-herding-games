#!/usr/bin/env npx tsx
/**
 * Capture real thumbnails from each locally built game with Playwright.
 * Run after `npm run build` + `npm run serve`. Results land in site/thumbnails/.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = join(ROOT, 'site/thumbnails');
mkdirSync(OUT, { recursive: true });

const { games } = JSON.parse((await import('node:fs')).readFileSync(join(ROOT, 'games.json'), 'utf8'));

const browser = await chromium.launch({ headless: true });
const only = process.argv.slice(2);
for (const game of games) {
  if (only.length && !only.includes(game.slug)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const path = `/${game.slug}/${game.smokePath ?? ''}`;
  try {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 60_000 });
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    if (game.kind === 'nes-rom') {
      await page.locator('#start').click(); // start the emulator so the shot shows gameplay
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(1500); // let the first frame render
    await page.screenshot({ path: join(OUT, `${game.slug}.png`), type: 'png' });
    console.log(`✓ captured ${game.slug}`);
  } catch (err) {
    console.warn(`! could not capture ${game.slug}: ${err instanceof Error ? err.message : err}`);
  }
  await page.close();
}
await browser.close();
