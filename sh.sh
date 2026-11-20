#!/bin/bash
# usage: sh.sh plan outdir [w h]  -> one browser, background; log /tmp/sh_<outdir-basename>.log (streams per shot)
cd "$(dirname "$0")"; n=$(basename $2)
setsid nohup node shot.cjs "$1" "$2" "${3:-1280}" "${4:-720}" > /tmp/sh_$n.log 2>&1 < /dev/null &
