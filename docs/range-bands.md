# Range bands

Rings around a token that show the Genesys range bands (Engaged, Short, Medium, Long, Extreme), so
everyone can see at a glance how far things are. It replaces the Combat Distances module and is
written from scratch for this module (Combat Distances is GPL; none of its code is used).

## Using it

- **Token HUD**: right-click a token and press the ring button (a dot in a circle) at the bottom of
  the left column. Press it again to hide the rings.
- **G**: shows the rings for every selected token, or hides them if they all show them already.
  Change the key in *Configure Controls* (FFG Azecraft Addon). While the Combat Distances module is
  active (it also uses G) the key has no default; set one there if you want it.

Only you see the rings you switch on; other players don't, and they are gone after a reload or a
change of scene. They follow the token as it moves and are drawn on the map, so they pan and zoom
with it. Token art stays on top of them; manual fog covers them.

Each ring is the far edge of a band, labelled with its name and distance in the scene's units
("Short 30 ft"). Beyond the last ring is out of range.

## Settings (GMs)

Configure Settings → FFG Azecraft Addon (world, so every player sees the same bands):

- **Range bands**: on by default. Off removes the feature (needs a reload).
- **Range bands: bands** (*Configure range bands*): the bands (label, distance, colour; up to 8),
  whether distances are in **grid squares** or **scene units** (ft, m), ring width and opacity, the
  shading opacity and whether to show labels. *Genesys defaults* puts the defaults back (save to
  keep them).
- **Range bands: grid shading**: also colour the squares or hexes of each band. *Cells fully inside
  a band* colours a cell with the nearest band it fits in completely; *Cells a band touches* with the
  nearest band that reaches into it. Off by default. Gridless scenes show rings only.

### The defaults

Genesys gives no exact distances: Engaged is close enough to touch, Short is up to several metres,
Medium up to several dozen metres, Long beyond that and Extreme the farthest. On a 1.5 m (5 ft)
square, counted from the token's edge:

| Band | Squares | Metres | Feet | Why |
|---|---|---|---|---|
| Engaged | 1 | 1.5 | 5 | The squares next to the token |
| Short | 6 | 9 | 30 | "Several metres": a room or a corridor |
| Medium | 16 | 24 | 80 | "Several dozen metres": across a typical battle map |
| Long | 40 | 60 | 200 | Off most battle maps |
| Extreme | 80 | 120 | 400 | Far edge of Extreme: about as far as a fight on foot reaches |

Distances are in grid squares by default so the same bands work on 5 ft and 1.5 m scenes. Switch to
scene units if your scenes use different square sizes and you want real distances.

Rings are measured from the token's edge (its centre plus half its size), so a large token's Engaged
ring still reaches the squares next to it. With *Cells fully inside a band* the squares around a
token are often only partly inside the Engaged ring (circles cut corners), so they count as Short;
*Cells a band touches* shades them Engaged.

## How it works (developers)

- Code in `scripts/range-bands/`: `range-bands.js` (settings, key binding, Token HUD button, hooks),
  `range-layer.js` (the canvas layer), `range-config.js` (the configuration window) and the pure,
  unit-tested `range-core.js` (configuration clean-up, radii, which band a cell is in). Template in
  `templates/range-bands/`, styles in `styles/range-bands.css`, tests in `tests/range-bands.test.js`.
- Ids: layer `canvas.azecraftRangeBands`, settings `ffg-azecraft-addon.rangeBandsEnabled`,
  `rangeBandsConfig` (an object: `unit`, `lineWidth`, `lineAlpha`, `fillAlpha`, `labels`, `bands`),
  `rangeBandsShading`, menu `rangeBandsConfigMenu`, key binding `rangeBandsToggle`. Nothing is shared
  with Combat Distances.
- The layer sits in the interface group at zIndex 180: below the tokens layer (200), whose token void
  meshes let the token art (in the primary group) show through, and below manual fog (190 and up).
- Which tokens show rings is an in-memory set of token ids per client. A redraw of the same scene
  keeps them; another scene drops them; deleting a token removes its rings.
- `refreshToken` moves the rings with the token (also during its movement animation). Shading
  depends on where the token is on the grid, so it is hidden while the token moves and drawn again
  200 ms after it stops. Shading covers the scene's area only and is skipped above 40 000 cells.
- Cells come from `canvas.grid.getOffsetRange`, `getCenterPoint` and `getShape`, so square and hex
  grids work the same way.
