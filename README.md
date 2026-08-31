# CHAINSCAPE

An immersive, cinematic blockchain website built as **one continuous 3D world**.
Scrolling does not fade between sections — it flies a camera through a single
persistent digital landscape, and the copy cross-dissolves in place as you travel.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
npm run preview
```

---

## The idea

The entire page is a fixed WebGL canvas. The `<section>` elements in
`index.html` carry no visible layout of their own — they are scroll spacers
that decide **where the camera is**. Each one owns a fixed, full-viewport
overlay (`.stage`) whose opacity is driven from the same scroll position that
drives the camera, so the words and the world are never out of step.

```
scroll position ──┬─▶ CameraRig     → position · lookAt · fov · fog · bloom
                  ├─▶ section --in  → which copy is on screen
                  └─▶ world state   → what lights up out there
```

## The world

| System | File | What it is |
|---|---|---|
| Landscape | `src/world/Terrain.js` | Up to 15,000 instanced structures in **one draw call**. Position, rotation, the endless Z-wrap and the LOD all run in the vertex shader; the CPU never touches per-block data after upload. |
| Gold pathways | `src/world/GoldPaths.js` | Manhattan circuit traces at ground level plus elevated data highways, with light packets running every route. Two draw calls total. |
| Floating vocabulary | `src/world/Glyphs.js` | Short tokens adrift among the structures — WEB-3, TRUST, HASH, PROOF, VERIFY, SECURE, LEDGER, SHA-256, CONSENSUS, IMMUTABLE, KEY, # — and the **IB LAB** wordmark as one entry among many. No currency or coin references. Set in Syncopate, rasterised once into a canvas atlas where each entry records its own tight sub-rect and aspect, so a `$` is not stretched to the width of a wordmark. Fades with altitude so nothing silhouettes against open sky, and fades up close so nothing looms. Edit the `ITEMS` table at the top of the file to change the words, sizes or how often each reads gold. |
| Data particles | `src/world/Dust.js` | Two populations in one buffer: a drifting field that wraps endlessly around the viewer, and orbiters that gather around landmark structures. A hovered object becomes an attractor. |
| Structures | `src/world/CircuitBlock.js` | The signature material — machined navy metal with triplanar gold circuitry flowing across it, a fresnel rim, and a tamper state that tears the surface into red static. |
| Landmarks | `src/world/Landmarks.js` | The genesis block, the ledger hub, the anatomy block, the five-block chain, and five distinct application forms. |
| The swarm | `src/world/NodeField.js` | A decentralised mesh with no centre. Nodes reveal outward as the camera pulls back; consensus travels through it as a spherical wave of gold. |
| Camera | `src/world/CameraRig.js` | Keyframes are **real positions in the world**, anchored to a section and a fraction of its scroll, then critically damped so fast scrolling never becomes a jump cut. |
| Grade | `src/world/Post.js` | Bloom, chromatic aberration, vignette, grain, and a navy-shadow / warm-highlight split. |

The landscape is generated once, deterministically (`src/world/layout.js`):
the gold paths are laid out **first**, their cells are recorded, and the block
field is grown around them — which is why the pathways read as clean channels
cut through a dense technological city rather than lines drawn on top of it.

## Interaction

- **Hover any structure** — its circuitry activates, a label appears, and the
  particle field is pulled toward the point you are pointing at.
- **Section 03** runs real SHA-256 (`src/ui/sha256.js`) over a real transaction
  string. Edit the amount and the digest recomputes; the characters that
  changed are lifted out in white, and the mini-ledger below shows the
  downstream blocks refusing to validate.
- **Section 04** tampers with block 03 and breaks the chain after it.
- **Mobile** gets the same five-item index as a full-screen overlay behind the
  menu control, since the inline nav bar cannot hold it at that width.
- **The live monitor** simulates a chain: transactions accumulate, blocks seal
  on an irregular cadence, and every sealed block fires a gold shockwave
  through the landscape. All figures are simulated and labelled as such.

## Performance

Roughly **80 draw calls / ~235k triangles / ~18k points** per frame at the
high tier — instancing and GPU-side wrapping do the heavy lifting.

Three quality tiers are chosen automatically from device signals and can be
cycled with the control at the bottom right. If the frame rate drops below
~34 fps for two consecutive seconds the renderer protects it in stages —
pixel ratio, then bloom, then tier — rather than letting the experience stutter.

Without WebGL the page falls back to a CSS landscape and keeps the whole
story, the hashing lab and the live monitor working. `prefers-reduced-motion`
stills the camera drift and shortens the reveals.

Useful query params: `?tier=high|medium|low`, `?noadapt`, `?debug`.

## Dev tools (optional)

`tools/` drives the built site in Chrome to capture the journey and catch
console errors. Set `CHROME_PATH` if Chrome is not in the default location.

```bash
npm run build && npx vite preview --port 4173
node tools/shoot.mjs http://127.0.0.1:4173/ shots
node tools/responsive.mjs http://127.0.0.1:4173/ shots-mobile 390 844
node tools/responsive.mjs http://127.0.0.1:4173/ shots-nogl 1440 900 --nogl
```
