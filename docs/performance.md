# Performance

## UI Performance window

The **UI Performance** button in the toolbar (next to the Scene list) opens a window over the free
scene area, for every user. It measures this computer from the moment the game loads; the cost is
tiny (a timestamp per frame, per hook call and per window render, and a snapshot every few
seconds).

- **Top left, statistics:** UI and canvas frame rate, slow frames (over 34 ms), freezes (over
  100 ms), the worst frame, memory, page size and running animations; the browser, GPU, CPU,
  screen, Foundry/system versions and the Scene. Below: **slow-frame time by code** (which module,
  system or Foundry script was running during slow frames; Chrome and Edge only), the **slowest
  window renders** and the **hooks** that took the most time.
- **Bottom left, graphs:** a snapshot every 10 seconds (change it in the window; 0 pauses) of fps,
  canvas fps, slow frames, freezes, long tasks and memory (Chrome/Edge), page elements and
  animations.
- **Right, loaded assets:** everything loaded since the page opened (scripts, styles, images,
  sounds, canvas textures with the GPU memory they use), sorted by size, with a filter. Files over
  5 MB are highlighted. **Rescan** checks again (e.g. after changing Scene).
- **Buttons:** **Lag now!** (press when you feel a stutter: the last 5 seconds are saved in the
  report), **Detailed report** (a readable summary; **Send to GM** whispers it to the GMs with a
  *Download full report* button, or download/copy the JSON), **Reset**.

Firefox gets everything except slow-frame attribution, long tasks and memory, which only Chromium
browsers provide.

## Reduce visual effects

A per-player setting that turns off the dashboard's and sheets' animations, glows and angled
corners. Try it on a laptop or older computer. Animations are also off whenever the operating
system asks for reduced motion.

## What the addon does to stay fast

- **Lightweight images:** large actor art is shown as small WebP copies (see
  [lightweight-images.md](lightweight-images.md)).
- **Sheets:** starwarsffg rebuilt the whole sheet's data once per skill (35+ times) every time a
  sheet rendered, to draw the skill dice. The addon makes those calls share one result, which makes
  opening sheets and every button on them much faster (`scripts/sheet-patches.js`).
- **Animations** only move layers (no repainting), and pause while hidden.

## For developers

`scripts/perf/perf-core.js` (pure, unit-tested) holds the statistics and chart paths;
`scripts/perf/perf-collector.js` patches `Hooks.call`/`callAll` and application renders
(ApplicationV2 `render`, Application V1 `_render`), observes `long-animation-frame`, `longtask` and
`resource` entries (with the resource buffer raised to 5000), runs a `requestAnimationFrame` loop
and takes snapshots; assets also come from the page's images and PIXI's texture cache.
`scripts/perf/perf-window.js` is the window (`scripts/ui/scene-space.js` fits it to the free scene
area). In the console, `azecraftPerf.buildReport()`
returns the report. To reproduce a slow machine in Chromium, throttle the CPU in the DevTools
Performance panel (4× or 6×).
