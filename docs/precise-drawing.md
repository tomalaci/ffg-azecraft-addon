# Precise drawing

Finer freehand drawing, an eyedropper and a "convert drawings to an image" button, brought into this
module from the [Precise Drawing Tools](https://github.com/shemetz/precise-drawing-tools) module
1.6.1 by shemetz (MIT licence, kept in `scripts/precise-drawing/LICENSE`; the convert code derives
from KayelGee's [DrawingTokenizer](https://github.com/KayelGee/DrawingTokenizer), also MIT).

## Using it

Everything is in Foundry's own **Drawing Tools** controls on the left. It works for anyone who may
draw; only the tile option is for GMs.

- **Freehand** draws as before, but follows the pointer more closely: slow, careful strokes keep a
  point as often as every 4 ms instead of Foundry's 75 ms, fast strokes fewer, so drawings stay small.
  Strokes start at once (Foundry otherwise waits until the pointer has moved 10 pixels), so short
  strokes and dots work. Pens and touch screens work too.
- **Eyedropper**: hold **K** over the map and the selected tool button shows the colour under the
  pointer; let go to make it the line colour of new drawings. Hold **Shift** as well for the fill
  colour. While K is held the scene is shown without darkness and weather, so you pick the map's own
  colours. The colour goes into Foundry's default drawing settings (the same as the cog → *Drawing
  defaults*). The key can be changed in *Configure Controls*.
- **Convert to an image** (picture icon): select drawings first (select tool, drag a box or
  Shift-click), then press it. A window shows the image with a file name, and:
  - **Download image** saves it as a WebP file on your computer.
  - **Replace with a tile (drawings hidden)** (GMs) uploads it, places a tile with it at the same spot
    and hides the drawings (they are kept, hidden, so you can bring them back). The images are saved
    in the world's folder: **`worlds/<world id>/converted-drawings/<file name>.webp`** in Foundry's
    user data (on our server, in the data folder of the Foundry installation). Pick a new file name
    for each conversion: the default one is random.

Many small drawings slow the canvas down; one tile does not. Converting finished artwork is the way to
keep big hand-drawn maps fast.

## Settings

Configure Settings → FFG Azecraft Addon:

- **Precise drawing** (world): on by default. Off removes all of it (needs a reload).
- Per user (client): **no drag resistance**, **points follow the pointer's speed**, **point spacing**
  (with the speed setting: about two points per this many screen pixels, default 50; lower is more
  detailed), **eyedropper** on or off, **convert to image button** shown or not.

## Next to the Precise Drawing Tools module

While the Precise Drawing Tools module is active, this feature stays off (both change the same
Foundry values) and GMs get a notice when they log in. Disable that module to use this one; nothing
needs converting. Images it uploaded stay in `worlds/<world id>/PDT-converted-drawings/` and keep
working.

## Changes from Precise Drawing Tools 1.6.1

- It no longer needs libWrapper (the original required it but never used it).
- Its canvas listeners and a scene-controls hook were added again each time a scene was shown and
  never removed; now they are added once per scene and removed when the scene closes.
- Foundry's values are only changed while a freehand stroke is drawn and are put back when it ends,
  also when the pointer is released outside the canvas or the scene changes (before, the sampling
  rate could stay changed).
- Pointer events instead of mouse events, so pens and touch screens get the same behaviour.
- The speed was measured with the wrong times after 30 points (positions and times were trimmed
  separately).
- Eyedropper: picking a fully transparent spot stored an invalid opacity; the scene's darkness,
  weather and the controls' fading are always put back, also when the controls are switched while K
  is held.
- Convert: the progress bar now moves (it was given the wrong field); a failed upload stops before
  hiding anything (before, it placed a broken tile and hid the drawings); the colour fix for
  half-transparent colours is applied to the image only, instead of changing and restoring the
  drawings for everyone; the image's size and position come from what is actually rendered (rotated
  drawings were sometimes cropped); only GMs (and assistant GMs) get the tile option (players may not upload files or create tiles by
  default).
- Images go to `converted-drawings/` instead of `PDT-converted-drawings/`; file names are cleaned
  (no folders or odd characters).
- Plain English names, no language file.

## How it works (developers)

- Code in `scripts/precise-drawing/`: `precise-drawing.js` (settings, the switch-over, freehand
  strokes), `eyedropper.js`, `convert-drawings.js` and the pure, unit-tested `drawing-core.js`
  (sampling maths, colours, file names; tests in `tests/precise-drawing.test.js`). Styles in
  `styles/precise-drawing.css`.
- Freehand: Foundry's `Drawing#_onMouseDraw` keeps a point only when `Drawing.FREEHAND_SAMPLE_RATE`
  ms have passed; `MouseInteractionManager` handles a pointer move at most once a frame (`dragTime`)
  and starts a drag after `options.dragResistance || 10` screen pixels. On `pointerdown` with the
  freehand tool, the canvas manager's `options.dragResistance` is set to 0.1. On each `pointermove`
  during the drag, the recent pointer speed (screen pixels per ms, last 30 samples at least 8 ms
  apart) gives an interval of *spacing / speed / 2*, between 4 and 75 ms, written to
  `FREEHAND_SAMPLE_RATE`, and `dragTime` is reset so the next move is not held back. On
  `pointerup`/`pointerupoutside`, tool changes and `canvasTearDown` the saved values are put back.
  Listeners go on `canvas.stage` at `canvasReady` (Foundry clears the stage's listeners when it draws
  a scene).
- Eyedropper: reads one pixel of `canvas.primary.renderTexture` under the pointer and writes
  `strokeColor`/`strokeAlpha` (or fill) into the core setting `DrawingsLayer.DEFAULT_CONFIG_SETTING`.
  `CONFIG.debug.eyedropper = true` logs each colour.
- Convert: each drawing is redrawn with the same graphics calls as `Drawing#_refreshShape` into a
  container placed like Foundry's shape (centre position, pivot, rotation; text as a child), rendered
  with `renderer.extract.canvas` over the container's bounds and saved as WebP (quality 0.92). The
  upload uses `FilePicker.implementation.upload("data", "worlds/<id>/converted-drawings", file)`
  after creating the folder; the tile gets the bounds' position and size.
