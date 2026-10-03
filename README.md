# FFG Azecraft Addon

Manifest URL: `https://github.com/tomalaci/ffg-azecraft-addon/releases/latest/download/module.json`

Foundry VTT v13 addon module for the `starwarsffg` system.

The module:

- Replaces selected Star Wars FFG NPC actor sheet templates with local versions and enriches their
  biography content.
- Adds Biotics and Tech power modifiers to the dice roll dialog, and **Biotics** / **Tech** tabs on
  character sheets: roll a power at its base difficulty, ready Tech elements, and save presets with
  modifiers ticked in advance (see [docs/character-sheet.md](docs/character-sheet.md#biotics-and-tech-tabs)).
- Adds a **mission dashboard**: a Mass Effect style HUD over a Scene with squad cards (stats,
  critical injuries, full art, player Desires), mission summary and objective from Journal pages,
  key intel with People of Note, and campaign-wide Fame and faction reputation. See
  [docs/mission-dashboard.md](docs/mission-dashboard.md) for GMs and players and
  [docs/mission-dashboard-development.md](docs/mission-dashboard-development.md) for developers.
- Replaces the Star Wars Light/Dark destiny tracker with a Mass Effect style **Story Points** bar
  (Destiny vs Doom tug of war, names configurable). See [docs/story-points.md](docs/story-points.md).
- Restyles character and NPC (minion, rival, nemesis) sheets in the same Mass Effect look and removes the unused
  Specializations / Force Powers / Signature Abilities fields. See
  [docs/character-sheet.md](docs/character-sheet.md).
- Adds Mass Effect **ammunition upgrades**: apply carried ammo gear to a weapon, with its quality
  (e.g. Burn 2, or +1) shown on the weapon and roll chat card until it runs out. See
  [docs/ammo.md](docs/ammo.md).
- Adds an **Apply damage** helper to weapon roll chat cards (GM only): damage after soak and Pierce
  / Breach for the targeted tokens, checked and editable before it is applied. See
  [docs/apply-damage.md](docs/apply-damage.md).
- Shows **lightweight copies** of large actor art (made automatically by the GM's browser) in
  the dashboard, the Actors tab and sheets; the originals stay untouched. See
  [docs/lightweight-images.md](docs/lightweight-images.md).
- **Quick effects** on the mission dashboard: statuses and custom roll effects (dice on chosen
  checks, for the next check, this combat or until removed) on a character card or the whole squad.
  See [docs/quick-effects.md](docs/quick-effects.md).
- A **toolbar** next to the Scene list: Dashboard on/off, Players, **Share Image** and **Share
  Text** (show an image or text to everyone or chosen people, kept in share archives under the
  *Shared Content* journal folder; see [docs/sharing.md](docs/sharing.md)), **UI Performance** (frame rate,
  slow code by module, graphs and loaded assets, with reports to the GM) and, for GMs, **XP
  Management** (add, reduce or set player characters' XP with a logged reason, adjust available XP, read their XP logs)
  and the **Admin Panel** (bulk art fixes, asset browser with WebP conversion and moves that relink
  documents, large and unused files); plus a *Reduce visual effects* option. See
  [docs/performance.md](docs/performance.md), [docs/xp-management.md](docs/xp-management.md) and
  [docs/admin-panel.md](docs/admin-panel.md).
- Replaces the Star Wars placeholder art of new minions, rivals, nemeses, characters and vehicles
  with abstract Mass Effect style art (configurable per type, portrait and token), and can swap the
  placeholders on existing actors. See [docs/default-art.md](docs/default-art.md).

## Current Behavior

- Loads on Foundry `init` through [`main.js`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/main.js).
- Hooks into `setup` and patches the base `ffg.ActorSheetFFG` class in [`scripts/override-actor-templates.js`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/scripts/override-actor-templates.js).
- Overrides the sheet template getter for these actor types:
  - `minion`
  - `rival`
  - `nemesis`
- Preloads the module templates before use.
- Adds `data.data.enrichedBio` with `TextEditor.enrichHTML(...)` when the overridden sheets need biography rendering.

## Templates Replaced

The module currently ships local replacements for:

- [`templates/actors/ffg-minion-sheet.html`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/templates/actors/ffg-minion-sheet.html)
- [`templates/actors/ffg-rival-sheet.html`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/templates/actors/ffg-rival-sheet.html)
- [`templates/actors/ffg-nemesis-sheet.html`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/templates/actors/ffg-nemesis-sheet.html)

These templates remain tightly coupled to the upstream Star Wars FFG system partials under `systems/starwarsffg/templates/...`, so this repo is best understood as a targeted template override module rather than a standalone UI layer.

## Repo Layout

`module.json`
: Foundry manifest. Declares module id, compatibility, and dependency on `starwarsffg` `>= 2.0.0`.

`main.js`
: Entrypoint that registers the template override patching.

`scripts/override-actor-templates.js`
: Core patch logic for swapping templates and enriching biography HTML.

`templates/actors/`
: Local sheet template replacements for supported actor types.

`scripts/mission-dashboard/`, `templates/mission-dashboard/`, `styles/mission-dashboard.css`
: Mission dashboard feature.

`scripts/ammo/`, `styles/ammo.css`
: Ammunition upgrades.

`scripts/combat/`, `styles/combat.css`
: Apply damage helper on weapon chat cards.

`scripts/powers/`, `templates/actors/parts/`, `styles/powers.css`
: Biotics / Tech tabs and power presets.

`scripts/thumbnails/`
: Lightweight copies of large images.

`scripts/toolbar/`, `scripts/share/`, `scripts/perf/`, `scripts/xp/`, `scripts/admin/`, `scripts/ui/`, `scripts/paths.js`
: Toolbar, Share Image and Share Text with the share archives, UI Performance window, XP Management, Admin Panel, the scene-space window
  base, and file path forms.

`scripts/default-art/`, `templates/default-art-config.hbs`, `styles/default-art.css`, `assets/default-art/`
: Default actor art feature.

`tests/`, `eslint.config.js`
: Unit tests and lint config. Run `npm ci` once, then `.ai/check` (or `npm run check`) runs ESLint, syntax checks and the tests.

## Compatibility

- Foundry Virtual Tabletop: `13`
- Required system: `starwarsffg`
- Declared minimum system version: `2.0.0`

## Local Foundry Server

The included [`compose.yml`](compose.yml) runs Foundry VTT `13.351` at
<http://localhost:30000>. It uses these host files:

- `~/.local/share/foundry-vtt/Data` for persistent Foundry data
- `~/.local/share/foundry-vtt/Dist/FoundryVTT-Node-13.351.zip` for the Foundry distribution
- `~/.local/share/foundry-vtt/license.txt` for the license key

The repository is mounted read-only as the installed `ffg-azecraft-addon`
module, and Foundry's development hot reload is enabled.
Start and stop the server with:

```sh
docker compose up -d
docker compose down
```

## Notes

- This repo has no build step. The release workflow zips the repository (excluding development files).
- Changes to `module.json` (for example `styles`) only load after restarting Foundry and relaunching the world; script, template and CSS changes load on a browser refresh.
- Behavior depends on the upstream `ffg.ActorSheetFFG` class and the system template structure remaining compatible.
- If the system changes its sheet registration, template getter, data shape, or biography handling, the patch in `scripts/override-actor-templates.js` will likely need adjustment.

## License

See [`LICENSE`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/LICENSE).
