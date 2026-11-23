#!/bin/bash
cd /workspace/work/wt/perf_debug1
echo "== A"; timeout 2400 node tools/regress_fresh.cjs plans/r5_regress.json shots/fp4/regA 320 180 2>&1 | grep -E "js->|ERR|PAGEERROR" | cut -c1-600
echo "== B"; timeout 1500 node tools/regress_fresh.cjs plans/r6_cyber_smoke.json shots/fp4/regB 320 180 2>&1 | grep -E "js->|ERR|PAGEERROR" | cut -c1-600
echo "== reg done"
