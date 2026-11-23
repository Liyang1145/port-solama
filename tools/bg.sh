#!/bin/bash
# perf_debug5: detached runner holding CHROMIUM.lock. usage: setsid nohup tools/bg.sh <tag> <secs> cmd... > log 2>&1 &
# writes /workspace/work/pd5_<tag>.done when finished; kills only its own process group's chrome.
cd "$(dirname "$0")/.."; source /workspace/work/wt/vehicles3/venv.sh
LK=/workspace/work/CHROMIUM.lock; tag=$1; t=$2; shift 2; D=/workspace/work/pd5_$tag.done; rm -f $D
for i in $(seq 1 60); do
  av=$(free -m | awk '/Mem:/{print $7}')
  if [ "$av" -ge 2500 ] && mkdir $LK 2>/dev/null; then break; fi; echo "wait lock/mem ($av) $(cat $LK/owner 2>/dev/null)"; sleep 20
done
[ -d $LK ] || { echo NOLOCK; echo NOLOCK > $D; exit 1; }
echo "perf_debug5 $$ $(date -u +%FT%TZ)" > $LK/owner
echo "START $(date -u +%T)"
timeout -k 5 $t "$@"; rc=$?
echo "END rc=$rc $(date -u +%T)"
# kill leftover chrome descended from this script only (playwright gives chrome its own pgid)
desc(){ for c in $(ps -eo pid=,ppid= | awk -v p=$1 '$2==p{print $1}'); do echo $c; desc $c; done; }
for p in $(desc $$); do ps -p $p -o comm= 2>/dev/null | grep -q chrome && kill -9 $p 2>/dev/null; done
grep -q "^perf_debug5 $$ " $LK/owner 2>/dev/null && { rm -f $LK/owner; rmdir $LK; }
echo "rc=$rc" > $D
