# Visual targets — what "looks like GTA 6" means for this build

Reference stills studied (kept in `v3/ref/` and `g3d/ref/`):
- `g3d/ref/a.jpg` — Vice City downtown skyline at dusk across the bay: pink/purple sky, lit window grids, warm sodium street lights, long water reflections, heavy humid haze over distance.
- `g3d/ref/b.jpg` — causeway/bay at sunset, highway traffic with red tail lights, palms silhouetted, pastel-to-orange horizon.
- `g3d/ref/c.jpg` — aerial of the bay + skyline at golden hour: teal water, cream/white condo towers with balcony bands, glass towers reflecting warm sky, atmospheric perspective (towers fade to lavender with distance).
- `v3/ref/d.png` (GTA VI trailer 1, Ocean Drive) — night: Art Deco hotels with pastel stucco, neon tubes outlining fins/eyebrows/signs (pink, cyan, purple), crowded sidewalk, palms, cars with clear-coat reflections.
- `v3/ref/e.jpg` (trailer 2, exotic cars) — daylight clear-coat paint with sharp sky reflections, deep contact shadows, saturated but natural colour.
- `v3/ref/f.png` (review screenshot) — midday street: real asphalt texture with wear, crisp sun/shade contrast, lush broadleaf trees, believable people with varied clothing.
- `v3/ref/g.jpg` (IGN trailer breakdown) — beach + Ocean Drive: white sand, turquoise shallows to deep blue, lifeguard tower, umbrellas.

## Measurable targets
1. **Light**: hard warm sun (golden hour key ~5-8x the sky fill), sharp contact + long cast shadows, teal-blue shade. No flat/overcast look at the default hour.
2. **Atmosphere**: humid haze — buildings >600 m lose ~40-60% contrast and shift to the horizon colour; warmer near the sun direction (in-scattering), lavender/blue away from it. Sky must have real clouds (HDRI), not a gradient.
3. **Palette / grade**: warm highlights, slightly teal shadows, lifted (not crushed) blacks, saturated pastels; filmic tone curve (ACES), mild bloom on bright speculars and neon only, vignette, fine grain.
4. **Architecture**: (a) Art Deco hotels — pastel stucco, eyebrow ledges over windows, vertical centre fin/pylon, cornice, awnings, vertical neon signage, neon edge tubes at night; (b) bay condos — white balcony slabs + glass rails; (c) downtown — glass curtain walls with mullion grid that reflect the sky, setbacks/chamfers, crowns; lit window grids at night.
5. **Streets**: wide 4-lane asphalt with wear, tyre tracks, patching, double-yellow + dashed lanes, zebra crossings; light concrete sidewalks with joints and curbs; mast-arm traffic signals; cobra-head street lights; dense palms.
6. **Water**: turquoise shallows to deep teal, real reflections of skyline (planar), sun glitter, shore foam; wet roads at night reflect lights.
7. **Vehicles**: clear-coat paint, glass, chrome, proper wheels, contact shadows; head/tail lights at night; variety of body types; police cruisers with light bars.
8. **People**: rigged humans with walk/run/idle, varied clothing; officers distinct.
9. **HUD** (v3.4, per GTA6_REFERENCE.md §1): contextual — slim bars top-left, small 6-star row + evidence + ammo/cash top-right, light translucent rounded-rect minimap bottom-left (blue in chase, red search zone), area name only on district change.

## Shot list used for comparisons (each round)
`street` (golden hour, Tideline Drive, street level), `onfoot` (third-person behind the player), `drive` (chase cam), `beach`, `night` (wet road, neon), `skyline` (from the island toward downtown), `aerial`.
