# XP Management

A GM-only toolbar tab (between UI Performance and Admin Panel) for the player characters' XP. It
opens in the free scene area, like the other toolbar windows. Everything it shows and changes is
stored in the world, so every GM sees the same list and the same history; the window only
remembers, per GM, which rows are selected or open.

## Using it

- **Add character** (below the list): pick a player character. The list starts empty; every GM
  sees the characters added. **×** on a row removes the character from the list again (its XP and
  log are not changed).
- Each row shows the character's **total** XP (all XP ever given), **available** XP and **spent**
  XP, plus the newest XP log entry. The card icon opens the sheet. Spent comes from the XP log:
  purchases and *Adjust XP* entries (negative spends, positive gives back), minus refunds; total
  is available + spent. Only GMs change the total, here.
- **Repair totals** (shown when needed): the sheet's *Adjust XP* used to lower the stored total
  along with available when a player recorded spending with a negative amount, so the sheet showed
  e.g. total 5 for a character given 95 who spent 90. A warning icon marks those characters; the
  button sets their stored total back to available + spent (after a preview; the XP Ledger records
  it). Available XP and XP logs are not changed.
- **Changing XP:** tick one or more characters (or *All*), choose **Add**, **Reduce** or **Set total
  to**, enter the XP and a **reason** (required), then **Apply**. You see the characters and
  their current XP first and confirm.
  - Total and available move together, so purchases stay paid for. *Set total to* moves available
    by the same difference. A change that would take the total below 0 is refused.
  - Each character gets a "granted" entry in its own XP log (negative for a reduction: a
    correction, not spending), the same log as the character sheet's XP log tab.
  - Each change also adds a row to the **XP Ledger** (a GM-only journal, created on the first
    change): when, character, change, total before → after, available, reason and GM. The newest
    30 rows show at the bottom of the window; *Open journal* shows them all.
- **XP log:** click a character's name to open its XP log. Date, action, description and the XP
  numbers can be edited in place (saved when you leave the field) and show on the character
  sheet straight away. The bin deletes an entry. Editing or deleting log entries never changes
  the character's XP. An entry with a link icon belongs to a purchase the sheet can refund;
  deleting it removes that refund option.
- If another GM changed the same XP log while you were editing, your edit is not saved and the
  current log is shown instead.

## The sheet's Adjust XP

The eraser icon on the character sheet's XP log tab (*Adjust XP*) takes an amount and a reason, as
before, but changes **available XP only**: a negative amount is XP spent, a positive one gives
spent XP back (e.g. an undone purchase). The total (all XP given) stays; GMs set it in XP
Management. The system changed both, so total and available moved together. It adds an
"adjusted" entry to the XP log.

## Planned (0.6.0)

Buying talents, characteristics and skills with XP from the addon's own screens instead of the
system's drag-and-drop. Until then, XP Management reads and edits the XP log as the system writes
it.

## How it works (developers)

- XP is the system's `system.experience.total` / `.available`; shown values come from
  `xpStatus()` (available as stored, spent from the log or total − available if more, total =
  available + spent). Purchases are Active Effects that
  subtract from `available`, so changes are written to the actor's stored values
  (`_source`) plus the difference; the effects stay as they are. The log entry records the
  resulting effective values, like the system does.
- The character's XP log is the system's actor flag `starwarsffg.xpLog`: an array, newest first,
  of `{action, id, xp: {cost, available, total}, date, description}`. `id` links a purchase to its
  Active Effect (the sheet's Refund link) and is kept on edits.
- The roster is the world setting `ffg-azecraft-addon.xpRoster` (actor ids). The ledger is a
  Journal Entry flagged `flags.ffg-azecraft-addon.xpLedger`, rows in its `rows` flag; its "Log"
  page is rewritten from the rows after every change.
- `scripts/xp/xp-core.js` holds the pure rules (unit-tested), `xp-ops.js` the data,
  `xp-manager.js` the window and `xp-adjust.js` the replacement of the sheet's `_xpAdjustment`. The window refreshes on actor, roster and ledger changes, so
  other GMs' changes show up live.
