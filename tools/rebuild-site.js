#!/usr/bin/env node
/**
 * rebuild-site.js — the industrialization layer for the premium-editorial-v1 template.
 *
 * Source of truth: data/site.json (site meta + article index).
 * Regenerates, deterministically:
 *   1. guides.html          — full archive page (all articles, newest first)
 *   2. index.html           — the <!--GUIDES:START/END--> featured block (latest 6 featured)
 *   3. sitemap.xml          — static pages + all articles, lastmod from article dates
 *   4. llms.txt             — the "## Guides" section between GUIDES markers
 * Then runs the integrated VERIFIER (exit 1 on any failure):
 *   - forbidden physical-testing claims (honest negations excluded)
 *   - untagged / missing-rel Amazon links
 *   - image refs that don't exist on disk
 *   - internal links & same-page anchors that don't resolve
 *   - every site.json article has a matching HTML file (and vice versa warning)
 *
 * Usage:  node tools/rebuild-site.js          (rebuild + verify)
 *         node tools/rebuild-site.js --verify (verify only, no writes)
 *
 * Adding article #7: write <slug>.html (see tools/AGENT-BRIEF.md), add one
 * entry to data/site.json, run this script, deploy the clean export:
 *   git archive HEAD | tar -x -C ../bidet-seats-live
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const SITE = DATA.site;
const ARTICLES = [...DATA.articles].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
const VERIFY_ONLY = process.argv.includes('--verify');
const today = () => {
  const ds = ARTICLES.map(a => a.date).sort();
  return ds[ds.length - 1] || '2026-08-11';
};

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function write(f, c) { if (!VERIFY_ONLY) fs.writeFileSync(path.join(ROOT, f), c); }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/* ---------------- extraction from canonical index.html ---------------- */
const idx = read('index.html');
const style = (idx.match(/<style>[\s\S]*?<\/style>/) || [null])[0];
const a11y = (idx.match(/<style id="a11y">[\s\S]*?<\/style>/) || [null])[0];
const header = (idx.match(/<header class="site">[\s\S]*?<\/header>/) || [null])[0];
const footer = (idx.match(/<footer class="site">[\s\S]*?<\/footer>/) || [null])[0];
if (!style || !a11y || !header || !footer) { console.error('FATAL: cannot extract template parts from index.html'); process.exit(1); }


/* One contextual card to a sibling site in the network (Art. 4: contextual,
   varied anchor, nofollow — never a sitewide footer farm). Data lives in
   site.json so this survives every regeneration. */
function networkCard() {
  const n = SITE.network_card;
  if (!n) return '';
  return `<a class="gcard" href="${n.href}" rel="nofollow noopener" target="_blank"><span class="gbody"><span class="eyebrow" style="color:var(--brass-text)">${n.category}</span><h2 class="serif">${n.title}</h2><p>${n.description}</p><span class="gmeta">Another independent guide from the same team</span></span></a>`;
}

/* ---------------- 1. guides.html ---------------- */
function guideCard(a) {
  return `<a class="gcard" href="/${a.slug}"><span class="gimg"><img src="/images/${a.hero}.webp" alt="" width="1600" height="900" loading="lazy" decoding="async"></span><span class="gbody"><span class="eyebrow" style="color:var(--brass-text)">${esc(a.category)}</span><h2 class="serif">${esc(a.title)}</h2><p>${esc(a.description)}</p><span class="gmeta">By ${SITE.author} · Updated ${fmtDate(a.date)} · ${a.minutes} min read</span></span></a>`;
}
function fmtDate(d) {
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[+m - 1]} ${+day}, ${y}`;
}
const guidesHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All Guides — ${SITE.name}</title>
<meta name="description" content="Every bidet seat guide, comparison and how-to on ${SITE.name} — research-based, honest, and updated for 2026.">
<link rel="canonical" href="${SITE.base_url}/guides">
<meta name="theme-color" content="#08191C">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${style}
<style>
.archive-hero{background:radial-gradient(120% 90% at 80% -10%,var(--dark-2),var(--dark) 60%);color:var(--on-dark);padding:56px 0 48px}
.archive-hero .eyebrow{color:var(--brass-lite)}
.archive-hero h1{font-family:var(--serif);font-weight:600;font-size:clamp(2rem,1.3rem+2.8vw,3.4rem)}
.archive-hero p{color:var(--on-dark-mute);max-width:56ch;margin-top:.8rem}
.glist{display:grid;grid-template-columns:1fr 1fr;gap:26px;padding:40px 0 20px}
@media (max-width:820px){.glist{grid-template-columns:1fr}}
.gcard{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-sm);overflow:hidden;text-decoration:none;color:var(--ink);transition:transform .18s,box-shadow .18s}
.gcard:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.gimg{display:block;aspect-ratio:16/9;overflow:hidden}
.gimg img{width:100%;height:100%;object-fit:cover;display:block}
.gbody{display:flex;flex-direction:column;gap:8px;padding:22px}
.gbody h2{font-weight:600;font-size:1.35rem;line-height:1.2}
.gbody p{color:var(--muted);margin:0;font-size:.95rem}
.gmeta{font-size:.8rem;color:var(--ink-soft);margin-top:4px}
@media (prefers-reduced-motion:reduce){.gcard:hover{transform:none}}
</style>
${a11y}
</head>
<body>
${header}
<div class="archive-hero"><div class="wrap"><span class="eyebrow">The library</span><h1 class="serif">All guides &amp; comparisons</h1><p>Every article on ${SITE.name} — research-based, honest, and kept current. New guides are added regularly.</p></div></div>
<div class="wrap"><div class="glist">
${ARTICLES.map(guideCard).join('\n')}
${networkCard()}
</div></div>
${footer}
</body>
</html>`;
write('guides.html', guidesHtml);

/* ---------------- 2. index.html featured block ---------------- */
const featured = ARTICLES.filter(a => a.featured).slice(0, 6);
function homeCard(a) {
  return `      <a class="panel" style="text-decoration:none;display:block" href="/${a.slug}">
        <span class="eyebrow" style="color:var(--brass-text)">${esc(a.category)}</span>
        <h3 class="serif" style="margin-top:6px">${esc(a.title)}</h3>
        <p>${esc(a.description)} <span style="color:var(--aqua-deep);font-weight:700">Read →</span></p>
      </a>`;
}
const newIdx = idx.replace(/<!--GUIDES:START-->[\s\S]*?<!--GUIDES:END-->/,
  '<!--GUIDES:START-->\n' + featured.map(homeCard).join('\n') + '\n<!--GUIDES:END-->');
write('index.html', newIdx);

/* ---------------- 3. sitemap.xml ---------------- */
const urls = [
  ...SITE.static_pages.map(p => ({ loc: `${SITE.base_url}/${p.path}`.replace(/\/$/, '') + (p.path === '' ? '/' : ''), lastmod: today(), priority: p.priority })),
  ...ARTICLES.map(a => ({ loc: `${SITE.base_url}/${a.slug}`, lastmod: a.date, priority: '0.8' }))
];
const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n') + `\n</urlset>\n`;
write('sitemap.xml', sm);

/* ---------------- 4. llms.txt guides section ---------------- */
let llms = read('llms.txt');
const guidesMd = ARTICLES.map(a => `- [${a.title}](${SITE.base_url}/${a.slug}): ${a.description}`).join('\n');
if (llms.includes('<!--LLMS-GUIDES:START-->')) {
  llms = llms.replace(/<!--LLMS-GUIDES:START-->[\s\S]*?<!--LLMS-GUIDES:END-->/, `<!--LLMS-GUIDES:START-->\n${guidesMd}\n<!--LLMS-GUIDES:END-->`);
} else if (llms.includes('## Guides')) {
  llms = llms.replace(/## Guides\n\n[\s\S]*?\n\n## /, `## Guides\n\n<!--LLMS-GUIDES:START-->\n${guidesMd}\n<!--LLMS-GUIDES:END-->\n\n## `);
} else {
  llms = llms.replace('## About', `## Guides\n\n<!--LLMS-GUIDES:START-->\n${guidesMd}\n<!--LLMS-GUIDES:END-->\n\n## About`);
}
write('llms.txt', llms);

/* ---------------- 5. VERIFIER ---------------- */
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const imgs = new Set(fs.existsSync(path.join(ROOT, 'images')) ? fs.readdirSync(path.join(ROOT, 'images')) : []);
const pages = new Set(htmlFiles.map(f => f.replace(/\.html$/, '')));
const forbidden = /we tested|we've tested|hands-on|after testing|in our testing|I tested|our testing lab/i;
const honestNeg = /don'?t run a (fake )?testing lab|no testing lab|don'?t physically test|do not physically test|not a (staged )?["']?lab|rather than a staged/gi;
/* Generic hardening (ported from the espresso build): a daily runner can only be
   trusted if the gate catches template drift, not just forbidden claims. */
const MIN_WORDS = 2000;
let failures = 0;
const report = [];

for (const f of htmlFiles) {
  const h = VERIFY_ONLY ? read(f) : fs.readFileSync(path.join(ROOT, f), 'utf8');
  const probs = [];
  const cleaned = h.replace(honestNeg, '');
  const m = cleaned.match(forbidden); if (m) probs.push('FORBIDDEN CLAIM: "' + m[0] + '"');
  const amz = (h.match(/amazon\.com\/dp\/[A-Z0-9]{10}[^"]*/g) || []);
  const untagged = amz.filter(u => !u.includes('tag=' + SITE.affiliate_tag));
  if (untagged.length) probs.push('UNTAGGED AMAZON LINKS: ' + untagged.length);
  const links = (h.match(/<a [^>]*amazon\.com[^>]*>/g) || []);
  const badRel = links.filter(l => !/nofollow/.test(l) || !/sponsored/.test(l));
  if (badRel.length) probs.push('MISSING rel nofollow/sponsored: ' + badRel.length);
  const refs = [...new Set((h.match(/\/images\/[a-zA-Z0-9._-]+\.webp/g) || []).map(s => s.replace('/images/', '')))];
  const missImg = refs.filter(r => !imgs.has(r));
  if (missImg.length) probs.push('MISSING IMAGES: ' + missImg.join(','));
  const ints = [...new Set((h.match(/href="\/([a-z0-9-]+)"/g) || []).map(s => s.slice(7, -1)))];
  const dead = ints.filter(s => !pages.has(s) && !s.includes('.'));
  if (dead.length) probs.push('DEAD INTERNAL LINKS: ' + dead.join(','));
  const ids = new Set([...h.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  const deadAnchors = [...new Set([...h.matchAll(/href="#([^"]+)"/g)].map(x => x[1]))].filter(a => !ids.has(a));
  if (deadAnchors.length) probs.push('DEAD ANCHORS: #' + deadAnchors.join(', #'));
  if (f !== '404.html' && !/As an Amazon Associate/.test(h)) probs.push('MISSING Amazon Associates disclosure');
  const isArticle = DATA.articles.some(a => a.slug + '.html' === f);
  if (isArticle) {
    const words = h.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS) probs.push(`TOO SHORT: ${words} words (min ${MIN_WORDS})`);
    if (!/<style id="a11y">/.test(h)) probs.push('MISSING a11y style block (template drift)');
    if (!/hero-[a-z0-9-]+\.webp/.test(h)) probs.push('MISSING hero image');
    if (!/"@type"\s*:\s*"Article"/.test(h)) probs.push('MISSING Article JSON-LD');
  }
  report.push((probs.length ? '  FAIL  ' : '  ok    ') + f.padEnd(48) + probs.join(' | '));
  if (probs.length) failures++;
}
// site.json <-> files coherence
for (const a of DATA.articles) if (!pages.has(a.slug)) { report.push('  FAIL  site.json article has no HTML: ' + a.slug); failures++; }
const known = new Set([...DATA.articles.map(a => a.slug), ...SITE.static_pages.map(p => p.path || 'index'), '404', 'index', 'guides']);
for (const p of pages) if (!known.has(p)) report.push('  warn  HTML file not in site.json (won\'t appear in /guides or sitemap): ' + p);

console.log((VERIFY_ONLY ? '[verify-only] ' : '[rebuilt guides.html, index featured block, sitemap.xml, llms.txt]\n') + report.join('\n'));
console.log(failures ? `\nVERIFIER: ${failures} FAILURE(S) — do not deploy.` : '\nVERIFIER: all clean — safe to deploy.');
process.exit(failures ? 1 : 0);
