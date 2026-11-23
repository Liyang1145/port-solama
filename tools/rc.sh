#!/bin/bash
# perf_debug1: run one rcmp.cjs under CHROMIUM.lock (foreground, <=98 s)
cd "$(dirname "$0")/.."; LK=/workspace/work/CHROMIUM.lock
av=$(free -m | awk '/Mem:/{print $7}'); [ "$av" -lt 2500 ] && { echo MEM_LOW $av; exit 1; }
mkdir $LK 2>/dev/null || { echo LOCKED; exit 1; }; echo "perf_debug1 $$" > $LK/owner
timeout 98 node tools/rcmp.cjs "$@" 2>&1 | grep -E "^(new|old|PAGEERROR|SELF)" | cut -c1-1500
rm -f $LK/owner; rmdir $LK
