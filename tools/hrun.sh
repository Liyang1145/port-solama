#!/bin/bash
# perf_debug1: run tools/human.cjs in the background holding CHROMIUM.lock. usage: tools/hrun.sh <map> <outdir> [scenarios]   (env passes through)
# -> prints the wrapper PID; log in <outdir>/run.log; the lock is released by this wrapper only (owner check)
cd "$(dirname "$0")/.."; LK=/workspace/work/CHROMIUM.lock; mkdir -p "$2"
av=$(free -m | awk '/Mem:/{print $7}'); if [ "$av" -lt 2500 ]; then echo "MEM_LOW $av"; exit 1; fi
mkdir $LK 2>/dev/null || { echo "LOCKED: $(cat $LK/owner 2>/dev/null)"; exit 1; }
source /workspace/work/wt/vehicles3/venv.sh
setsid nohup bash -c "echo \"perf_debug1 \$\$ $(date -u +%FT%TZ)\" > $LK/owner; timeout ${TLIM:-2400} node tools/human.cjs $1 $2 $3 > $2/node.out 2>&1; echo EXIT \$? >> $2/node.out; for q in \$(ps -o pid= --sid \$\$); do [ \$q != \$\$ ] && kill -9 \$q 2>/dev/null; done; if grep -q \"^perf_debug1 \$\$ \" $LK/owner 2>/dev/null; then rm -f $LK/owner; rmdir $LK; fi" > /dev/null 2>&1 < /dev/null &
echo "PID $!"
