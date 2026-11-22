/**
 * Health estimate: a short text over a token ("Unharmed" ... "Near Death", "Dead"; vehicles
 * "Pristine" ... "Wrecked") from the share of its wound or hull trauma threshold it has left. A
 * trimmed, starwarsffg-only port of the Health Estimate module (MIT, see LICENSE in this folder).
 * See docs/health-estimate.md.
 *
 * One PIXI.Text per token, in a container on canvas.interface (above tokens, like scrolling text),
 * created on first show and then only re-styled when its label or colour changes. While the Health
 * Estimate module is active this feature stays off, so tokens don't get two texts.
 */

import { AUTO_DEAD_FLAG, FLAGS, LEGACY_ID, MODULE_ID, VISIBILITY, actorHealth, diesAtZero, estimate, readFlags, visibleTo } from "./health-core.js";

const SETTINGS = {
    enabled: "healthEstimateEnabled",
    visibility: "healthEstimateVisibility",
    combatOnly: "healthEstimateCombatOnly",
    npcsDie: "healthEstimateNpcsDie",
    deadStatus: "healthEstimateDeadStatus",
    hideVehicles: "healthEstimateHideVehicles",
    alwaysShow: "healthEstimateAlwaysShow",
    position: "healthEstimatePosition",
    size: "healthEstimateSize"
};
/** Text is drawn at 4x and scaled down, for sharp text when zoomed in (as Health Estimate does). */
const FONT_SIZE = 96;
const BASE_SCALE = 0.25;

/** Settings read on every refresh, kept here so a refresh does not look them up. */
const options = {};
let container = null;
/** Token id -> { text: PIXI.Text, label, fill, stroke }. */
const cache = new Map();
let combatRunning = false;

const legacyActive = () => Boolean(game.modules.get(LEGACY_ID)?.active);
const isActiveGM = () => game.user === game.users.activeGM;

function readOptions() {
    for (const [name, key] of Object.entries(SETTINGS)) {
        if (name !== "enabled") options[name] = game.settings.get(MODULE_ID, key);
    }
}

function registerSettings() {
    const refresh = () => {
        readOptions();
        refreshAll();
    };
    const setting = (key, data) => game.settings.register(MODULE_ID, key, { config: true, onChange: refresh, ...data });

    setting(SETTINGS.visibility, {
        name: "Health estimate: who sees it",
        hint: "NPCs are tokens whose actor no player owns.",
        scope: "world",
        type: String,
        choices: VISIBILITY,
        default: "all"
    });
    setting(SETTINGS.combatOnly, {
        name: "Health estimate: only in combat",
        hint: "Show estimates only while a combat on this scene has started.",
        scope: "world",
        type: Boolean,
        default: false
    });
    setting(SETTINGS.npcsDie, {
        name: "Health estimate: NPCs die at their threshold",
        hint: "Minions, rivals, nemeses and characters no player owns show \"Dead\" once their wounds exceed the threshold, instead of \"Unconscious\". A token can be exempted with the \"Don't mark as dead\" key binding.",
        scope: "world",
        type: Boolean,
        default: true
    });
    setting(SETTINGS.deadStatus, {
        name: "Health estimate: mark dead NPCs with the dead status",
        hint: "Also give NPCs that die (see above) Foundry's dead status, the skull over the token, and take it off if they are healed. Off: only the text changes.",
        scope: "world",
        type: Boolean,
        default: false
    });
    setting(SETTINGS.hideVehicles, {
        name: "Health estimate: hide on vehicles",
        hint: "No estimate on vehicle tokens (otherwise they show their hull trauma: \"Pristine\" ... \"Wrecked\").",
        scope: "world",
        type: Boolean,
        default: false
    });
    setting(SETTINGS.alwaysShow, {
        name: "Health estimate: always show",
        hint: "Show estimates on every token all the time, not only on the token under the pointer (or while Alt highlights tokens).",
        scope: "client",
        type: Boolean,
        default: false
    });
    setting(SETTINGS.position, {
        name: "Health estimate: position",
        scope: "client",
        type: String,
        choices: { top: "Above the token", bottom: "Below the token" },
        default: "top"
    });
    setting(SETTINGS.size, {
        name: "Health estimate: text size",
        scope: "client",
        type: Number,
        choices: { 0.75: "Small", 1: "Normal", 1.4: "Large" },
        default: 1
    });
}

/**
 * Toggle a flag (a FLAGS name) on the controlled tokens: on for all, or off when every one already
 * has it. Switching off also clears a Health Estimate flag left on the token or its actor.
 */
async function toggleTokenFlag(name, describe) {
    const tokens = canvas.ready ? canvas.tokens.controlled.filter(token => token.actor) : [];
    if (!tokens.length) return;
    const { key, legacy } = FLAGS[name];
    const value = !tokens.every(token => readFlags(token.document.flags, token.actor.flags)[name]);
    const writes = tokens.flatMap(token => {
        if (value) return [token.document.setFlag(MODULE_ID, key, true)];
        return [
            token.document.unsetFlag(MODULE_ID, key),
            token.document.flags?.[LEGACY_ID]?.[legacy] && token.document.unsetFlag(LEGACY_ID, legacy),
            token.actor.flags?.[LEGACY_ID]?.[legacy] && token.actor.unsetFlag(LEGACY_ID, legacy)
        ];
    });
    await Promise.all(writes.filter(Boolean));
    ui.notifications.info(describe(tokens.map(token => token.name).join(", "), value), { console: false });
}

function registerKeybindings() {
    const binding = (name, data) => game.keybindings.register(MODULE_ID, name, {
        editable: [],
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
        ...data
    });
    binding("healthEstimateMarkDead", {
        name: "Health estimate: mark as dead",
        hint: "Shows the selected tokens as \"Dead\" (again: back to their wounds). Only the estimate; Foundry's dead status is separate.",
        onDown: () => { toggleTokenFlag("dead", (names, on) => `${names}: health estimate ${on ? "shows Dead" : "shows the wounds again"}.`); return true; }
    });
    binding("healthEstimateHide", {
        name: "Health estimate: hide from players",
        hint: "Hides the selected tokens' estimates from players (again: shows them). GMs see hidden estimates with an asterisk (*).",
        onDown: () => { toggleTokenFlag("hidden", (names, on) => `${names}: health estimate ${on ? "hidden from" : "shown to"} players.`); return true; }
    });
    binding("healthEstimateDontMarkDead", {
        name: "Health estimate: don't mark as dead",
        hint: "The selected NPC tokens show \"Unconscious\" instead of \"Dead\" at their threshold (with \"NPCs die at their threshold\" on). Again: back to the setting.",
        onDown: () => { toggleTokenFlag("dontMarkDead", (names, on) => `${names}: ${on ? "not marked" : "marked"} as dead at the threshold.`); return true; }
    });
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

function isCombatRunning() {
    const sceneId = canvas.scene?.id;
    return game.combats.some(combat => combat.started && (!combat._source.scene || combat._source.scene === sceneId));
}

function statusDead(token) {
    const defeated = CONFIG.specialStatusEffects.DEFEATED;
    return Boolean(token.actor?.statuses?.has(defeated) || token.combatant?.defeated);
}

/** The estimate this user sees on a token now, or null for none. */
function tokenEstimate(token) {
    const actor = token.actor;
    if (!actor || token.isPreview || !token.isVisible || token.document.isSecret) return null;
    const npc = !actor.hasPlayerOwner;
    const isGM = game.user.isGM;
    if (!visibleTo(options.visibility, { isGM, npc })) return null;
    const flags = readFlags(token.document.flags, actor.flags);
    if (flags.hidden && !isGM) return null;
    return estimate({
        actor, playerOwned: !npc, flags, statusDead: statusDead(token),
        npcsDie: options.npcsDie, hideVehicles: options.hideVehicles, isGM
    });
}

function shouldShow(token) {
    if (options.combatOnly && !combatRunning) return false;
    return options.alwaysShow || token.hover || canvas.tokens.highlightObjects;
}

function place(entry, token) {
    const { text } = entry;
    const top = options.position !== "bottom";
    const gridScale = canvas.dimensions.size / 100;
    // Larger tokens get larger text (Health Estimate's "scale to token size", on by default).
    text.scale.set(BASE_SCALE * gridScale * token.document.width * options.size);
    text.anchor.set(0.5, top ? 1 : 0);
    text.position.set(token.x + (token.w / 2), top ? token.y - 2 : token.y + token.h + 2);
    text.alpha = token.mesh?.alpha ?? 1;
}

function createText(data) {
    const text = new PIXI.Text(data.label, {
        fontFamily: CONFIG.canvasTextStyle.fontFamily,
        fontSize: FONT_SIZE,
        fill: data.fill,
        stroke: data.stroke,
        strokeThickness: 12,
        padding: 5,
        dropShadow: true,
        dropShadowColor: "#000000",
        dropShadowDistance: 5,
        lineJoin: "round"
    });
    return container.addChild(text);
}

/** Show, update or hide one token's text. */
function update(token) {
    if (!container || container.destroyed || !token?.id || token.isPreview) return;
    let entry = cache.get(token.id);
    const data = shouldShow(token) ? tokenEstimate(token) : null;
    if (!data?.label) {
        if (entry) entry.text.visible = false;
        return;
    }
    if (!entry) {
        entry = { text: createText(data), ...data };
        cache.set(token.id, entry);
    } else {
        // Only real changes touch the text: a change re-renders its texture.
        if (entry.label !== data.label) entry.text.text = entry.label = data.label;
        if (entry.fill !== data.fill) entry.text.style.fill = entry.fill = data.fill;
        if (entry.stroke !== data.stroke) entry.text.style.stroke = entry.stroke = data.stroke;
        entry.text.visible = true;
    }
    place(entry, token);
}

function remove(tokenId) {
    const entry = cache.get(tokenId);
    if (!entry) return;
    cache.delete(tokenId);
    entry.text.destroy();
}

function refreshAll() {
    if (!canvas.ready) return;
    for (const token of canvas.tokens.placeables) update(token);
}

function refreshActor(actor) {
    if (!canvas.ready || !actor) return;
    for (const token of actor.getActiveTokens(false, false)) update(token);
}

function onRefreshToken(token, flags) {
    // Drag previews share the token's id: they must not move its text.
    if (token.isPreview) return;
    const entry = cache.get(token.id);
    // While a token moves only its position changes: move the text, don't recompute it.
    if (entry && !(flags.refreshState || flags.refreshVisibility || flags.refreshSize)) {
        if (entry.text.visible) place(entry, token);
        return;
    }
    update(token);
}

function onCanvasReady() {
    onCanvasTearDown();
    combatRunning = isCombatRunning();
    container = canvas.interface.addChild(new PIXI.Container());
    container.eventMode = "none";
    container.interactiveChildren = false;
    container.zIndex = CONFIG.Canvas.groups.interface.zIndexScrollingText;
    canvas.interface.sortDirty = true;
    refreshAll();
}

function onCanvasTearDown() {
    cache.clear();
    if (container && !container.destroyed) container.destroy({ children: true });
    container = null;
}

function onCombatChange() {
    if (!canvas.ready) return;
    const running = isCombatRunning();
    if (running === combatRunning) return;
    combatRunning = running;
    if (options.combatOnly) refreshAll();
}

/* -------------------------------------------- */
/*  NPCs die                                    */
/* -------------------------------------------- */

/** Actors whose dead status is being written (updateActor and updateToken can both report one change). */
const pendingDead = new Set();

/**
 * The active GM gives an NPC Foundry's dead status (as the overlay) when its wounds pass the
 * threshold, and takes it off again when it is healed, if this feature put it on. Removing the
 * status by hand keeps it off until the NPC is healed and goes down again.
 */
async function syncDeadStatus(actor) {
    if (!actor || !isActiveGM() || !options.npcsDie || !options.deadStatus || pendingDead.has(actor.uuid)) return;
    const health = actorHealth(actor);
    if (!health || health.vehicle) return;
    const tokens = actor.getActiveTokens(false, true);
    const dontMarkDead = [actor.flags, ...tokens.map(token => token.flags)]
        .some(flags => readFlags(flags, {}).dontMarkDead);
    const down = diesAtZero({ type: actor.type, playerOwned: actor.hasPlayerOwner, fraction: health.fraction, npcsDie: true, dontMarkDead });
    const marked = Boolean(actor.getFlag(MODULE_ID, AUTO_DEAD_FLAG));
    if (down === marked) return;
    const status = CONFIG.specialStatusEffects.DEFEATED;
    pendingDead.add(actor.uuid);
    try {
        if (down) {
            if (!actor.statuses.has(status)) await actor.toggleStatusEffect(status, { active: true, overlay: true });
            await actor.setFlag(MODULE_ID, AUTO_DEAD_FLAG, true);
        } else {
            if (actor.statuses.has(status)) await actor.toggleStatusEffect(status, { active: false });
            await actor.unsetFlag(MODULE_ID, AUTO_DEAD_FLAG);
        }
    } catch (error) {
        console.error(`Azecraft Addon | Health estimate: could not update the dead status of ${actor.name}`, error);
    } finally {
        pendingDead.delete(actor.uuid);
    }
}

const touchesHealth = changes => foundry.utils.hasProperty(changes, "system.stats")
    || foundry.utils.hasProperty(changes, "system.quantity") || foundry.utils.hasProperty(changes, "system.unit_wounds");

/* -------------------------------------------- */

function registerHooks() {
    Hooks.on("canvasReady", onCanvasReady);
    Hooks.on("canvasTearDown", onCanvasTearDown);
    Hooks.on("refreshToken", onRefreshToken);
    Hooks.on("deleteToken", tokenDocument => remove(tokenDocument.id));
    Hooks.on("updateToken", (tokenDocument, changes) => {
        if (tokenDocument.object) update(tokenDocument.object);
        const flagsChanged = changes.flags?.[MODULE_ID] || changes.flags?.[LEGACY_ID];
        if (flagsChanged || (changes.delta && touchesHealth(changes.delta))) syncDeadStatus(tokenDocument.actor);
    });
    Hooks.on("updateActor", (actor, changes) => {
        refreshActor(actor);
        if (touchesHealth(changes)) syncDeadStatus(actor);
    });
    const effectChanged = effect => {
        if (effect.parent instanceof Actor) refreshActor(effect.parent);
    };
    Hooks.on("createActiveEffect", effectChanged);
    Hooks.on("deleteActiveEffect", effectChanged);
    Hooks.on("updateCombatant", combatant => {
        if (combatant.token?.object) update(combatant.token.object);
    });
    for (const hook of ["createCombat", "updateCombat", "deleteCombat", "combatStart"]) Hooks.on(hook, onCombatChange);
}

export function initHealthEstimate() {
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Health estimate",
        hint: "A short text over a token (\"Unharmed\" ... \"Near Death\", \"Dead\"; vehicles \"Pristine\" ... \"Wrecked\") on hover, from the Health Estimate module. Stays off while the Health Estimate module is active.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;
    if (legacyActive()) {
        console.log("Azecraft Addon | Health estimate is off: the Health Estimate module is active.");
        Hooks.once("ready", () => {
            if (game.user.isGM) ui.notifications.info("Azecraft health estimate is off while the Health Estimate module is active. Deactivate that module to use this one (same estimates and flags).");
        });
        return;
    }

    registerSettings();
    registerKeybindings();
    readOptions();
    registerHooks();
}
