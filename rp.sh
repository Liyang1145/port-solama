#!/bin/bash
# usage: rp.sh plan outdir [chunk] [w h] -> runs in background, log /tmp/rp_<name>.log
cd "$(dirname "$0")"; n=$(basename $2)
setsid nohup node runplan.cjs "$1" "$2" "${3:-2}" > /tmp/rp_$n.log 2>&1 < /dev/null &
