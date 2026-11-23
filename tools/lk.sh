#!/bin/bash
# perf_debug3: run one command holding CHROMIUM.lock (foreground, timeout-wrapped). usage: tools/lk.sh <secs> cmd...
LK=/workspace/work/CHROMIUM.lock; av=$(free -m | awk '/Mem:/{print $7}'); [ "$av" -lt 2500 ] && { echo "MEM_LOW $av"; exit 1; }
mkdir $LK 2>/dev/null || { echo "LOCKED: $(cat $LK/owner 2>/dev/null)"; exit 1; }
echo "perf_debug4 $$ $(date -u +%FT%TZ)" > $LK/owner; t=$1; shift
timeout -k 3 $t "$@"; rc=$?
grep -q "^perf_debug4 $$ " $LK/owner 2>/dev/null && { rm -f $LK/owner; rmdir $LK; }; exit $rc
