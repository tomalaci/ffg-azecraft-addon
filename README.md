# FFG Azecraft Addon

Manifest URL: `https://github.com/tomalaci/ffg-azecraft-addon/releases/latest/download/module.json`

Foundry VTT v13 addon module for the `starwarsffg` system.

Current scope is narrow: this repo patches the system actor sheet class so the module can replace selected Star Wars FFG NPC actor templates with local versions and ensure biography content is enriched for those overridden sheets.

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

## Compatibility

- Foundry Virtual Tabletop: `13`
- Required system: `starwarsffg`
- Declared minimum system version: `2.0.0`

## Notes

- This repo currently has no build step or packaging pipeline.
- Behavior depends on the upstream `ffg.ActorSheetFFG` class and the system template structure remaining compatible.
- If the system changes its sheet registration, template getter, data shape, or biography handling, the patch in `scripts/override-actor-templates.js` will likely need adjustment.

## License

See [`LICENSE`](/c:/Users/azero/AppData/Local/FoundryVTT/Data/modules/ffg-azecraft-addon/LICENSE).
