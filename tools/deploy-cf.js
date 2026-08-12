#!/usr/bin/env node
/**
 * deploy-cf.js — one-command go-live for a premium-editorial-v1 blog, via the
 * Cloudflare API + wrangler. Replaces the manual dashboard click-through
 * (Pages > upload folder > custom domain) that we used for bestbidetseats.
 *
 * Requires a Cloudflare API token with:
 *   Account > Cloudflare Pages > Edit
 *   Zone > DNS > Edit          (to point the apex at the Pages project)
 *   Zone > Zone > Read
 * The repo token in data/cloudflare-credentials.json is zone-scoped only and will NOT work.
 *
 * Token is read from, in order: $CLOUDFLARE_API_TOKEN, then
 * c:/Dev/Usine-a-blog/data/cloudflare-credentials.json ("pages_api_token", then "api_token").
 *
 * Usage:
 *   node tools/deploy-cf.js                 # verify + build export + deploy + attach domain
 *   node tools/deploy-cf.js --dry-run       # everything except the mutating calls
 *   node tools/deploy-cf.js --skip-domain   # deploy only, leave DNS/custom domain alone
 *
 * Deliberate order: the local verifier gates the deploy (exit 1 = nothing is published),
 * then upload, then the custom domain, then DNS. Never publishes an unverified tree.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8')).site;
/* Pages project name = domain minus TLD (bestbidetseats.com -> bestbidetseats),
   which also matches the GitHub repo name and keeps the *.pages.dev subdomain readable. */
const PROJECT = process.env.CF_PAGES_PROJECT || SITE.domain.replace(/\.[a-z]{2,}$/, '').replace(/\./g, '-');
const DOMAIN = SITE.domain;
const DRY = process.argv.includes('--dry-run');
const SKIP_DOMAIN = process.argv.includes('--skip-domain');
const API = 'https://api.cloudflare.com/client/v4';

/* Credentials live in the Usine data dir. On the Hetzner box this repo sits at
   <usine>/premium/<blog>/, on the PC the Usine root is c:/Dev/Usine-a-blog — try
   both (plus $USINE_CREDENTIALS) so the same script deploys from either. */
function credsPath() {
  return [
    process.env.USINE_CREDENTIALS,
    path.join(ROOT, '..', '..', 'data', 'cloudflare-credentials.json'),
    '/home/usine/usine/data/cloudflare-credentials.json',
    'c:/Dev/Usine-a-blog/data/cloudflare-credentials.json'
  ].filter(Boolean).find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
}
function creds() {
  const f = credsPath();
  if (!f) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; }
}
function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  const t = creds().pages_api_token || creds().api_token;
  if (t) return t;
  die('no Cloudflare API token: set $CLOUDFLARE_API_TOKEN or add "pages_api_token" to data/cloudflare-credentials.json');
}
const TOKEN = token();

function die(msg) { console.error('\nFATAL: ' + msg); process.exit(1); }
function sh(cmd, opts = {}) { return execSync(cmd, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opts }); }

async function cf(method, urlPath, body) {
  const res = await fetch(API + urlPath, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await res.json().catch(() => ({ success: false, errors: [{ message: 'non-JSON response ' + res.status }] }));
  if (!j.success) {
    const m = (j.errors || []).map(e => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`${method} ${urlPath} -> ${m}`);
  }
  return j.result;
}

(async () => {
  console.log(`\n=== deploy ${SITE.name} -> project "${PROJECT}" (${DOMAIN}) ===`);
  if (DRY) console.log('(dry run: no mutating calls)\n');

  /* 1. GATE: the local verifier decides whether anything gets published at all. */
  console.log('[1/6] local verifier');
  try { sh('node tools/rebuild-site.js --verify', { cwd: ROOT, quiet: true }); }
  catch (e) { die('verifier failed — refusing to deploy. Run `node tools/rebuild-site.js` and fix the failures.'); }
  console.log('      clean');

  /* 2. Clean export straight from HEAD: never ship .git/, tools/ or data/. */
  console.log('[2/6] clean export from git HEAD');
  const dirty = sh('git status --porcelain', { cwd: ROOT, quiet: true }).trim();
  if (dirty) die('working tree has uncommitted changes — commit first so the deploy matches a real commit:\n' + dirty);
  const OUT = path.join(os.tmpdir(), 'cf-deploy-' + PROJECT);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  /* Windows needs Git-bash for the pipe; on Linux the default /bin/sh handles it. */
  const PIPE = process.platform === 'win32' ? { shell: 'C:/Program Files/Git/bin/bash.exe' } : {};
  sh(`git archive HEAD | tar -x -C "${OUT.replace(/\\/g, '/')}"`, { cwd: ROOT, quiet: true, ...PIPE });
  for (const forbidden of ['.git', 'tools', 'data']) {
    if (fs.existsSync(path.join(OUT, forbidden))) die(`export contains ${forbidden}/ — check .gitattributes export-ignore`);
  }
  const countFiles = (d) => fs.readdirSync(d, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(d, e.name)) : 1), 0);
  const n = countFiles(OUT);
  console.log(`      ${n} files at ${OUT}`);

  /* 3. Account + project. */
  console.log('[3/6] account + Pages project');
  /* least-privilege tokens can't list /accounts — prefer env/creds account_id */
  let ACC = process.env.CF_ACCOUNT_ID || creds().account_id || null;
  if (!ACC) { const accounts = await cf('GET', '/accounts'); if (!accounts.length) die('token cannot list /accounts and no account_id in env/creds'); ACC = accounts[0].id; }
  console.log('      account ' + ACC);
  let exists = true, project = null;
  try { project = await cf('GET', `/accounts/${ACC}/pages/projects/${PROJECT}`); }
  catch (e) { if (/8000007|not.found/i.test(e.message)) exists = false; else throw e; }
  if (!exists) {
    console.log(`      creating project ${PROJECT}`);
    if (!DRY) await cf('POST', `/accounts/${ACC}/pages/projects`, { name: PROJECT, production_branch: 'master' });
  } else console.log('      project already exists');
  /* Deploy to the project's OWN production branch. A project created from the
     dashboard defaults to "main"; uploading with --branch master then produces a
     PREVIEW deployment and the apex silently keeps serving the previous build —
     exactly what happened to bestbidetseats on the first premium-daily run. */
  const BRANCH = (project && project.production_branch) || 'master';
  console.log('      production branch: ' + BRANCH);

  /* 4. Upload (wrangler handles the direct-upload JWT + hashing). */
  console.log('[4/6] upload');
  if (!DRY) {
    process.env.CLOUDFLARE_API_TOKEN = TOKEN;
    process.env.CLOUDFLARE_ACCOUNT_ID = ACC;
    sh(`npx --yes wrangler pages deploy "${OUT}" --project-name ${PROJECT} --branch ${BRANCH} --commit-dirty=true`, { cwd: ROOT });
  }

  /* 5. Custom domain (apex). */
  if (!SKIP_DOMAIN) {
    console.log('[5/6] custom domain ' + DOMAIN);
    const domains = DRY ? [] : await cf('GET', `/accounts/${ACC}/pages/projects/${PROJECT}/domains`).catch(() => []);
    if (!domains.some(d => d.name === DOMAIN)) {
      if (!DRY) await cf('POST', `/accounts/${ACC}/pages/projects/${PROJECT}/domains`, { name: DOMAIN });
      console.log('      attached');
    } else console.log('      already attached');

    /* 6. DNS: apex CNAME -> <project>.pages.dev (Cloudflare flattens the apex CNAME). */
    console.log('[6/6] DNS');
    const zones = await cf('GET', `/zones?name=${DOMAIN}`);
    if (!zones.length) die(`no Cloudflare zone for ${DOMAIN} — is the domain in this account?`);
    const ZONE = zones[0].id;
    const recs = await cf('GET', `/zones/${ZONE}/dns_records?type=CNAME&name=${DOMAIN}`);
    const target = `${PROJECT}.pages.dev`;
    if (recs.length && recs[0].content === target) console.log(`      apex CNAME already -> ${target}`);
    else if (recs.length) {
      if (!DRY) await cf('PATCH', `/zones/${ZONE}/dns_records/${recs[0].id}`, { content: target, proxied: true });
      console.log(`      apex CNAME updated -> ${target}`);
    } else {
      if (!DRY) await cf('POST', `/zones/${ZONE}/dns_records`, { type: 'CNAME', name: '@', content: target, proxied: true });
      console.log(`      apex CNAME created -> ${target}`);
    }
  } else console.log('[5-6/6] skipped (--skip-domain)');

  console.log(`\ndone. Next: node tools/verify-live.js  (SSL can take a few minutes on a fresh domain)`);
  console.log(`preview: https://${PROJECT}.pages.dev/   apex: https://${DOMAIN}/\n`);
})().catch(e => die(e.message));
