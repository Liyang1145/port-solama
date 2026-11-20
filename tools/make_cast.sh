#!/bin/sh
# Rebuild the character cast: realistic MakeHuman (CC0) people with CMU mocap clips via ara3d (MIT), then optimise.
set -e; OUT=/tmp/ara/out; mkdir -p $OUT
for p in "Athletic man" "The Miami Dealer" "The Corporate High-Flier" "The Gangster" "Elder" "Athletic woman" "Businesswoman" "The Beach Girl" "Teen" "The American Sheriff"; do
  npx -y ara3d export --preset "$p" --detail low --animations idle,walk,run,pistol_aim,death_backward --out $OUT; done
# then: npx gltf-transform optimize IN OUT --texture-compress webp --texture-size 1024 --compress meshopt --simplify false --instance false
# mapping: hero=Athletic man, m1=Miami Dealer, m2=Corporate High-Flier, m3=Gangster, m4=Elder, f1=Athletic woman, f2=Businesswoman, f3=Beach Girl, f4=Teen, cop=American Sheriff
