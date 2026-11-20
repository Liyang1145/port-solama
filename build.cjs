// Build: bundle src/main.js (+three) into dist/main.js and copy index.html. Assets live in dist/assets (tools/assets.py, tools/optcar.mjs).
const esbuild = require('esbuild'), fs = require('fs');
(async () => {
  const r = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, minify: !process.argv.includes('--dev'), format: 'iife', target: 'es2020', outfile: 'dist/main.js', legalComments: 'none', logLevel: 'warning' });
  const html = fs.readFileSync('src/index.html', 'utf8').replace('<script type="module" src="main.js"></script>', '<script src="main.js"></script>');
  fs.writeFileSync('dist/index.html', html);
  console.log('dist/main.js', (fs.statSync('dist/main.js').size / 1024).toFixed(0) + ' KB');
})().catch((e) => { console.error(e.message); process.exit(1); });
