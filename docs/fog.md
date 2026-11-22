# Manual fog

GM-drawn fog of war, brought into this module from the
[Simple Fog](https://github.com/mclemente/simplefog) module (MIT licence, kept in
`scripts/fog/LICENSE`). Players see solid fog except where the GM has revealed the map; GMs see the
map through a lighter fog so they know what is hidden.

It is based on Simple Fog **1.4.4**, the last release for Foundry V13. Simple Fog 1.5 needs Foundry
V14, but most of its fixes and tool improvements are ordinary canvas code, so they are included here
(see below).

## Using it (GMs)

Open **Manual Fog** in the scene controls on the left (an eye behind a cloud), or press **Ctrl+S**
on the canvas (again to go back to the tokens).

- **Eye** (first button): manual fog on or off for this scene. Switching it off asks first (a
  setting). The drawing is kept while it is off.
- **Brush**: paint. The *Fog Brush* window sets the brush size and the opacity.
- **Grid cells**: paint whole squares or hexes (not on gridless scenes).
- **Room**: press where the party stands and drag outwards: it reveals what can be seen from there,
  as far as you drag, stopped by walls. Open doors let it through; hold **Shift** to stop at them too.
  **Expand** (shown with the room tool) reveals the whole room at one click instead.
- **Polygon**: click the corners; click the first corner again, or double-click, to finish.
  Right-click cancels.
- **Rectangle** and **Ellipse**: drag. Hold **Shift** for a square or circle.
- **Snap to the grid** (shown with the rectangle, ellipse and polygon tools): corners land on the
  grid.
- **Eraser**: on, every tool reveals; off, every tool hides (puts fog back). **T** switches it.
  The opacity slider in the Fog Brush window gives partial values in 5% steps; 0% reveals, 100% hides.
- **Cog**: the fog's look for this scene (see Settings).
- **Bin**: start the scene over, either **Cover all** (all fog) or **Reveal all** (no fog).
- **Ctrl+Z** undoes your last action on this scene (up to 50, until you reload). **[** and **]**
  make the brush smaller or larger (with **Shift**: smallest or largest).

### Precision

Fog is made of small square pieces. **Precision** is their size in pixels: the default 10 gives
10 x 10 pieces per square on a 100 px grid; set it to the grid size and the fog covers or reveals
whole squares; 1 is pixel-exact. It is rounded down to a size that fits the scene's grid evenly (on a
64 px grid, 10 becomes 8), and on very large maps it is raised so a scene never has more than four
million pieces. Smaller pieces follow shapes more closely but take more to store and draw. Soft edges
(blur) are drawn on top, so pieces don't look blocky.

Set the default in *Manual fog: default look*, or for one scene with the cog. Changing it converts the
fog already drawn on that scene (the active GM stores the conversion when the scene is next shown).

While a GM has a player's token selected, the fog looks the way players see it (a setting).

## Settings

Configure Settings → FFG Azecraft Addon (world):

- **Manual fog**: on by default. Off removes it completely (needs a reload).
- **Manual fog: default look** (*Configure fog*): precision, GM and player colour and opacity, an overlay image
  shown in the fogged areas, soft edges (blur) and fading. The cog in the fog controls sets the same
  values for one scene; the scene keeps only what differs from these defaults (*Use the defaults*
  clears it).
- **Confirm switching off**, **On for new scenes** (off by default: fog is opt-in per scene), **Tool
  for the shortcut**, **Drawn above** (which canvas layers it covers), **Player view for GMs**.
- **New scenes: Foundry vision and fog** (off by default): new blank scenes start with Foundry's own
  Token Vision and Fog Exploration off, so players see the whole map until you switch them on in the
  scene's settings (Lighting tab). On gives Foundry's default (both on). Duplicated and imported
  scenes keep their own values. This works even with manual fog switched off.

## Next to the Simple Fog module

Both can be active at the same time while switching over. They don't share anything: each has its
own controls (*Simple Fog* and *Manual Fog*), its own fog on each scene and its own settings. A scene
with both switched on shows both fogs. Scenes drawn with Simple Fog are not converted; switch manual
fog on and draw again.

- While Simple Fog is active, new scenes never get manual fog switched on (so they are not fogged
  twice). Simple Fog's own *Auto Enable Scene Fog* setting still decides for Simple Fog.
- Ctrl+S opens manual fog. Simple Fog 1.4.4's own Ctrl+S does not work on Foundry V13 (it is
  registered with an old key name), so nothing is lost.

## Changes from Simple Fog 1.4.4

From Simple Fog 1.5 (working on V13):

- The fog only covers the scene for GMs; for players it also covers the padding around it.
- The brush draws a continuous line on fast drags (before, quick strokes left gaps).
- The polygon tool shows its edges, corners and a line to the pointer while drawing.
- The room tool reveals as far as you drag; Expand gives the old whole-room click.
- Snap to the grid for shapes, an eraser button, a "below tokens" layer option, the player view for
  GMs, tools hidden while the fog is off, Ctrl+Z through Foundry's undo.
- The grid tool follows changes to the grid size; undo keeps the right position in the history.

Fixed here:

- Switching the fog on the first time could need two clicks, and new scenes were flagged by every
  connected client (players' attempts failed with errors); now only the GM who made the scene does.
- A scene could not keep 0 or *off* as its own value (for example no blur when the default blurs),
  and the GM image opacity fell back to a missing setting.
- The unused *automatic visibility* options (their code was removed from Simple Fog long ago) are
  gone.

Faster on big maps (the stuttering Simple Fog causes on large, much-edited scenes):

- The fog is stored as pieces (see Precision) in tiles, not as a list of every brush stroke. An action
  sends only the tiles it changed, in one update; Simple Fog sent its whole stroke list twice per
  action, and the list only grows (its 5 actions on one of our scenes were 121 KB, sent again with each
  new action; the same fog here is under 1 KB).
- Opening a scene decodes the tiles instead of replaying every stroke ever drawn.
- Soft edges are worked out once when the fog changes, on a small texture, instead of blurring a
  full-map sprite on every frame; the mask is at most 4096 px instead of the whole canvas.
- Opacity is kept in 5% steps.

Not taken from 1.5: the brush palette (needs V14's palettes) and fog per scene level (V14 levels).

## How it works (developers)

- Code in `scripts/fog/`: `fog.js` (settings, key bindings, scene controls, hooks), `fog-layer.js`
  (the tools), `mask-layer.js` (the pieces, their storage, undo and the mask), `brush-controls.js`,
  `fog-config.js`, `clockwise-sweep.js` (room tool), `hexagons.js` (hex grid maths, CC0) and the pure,
  unit-tested `fog-raster.js` (pieces, tiles, encoding, painting shapes) and `fog-core.js`. Templates in `templates/fog/`, styles in `styles/fog.css`.
- The layer is `canvas.azecraftFog` (interface group), the scene control `azecraft-fog`.
- A scene's fog is `flags.ffg-azecraft-addon.fog`: `visible`, `raster` and any per-scene look values
  (including `precision`). `raster` is `{cols, rows, cell, fill, tiles}`: `cell` px per piece, each
  piece a level 0-20 (5% steps, 20 = fog), in 64 x 64 tiles keyed `"tx_ty"` and run-length encoded
  (`A`-`U` for the level, then the run length in base 36). A tile equal to `fill` is not stored, so
  *Cover all* / *Reveal all* store no tiles.
- An action paints into the pieces at once (the GM sees it while drawing), then stores the touched
  tiles in one update (`raster.tiles.<key>` or `-=<key>`); other clients decode only those tiles.
  Replacing everything (fill, precision change, undoing those) uses `==raster`. Undo keeps the tiles'
  previous text per GM in memory.
- Drawing: the pieces are a small canvas texture (one pixel each, plus a border repeating the edges so
  the blur does not fade at the scene's edges), blurred once into the mask render texture whenever
  they change (at most once per frame). The fog colour sprite and the overlay image use that mask; for
  players a padding frame covers the area outside the scene.
