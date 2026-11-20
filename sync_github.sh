#!/bin/bash
# Sync real/ (写实分支) game source + docs to public repo Liyang1145/port-solama (run with github credentials).
# Usage: bash sync_github.sh "commit message"
set -e
S=/workspace/projects/0a960a04-53db-40e6-a416-30a388d78d06/real
R=/workspace/work/port-solana-repo
if [ ! -d $R/.git ]; then git clone -c http.sslCAInfo="$SSL_CERT_FILE" https://github.com/Liyang1145/port-solama.git $R; fi
cd $R && git -c http.sslCAInfo="$SSL_CERT_FILE" pull -q --rebase origin main || true
# replace tracked game files (keep README/CONTRIBUTING/LICENSE/.gitignore/docs of the repo)
find $R -mindepth 1 -maxdepth 1 ! -name .git ! -name README.md ! -name CONTRIBUTING.md ! -name LICENSE ! -name .gitignore ! -name docs -exec rm -rf {} +
cd $S && tar --exclude=./node_modules --exclude=./raw --exclude=./ref --exclude=./shots --exclude='./dist*' --exclude=./RUNNING.lock --exclude=./release -cf - . | tar -xf - -C $R
mkdir -p $R/dist && cp -r $S/dist/assets $R/dist/
sed -i 's/"name":"v3-leonida"/"name":"port-solana"/' $R/package.json
cd $R && git add -A && (git diff --cached --quiet && echo "nothing to sync") || (git -c user.name=Liyang1145 -c user.email=273586200+Liyang1145@users.noreply.github.com commit -qm "${1:-sync}" && git -c http.sslCAInfo="$SSL_CERT_FILE" push -q origin main && git log --oneline -1)
