# AGENT BRIEF — writing a new article for this site (premium-editorial-v1)

This is the exact standard that produced the first 6 articles. Every future article
(by Claude, Eli, or the daily pipeline) MUST follow it. Deviation = the site slides
back to network-average quality.

## The pipeline for one new article

1. Pick topic + real products (from `data/amazon-products-database.json` on the server —
   NEVER invent products, prices, ratings or review counts).
2. Generate the hero on the server (Replicate flux-1.1-pro, 16:9 → 1600×900 webp).
   **Prompt rule learned the hard way:** explicitly center the subject
   ("white toilet with bidet seat…") AND add negatives ("no sink, no faucet, no vanity,
   no people, no text, no glow"). **Eyeball the image on a contact sheet BEFORE using it.**
3. Download product photos (real `images[]` URLs from the DB — never guess an image ID)
   → 800×800 webp on white, `images/amazon-<ASIN>.webp`.
4. Write `<slug>.html` per the template contract below.
5. Add one entry to `data/site.json` → run `node tools/rebuild-site.js`
   (regenerates /guides, homepage block, sitemap, llms.txt AND verifies; exit 1 = do not deploy).
6. Deploy the clean export: `git archive HEAD | tar -x -C ../bidet-seats-live`, upload
   that folder to CF Pages, purge the zone cache. Never deploy a folder containing `.git/`.

## Template contract (what the HTML file must contain)

- Read `index.html`; reuse its ENTIRE `<style>` block, `<style id="a11y">` block,
  `<header class="site">` (same inline SVG logo) and `<footer class="site">` VERBATIM.
  Append only minimal article CSS (prose ~68ch). Never restyle `.buy`/`.btn`
  (the a11y block owns them — that's the teal-on-teal lesson).
- Head: unique title + meta description, canonical `https://<domain>/<slug>`,
  the 5 favicon links, `theme-color #08191C`, OG tags.
- JSON-LD: `Article` (author, datePublished) + `FAQPage` (3-4 real FAQs from the body);
  `HowTo` for install-type guides; `ItemList` with REAL `AggregateRating` for mini-roundups.
- Hero `<img>` at top: `loading="eager" fetchpriority="high"`, width/height set.
- Product images: `/images/amazon-<ASIN>.webp`, `loading="lazy"`.
- Amazon links: `https://www.amazon.com/dp/<ASIN>?tag=<affiliate_tag>` with
  `rel="nofollow sponsored noopener" target="_blank"`. No untagged dp links, ever.
- Byline: `By <author> · Updated <date> · Research-based.`
- Affiliate disclosure line near the top AND the footer already carries
  "As an Amazon Associate, we earn from qualifying purchases."

## Editorial bar

- 2,500–4,000 words of genuinely useful, specific, conversational-but-authoritative
  English for a US audience. No fluff, no repetition, no AI-listicle cadence.
- NEVER claim physical testing: no "we tested", "hands-on", "our lab".
  Use "we compared / we researched / owners report / reviewers consistently note".
  Include one honest no-testing-lab line.
- Owner sentiment is paraphrased WITHOUT quotation marks, introduced as
  "The theme that repeats across owner reviews: …". Never fake a verbatim quote.
- Only the supplied ratings/counts. Energy/savings math must state its assumptions.
  Health-adjacent points framed as general information, never medical advice.
- Internal links: to `/` and 3-5 sibling articles in context + a "Keep reading" block.

## Verification gate (non-negotiable)

`node tools/rebuild-site.js` must exit 0. It checks: forbidden claims, untagged/missing-rel
Amazon links, missing images, dead internal links, dead same-page anchors, disclosure
presence, site.json↔files coherence. A FAIL means fix, not deploy.

After deploy: load the page, check hero renders on-topic, click 2 internal links,
confirm the article appears on /guides and in sitemap.xml.
