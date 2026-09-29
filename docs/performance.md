# Performance

## Performance monitor

A per-player setting (Configure Settings → FFG Azecraft Addon → **Performance monitor**, off by
default; the page reloads). While on, a small panel at the top of the screen shows the frame rate,
the canvas frame rate, the share of slow frames, freezes and memory, and records from the start of
the session:

- **Frames:** fps, slow frames (over 34 ms, below 30 fps) and freezes (over 100 ms).
- **Slow-frame time by code:** which module, system or Foundry script was running during slow
  frames, with the function and what triggered it (e.g. a click on a sheet). Chrome, Edge and other
  Chromium browsers only; Firefox has no such API, so there only the frame numbers apply.
- **Renders:** how long each window (sheets, dashboard, dialogs, sidebar tabs) took to render.
- **Hooks:** time spent in each Foundry hook (all modules' handlers together).
- **Heaviest images** and slowest downloads, memory, page size and running animations.
- **Setup:** browser, GPU, CPU threads, memory, screen, Foundry/system/module versions, scene size
  and the canvas performance settings.

Buttons:

- **Lag now!** Press when you feel a stutter: the last 5 seconds of renders, slow frames and hooks
  are saved into the report.
- **Report:** shows the summary, and can **Send to GM** (a whisper with the summary and a
  *Download full report* button for the GM), download or copy the full JSON report.
- **Reset:** start counting again.

When the setting is off nothing is measured or changed, so it costs nothing.

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

`scripts/perf/perf-core.js` (pure, unit-tested) holds the statistics; `scripts/perf/perf-monitor.js`
patches `Hooks.call`/`callAll` and application renders (ApplicationV2 `render`, Application V1
`_render`) only when the setting is on, observes `long-animation-frame`, `longtask` and `resource`
entries, and runs a `requestAnimationFrame` loop. In the console, `azecraftPerf.buildReport()`
returns the report. To reproduce a slow machine in Chromium, throttle the CPU in the DevTools
Performance panel (4× or 6×).
