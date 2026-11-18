#!/usr/bin/env node
/* Usage: node tools/bump-version.js 0.19.8 "Changelog line" ["PLAN table prefix to mark DONE"]
   Rewrites: config.js version, every ?v= in the HTML files, CACHE_VERSION in sw.js,
   prepends a CHANGELOG entry, and optionally marks a PLAN.md table row DONE. No deps. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const [ver, line, planRow] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) {
  console.error('Usage: node tools/bump-version.js X.Y.Z "changelog line" ["plan row text"]');
  process.exit(1);
}
function edit(file, fn) {
  const p = path.join(root, file);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  const out = fn(raw.replace(/\r\n/g, '\n'));
  fs.writeFileSync(p, crlf ? out.replace(/\n/g, '\r\n') : out);
}
edit('config.js', (s) => s.replace(/version: '[^']*'/, `version: '${ver}'`));
edit('sw.js', (s) => s.replace(/CACHE_VERSION = '[^']*'/, `CACHE_VERSION = 'v${ver}'`));
['index.html', 'newindex.html'].forEach((f) => edit(f, (s) => s.replace(/\?v=[0-9.]+/g, `?v=${ver}`)));
if (line) {
  edit('CHANGELOG.md', (s) => s.replace('# Changelog\n', `# Changelog\n\n## [${ver}]\n- ${line}\n`));
}
if (planRow) {
  edit('PLAN.md', (s) => s.replace(`| ${planRow} |`, `| ${planRow} (DONE ${ver}) |`));
}
console.log('Bumped to ' + ver);
