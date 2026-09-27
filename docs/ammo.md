# Ammunition upgrades

Mass Effect ammunition upgrades (Armor-Piercing, Cryo, Disruptor, Explosive, Incendiary, Shredder)
are consumables: a character spends a maneuver to apply one to a weapon (theirs, or an engaged
ally's), and the weapon keeps the benefit until it runs out, which the GM decides (e.g. by spending
three Threat or a Despair).

## Using it

- **Carrying ammo.** Ammo stays ordinary gear: the world's "AP Ammo", "Incendiary Ammo", ... items
  (any gear whose name has "Ammo" or "Ammunition" and the type, e.g. "Armor-Piercing
  Ammunition").
- **Applying.** On the character sheet's Gear tab, each weapon has **+ Ammo** under its name. Pick
  the type; one carried item of that type is used up (its quantity drops, and the last one is
  removed). A GM can also apply a type nobody carries, for story reasons. A chat message says what
  was loaded and the resulting quality, e.g. "Avenger loaded with Incendiary Ammo: Burn 2."
  Applying another type replaces the current one.
- **An ally's weapon.** Players apply ammo from their own sheet to their own weapons. To load an
  engaged ally's weapon, the GM applies it from the ally's sheet (as "none carried") and the
  player who handed it over lowers their own ammo quantity on the Gear tab.
- **While loaded.** The weapon shows the ammo under its name, and its qualities (weapon sheet and
  roll chat card) include the upgrade by the rules:

  | Ammo | Quality |
  | --- | --- |
  | Armor-Piercing | Pierce 2, or +1 to an existing Pierce |
  | Cryo | Ensnare 2, or +2 to an existing Ensnare |
  | Disruptor | Phasic 2, or +2 to an existing Phasic |
  | Explosive | Disorient 2, or +1 to an existing Disorient; spend a Triumph to stagger for one round |
  | Incendiary | Burn 2, or +1 to an existing Burn |
  | Shredder | Vicious 3, or +2 to an existing Vicious |

- **Running out.** Click **Run out** next to the ammo when the GM says so; a chat message notes it.

Nothing else is automated: the GM still decides when ammo runs out, and the dice dialog stays
fully editable.

## How it works (developers)

`scripts/ammo/ammo-catalog.js` has the rules (pure, unit-tested); `scripts/ammo/ammo.js` adds the
weapon row controls in `renderActorSheet` and wraps the system item sheets'
`_getSummarizedQualities`, which feeds both the weapon sheet's qualities and the weapon roll chat
card (`doNotSubmit.qualities`). The ammo is not an attachment (no hardpoints): the system adds
attachment quality ranks together, which cannot express "gains X 2, or +1 if present".

The applied ammo is the weapon flag `ffg-azecraft-addon.ammo = {type}`. It is written with a
nested `flags` object: starwarsffg's `ItemBaseFFG.update` adds `flags: {}` to updates without a
top-level `flags` key, which silently drops dotted flag keys, so `setFlag` / `unsetFlag` on
system items only work the first time.

Roll chat cards re-read the weapon when they render, so an old card shows the weapon's current
qualities (a system behaviour that applies to attachments as well).
