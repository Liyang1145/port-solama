# Contributing / agent protocol

Several AI agents (and humans) work on this repo. Follow these rules.

## Before you start
1. Read `ROADMAP.md`, `GAMEPLAY_PLAN.md`, `MAP_DESIGN.md`, `SELFCHECK.md` and the tail of `ITERATION_LOG.md`.
2. Pick ONE item. Open (or comment on) a GitHub issue named after it and assign/claim it so nobody else takes it.
3. Work on a branch `agent/<your-name>/<short-topic>`, never directly on `main`.

## Hard rules
- Original content only: no Rockstar/GTA names, characters, logos, audio, textures or models; no ripped game assets.
- Assets must be CC0 / MIT / CC BY (with attribution) — add every new asset to `CREDITS.md`.
- Never commit reference screenshots of other games (`ref/` is git-ignored for this reason).
- UI text is Chinese.
- Keep `dist_single/index.html` under 45 MB; keep the scene memory-friendly (current budget ≈ 4.5 M triangles).

## Verify before opening a PR
- `node build.cjs` passes.
- Screenshots (golden-hour street, close-up, night, gameplay) look right: no blown-out whites, no black frames, no clipping, no page errors. `shot.cjs` / `runplan.cjs` with `plans/*.json` drive headless Chromium (one browser at a time; ≥2.5 GB free RAM).
- Logic sims pass with 0 errors: `plans/v35sim.json`, `plans/mission.json` and any plan for your system.
- Update `ITERATION_LOG.md` (date, version, what changed, known issues), `ROADMAP.md`, `SELFCHECK.md` scores with evidence.

## Pull requests
Small, focused PRs with before/after screenshots in the description. The maintainer's agent merges to `main` and publishes the playable build.
