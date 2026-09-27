# Story points (Mass Effect theme)

The Star Wars Light/Dark destiny tracker at the bottom left is replaced by a **Story Points** bar
in the dashboard's style. The rules are the same as before (Genesys story points):

- **Squad** points (blue, the system's Light side) are the players'. Spend one for a story
  advantage, and it passes to the GM.
- **Threat** points (red, the system's Dark side) are the GM's. Spend one for a story setback, and
  it passes back to the squad.

The bar is a tug of war. Each segment is one point: squad points fill from the left in blue, threat
points fill from the right in red. As the squad spends points, the blue shrinks and the red grows.

## Using it

- **Players:** click the blue **Squad** box to spend a squad point. A GM must be online, because
  the active GM's client applies the change.
- **GMs:**
  - Click the red **Threat** box to spend a threat point.
  - Use − / + under each side to remove or add points (e.g. at the start of a session).
  - The two buttons at the top open the system's **Group Manager** and **Request story point
    roll** (the system's destiny roll).
- Every spend posts a short chat card, e.g. "Squad story point used, it passes to Threat.
  Squad 2 · Threat 4".

## Settings (Configure Settings → FFG Azecraft Addon, world)

- **Mass Effect story points:** on by default. Turn it off to get the original tracker back.
- **Story points: players' side name** (default *Squad*) and **GM's side name** (default *Threat*).
  These names also replace "Light"/"Dark" in the system's own screens, such as the Group Manager.

## How it works (developers)

- The pool is still the system's world settings `starwarsffg.dPoolLight` and `dPoolDark`.
  Nothing new is stored.
- The system's `DestinyTracker` keeps running, hidden with CSS. The widget relies on it for two
  things: player spends (`game.socket.emit("system.starwarsffg", { pool })` is applied by the
  active GM's tracker, because players cannot write world settings), and its GM menu callbacks.
- The widget (`scripts/story-points/`) is a frameless ApplicationV2 in `#interface`, placed above
  the player list. It re-renders on `updateSetting` for the two pool settings. The pool maths is
  pure (`story-pool.js`, unit-tested).
- The system's remaining Star Wars wording (`SWFFG.Lightside`, `SWFFG.Darkside`,
  `SWFFG.DestinyPool`…) is overridden in `game.i18n.translations` at `setup`.
