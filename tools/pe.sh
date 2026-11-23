#!/bin/bash
# foreground probe with the lock: tools/pe.sh <map> 'js' ['js'...]
cd "$(dirname "$0")/.."; LK=/workspace/work/CHROMIUM.lock
av=$(free -m | awk '/Mem:/{print $7}'); if [ "$av" -lt 2500 ]; then echo "MEM_LOW $av"; exit 1; fi
mkdir $LK 2>/dev/null || { echo "LOCKED: $(cat $LK/owner 2>/dev/null)"; exit 1; }
echo "perf_debug1-pe $$ $(date -u +%FT%TZ)" > $LK/owner; source /workspace/work/wt/vehicles3/venv.sh
setsid timeout -k 2 92 node tools/peval.cjs "$@" 2>&1 | grep -v "^\s*-\|<launching>\|^$" | head -60
if grep -q "^perf_debug1-pe $$ " $LK/owner 2>/dev/null; then rm -f $LK/owner; rmdir $LK; fi
