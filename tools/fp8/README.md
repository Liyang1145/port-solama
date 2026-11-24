fix_pt8 node harness for map-B parcel generators (no browser). Build: node_modules/.bin/esbuild tools/fp8/entry.js --bundle --format=esm --platform=node --outfile=tools/fp8/bundle.mjs
t2 per-style timing (BAL=4000 ~400 MB ballast heap), t3 allocation sampling, t4 old-vs-resumable byte equality (+ logs, svcF, global state leak), t5 slice-time distribution (MODE=old|new).
