// Single-file build: dist_single/index.html with main.js and every asset embedded (textures re-encoded to WebP, kept under
// their .jpg/.png names; the browser decodes by content). Needed because the page publisher uploads only index.html.
const fs = require('fs'), path = require('path'), sharp = require('sharp');
(async () => {
  const A = {}; let raw = 0;
  for (const f of fs.readdirSync('dist/assets').sort()) {
    const p = path.join('dist/assets', f); let buf = fs.readFileSync(p); let mime = 'application/octet-stream'; raw += buf.length;
    if (/\.(jpg|png)$/.test(f)) {
      const alpha = f.endsWith('.png');
      const isNormal = /_n\.jpg$|waternormals/.test(f);
      buf = await sharp(buf).webp({ quality: isNormal ? 88 : 80, alphaQuality: 90, effort: 4, nearLossless: false }).toBuffer(); mime = 'image/webp'; void alpha;
    } else if (f.endsWith('.glb')) mime = 'model/gltf-binary';
    else if (f.endsWith('.ttf')) mime = 'font/ttf';
    A[f] = `data:${mime};base64,` + buf.toString('base64');
  }
  const js = fs.readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  let html = fs.readFileSync('dist/index.html', 'utf8');
  html = html.replace(", url('Anton-Regular.ttf') format('truetype')", '');
  html = html.replace("url('assets/Anton-Regular.ttf')", `url('${A['Anton-Regular.ttf']}')`);
  const assetJs = 'window.__A=' + JSON.stringify(A) + ';';
  html = html.replace('<script src="main.js"></script>', () => `<script>${assetJs}</script>\n<script>${js}</script>`);
  fs.mkdirSync('dist_single', { recursive: true }); fs.writeFileSync('dist_single/index.html', html);
  console.log('raw assets', (raw / 1048576).toFixed(1), 'MB -> single file', (html.length / 1048576).toFixed(1), 'MB');
})();
