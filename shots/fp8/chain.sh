#!/bin/bash
# fix_pt8 wrap: streameq + shots + pf7 B tp (new / ?oldslice) on the minified build, then regression A/B
cd /workspace/work/wt/perf_debug1; source /workspace/work/wt/vehicles3/venv.sh
echo "== streameq $(date -u +%T)"; timeout 600 node tools/streameq.cjs 3 > shots/fp8/streameq.log 2>&1; grep -E '"same"|"oldStable"|PAGEERROR' shots/fp8/streameq.log | tr -d ' \n'; echo
CC="g.override=null; if(g.P.car) g.toggleCar(); G.setHour(13); g.tp(80,1690,Math.PI); G.step(4); let n=0; while((__G.stream.job||n<3)&&n<4000){ __G.stream.update(G.camera.position,1); n++; } G.step(2)"
ST="g.override=null; if(g.P.car) g.toggleCar(); G.setHour(21.6); g.tp(257.9,-11.2,0); G.step(4); let n=0; while((__G.stream.job||n<3)&&n<4000){ __G.stream.update(G.camera.position,1); n++; } G.step(2)"
export SINGLE=1 VW=400 VH=225 NR=4
echo "== shots $(date -u +%T)"
MAP=cyber V="new=lowshadow&nopost&far=140" SEQ="sl1|$CC@@sl2|$ST" timeout 900 node tools/fp8shot.cjs > shots/fp8/s_bnew.log 2>&1
MAP=cyber V="old=lowshadow&nopost&far=140&oldslice" SEQ="sl1|$CC@@sl2|$ST" timeout 900 node tools/fp8shot.cjs > shots/fp8/s_bold.log 2>&1
VW=480 VH=270 MAP=gta V="new=lowshadow&nopost&far=140" SEQ="spawn|@@night|" timeout 900 node tools/fp8shot.cjs > shots/fp8/s_anew.log 2>&1
grep -h PAGEERROR shots/fp8/s_*.log | head; echo "pageerr lines: $(grep -h PAGEERROR shots/fp8/s_*.log | grep -vc ' 0$')"
echo "== pf7 $(date -u +%T)"
timeout 900 node tools/pf7.cjs cyber fp8new tp 900 > shots/fp8/pf_new.log 2>&1; cp shots/fp7/pf7_cyber_fp8new.json shots/fp8/ 2>/dev/null
Q=oldslice timeout 900 node tools/pf7.cjs cyber fp8old tp 900 > shots/fp8/pf_old.log 2>&1; cp shots/fp7/pf7_cyber_fp8old.json shots/fp8/ 2>/dev/null
echo "== reg A $(date -u +%T)"; timeout 2400 node tools/regress_fresh.cjs plans/r5_regress.json shots/fp8/regA 320 180 > shots/fp8/regA.raw 2>&1; grep -E "js->|ERR|PAGEERROR" shots/fp8/regA.raw | cut -c1-300 | tail -15
echo "== reg B $(date -u +%T)"; timeout 1500 node tools/regress_fresh.cjs plans/r6_cyber_smoke.json shots/fp8/regB 320 180 > shots/fp8/regB.raw 2>&1; grep -E "js->|ERR|PAGEERROR" shots/fp8/regB.raw | cut -c1-300 | tail -12
echo "== chain done $(date -u +%T)"
