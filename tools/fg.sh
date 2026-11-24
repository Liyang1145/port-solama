#!/bin/bash
# anim2: foreground runner holding CHROMIUM.lock (owner = this PID) for <= 95 s; kills only chrome descended from itself.
cd "$(dirname "$0")/.."; source /workspace/work/wt/vehicles3/venv.sh
LK=/workspace/work/CHROMIUM.lock
if [ -d $LK ]; then o=$(awk '{print $2}' $LK/owner 2>/dev/null); if [ -n "$o" ] && ! kill -0 $o 2>/dev/null; then echo "stale lock $o"; rm -f $LK/owner; rmdir $LK; fi; fi
av=$(free -m | awk '/Mem:/{print $7}'); [ "$av" -ge 2500 ] || { echo "LOWMEM $av"; exit 3; }
mkdir $LK 2>/dev/null || { echo "LOCKED $(cat $LK/owner)"; exit 2; }
echo "anim2fg $$ $(date -u +%FT%TZ)" > $LK/owner
timeout -k 3 ${T:-95} "$@"; rc=$?
desc(){ for c in $(ps -eo pid=,ppid= | awk -v p=$1 '$2==p{print $1}'); do echo $c; desc $c; done; }
for p in $(desc $$); do ps -p $p -o comm= 2>/dev/null | grep -q chrome && kill -9 $p 2>/dev/null; done
rm -f $LK/owner; rmdir $LK; echo "rc=$rc"
