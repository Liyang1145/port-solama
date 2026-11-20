#!/bin/bash
# usage: verify.sh outdir  -> std shots (golden/detail/night/drive) + logic sim, one browser at a time, 960x540. log /tmp/verify_<name>.log
cd "$(dirname "$0")"; n=$(basename $1)
( SW=${SW:-960} SH=${SH:-540} node runplan.cjs plans/v4v.json $1 1; SW=640 SH=360 node runplan.cjs plans/v35sim.json $1/sim 3 ) > /tmp/verify_$n.log 2>&1
