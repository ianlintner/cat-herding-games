#!/usr/bin/env node
/** Write simple SVG placeholder thumbnails; replaced by real captures after the first build. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'site/thumbnails');
mkdirSync(DIR, { recursive: true });

const thumbs = {
  'nyan-noodle': { bg: '#2b1b2e', fg: '#ffca58', title: 'NYAN NOODLE', sub: 'ramen & cats' },
  'monster-league-arcade': { bg: '#20163d', fg: '#ff7ba9', title: 'MONSTER LEAGUE', sub: 'football / hockey' },
  'space-tycoon': { bg: '#101f38', fg: '#64e0c8', title: 'SPACE TYCOON', sub: 'freight empire' },
  'primordial-swamp': { bg: '#12301f', fg: '#b6e36a', title: 'PRIMORDIAL SWAMP', sub: 'dinosaur roguelite' },
};

for (const [slug, t] of Object.entries(thumbs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <rect width="640" height="360" fill="${t.bg}"/>
  <circle cx="540" cy="70" r="130" fill="${t.fg}" opacity="0.08"/>
  <text x="32" y="185" font-family="Trebuchet MS,sans-serif" font-size="44" font-weight="bold" fill="${t.fg}">${t.title}</text>
  <text x="32" y="230" font-family="Trebuchet MS,sans-serif" font-size="22" fill="#fff" opacity="0.7">${t.sub}</text>
  <text x="32" y="330" font-family="monospace" font-size="14" fill="#fff" opacity="0.35">screenshot pending</text>
</svg>
`;
  writeFileSync(join(DIR, `${slug}.svg`), svg);
}
console.log(`wrote ${Object.keys(thumbs).length} placeholder thumbnails`);
