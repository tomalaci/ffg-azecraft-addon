# Quick effects (statuses and roll effects from the dashboard)

Buffs and debuffs on characters without finding their tokens.

## Using it

- **On a character card:** the row of small icons under the name shows the character's statuses and
  quick effects; hover for what each does, click one to remove it. **+** opens *Add effect*.
- **Squad effects** (under the mission buttons) has two buttons:
  - **Squad condition** (cloud icon): an effect that stays on *every* squad member, including anyone
    who joins the squad later, e.g. a toxic atmosphere or thick smoke while the squad is in it. Its
    chip has a switch: click the name to switch it off for everyone (it stays in the strip, greyed,
    to switch back on later); **×** removes it. On the cards it shows with a blue edge and cannot be
    removed there; if someone deletes it from a sheet it comes back while the condition is on.
    Conditions last until switched off, so the next-check and this-combat statuses are not offered.
  - **One-off effect** (wand icon): give an effect to the whole squad or the members you tick, now
    (e.g. Boost on the next check). Each member keeps their own copy; the strip shows how many still
    have it (e.g. "Inspired 6/6") and **×** removes it from all of them.
  - The chips wrap under the two buttons, up to three rows (the portrait rail moves down to make
    room). When there are more, the last place is an **N+ Effects** button: it opens a list of the
    rest, where they can be switched or removed the same way.
- **Add effect** window:
  - **Statuses:** the system's statuses (Boost / Setback / Upgrade / Success next check or this
    combat, Heavy Cover, Disoriented, Immobilized, Staggered); click one to add it right away.
  - **Presets:** effects a GM saved; click one to add it right away.
  - **Custom effect** (folded, click to open): name, icon, dice (Boost, Setback, Remove Setback, Upgrade ability, Success,
    Advantage, Failure, Threat; −/+ for the count), which checks (all, combat, Biotics and Tech, or
    chosen skills) and how long (until removed, next check, this combat). The line below sums it up.
    *Add effect*; GMs can also *Save as preset*.
- Anyone can add or remove effects on any squad member, and add, switch or remove squad conditions. For a character you do not own, the change
  is made by the GM's client, so a GM needs to be online.

## Rules

- The effects change the dice of the character's own rolls: every skill roll (including powers)
  gets them in its dice pool automatically, as with the system's statuses.
- *Next check* effects disappear after the character's next roll; *this combat* effects when the
  character leaves combat (both done by the system).

## How it works (developers)

- `scripts/effects/effect-core.js` (pure, unit-tested): an effect `{name, dice, scope, skills,
  duration}` becomes Active Effect changes like the system's statuses
  (`system.skills.<skill>.boost` etc., mode ADD) with `system.duration` `"once"` / `"combat"`; card
  chips and squad groups.
- `scripts/effects/quick-effects.js`: the *Add effect* window, the operations (add status via
  `actor.toggleStatusEffect`, add custom effect, remove, remove a squad group) and their relay to the
  active GM over the module socket (`quickEffect`) for actors the user does not own; presets in the
  world setting `effectPresets`.
- Custom effects carry `flags.ffg-azecraft-addon.quickEffect = {spec, group}`; squad-wide ones share
  a `group` id.
- Squad conditions are the world setting `squadConditions` (`{id, squadId, name, img, statusId | spec,
  on}`); players' changes go to the active GM (`squadCondition` socket message). The active GM's
  client keeps the members' effects in line (`conditionPlan` in effect-core.js): when the list or the
  squads change, when a condition effect is deleted, and when a user connects. Their effects carry
  `quickEffect.condition` (the condition id) and no `system.duration`. Chips show effects with statuses or that flag (not item effects or XP purchases).
