# Health estimate

Hover over a token and a short text above it says roughly how hurt it is: **Unharmed**, **Barely
Injured**, **Injured**, **Badly Injured**, **Near Death**, **Unconscious**, or **Dead**. Vehicles
say **Pristine**, **Scratched**, **Battered**, **Smoking**, **Flaming** or **Wrecked**. The text runs
from green (unhurt) through yellow to red. Holding **Alt** (highlight objects) shows it on every token.

It is a trimmed port of the [Health Estimate](https://github.com/mclemente/healthEstimate) module
(MIT licence, kept in `scripts/health-estimate/LICENSE`), for the starwarsffg system only.

## How the estimate is worked out

The estimate is the share of the wound threshold the token has left (vehicles: hull trauma
threshold), in brackets:

| Health left | People | Vehicles |
|---|---|---|
| 100% | Unharmed | Pristine |
| 81–99% | Barely Injured | Pristine |
| 76–80% | Barely Injured | Scratched |
| 61–75% | Injured | Scratched |
| 51–60% | Injured | Battered |
| 41–50% | Badly Injured | Battered |
| 26–40% | Badly Injured | Smoking |
| 21–25% | Near Death | Smoking |
| under 21% | Near Death | Flaming |
| wounds over the threshold | Unconscious (or Dead) | Wrecked |

- As in Genesys, a token is down only when its wounds **exceed** the threshold; at exactly the
  threshold it is still *Near Death*.
- **Minion groups** use the group's wounds against the group threshold (wounds per minion x group
  size), the same values the sheet shows: a group of three 5-wound minions with 10 wounds is *Badly
  Injured*, and it is out once it has more than 15.
- Homesteads and actors with no threshold (0) show nothing.

### Dead

An estimate says **Dead** (in dark red) when:

- the token's actor has Foundry's **dead** status (token HUD), or its combatant is marked defeated;
- the GM marked it with the *Mark as dead* key binding; or
- **NPCs die at their threshold** is on (the default) and it is a minion, rival, nemesis or a
  character no player owns whose wounds exceed the threshold. Player characters show *Unconscious*.
  With **Mark dead NPCs with the dead status** on (off by default), the active GM's client also gives
  such an NPC the dead status (the skull overlay), and takes it off again if it is healed. Removing
  the skull by hand keeps it off until the NPC goes down again.

Vehicles are never *Dead*; they are *Wrecked*.

## Key bindings (GMs)

Configure Controls → FFG Azecraft Addon. They have no keys by default; each works on the selected
tokens and switches back when pressed again.

- **Mark as dead**: the estimate says *Dead* (only the text; the dead status is separate).
- **Hide from players**: players see no estimate on these tokens; GMs see it with an asterisk (*).
- **Don't mark as dead**: these NPCs show *Unconscious* at their threshold instead of *Dead* (and get
  no skull).

## Settings

Configure Settings → FFG Azecraft Addon.

World (GMs):

- **Health estimate**: on by default. Off removes it completely (needs a reload).
- **Who sees it**: everyone (default); players see NPCs only while GMs see every token; everyone
  sees NPCs only; or GMs only. An NPC is a token whose actor no player owns.
- **Only in combat**: estimates only while a combat on this scene has started.
- **NPCs die at their threshold**: see *Dead* above.
- **Mark dead NPCs with the dead status** (off): see *Dead* above.
- **Hide on vehicles**: no estimates on vehicles.

Each user (client):

- **Always show**: estimates on every token all the time, not only under the pointer.
- **Position**: above (default) or below the token.
- **Text size**: small, normal or large. The text also grows with the token's size and the scene's
  grid size.

## Next to the Health Estimate module

While the Health Estimate module is active, this feature stays off (so tokens don't get two texts) and
GMs get a notice on load. Deactivate Health Estimate to switch over. Its token flags keep working:
tokens it hid, marked dead or exempted from dying stay that way, until changed with the key bindings
here. Its own settings (custom brackets, colours, chat messages) are not carried over.

## Changes from Health Estimate

- starwarsffg only, with the default brackets and the default red-to-green colours; no settings
  menus, estimate tables, JavaScript rules, colour or gradient editors (and none of its bundled
  libraries).
- Fixed: *NPCs die immediately* only checked generic actor types (`npc`, `monster`...), so it never
  applied to starwarsffg's minions, rivals and nemeses. It only changed the text; here the dead
  status can also be given (a setting, off by default).
- Genesys threshold rule (down only above the threshold) instead of down at the threshold.
- Not kept: chat messages on stage changes (and so the *hide names* binding), the token
  configuration tab, the elevation tooltip position, zoom scaling, 3D canvas support, and
  per-estimate custom labels.

## How it works (developers)

- Code in `scripts/health-estimate/`: `health-estimate.js` (settings, key bindings, hooks, drawing)
  and the pure, unit-tested `health-core.js` (actor to health share, brackets, colours, flags, who
  sees it, dying at the threshold). Tests in `tests/health-estimate.test.js`.
- Reads `system.stats.wounds` (character, minion, rival, nemesis) and `system.stats.hullTrauma`
  (vehicle) after starwarsffg's `prepareDerivedData`: `value` is the damage taken, `max` the
  threshold (for minions `unit_wounds x quantity.max`).
- Drawing: one `PIXI.Text` per token in a container on `canvas.interface` at the scrolling-text
  z-index, created the first time the token shows an estimate and kept per token id. A `refreshToken`
  that only moves the token moves the text; hover, visibility and size changes and actor, token,
  effect and combatant updates recompute it, and the text is only re-rendered when its label or
  colour changes. Deleted tokens drop their text; `canvasTearDown` destroys the container.
- Flags, under `flags.ffg-azecraft-addon` on the token (or its actor): `healthEstimateHidden`,
  `healthEstimateDead`, `healthEstimateDontMarkDead`. Fallback: Health Estimate's
  `flags.healthEstimate.{hideHealthEstimate, dead, dontMarkDead}`; turning one off with a key binding
  clears both. `healthEstimateAutoDead` on an actor records that this feature gave it the dead
  status. (`flags.healthEstimate.hideName` was only for chat messages and is ignored.)
- Settings `healthEstimate*`, key bindings `healthEstimate*`.
