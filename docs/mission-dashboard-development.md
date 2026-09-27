# Mission Dashboard: developer notes

GM and player documentation is in [mission-dashboard.md](mission-dashboard.md).

## Verified environment

These were checked against the running local instance on 27 September 2026:

| Item | Value |
| --- | --- |
| Foundry VTT | 13.351 (`ghcr.io/felddy/foundryvtt:13.351`, see `compose.yml`) |
| System | `starwarsffg` 2.0.3, Genesys skill theme (`starwarsffg.skilltheme = "genesys"`) |
| World | `test` ("Mass Effect: Helping Hands") |
| Other active modules | advanced-drawing-tools, combat-distances, gm-notes, healthEstimate, lib-wrapper, popout, precise-drawing-tools, simplefog |

`.memory/StarWarsFFG` is the same version (2.0.3) as the installed system.

## Files

```text
scripts/mission-dashboard/
  index.js                 settings, keybinding, Scene directory/config integration, module API
  constants.js             ids, limits, paths, ownership levels mirrored for pure modules
  dashboard-state.js       Scene flag schema: defaults, normalization, validation, narrow writes
  actor-adapter.js         starwarsffg Actor -> permission-filtered card view model
  mission-data.js          tab view models: ledger choice, entry paging, page access, enrichment; People of Note
  ledgers.js               mission ledgers: module Journal folders, ledger/entry creation, ledger choice
  campaign-reputation.js   ledger schema, totals, validation, ledger writes
  controller.js            per-client lifecycle, hook routing, coalescing, stale-render guard
  dashboard-app.js         the HUD (frameless ApplicationV2, Handlebars parts)
  dashboard-config.js      GM configuration window
  campaign-app.js          Fame/reputation window
  help-app.js              in-game help (quick starts + feature reference), openable at a section
  layout.js                measures core UI, publishes CSS variables
templates/mission-dashboard/*.hbs
styles/mission-dashboard.css      registered in module.json "styles"
assets/mission-dashboard/placeholder.svg
tests/*.test.js                   node --test, no dependencies
```

`main.js` calls `initMissionDashboard()` during `init`, after the existing template and roll
patches. The existing features are unchanged and were checked live: the overridden rival sheet
template still renders, and the Biotics roll dialog still shows Power Modifiers.

## Actor field mapping (starwarsffg 2.0.3)

All of this lives in `actor-adapter.js`:

| Card field | Source | Notes |
| --- | --- | --- |
| Wounds | `system.stats.wounds.value` / `.max` | Accumulated damage against the threshold, after `ActorFFG.prepareDerivedData`. The system derives `woundsOverThreshold = value - max`; the card marks *over* only when `value > max`. |
| Strain | `system.stats.strain.value` / `.max` | Same as wounds. |
| Soak | `system.stats.soak.value` | Includes Active Effects. Verified: a +3 soak effect showed the same value on the card and the sheet. |
| Defense | `system.stats.defence.melee` / `.ranged` | British spelling, as in the system. |
| Species / career | Embedded Items of type `species` / `career` | `system.species.value` / `system.career.value` are legacy text fields, empty on every PC in this world; used only as a fallback. |
| Critical injuries | Embedded Items of type `criticalinjury`, `system.severity` | Sorted by `item.sort`, like the sheet. |
| Portrait | `actor.img` | |
| Full art / Desire | `flags["ffg-azecraft-addon"].dashboard.fullArt` / `.desire` | Written with `actor.setFlag` / `unsetFlag` only. |

Missing values (for example Thana T'Serro's `wounds.value` is `null` in this world) show as `—`,
never as 0. Bars clamp at 100%; the numbers are never clamped.

Permission levels:

| Level | What the card shows |
| --- | --- |
| None | "Classified operative" only |
| Limited | Name and art only |
| Observer and above | Everything |

Every player character in this world has default ownership Observer, so every player sees every PC
card.

## Persisted data

### Where the config lives

The same config shape is stored in one of two places:

- the **campaign dashboard**, in the world setting `campaignDashboard` (GM-written). Every Scene
  without its own config uses it.
- a **Scene's own config**, in the Scene flag, when `source: "scene"`.

`resolveDashboard(flag, { showOnAllScenes, campaign })` is pure and returns `{ shown, source,
config }`:

- `shown` is `flag.enabled !== false` when the world setting `showOnAllScenes` (default `true`) is
  on, and `flag.enabled === true` when it is off.
- `source` is `"scene"` when `flag.source === "scene"`, or, for legacy flags with no `source`, when
  the flag holds `party`/`mission`/`ledgers`. Otherwise it is `"campaign"`.

Switching a Scene to the campaign dashboard only writes `source`; its own config stays in the flag,
so it can be switched back. `setDefaultLedger` writes to whichever store
the Scene uses. Settings `onChange` re-syncs every client, so campaign edits show everywhere.

### Scene flag: `flags["ffg-azecraft-addon"].dashboard`

```js
{
  schemaVersion: 1,
  enabled: true,                 // false hides it on this Scene; absent means "follow the world setting"
  source: "campaign" | "scene",  // which config this Scene shows
  party: [{ id: "slot-1", actorUuid: "Actor.<id>" | null }, ...],   // 1..12 slots, 6 by default
  ledgers: { objective: uuid | null, summary: uuid | null, intel: uuid | null },  // default ledger (JournalEntry) per tab
  people: [{ id, actorUuid, role, status, relationship, note }]       // player-visible text only
}
```

- **Ledgers.** A ledger is a JournalEntry with `flags["ffg-azecraft-addon"].missionLedger = { panel }`.
  Ledgers live in module folders tagged `flags["ffg-azecraft-addon"].dashboardFolder` (`root`,
  `objective`, `summary`, `intel`). `ensureLedgerFolders` creates the folders on the active GM's
  `ready`, and whenever a ledger is created. A ledger's pages, sorted by `sort`, are its entries;
  the last one is the newest.
- **Which ledger shows.** `chooseLedger(visible, default, choice)` picks the viewer's choice, then
  the configured default, then the most recently created ledger. Only ledgers the viewer can see
  (Limited or higher) are considered. `selectEntry` then pages over the entries the viewer can
  read; GMs see all of them.
- **Per-client state.** The ledger and entry being viewed are stored per client
  (`controller.#panelView`). They reset to the defaults on any Scene or config change. A new entry
  never resets them: viewers already on the newest entry see it automatically.
- **Superseded fields.** Earlier builds stored per-tab page lists (`mission`) or single page UUIDs.
  They are ignored, and saving a Scene's own config removes `mission` with a `-=` key.
- Reads normalize in memory with `normalizeDashboardConfig`, which gives deterministic `slot-N` ids
  for a config that was never saved. They never write.
- Only a GM saving the config form writes. The update touches only
  `flags.ffg-azecraft-addon.dashboard`.
- The form takes a fingerprint of the stored config when it opens. If the stored config has changed
  by save time, the GM chooses between overwriting and reloading.
- A config that references a deleted Actor or page is shown with a placeholder and is never
  rewritten automatically.

### World settings

`showOnAllScenes` (Boolean, default true) and `campaignDashboard` (Object: `party`, `ledgers`,
`people`).

### Client settings (per browser)

`dashboardHidden`, `dashboardCompact` (`auto`/`always`/`never`), `dashboardMissionCollapsed`.

### World setting

`campaignLedgerUuid`: the UUID of the ledger JournalEntry.

### Ledger Journal

- Entry flag `ledger = { schemaVersion, factions: [{ id, name, archived }] }`.
- Each adjustment is its own JournalEntryPage whose `_id` is the `eventId`, with flag
  `adjustment = { schemaVersion, eventId, target: {kind: "fame"|"faction", id}, delta, reason,
  authorUserId, createdAt, sessionLabel, sceneUuid, correctsEventId }`. The page body is derived
  text for humans only.
- Totals are recomputed from the pages every time, so there is no stored total that could be lost
  to a concurrent overwrite.
- Creating a page with a fixed `_id` (`keepId: true`) makes a repeated submission of the same dialog
  idempotent.
- Faction definition edits are a read-modify-write of the entry flag from the current document.
  Two GMs editing faction *names* at the same instant can still lose one edit. Adjustments can't.

## Lifecycle and rendering

- The dashboard follows `game.scenes.viewed`, so each client sees the dashboard of the Scene it is
  looking at (the resolved config: campaign or the Scene's own). `canvasReady` runs `controller.sync()`; `canvasTearDown` unmounts.
- The HUD is a `HandlebarsApplicationMixin(ApplicationV2)` with `window.frame: false`.
  `_insertElement` prepends it to `#interface`, so it sits above the canvas (z-index 1, `#board` is
  0) and below the core UI columns (z-index 30) and every window.
- Frameless ApplicationV2 roots do **not** get the core `.application` class, so the CSS targets
  `#azecraft-mission-dashboard` directly.
- The root has `pointer-events: none`; only the panels take input.
- Core V13 only zooms the canvas when `elementFromPoint` is `#board`, and it ignores hotkeys while
  an input has focus. The HUD therefore stops no events globally. Verified live: the wheel over
  panels scrolls them without zooming, the wheel over the map zooms, a real mouse drag moves a token,
  and arrow keys and Delete in the Desire editor don't touch the selected token.
- **Frame.** `frame` is the first part, so it paints behind the others. In framed style (client
  setting `dashboardStyle`, default `framed`), its two solid, pointer-absorbing blocks form an L
  around the map window. `frameWindow()` computes that window. `fitSceneToFrame()` pans and zooms
  (`canvas.animatePan`) so `canvas.dimensions.sceneRect` fits inside it. That runs only on the
  header button, or once on mount when the Scene flag `fitOnOpen` is set.
- Parts are `frame`, `header`, `rail`, `mission` and `intel`. The controller builds a view model, awaiting
  UUID resolution and `TextEditor.enrichHTML`, and then renders only the affected parts. Cards and
  the header render immediately; the first mount waits for mission content.
- Stale results are dropped using a scene generation counter (bumped on sync and unmount) and a
  mission sequence number. The sequence number is bumped as soon as a mission refresh is *queued*,
  not when it runs. So an enrichment already in flight when access is revoked can never render, and
  one in flight during an unmount can never remount the HUD (see `tests/controller.test.js`).
- Hook routing:
  - `update/create/deleteActor`, `...Item` and `...ActiveEffect` refresh the rail, and only for
    referenced Actors.
  - `...JournalEntryPage` and `...JournalEntry` refresh the mission tabs (any mission ledger) or
    the campaign view (ledger).
  - `updateScene` resyncs when the module flag, ownership or name changes.
  - `updateUser` resyncs on the user's own role change.
  - Updates are coalesced over 30 ms.
- Desire drafts live in the app (`drafts` map), not the DOM. They survive re-renders and remote
  updates. The focused element and caret position are restored after a part re-render. A remote
  change to the same Desire shows a conflict notice instead of discarding either version. Typing
  that happens while a save is in flight is kept as a new draft.
- `LayoutWatcher` measures `#scene-controls`, `#scene-navigation-active`, `#players`, `#hotbar`,
  `#sidebar` and `#destiny-tracker`. It re-measures through ResizeObserver, window resize and the
  relevant core hooks, and writes CSS variables. The SWFFG destiny tracker is a movable window and
  only counts while docked in the lower 40% of the screen. In hidden mode, the restore button moves
  to the top of the screen, right of the scene navigation (`--azd-toggle-left/top`).
- Repeated Scene switching was checked live: one HUD element, and the hook counts don't grow.

## Permissions and content safety

- Every write handler checks again before writing, and Foundry's server enforces the permissions.
  Verified live with a non-GM test user:
  - Setting a flag on another player's Actor was rejected.
  - Calling `recordAdjustment` and creating ledger pages directly were both rejected.
- Journal pages are shown only when `page.testUserPermission(user, OBSERVER)` (which inherits from
  the entry) and the entry is at least Limited. Content goes through
  `TextEditor.enrichHTML(content, { secrets: page.isOwner, relativeTo: page })`, so secret blocks
  reach page owners only.
- Titles of restricted, missing or unsupported pages are shown only to GMs. Verified: revoking a
  Journal's permission live replaced the player's panel with "Classified" and removed the text from
  the DOM.
- Secret blocks are styled for GMs, and their Reveal button is hidden in the HUD (revealing belongs
  in the Journal).
- People of Note are shown only when the viewer can see the Actor (Limited). Hidden entries are
  never rendered for players; GMs see them tagged "GM only". **No NPC in this world is currently
  Limited or higher**, so GMs have to set that for People of Note to reach players.
- Plain text (Desire, notes, labels) is escaped by Handlebars `{{ }}`. The only triple-stash output
  is enriched Journal HTML.
- The collapsed-objective line is built with an inert `DOMParser` document.

## Token semantics

Party slots reference **world Actors**. Linked tokens share the world Actor and update the card.
Unlinked tokens have synthetic Actors and don't; this was verified live. Synthetic token support
would be a separate feature.

## Tests and checks

```sh
node --test tests/     # or: npm test
.ai/check              # syntax check, manifest JSON, unit tests
```

The unit tests cover:
- the adapter: zeroes, missing values, over-threshold values, injury extraction and permission levels;
- flag normalization, including that it doesn't mutate its input, plus validation and conflict
  fingerprints;
- page access decisions;
- reputation totals, opening balances, corrections, concurrent entries and invalid events;
- layout rules;
- the controller's stale-render guard and unmount.

Live checks in Chromium through Playwright, with GM, player and second-GM sessions at the same time:
- enable, configure and save through the UI, both from the Scene directory menu and from the
  Scene Config header;
- live updates of stats, injuries, effects, page text and page renames;
- per-client viewing and rapid switching;
- local hide, compact and collapse;
- permission revocation and deleted Actors;
- ledger creation, adjustment, correction, two GMs adjusting concurrently, and deduplication;
- layout at 1366×768 with the sidebar open, 1920×1080 with it open and closed, and 2560×1440;
- existing sheet and roll customizations.

Not covered: touch devices, Firefox and Safari, browser zoom other than 100%, and more than one
player client at once.

## Extension points

- `game.modules.get("ffg-azecraft-addon").api.missionDashboard` has `configure(scene)`,
  `enable(scene)`, `disable(scene)`, `openCampaign()`, `openHelp(section)`, `refresh()` and
  `controller`. Help section ids are the `data-section` values in `templates/mission-dashboard/help.hbs`.
- When a feature changes, update the in-game help (`help.hbs`) along with these docs.
- System-specific field knowledge belongs only in `actor-adapter.js`.
- New panels: add a part to `MissionDashboardApp.PARTS`, build its data in `DashboardController.#flush`,
  and route its hooks in `registerHooks`.

## Known limits

- A fixed overlay doesn't shrink the canvas; the map simply continues under the panels. Use the
  hide button to see the whole map.
- With many Scenes occupied at once, the scene navigation grows and the rail starts lower. The rail
  scrolls rather than shrinking its text.
- Strings are English and hardcoded, like the rest of this module (it has no `lang/` files yet).
