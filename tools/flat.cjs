// Make dist_flat/: same game with every asset beside index.html (no assets/ subfolder) for publishing tools that flatten paths.
const fs = require('fs'), path = require('path');
const out = 'dist_flat'; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const js = fs.readFileSync('dist/main.js', 'utf8'); const n = (js.match(/'assets\/'/g) || []).length + (js.match(/"assets\/"/g) || []).length;
fs.writeFileSync(path.join(out, 'main.js'), js.replace(/(['"])assets\//g, '$1'));
fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync('dist/index.html', 'utf8').replace(/url\('assets\//g, "url('"));
for (const f of fs.readdirSync('dist/assets')) fs.copyFileSync(path.join('dist/assets', f), path.join(out, f));
console.log('flat: replaced', n, 'asset prefixes;', fs.readdirSync(out).length, 'files');
