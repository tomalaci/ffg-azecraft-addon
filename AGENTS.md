# AGENTS

## Project Context

- This project is a Foundry Virtual Tabletop V13 addon module.
- Foundry V13 API docs: <https://foundryvtt.com/api/v13/>
- The module depends on and modifies the Star Wars FFG system, which is based on Genesys.
- Upstream system repository: <https://github.com/StarWarsFoundryVTT/StarWarsFFG>
- Most changes in this module target template behavior rather than adding standalone application flows.

## Working Notes

- Use local .memory folder for managing memory notes.
- Star Wars FFG system code is available at `.memory/StarWarsFFG`.
- Prefer Foundry V13-compatible APIs and hooks (context7)
- Treat Star Wars FFG system behavior as the primary integration surface.
- When making changes, inspect the relevant system templates, sheet data flow, and text enrichment/rendering behavior first.
  - Note that some templates are available locally that are slightly modified, meant to replace original ones.

## Git Workflow

- Commit directly to `main`; no feature branches or pull requests are needed.
- After finishing and validating a change (`.ai/check`, plus a live check where relevant), commit it with a short descriptive message and push it without asking.
  Stage only the files of that change, not unrelated edits.
- Pushing to `main` does not deploy anything. The hosted server only picks up the module when the user publishes a GitHub release with a version tag (the release workflow builds `module.json`/`module.zip`). Never create releases or tags yourself.

## Checks

- Run `npm ci` once to install the dev-only lint tooling (`node_modules/` is git-ignored and excluded from releases).
- `.ai/check` (also `npm run check`) runs ESLint (undefined/unused names), syntax checks, manifest validation and the unit tests; it must pass before committing.
- Foundry runtime globals are declared in `eslint.config.js`; add new ones there rather than disabling rules.

## Local Testing

- `compose.yml` runs Foundry 13.351 at <http://localhost:30000> with this repo mounted as the installed module.
  Script, template and CSS changes load on a browser refresh; `module.json` changes need a container restart and relaunching the world.
- Local logins, test documents and Playwright notes are in `.memory/local-test-environment.md` (not committed).
