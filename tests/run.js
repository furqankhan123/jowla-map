/* Runs every tests/*.test.js and node --check on every JS file. Usage: node tests/run.js */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
let failed = 0;
function run(args, label) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error('FAIL ' + label + '\n' + (r.stdout || '') + (r.stderr || '')); }
  else console.log('ok   ' + label);
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
walk(root).filter((f) => f.endsWith('.js')).forEach((f) => run(['--check', f], 'check ' + path.relative(root, f)));
fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).forEach((f) => run([path.join(__dirname, f)], 'test ' + f));
process.exit(failed ? 1 : 0);
