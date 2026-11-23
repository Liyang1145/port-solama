#!/bin/bash
# perf_debug1: every scenario in its own fresh browser (the game + SwiftShader sit ~300 MB under the sandbox OOM line), one at a
# time, holding CHROMIUM.lock for the whole loop; a crashed scenario is retried once. usage: tools/hrun_all.sh <map> <outdir> "<scenarios>"
cd "$(dirname "$0")/.."; LK=/workspace/work/CHROMIUM.lock; mkdir -p "$2"
mkdir $LK 2>/dev/null || { echo "LOCKED: $(cat $LK/owner 2>/dev/null)"; exit 1; }
source /workspace/work/wt/vehicles3/venv.sh
SC="${3:-walk car guns mission menus daynight session3min}"
setsid nohup bash -c "
echo \"perf_debug1 \$\$ \$(date -u +%FT%TZ)\" > $LK/owner
for s in $SC; do for t in 1 2; do
  w=0; while [ \$(free -m | awk '/Mem:/{print \$7}') -lt 2500 ] && [ \$w -lt 30 ]; do sleep 5; w=\$((w+1)); done
  timeout ${TLIM:-900} node tools/human.cjs $1 $2/\$s \$s > $2/\$s.out 2>&1
  for bp in \$(cat $2/\$s/browser.pids 2>/dev/null); do for q in \$(ps -o pid= --sid \$bp); do kill -9 \$q 2>/dev/null; done; done
  for q in \$(ps -o pid= --sid \$\$); do [ \$q != \$\$ ] && [ \$q != \$BASHPID ] && kill -9 \$q 2>/dev/null; done
  grep -q '^.\{9\}scenario ' $2/\$s/run.log 2>/dev/null && break; echo \"retry \$s\" >> $2/loop.log
done; echo \"done \$s \$(date -u +%T)\" >> $2/loop.log; done
echo ALL >> $2/loop.log
if grep -q \"^perf_debug1 \$\$ \" $LK/owner 2>/dev/null; then rm -f $LK/owner; rmdir $LK; fi" > /dev/null 2>&1 < /dev/null &
echo "PID $!"
