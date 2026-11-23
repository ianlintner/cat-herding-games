#!/usr/bin/env node
/**
 * Render site/index.html from games.json. The committed file is the generated
 * artifact, so the hub stays a zero-dependency static site; run this after
 * editing games.json (or `npm run generate:site`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { games, featured } = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const card = (g) => `
      <article class="card${g.slug === featured ? ' is-featured' : ''}" data-slug="${esc(g.slug)}">
        <a class="thumb" href="/${esc(g.slug)}/" aria-label="Play ${esc(g.title)}">
          <img src="${esc(g.thumbnail)}" alt="${esc(g.title)} screenshot" width="640" height="360" loading="lazy" decoding="async">
          ${g.slug === featured ? '<span class="badge">★ Featured</span>' : ''}
        </a>
        <div class="card-body">
          <h3><a href="/${esc(g.slug)}/">${esc(g.title)}</a></h3>
          <p>${esc(g.blurb)}</p>
          <ul class="tags">${g.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          <div class="actions">
            <a class="play" href="/${esc(g.slug)}/">▶ Play</a>
            <a class="source" href="https://github.com/${esc(g.repo)}" rel="noopener noreferrer">Source ↗</a>
          </div>
        </div>
      </article>`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cat Herding Games — a passel of pixel-sized pastimes</title>
  <meta name="description" content="Play Nyan Noodle, Monster League Arcade, Space Tycoon and Primordial Swamp — four little games herded into one cozy corner of the web.">
  <meta name="theme-color" content="#151322">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="masthead">
    <div class="cat" aria-hidden="true">🐈‍⬛</div>
    <div>
      <p class="eyebrow">A collective of notoriously unherdable games</p>
      <h1>Cat Herding Games</h1>
      <p class="tagline">Four games. Zero obedience. Infinite treats.</p>
    </div>
  </header>

  <main>
    <section class="featured-strip" aria-label="Featured game">
      <p>Rounder up the latest pick of the litter:</p>
      <a href="/${esc(featured)}/">Play ${esc(games.find((g) => g.slug === featured).title)} →</a>
    </section>

    <h2>The whole cattery</h2>
    <div class="grid">${games.map(card).join('')}
    </div>

    <section class="about">
      <h2>What is this place?</h2>
      <p>Each game lives in its own little repository. This hub builds them all with the right subpath and serves them from one cozy Azure Static Web App, so you can wander between worlds without ever changing address. It's like a cat tower, but with more JavaScript.</p>
      <p><a href="/versions.json">Build versions</a> · <a href="https://github.com/ianlintner/cat-herding-games" rel="noopener noreferrer">Hub source ↗</a></p>
    </section>
  </main>

  <footer>
    <p>Made for the cats. Built by <a href="https://github.com/ianlintner" rel="noopener noreferrer">Ian</a>. MIT licensed.</p>
  </footer>
</body>
</html>
`;

mkdirSync(join(ROOT, 'site'), { recursive: true });
writeFileSync(join(ROOT, 'site/index.html'), html);
console.log(`wrote site/index.html (${games.length} games, featured ${featured})`);
