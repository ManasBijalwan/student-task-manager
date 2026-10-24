const { existsSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const rootNodeModules = join(process.cwd(), 'node_modules');
let patched = 0;

function patchIconvLite(packageDirectory) {
  const manifestPath = join(packageDirectory, 'package.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== 'iconv-lite' || !manifest.browser || typeof manifest.browser !== 'object') return;

  let changed = false;
  for (const path of ['./lib/extend-node', './lib/streams']) {
    if (Object.hasOwn(manifest.browser, path)) {
      delete manifest.browser[path];
      changed = true;
    }
  }

  if (changed) {
    if (Object.keys(manifest.browser).length === 0) delete manifest.browser;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    patched += 1;
  }
}

function visitNodeModules(directory) {
  if (!existsSync(directory)) return;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDirectory = join(directory, entry.name);

    if (entry.name === 'iconv-lite') patchIconvLite(packageDirectory);
    if (entry.name.startsWith('@')) visitNodeModules(packageDirectory);
    visitNodeModules(join(packageDirectory, 'node_modules'));
  }
}

visitNodeModules(rootNodeModules);
if (patched > 0) console.log(`Applied Cloudflare Workers iconv-lite compatibility patch to ${patched} package(s).`);
