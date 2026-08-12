#!/usr/bin/env node
/**
 * verify-live.js — the post-deploy gate. Nothing may be reported as "live" until this
 * passes. Codifies the checks that were run by hand for bestbidetseats, including the
 * two that caught real bugs there: soft-404s, and broken image references.
 *
 * Checks, against a real origin (apex by default, or a deployment/preview URL):
 *   1. every sitemap URL returns 200 (and the sitemap itself parses)
 *   2. every <img src> and og:image on every page returns 200 (no broken media)
 *   3. each page's <title> is non-empty and unique across the site
 *   4. an unknown path returns a real 404 status (not a 200 soft-404)
 *   5. robots.txt, llms.txt, sitemap.xml, favicon.svg all 200
 *   6. the Amazon Associates disclosure is present in the served HTML
 *   7. no page serves an untagged amazon.com/dp link
 *   8. /tools/ and /data/ are NOT reachable (export-ignore actually worked)
 *
 * Usage: node tools/verify-live.js [https://origin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8')).site;
const ORIGIN = (process.argv[2] || SITE.base_url).replace(/\/$/, '');
const TAG = SITE.affiliate_tag;

let fails = 0, checks = 0;
const bad = m => { fails++; console.log('  FAIL  ' + m); };
const ok = m => { checks++; console.log('  ok    ' + m); };

async function head(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (r.status === 405 || r.status === 501) r = await fetch(url, { method: 'GET', redirect: 'follow' });
    return r.status;
  } catch (e) { return 'ERR ' + e.message.slice(0, 40); }
}
async function get(url) {
  try { const r = await fetch(url, { redirect: 'follow' }); return { status: r.status, body: await r.text() }; }
  catch (e) { return { status: 'ERR ' + e.message.slice(0, 40), body: '' }; }
}
const abs = u => u.startsWith('http') ? u : ORIGIN + (u.startsWith('/') ? u : '/' + u);

(async () => {
  console.log(`\n=== verify-live ${ORIGIN} ===\n`);

  /* 1. sitemap */
  const sm = await get(ORIGIN + '/sitemap.xml');
  if (sm.status !== 200) return bad(`sitemap.xml -> ${sm.status} (cannot continue)`), process.exit(1);
  const urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (!urls.length) return bad('sitemap.xml has no <loc> entries'), process.exit(1);
  ok(`sitemap.xml parses, ${urls.length} URLs`);

  /* 2-3, 6-7: fetch every page once and run the content checks */
  const titles = new Map();
  const images = new Set();
  for (const u of urls) {
    const target = u.replace(SITE.base_url, ORIGIN);
    const r = await get(target);
    const label = target.replace(ORIGIN, '') || '/';
    if (r.status !== 200) { bad(`${label} -> ${r.status}`); continue; }

    const t = (r.body.match(/<title>([^<]*)<\/title>/) || [, ''])[1].trim();
    if (!t) bad(`${label} has an empty <title>`);
    else if (titles.has(t)) bad(`${label} duplicates the title of ${titles.get(t)}: "${t}"`);
    else titles.set(t, label);

    if (!/As an Amazon Associate/.test(r.body)) bad(`${label} is missing the Amazon Associates disclosure`);

    const untagged = (r.body.match(/amazon\.com\/dp\/[A-Z0-9]{10}[^"'\s]*/g) || []).filter(x => !x.includes('tag=' + TAG));
    if (untagged.length) bad(`${label} serves ${untagged.length} untagged Amazon link(s)`);

    for (const m of r.body.matchAll(/<img[^>]+src="([^"]+)"/g)) images.add(m[1]);
    for (const m of r.body.matchAll(/property="og:image" content="([^"]+)"/g)) images.add(m[1]);
    ok(`${label} 200, title ok`);
  }

  /* media */
  let broken = 0;
  for (const src of images) {
    const s = await head(abs(src));
    if (s !== 200) { bad(`image ${src} -> ${s}`); broken++; }
  }
  ok(`${images.size} distinct images checked, ${broken} broken`);

  /* 4. real 404, not a soft 404 */
  const nf = await get(ORIGIN + '/definitely-not-a-real-page-' + Date.now());
  if (nf.status !== 404) bad(`unknown path returned ${nf.status} (soft-404 — Google will index junk)`);
  else if (!/noindex/.test(nf.body)) bad('404 page is missing <meta name="robots" content="noindex">');
  else ok('unknown path -> 404 + noindex');

  /* 5. the AEO/infra files */
  for (const f of ['/robots.txt', '/llms.txt', '/favicon.svg', '/site.js']) {
    const s = await head(ORIGIN + f);
    s === 200 ? ok(`${f} 200`) : bad(`${f} -> ${s}`);
  }

  /* 8. build tooling must not be published */
  for (const f of ['/tools/rebuild-site.js', '/data/site.json']) {
    const s = await head(ORIGIN + f);
    (s === 404 || s === 403) ? ok(`${f} not published (${s})`) : bad(`${f} IS PUBLISHED (${s}) — check .gitattributes export-ignore`);
  }

  console.log(`\n${fails ? `VERIFY-LIVE: ${fails} FAILURE(S) — do not report this as live.` : `VERIFY-LIVE: all clean (${checks} checks).`}\n`);
  process.exit(fails ? 1 : 0);
})();
