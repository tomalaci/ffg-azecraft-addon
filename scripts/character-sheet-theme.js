/**
 * Mass Effect style for the starwarsffg character and NPC (minion, rival, nemesis) sheets, matching
 * the mission dashboard HUD.
 *
 * The system's sheet stylesheet is unlayered, so it beats anything in Foundry's "modules" CSS layer
 * regardless of specificity. This theme is therefore added as its own (unlayered) <link> and scoped
 * to sheets tagged with the `azcs` class, which is added to character sheets when they render.
 * The sheet's markup is the system's (see templates/actors/ffg-character-sheet.html for the rows the
 * addon removes); only its look changes.
 */

const MODULE_ID = "ffg-azecraft-addon";
const SETTING = "characterSheetTheme";
const STYLESHEET = `modules/${MODULE_ID}/styles/character-sheet.css`;
const THEMED_TYPES = new Set(["character", "minion", "rival", "nemesis"]);

function enabled() {
    return game.settings.get(MODULE_ID, SETTING);
}

function addStylesheet() {
    if (document.querySelector(`link[data-azecraft-sheet-theme]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET;
    link.dataset.azecraftSheetTheme = "true";
    document.head.append(link);
}

export function initCharacterSheetTheme() {
    game.settings.register(MODULE_ID, SETTING, {
        name: "Mass Effect character sheet",
        hint: "Show character and NPC (minion, rival, nemesis) sheets in the dark Mass Effect style of the mission dashboard instead of the Star Wars parchment.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => foundry.utils.debouncedReload()
    });

    Hooks.once("setup", () => {
        if (enabled()) addStylesheet();
    });

    // ActorSheet is an Application V1 sheet in starwarsffg 2.0: html is a jQuery object.
    Hooks.on("renderActorSheet", (app, html) => {
        if (!enabled() || !THEMED_TYPES.has(app.actor?.type)) return;
        const element = app.element?.[0] ?? html?.[0]?.closest?.(".app");
        element?.classList.add("azcs");
    });
}
