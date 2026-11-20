// Run a shot plan in chunks (fresh browser per chunk keeps SwiftShader memory low). usage: node runplan.cjs plan.json outdir [chunk]
// v4.3: waits for >= 2.5 GB available before each browser launch, kills leftover chromium after each chunk, retries a crashed chunk once.
const fs = require('fs'), { execFileSync, execSync } = require('child_process');
const plan = JSON.parse(fs.readFileSync(process.argv[2])); const out = process.argv[3]; const n = +(process.argv[4] || 1);
const avail = () => +execSync("free -m | awk '/Mem:/{print $7}'").toString().trim();
const kill = () => { try { execSync("pkill -9 -f 'ms-playwright' ; true"); } catch (e) { } };
const sleep = (s) => execSync('sleep ' + s);
for (let i = 0; i < plan.shots.length; i += n) {
  const sub = { query: plan.query, shots: plan.shots.slice(i, i + n) };
  const f = `/tmp/plan_chunk_${process.pid}_${i}.json`; fs.writeFileSync(f, JSON.stringify(sub));
  for (let attempt = 0; attempt < 2; attempt++) {
    let w = 0; while (avail() < 2500 && w < 30) { sleep(10); w++; }
    console.log('chunk', i, 'attempt', attempt, 'avail MB', avail());
    let ok = true;
    try { const r = execFileSync('node', ['shot.cjs', f, out, process.env.SW || '1280', process.env.SH || '720'], { encoding: 'utf8', timeout: 1500000 }); console.log(r.split('\n').filter((l) => /^shot|rendered|js->|ERR|PAGEERROR|CONSOLE-ERR|error:|loaded|stats/.test(l)).join('\n')); if (/\nERR /.test('\n' + r)) ok = false; }
    catch (e) { ok = false; console.log('chunk fail', i, (e.stdout || '').split('\n').filter((l) => /^shot|js->|ERR|PAGEERROR|loaded/.test(l)).join('\n')); }
    kill();
    if (ok) break;
  }
}
console.log('DONE');
