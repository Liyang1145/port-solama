// Run a shot plan in chunks (fresh browser per chunk keeps SwiftShader memory low). usage: node runplan.cjs plan.json outdir [chunk]
// v4.3: waits for >= 2.5 GB available before each browser launch, kills leftover chromium after each chunk, retries a crashed chunk once.
const fs = require('fs'), { execFileSync, execSync } = require('child_process');
const plan = JSON.parse(fs.readFileSync(process.argv[2])); const out = process.argv[3]; const n = +(process.argv[4] || 1);
const avail = () => +execSync("free -m | awk '/Mem:/{print $7}'").toString().trim();
// r5.0 (shared machine): never pkill by name (the v3 line runs chromium too). Each chunk runs in its own session (setsid);
// we kill only that process group, and hold the global /workspace/work/CHROMIUM.lock while a browser is up.
const LOCK = '/workspace/work/CHROMIUM.lock';
let PG = null; const kill = () => { if (PG) { try { execSync(`for c in $(pgrep -P ${PG}); do kill -9 -- -$c 2>/dev/null; done; kill -9 -- -${PG} 2>/dev/null; true`); } catch (e) { } PG = null; } }; // playwright puts chromium in its own group (child of shot.cjs)
const lock = () => { for (;;) { try { fs.mkdirSync(LOCK); fs.writeFileSync(LOCK + '/owner', `real runplan ${process.pid} ${new Date().toISOString()}`); return; } catch (e) {
  try { const age = (Date.now() - fs.statSync(LOCK).mtimeMs) / 60000; if (age > 40) { console.log('stale lock', age.toFixed(0), 'min -> removed'); fs.rmSync(LOCK, { recursive: true, force: true }); continue; } } catch (e2) { }
  sleep(4); } } };
const unlock = () => { try { if (fs.readFileSync(LOCK + '/owner', 'utf8').startsWith('real runplan ' + process.pid)) fs.rmSync(LOCK, { recursive: true, force: true }); } catch (e) { } };
process.on('exit', () => { kill(); unlock(); });
const sleep = (s) => execSync('sleep ' + s);
for (let i = 0; i < plan.shots.length; i += n) {
  const sub = { query: plan.query, shots: plan.shots.slice(i, i + n) };
  const f = `/tmp/plan_chunk_${process.pid}_${i}.json`; fs.writeFileSync(f, JSON.stringify(sub));
  for (let attempt = 0; attempt < 2; attempt++) {
    lock(); let w = 0; while (avail() < 2500 && w < 60) { sleep(10); w++; }
    console.log('chunk', i, 'attempt', attempt, 'avail MB', avail());
    let ok = true;
    const pgf = `/tmp/real_pg_${process.pid}`;
    try { const r = execFileSync('setsid', ['sh', '-c', `echo $$ > ${pgf}; exec node shot.cjs ${f} ${out} ${process.env.SW || '1280'} ${process.env.SH || '720'}`], { encoding: 'utf8', timeout: 1500000 }); try { PG = fs.readFileSync(pgf, 'utf8').trim(); } catch (e) { } console.log(r.split('\n').filter((l) => /^shot|rendered|js->|ERR|PAGEERROR|CONSOLE-ERR|error:|loaded|stats/.test(l)).join('\n')); if (/\nERR /.test('\n' + r)) ok = false; }
    catch (e) { try { PG = fs.readFileSync(pgf, 'utf8').trim(); } catch (e3) { } ok = false; console.log('chunk fail', i, (e.stdout || '').split('\n').filter((l) => /^shot|js->|ERR|PAGEERROR|loaded/.test(l)).join('\n')); }
    kill(); unlock();
    if (ok) break;
  }
}
console.log('DONE');
