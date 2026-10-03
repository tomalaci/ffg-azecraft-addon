# Quick effects (statuses and roll effects from the dashboard)

Buffs and debuffs on characters without finding their tokens.

## Using it

- **On a character card:** the row of small icons under the name shows the character's statuses and
  quick effects; hover for what each does, click one to remove it. **+** opens *Add effect*.
- **Squad effects** (the strip under the mission buttons): effects given to the whole squad at once,
  with how many members have each (e.g. "Smoke 6/6"). **+** adds one to everyone (or the members you
  tick); **×** removes it from all of them.
- **Add effect** window:
  - **Statuses:** the system's statuses (Boost / Setback / Upgrade / Success next check or this
    combat, Heavy Cover, Disoriented, Immobilized, Staggered); click to add.
  - **Presets:** effects a GM saved; click to add.
  - **Custom effect:** name, icon, dice (Boost, Setback, Remove Setback, Upgrade ability, Success,
    Advantage, Failure, Threat; −/+ for the count), which checks (all, combat, Biotics and Tech, or
    chosen skills) and how long (until removed, next check, this combat). The line below sums it up.
    *Add effect*; GMs can also *Save as preset*.
- Anyone can add or remove effects on any squad member. For a character you do not own, the change
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
  a `group` id. Chips show effects with statuses or that flag (not item effects or XP purchases).
