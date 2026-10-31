# Desire Tracker

**Desires** in the toolbar (GMs only) opens the Desire Tracker: the characters of the dashboard's
active squad (without a squad, the characters players own), each with their player and their
**Desire**, the Genesys motivation from the sheet's Basic Information tab (also shown and edited on
the dashboard cards).

- **Fulfilled**: click the circle to mark a character's Desire fulfilled this session; click again
  to undo. The mark keeps the Desire's text from that moment, so if the player then writes a new
  Desire, the row still shows what was fulfilled. ×N is how many times that character's Desire was
  fulfilled over all sessions.
- **How (note)**: an optional note on a fulfilled Desire (saved when you leave the field or press
  Enter).
- **Session**: name the session (for example *Session 12: The Citadel*); without a name it is
  *Session N*. The bar shows when it started and how many Desires were fulfilled.
- **New session**: after a confirmation, files the session's marks under **Earlier sessions** (name,
  dates, and each character's fulfilled Desire and note) and starts the next session empty. A session
  with nothing marked is not kept.

A character who leaves the squad keeps their mark for the session (shown as *not in the squad*).

The data is one world setting (`desireTracker`), shared by every GM; players can't see or change it.
The last 100 sessions are kept. Files: `scripts/desires/desire-core.js` (rules, unit-tested in
`tests/desire-core.test.js`), `scripts/desires/desire-tracker.js` (window and settings),
`templates/desires/desire-tracker.hbs`, `styles/desires.css`.
