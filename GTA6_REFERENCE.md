# GTA 6 reference — implementable specifics for 索拉纳港 Port Solana

**Every future round must read this file before choosing work.** Compiled 2026-11-20 (game released 2026-11-19) from
reviews, Digital Foundry analysis, launch-night captures and frame-by-frame breakdowns. Reference stills (study only —
never shipped, © Rockstar Games) live in `v3/ref/gta6/` (55+ images; filename prefix = source:
`mh_` mapheist.com Extended-Look frames, `vm_` vicemanual.com PS5 launch captures, `df*_` Digital Foundry,
`wx_` Rockstar/Weather Channel weather shots, `ri_` Rockstar music-page stills, `vice_`/`yt_` press frames).
Our game stays original: copy *layouts, proportions, light behaviour, density*, never names/logos/characters/icons.

Key sources (cited per item below by tag):
- [DF-EL] https://www.digitalfoundry.net/features/gta-6-an-extended-look-analysis-perhaps-the-most-impressive-showcase-weve-ever-seen-in-real-time-rendering
- [DF-R] https://www.digitalfoundry.net/reviews/grand-theft-auto-6-a-landmark-achievement-that-redefines-a-console-generation
- [DF-T2] https://www.digitalfoundry.net/articles/digitalfoundry-2025-gta-6-trailer-2-tech-breakdown-incredible-realism-impressive-rt-astonishing-detail
- [MH-HUD] https://mapheist.com/en/analysis/gta-6-interface-breakdown
- [MH-EL] https://mapheist.com/en/analysis/gta-6-extended-look-breakdown/
- [VM] https://vicemanual.com/gta-6-screenshots (launch PS5 captures: HUD, map, phone, settings)
- [UX] https://ux-news.com/gta-vi-ui-screenshots-navigation-feedback/
- [VA] https://www.vice-atlas.com/briefings/gta6-hud-explained
- [GN] https://gtanerd.com/guides/gta-6-hud-and-minimap/
- [MAPNET] https://www.gta6map.net/wiki/gta-6/guides/gta-6-hud-ui-settings  and  .../gta-6-camera-settings
- [CAM] https://howtovideogame.com/gta-6-change-camera-view , https://playday.one/2026/11/18/all-in-game-options-in-gta-6
- [GS] https://www.gamespot.com/reviews/grand-theft-auto-6-review/ ; [IGN] https://www.ign.com/articles/grand-theft-auto-vi-review ;
  [ARS] https://arstechnica.com/gaming/2026/11/grand-theft-auto-vi-the-ars-technica-review/ ; [QS] https://quantslant.com/gta-6-review/
- [WX] https://www.mmoexp.com/News/gta-6-gets-drenched-in-six-new-screenshots-featuring-storms-fog-and-heavy-rain.html (6 official weather stills)
- [RI] https://rockstarintel.com/3-new-stunning-gta-6-screenshots-released-by-rockstar/

---------------------------------------------------------------------------------------------------------------------

## 1. HUD (contextual, four corners, mostly empty)
| Element | GTA 6 specific | Source |
|---|---|---|
| Philosophy | Default HUD hides itself: walking quietly = nothing or just minimap; bars/cash/stars fade in on change, press D-pad-down to peek; fade out after a few s. Driving = minimap (+ GPS distance) only. | [MH-HUD] [VA] [MAPNET] |
| Minimap | **Bottom-left rounded rectangle** (not circle), ≈16% screen width × 15% height, ~1.2% margin. **Light translucent plate** (pale grey roads on light grey/teal, water light teal) — not GTA5's dark map. Route = **pink/magenta** thick line; distance to waypoint (e.g. "0.77 mi") small white text at the plate's top-left; small north marker at the bottom-left corner; player = white arrow in dark circle. 3-D buildings in the map. | [MH-HUD] frame `mh_el-ui-minimap.webp`, `mh_el-sentinel-drive`, [GN] |
| Minimap states | Whole plate tints **solid blue** during an active chase (`mh_el-chase-hud`) and **red/pink** over the police search area (`mh_el-heli-chase`, `mh_el-livestream`). Police are NOT dots on the map. | [GN] [VA] frames |
| Status bars | **Top-left**, slim horizontal bars each with a small icon: health = pink + heart (notch at ~25%), stamina = mint/teal + bolt (only while sprinting/fighting), focus = purple + eye. GTA5 arc under the minimap is gone. | [MH-HUD] `mh_el-ui-bars.webp` [VA] |
| Wanted | **Top-right**, small (~2% screen height) **6 stars**; unlit stars stay visible as dim grey outlines; white while police see you, **red** when they lost sight ("heat"), hollow-white = crime known, culprit unknown. A row of small red circular "evidence" icons under the stars (face, outfit, car, weapon, camera, pair). | [MH-HUD] [VM] `vm_gta-6-wanted-stars-hud.webp` |
| Ammo | Top-right under/next to stars: weapon silhouette + "17/80" (clip/reserve) in condensed bold white. | [MH-HUD] |
| Money | Two figures only on change/peek: bank (top) and cash (bottom, green wallet icon). | [MH-HUD] |
| Prompts | Context prompts as **button glyph + ALL-CAPS label** stacked near the subject/right side ("SLIM JIM", "SMASH WINDOW"); tutorial hints in a dark translucent box **top-left**. Bottom-right: race/progress counters in condensed numerals. | `mh_el-loc-clewiston`, `vm_gta-6-run-sprint-tutorial` |
| Fonts/colours | Condensed bold grotesk for numbers/headers, clean geometric sans for body; white with soft shadow (no heavy black outline). Accent palette: pink/magenta, purple, mint, cyan route on map screen. Map screen = muted purple/navy. | [UX] [VM] |
| Street names | Off by default (option). Area name not shown permanently. | [MAPNET] |

## 2. Camera
- Third-person on foot sits **close and low-ish, slightly right of the character** (shoulder offset), character ≈ 1/3–1/2 frame height; three heights Low/Medium(default)/High. Follow speed default 10/10 (snappy), driver follow delay 0. [CAM]
- Driving cam: low, close chase — car occupies ≈ 25–30% of frame width, horizon at ~45% height, camera ~1.4 m above road, slight lag on turns (`mh_el-sentinel-drive`, `mh_el-starfish-sign`).
- Motion blur default 3/10, camera bob default 10/10 (walk/run bob on), camera shake on (explosions, crashes, gunfire), weapon sway on. Cinematic slow-mo kill-cam and crash-cam. [CAM] [MH-EL]
- Vertical FOV estimated ≈ 50–55° (from frame proportions; horizontally ~80° at 16:9). Phone is used in first person without pausing. [The Verge]
- 30 fps target, so motion blur is part of the look. [DF-R]

## 3. Colour grading & tonemapping
- **Neutral-filmic, photographic**, not the GTA5 teal-orange: highlights roll off softly (HDR spec highlights >1500 nits on HDR displays), **deep but not crushed shadows**, natural saturation; Florida daylight reads **crisp: deep cobalt zenith, white cumulus, high sun/shade contrast**. [DF-R]
- Midday: strong blue sky gradient (zenith ~#2f5fa8 → horizon pale #c9d8e6); shadow side of buildings cool blue-grey; sunlit stucco near-white. (`mh_el-van-stop`, `vice_beach_crowd`, `ri_hero_street`)
- Golden hour: warm amber key, long shadows, sky stays blue above with peach horizon; backlit palms silhouette with rim light; lens flare/bloom around the sun (`mh_el-sentinel-drive`).
- Overcast: desaturated, flat grey-blue, soft shadows (`dfr_overcast-*`).
- Night: **realistically dark** ("Rockstar allows the world to be realistically dark" [IGN]); ambient near zero, light only from practical sources — sodium lamps, neon, storefronts, headlights; high local contrast; saturated neon pink/cyan/purple (`ri_album_city`, `yt_oceandrive_night`, `dfs_1f8188b3bc351`).
- Dusk: purple-magenta sky, tower windows lighting up, warm sodium lamps already on (`dfs_47389a6ce1879`, `df_76189f064aa3d`).
- Special: nitro boost = oversaturated gradient filter (race-only effect). [MH-EL]

## 4. Lighting
- Ray-traced diffuse GI everywhere: indirect bounce respects occlusion and colour bleeding (sunlit pavement lights the underside of awnings; red walls tint nearby surfaces). Emulate with brighter warm ground-bounce hemisphere + coloured AO. [DF-EL] [DF-T2]
- RT reflections on opaque + transparent surfaces incl. rough ones (car paint, wet floors, leather). Low-res/blurry under motion. Mirrors are planar. [DF-EL] [DF 63-screenshots news]
- Shadows: refined shadow maps with **variable penumbra** (sharp near contact, soft far). PS5 Pro: RT shadows, pin-sharp contact shadows. [DF-EL] [DF-R]
- Sun:sky ratio high — sunlit surfaces 4–6 stops above shade at midday. Florida sun "blinding". [DF-R]
- Night practicals: police light bars wash entire streets red/blue; headlights through windows cast moving light; sodium streetlights orange pools; neon tubes on Deco hotels; storefront spill; light-up billboards. [ARS] [DF-T2]
- Interiors: tinted/stained glass throws coloured light; open storefronts with full interiors visible. [DF-R]

## 5. Atmosphere & weather
- Physically based sky + **procedural volumetric clouds** (from RDR2 tech); **localised weather** — rain over specific districts, visible storm cells casting cloud shadows, puddles persisting after rain. Hurricanes / tropical storms exist. [DF-R] [WX]
- Humidity haze: distant towers fade to pale warm grey-blue; sea fog rolling over the skyline (`wx_seafog_skyline`); low morning mist over fields/water (`wx_morning_mist`).
- Heat shimmer / mirage on long straight roads on hot days. [DF-R]
- Rain: heavy streaks, splashes, road spray behind cars, wet roads with long light streaks, road reflectors visible (`wx_keys_rain_night`, `wx_keys_highway_rain`).
- Birds (gulls, vultures circling, ibis), planes overhead at different altitudes. [Kotaku review]

## 6. City
- **Districts**: Vice Beach/Ocean Drive (2–6 storey Art Deco/MiMo hotels, pastel stucco, neon, pink sidewalks), downtown (40–60 floor glass towers, curved/terraced condo towers, elevated metro rail), midrise residential (6–12 floor stucco with balconies), strip malls (1-storey arcades with stucco arches, painted signs), port (container cranes), suburbs (pools), Keys/swamps/rural. Streets narrower than GTA 5, thicker traffic. [QS] [ARS] [DF-R] frames
- **Signage density very high**: every storefront unique, hand-painted + backlit signs, posters, "OPEN" neon, prices in windows, billboards on poles, murals. "No two stores look the same." [GS]
- **Street furniture** (seen in `mh_el-van-stop`, `dfr_overcast-pedestrian`, `dfr_outside-a-bar`): wooden + concrete **utility poles with sagging power/telephone lines** everywhere outside the Deco core; cobra-head and decorative lamps; **STOP signs**, yellow diamond pedestrian/school signs, speed-limit signs, green street-name blades; trash cans (green/black), newspaper boxes, utility boxes (grey/green cabinets), fire hydrants, storm-drain grates, manholes, bus benches/shelters, bollards, parking meters, chain-link fences, construction cones/barrels, palm planters.
- **Roads**: asphalt with heavy patching, tyre wear, oil stains; **green bike lanes with dashed green conflict markings**, red/pink colored crosswalks, ladder crosswalks, stop bars, painted arrows; yellow detectable-warning pads at kerb ramps; concrete sidewalks with expansion joints, cracks, gum stains; grass verges with sprinkler-burnt patches.
- **Vegetation**: mixed: royal/date/sabal palms, coconut palms leaning; **broadleaf live oaks & sea grapes with dense canopies**, red-flowering royal poinciana, hibiscus hedges, bougainvillea, tall clumping grass; every surface has some vegetation; wind moves all leaves. [Kotaku] frames
- Parking lots: worn white stall lines, wheel stops, light poles, cars parked at angles.
- 600+ enterable interiors; 3-D map colours enterable buildings. [QS]

## 7. Vehicles
- 100+ unique cars; off-brand designs mixing real cues; body styles: sedans, coupes, muscle, SUVs, pickups (incl. police pickups with push bars), vans, box trucks, semis, taxis (yellow with roof sign), convertibles, tuners. [Shacknews] frames
- Paint: clear-coat with sharp sky reflections, **dust/dirt and grime layers**, panel deformation affects handling; rust on old cars (`df_a519db1035ec4`). Plates with orange emblem variant. [MH-EL]
- Lights: bright LED/halogen headlights with light cones, red tail light bars, brake glow; police = blue/red strobes that light the street. Fuel gauge exists. [DF-R]
- Traffic is dense; distant highways visible as streams of head/tail lights. [DF-R]

## 8. People
- Very high density: beach crowds of hundreds, train stops 100+ people, clubs packed; every ped handmade, 600k+ animations; strand hair on everyone. [QS] [MH-EL] [DF-R]
- Clothing: Florida casual — tank tops, shorts, sundresses, swimwear on the beach, sports jerseys, cargo shorts, caps, sunglasses; skin types varied; bodies varied (heavy, thin, tall).
- Behaviours: phones out filming, groups chatting, sitting on benches/curbs, leaning on walls, reacting to guns before shots, fleeing into shops. [DF-R] [MH-EL]

## 9. Water / beach
- Bright cream-white sand with footprints and debris, turquoise→teal→deep blue water bands, white foam lines; dense colourful umbrellas, striped loungers, towels, lifeguard towers, jet skis; gulls and sandpipers. (`vice_beach_crowd`, `df_bfcca4a6af61d`)
- Water surface varies: choppy open ocean, calm glassy inland canals; clear springs show bottom. [DF YouTube review] (`mh_el-airboat`)

## 10. Audio / radio
- Multiple licensed radio stations + talk radio; layered crowd murmur, footsteps per material, surround propagation; vehicle audio reacts to damage. [DF-R]

## 11. Gameplay systems relevant to look
- 6-star wanted with evidence (face/outfit/car/weapon/camera/pair); police dispatch from stations, need line-of-sight; red search zone on map; clothing change drops "outfit". Focus mode (slow-mo, highlights cops). Cash vs bank (ATM). Fuel. Phone usable while walking/driving. [MH-HUD] [DF-R] [VM]

---------------------------------------------------------------------------------------------------------------------

## Top 10 differences: Port Solana v3.3 vs GTA 6 (fresh shots `v3/shots/r11base/`, ranked by visual impact)
1. **Sky + grade**: our day sky is milky/white-washed and low-contrast (fog too bright, sky HDRI pale); GTA 6 has a deep blue zenith, crisp clouds, strong sun/shade contrast and neutral filmic grade. Whole image looks hazy-grey.
2. **Empty streets / no street furniture**: no utility poles/power lines, almost no signs (STOP, ped, speed, street-name), bins, hydrants, cabinets, newspaper boxes, bus shelters; GTA 6 frames are packed with this clutter.
3. **Vegetation monotony**: only palms (fronds read as black cut-outs at golden hour), no broadleaf canopy trees, hedges, flowering shrubs.
4. **HUD is GTA 5-style**: dark minimap + bars under it, big money top-right, permanent area name. GTA 6: bars top-left, small 6 stars + ammo top-right, light translucent rounded-rect minimap, contextual fade.
5. **Facades/storefronts**: ground floors read as dark checkerboards, no shop signage variety, no awnings/posters; upper floors flat.
6. **Road surface detail**: road too wide and clean, no bike lanes, coloured crosswalks, patches, storm drains, kerb ramps.
7. **Traffic & crowd density** far below GTA 6 (17 peds, ~40 cars over the whole map).
8. **Night**: needs to be darker overall with stronger practical light pools (sodium lamps, storefront spill, headlight cones).
9. **Beach**: sand too brown/dark, beach nearly empty (no umbrellas, loungers, towels, people).
10. **Tower glass/vehicle reflections**: glass reflects only the sky; cars lack dirt/wear.

### Status after v3.4 (shots/r15)
1 sky/grade — done (blue zenith, neutral-filmic; dusk/overcast looks still thin). 2 street clutter — done (poles/wires/signs/shelters/boxes).
3 vegetation — partly (broadleaf trees added; no flowering trees/hedges). 4 HUD — done (layout matched, original styling).
5 storefronts — done for Deco/Tideline; midrise/tower facades still flat. 6 roads — partly (bike lanes, arrows, drains; no coloured crosswalks).
7 density — partly (40 peds / 27 cars; GTA6 far denser). 8 night — done (dark + practical pools + headlight cones).
9 beach — partly (dense umbrellas/towels; no sunbathers). 10 reflections — partly (bay cube probe for towers; cars still sky-only; dirt added).
