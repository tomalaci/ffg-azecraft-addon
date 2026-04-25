# AGENTS

## Project Context

- This project is a Foundry Virtual Tabletop V13 addon module.
- Foundry V13 API docs: <https://foundryvtt.com/api/v13/>
- The module depends on and modifies the Star Wars FFG system, which is based on Genesys.
- Upstream system repository: <https://github.com/StarWarsFoundryVTT/StarWarsFFG>
- Most changes in this module target template behavior rather than adding standalone application flows.

## Working Notes

- Prefer Foundry V13-compatible APIs and hooks.
- Treat Star Wars FFG system behavior as the primary integration surface.
- When making changes, inspect the relevant system templates, sheet data flow, and text enrichment/rendering behavior first.
  - Note that some templates are available locally that are slightly modified, meant to replace original ones.
