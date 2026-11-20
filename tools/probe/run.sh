#!/bin/bash
# run.sh <timeout> <args...>: takes CHROMIUM.lock, runs probe supervised, kills only own browser pid
L=/workspace/work/CHROMIUM.lock
for i in $(seq 1 120); do
  if mkdir $L 2>/dev/null; then echo "int-probe $$ $(date -u)" > $L/owner; break; fi
  age=$(( ( $(date +%s) - $(stat -c %Y $L) ) / 60 )); if [ $age -gt 40 ]; then rm -rf $L; continue; fi; sleep 30; done
cleanup(){ bp=$(cat /tmp/probe.bpid 2>/dev/null); [ -n "$bp" ] && kill -9 $bp 2>/dev/null; rm -f /tmp/probe.bpid; rm -rf $L; }
trap cleanup EXIT
while [ $(free -m | awk '/Mem:/{print $7}') -lt 2500 ]; do sleep 10; done
T=$1; shift
timeout -k 5 $T node /workspace/work/int/probe/probe.cjs "$@"
