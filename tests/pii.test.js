/* Guard: fails (file:line only, never the text) if tracked files look like they hold real data. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !/^(vendor|icons)\//.test(f) && /\.(js|md|yml|yaml|html|css|json|txt|gs)$/.test(f));
const pats = [
  ['TX ZIP', /\bTX,?\s*7[5-9]\d{3}\b/],
  ['street address', /\b\d{3,5}\s+[a-z]+(?:\s[a-z]+)*\s(?:dr|drive|st|street|ln|lane|ct|court|way|rd|road|blvd|ave|pkwy|trl|trail|cir)\b/i],
  ['Texas coordinates', /\b3[0-4]\.\d{5,}\s*,\s*-9[5-8]\.\d{5,}/],
  ['sheet row id', /\browid \d{2,}/],
  ['playwright snapshot', /^\s*- button "/],
];
const allowed = /123 Main St/i;
const bad = [];
for (const f of files) {
  fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
    for (const [name, re] of pats) {
      if (re.test(line) && !allowed.test(line)) bad.push(f + ':' + (i + 1) + ' (' + name + ')');
    }
  });
}
if (bad.length) { console.error('Possible PII in tracked files:\n' + bad.join('\n')); process.exit(1); }
console.log('pii guard ok (' + files.length + ' files)');
