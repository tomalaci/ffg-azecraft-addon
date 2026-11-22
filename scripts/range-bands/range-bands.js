/**
 * Range bands: rings (and optional grid shading) around a token showing the Genesys range bands,
 * switched on per token from the Token HUD or with a key. Only the user who switched them on sees
 * them, and they are not stored. See docs/range-bands.md.
 *
 * A clean-room replacement for the Combat Distances module, with its own ids (layer
 * `canvas.azecraftRangeBands`, settings `rangeBands*`, keybinding `rangeBandsToggle`), so both can
 * be active while switching over.
 */

import RangeBandsLayer, { LAYER } from "./range-layer.js";
import { CONFIG_TEMPLATE, RangeBandsConfig } from "./range-config.js";
import { DEFAULT_CONFIG, MODULE_ID, SETTINGS, SHADING } from "./range-core.js";

const layer = () => canvas?.[LAYER];
const combatDistancesActive = () => Boolean(game.modules.get("combat-distances")?.active);

function registerSettings() {
    const redraw = () => layer()?.redrawAll();
    game.settings.register(MODULE_ID, SETTINGS.config, {
        scope: "world",
        config: false,
        type: Object,
        default: foundry.utils.deepClone(DEFAULT_CONFIG),
        onChange: redraw
    });
    game.settings.registerMenu(MODULE_ID, "rangeBandsConfigMenu", {
        name: "Range bands: bands",
        label: "Configure range bands",
        hint: "Labels, distances and colours of the bands, the distance unit and the look of the rings.",
        icon: "fa-regular fa-circle-dot",
        type: RangeBandsConfig,
        restricted: true
    });
    game.settings.register(MODULE_ID, SETTINGS.shading, {
        name: "Range bands: grid shading",
        hint: "Also colour the grid squares or hexes of each band: only those fully inside a band, or every one a band reaches into. Not on gridless scenes.",
        scope: "world",
        config: true,
        type: String,
        default: "none",
        choices: SHADING,
        onChange: redraw
    });
}

/** Show bands on all selected tokens, or hide them if every selected token shows them already. */
function toggleSelected() {
    const tokens = canvas.ready ? canvas.tokens.controlled : [];
    if (!tokens.length || !layer()) return false;
    const show = tokens.some(token => !layer().isShown(token));
    for (const token of tokens) layer().toggle(token, show);
    refreshHud();
    return true;
}

function registerKeybinding() {
    game.keybindings.register(MODULE_ID, "rangeBandsToggle", {
        name: "Range bands: show or hide for the selected tokens",
        // Unbound while Combat Distances (also on G) is active; set it in Configure Controls.
        hint: combatDistancesActive() ? "No default key while the Combat Distances module is active (it uses G)." : "",
        editable: combatDistancesActive() ? [] : [{ key: "KeyG" }],
        onDown: toggleSelected
    });
}

function refreshHud() {
    const hud = canvas.tokens?.hud;
    if (hud?.rendered && hud.object) hud.render();
}

function addHudButton(hud, html) {
    const token = hud.object;
    const column = (html instanceof HTMLElement ? html : html[0])?.querySelector(".col.left");
    if (!token || !column || !layer()) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon azrb-hud";
    button.classList.toggle("active", layer().isShown(token));
    button.dataset.tooltip = "Range bands";
    button.innerHTML = '<i class="fa-regular fa-circle-dot" inert></i>';
    button.addEventListener("click", event => {
        event.preventDefault();
        button.classList.toggle("active", layer().toggle(token));
    });
    column.append(button);
}

export function initRangeBands() {
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Range bands",
        hint: "Rings around a token showing the range bands (Token HUD button or G), like the Combat Distances module.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;

    registerSettings();
    registerKeybinding();
    CONFIG.Canvas.layers[LAYER] = { group: "interface", layerClass: RangeBandsLayer };

    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([CONFIG_TEMPLATE]));
    Hooks.on("renderTokenHUD", addHudButton);
    Hooks.on("refreshToken", token => {
        if (!token.isPreview && layer()?.isShown(token)) layer().follow(token);
    });
    Hooks.on("deleteToken", document => layer()?.remove(document.id));
}
