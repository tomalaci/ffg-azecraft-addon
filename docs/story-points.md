# Story points (Mass Effect theme)

The Star Wars Light/Dark destiny tracker at the bottom left is replaced by a **Story Points** bar
in the dashboard's style. The rules are the same as before (Genesys story points):

- **Destiny** points (blue, the system's Light side) are the players'. Spend one to push the story
  in your favour, and it passes to the GM.
- **Doom** points (red, the system's Dark side) are the GM's. Spend one for a story setback,
  and it passes back to the players.

Both names can be changed (see Settings below).

It sits right of the player list, in the corner under the mission dashboard's squad column, and
fills the space there. When that corner is too narrow (small or narrow screens), the bar turns
vertical: Doom on top, Destiny at the bottom, and the controls beside it.

The bar is a tug of war. Each segment is one point: Destiny fills from the left in blue, Doom
fills from the right in red. As the players spend Destiny, the blue shrinks and the red grows.

## Using it

- **Players:** click the blue **Destiny** box to spend a Destiny point. A GM must be online, because
  the active GM's client applies the change.
- **GMs:**
  - Click the red **Doom** box to spend a Doom point.
  - Use the **+** under a side to pull a point over from the other side: + under Doom moves one
    Destiny point to Doom, + under Destiny moves one Doom point to Destiny. The total stays the
    same, and no chat message is posted.
  - Use − / + in the middle, around the total, to change how many story points are in play (e.g.
    at the start of a session). A new
    point goes to the side with fewer points (Destiny on a tie), and a removed point comes from the
    side with more (Doom on a tie), so the balance stays as it was.
  - The two buttons at the top open the system's **Group Manager** and **Request story point
    roll** (the system's destiny roll).
- Every spend posts a short chat card, e.g. "Destiny story point used, it passes to Doom.
  Destiny 2 · Doom 4".

## Settings (Configure Settings → FFG Azecraft Addon, world)

- **Mass Effect story points:** on by default. Turn it off to get the original tracker back.
- **Story points: players' side name** (default *Destiny*) and **GM's side name** (default
  *Doom*).
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
