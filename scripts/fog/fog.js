/**
 * Manual fog of war (GM-drawn), a port of Simple Fog 1.4.4 (MIT, see LICENSE in this folder) with
 * fixes and tools from Simple Fog 1.5 that work on Foundry V13. See docs/fog.md.
 *
 * It uses only this module's ids (layer `canvas.azecraftFog`, control `azecraft-fog`, scene flags
 * `flags.ffg-azecraft-addon.fog`, settings `fog*`), so it runs next to the Simple Fog module during
 * the switch-over: both have their own fog, controls and settings. While Simple Fog is active, new
 * scenes do not get this fog switched on. (Simple Fog 1.4.4's own Ctrl+S never fires on V13: it is
 * registered as "S" instead of "KeyS".)
 */

import FogLayer, { LAYER, TOOLS } from "./fog-layer.js";
import { BRUSH_TEMPLATE } from "./brush-controls.js";
import { CONFIG_TEMPLATE, FogConfig, registerFogConfig } from "./fog-config.js";
import { levelFromPercent } from "./fog-raster.js";
import { FLAG, MODULE_ID, SETTINGS } from "./mask-layer.js";

const CONTROL = "azecraft-fog";

const layer = () => canvas?.[LAYER];
const isActiveControl = () => ui.controls?.control?.name === CONTROL;
const simpleFogActive = () => Boolean(game.modules.get("simplefog")?.active);

function registerSettings() {
    const { NumberField } = foundry.data.fields;
    registerFogConfig();

    game.settings.register(MODULE_ID, SETTINGS.brushSize, {
        scope: "world",
        config: false,
        type: new NumberField({ required: true, nullable: false, initial: 50, min: 10, max: 500, step: 10, integer: true }),
        onChange: value => layer()?.setBrushSize(value)
    });
    game.settings.register(MODULE_ID, SETTINGS.brushOpacity, {
        scope: "world",
        config: false,
        type: new NumberField({ required: true, nullable: false, initial: 0, min: 0, max: 100, step: 5, integer: true }),
        onChange: value => {
            const fog = layer();
            if (!fog) return;
            fog.brushLevel = levelFromPercent(value);
            fog.setPreviewTint();
            fog.brushControls.render();
            if (isActiveControl()) ui.controls.render({ reset: true });
        }
    });
    game.settings.register(MODULE_ID, SETTINGS.confirmDisable, {
        name: "Manual fog: confirm switching off",
        hint: "Ask before switching a scene's manual fog off.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, SETTINGS.autoEnable, {
        name: "Manual fog: on for new scenes",
        hint: "Switch manual fog on for every new scene. Off by default: switch it on per scene with the eye in the fog controls. (Never while the Simple Fog module is active.)",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
    game.settings.register(MODULE_ID, SETTINGS.defaultTool, {
        name: "Manual fog: tool for the shortcut",
        hint: "The tool selected when the fog controls are opened with the keyboard shortcut.",
        scope: "world",
        config: true,
        type: String,
        default: "brush",
        choices: { brush: "Brush", grid: "Grid cells", room: "Room", polygon: "Polygon", box: "Rectangle", ellipse: "Ellipse" }
    });
    game.settings.register(MODULE_ID, SETTINGS.zIndex, {
        name: "Manual fog: drawn above",
        hint: "Which canvas layers the fog covers.",
        scope: "world",
        config: true,
        type: new NumberField({
            required: true, nullable: false, initial: 1120, integer: true,
            choices: { 190: "Below tokens (tokens stay visible)", 220: "Tokens", 1020: "Tokens and doors", 1120: "Everything (also health and scrolling numbers)" }
        }),
        onChange: value => {
            if (layer()) layer().zIndex = value;
        }
    });
    game.settings.register(MODULE_ID, SETTINGS.previewPlayerView, {
        name: "Manual fog: player view for GMs",
        hint: "While a GM has a player's token selected, the fog looks as players see it.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
}

function registerKeybindings() {
    const { SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register(MODULE_ID, "fogSwap", {
        name: "Manual fog: open or leave the fog controls",
        hint: "Switches between the token controls and the manual fog controls.",
        editable: [{ key: "KeyS", modifiers: ["Control"] }],
        onDown: () => {
            if (!canvas.ready) return false;
            if (isActiveControl()) canvas.tokens.activate();
            else ui.controls.activate({ control: CONTROL, tool: game.settings.get(MODULE_ID, SETTINGS.defaultTool) });
            return true;
        },
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
    });
    game.keybindings.register(MODULE_ID, "fogEraser", {
        name: "Manual fog: switch between reveal and hide",
        editable: [{ key: "KeyT" }],
        onDown: () => {
            if (!isActiveControl()) return false;
            layer().setEraser(!layer().eraser);
            return true;
        },
        restricted: true
    });
    const resize = grow => context => {
        if (!isActiveControl() || layer().activeTool !== "brush") return false;
        const current = Number(layer().brushSize);
        const size = grow
            ? Math.min(context.isShift ? 500 : current * 1.25, 500).toNearest(10, "ceil")
            : Math.max(context.isShift ? 10 : current * 0.8, 10).toNearest(10, "floor");
        layer().brushControls.setValue("brushSize", size);
        return true;
    };
    game.keybindings.register(MODULE_ID, "fogBrushSmaller", {
        name: "Manual fog: smaller brush (Shift: smallest)",
        editable: [{ key: "BracketLeft" }],
        reservedModifiers: [SHIFT],
        onDown: resize(false),
        repeat: true,
        restricted: true
    });
    game.keybindings.register(MODULE_ID, "fogBrushLarger", {
        name: "Manual fog: larger brush (Shift: largest)",
        editable: [{ key: "BracketRight" }],
        reservedModifiers: [SHIFT],
        onDown: resize(true),
        repeat: true,
        restricted: true
    });
}

async function toggleFog() {
    const fog = layer();
    if (game.settings.get(MODULE_ID, SETTINGS.confirmDisable) && fog.getSetting("visible")) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Switch manual fog off" },
            content: "<p>Switch the manual fog off for this scene? Players will see the whole map. The fog you drew is kept.</p>"
        });
        if (!confirmed) {
            ui.controls.render({ reset: true });
            return;
        }
    }
    await fog.toggle();
}

function resetFog() {
    return foundry.applications.api.DialogV2.wait({
        window: { title: "Reset manual fog" },
        content: "<p>Start this scene's fog over: <strong>Cover all</strong> fogs the whole scene, <strong>Reveal all</strong> clears it. This cannot be undone.</p>",
        buttons: [
            { action: "reset", label: "Cover all", icon: "fa-solid fa-cloud", callback: () => layer().resetMask() },
            { action: "blank", label: "Reveal all", icon: "fa-solid fa-eye", callback: () => layer().blankMask() },
            { action: "cancel", label: "Cancel", icon: "fa-solid fa-times", default: true }
        ]
    });
}

function sceneControls(controls) {
    if (!game.user.isGM) return;
    const fog = layer();
    const on = Boolean(fog?.visible);
    const tool = fog?.activeTool;
    const shapeTool = ["box", "ellipse", "polygon"].includes(tool);
    let order = 0;
    const entry = (name, data) => ({ name, order: order++, visible: on, ...data });

    controls[CONTROL] = {
        name: CONTROL,
        title: "Manual Fog",
        icon: "fa-solid fa-cloud azfog-control",
        layer: LAYER,
        visible: true,
        onChange: (event, active) => {
            if (active) layer()?.activate();
        },
        onToolChange: (event, changed) => {
            if (!TOOLS.includes(changed.name) || changed.name === layer()?.activeTool) return;
            layer()?._changeTool(changed.name);
            // Expand (room) and Snap (shapes) depend on the tool.
            ui.controls.render({ reset: true });
        },
        activeTool: on && TOOLS.includes(tool) ? tool : "brush",
        tools: {
            toggle: entry("toggle", { title: "Manual fog on or off for this scene", icon: "fa-solid fa-eye", visible: true, toggle: true, active: on, onChange: () => toggleFog() }),
            // Always shown: Foundry needs a visible selected tool, also while the fog is off.
            brush: entry("brush", { title: "Brush", icon: "fa-solid fa-paint-brush", visible: true }),
            grid: entry("grid", {
                title: "Grid cells",
                icon: canvas.grid?.type === CONST.GRID_TYPES.SQUARE ? "fa-solid fa-border-none" : "fa-regular fa-hexagon",
                visible: on && canvas.grid?.type !== CONST.GRID_TYPES.GRIDLESS
            }),
            room: entry("room", { title: "Room: drag out from a point (walls stop it; Shift: open doors too)", icon: "fa-solid fa-block-brick" }),
            polygon: entry("polygon", { title: "Polygon: click the corners, double-click or click the first corner to finish", icon: "fa-solid fa-draw-polygon" }),
            box: entry("box", { title: "Rectangle (Shift: square)", icon: "fa-regular fa-square" }),
            ellipse: entry("ellipse", { title: "Ellipse (Shift: circle)", icon: "fa-regular fa-circle" }),
            eraser: entry("eraser", { title: "Reveal (on) or hide (off) with every tool (T)", icon: "fa-solid fa-eraser", toggle: true, active: Boolean(fog?.eraser), onChange: (event, active) => layer().setEraser(active) }),
            expand: entry("expand", {
                title: "Room: reveal the whole room at a click",
                icon: "fa-solid fa-up-right-and-down-left-from-center",
                visible: on && tool === "room",
                toggle: true,
                active: Boolean(fog?.roomExpand),
                onChange: (event, active) => { layer().roomExpand = active; }
            }),
            snap: entry("snap", {
                title: "Snap to the grid",
                icon: "fa-solid fa-plus",
                visible: on && shapeTool && !canvas.grid?.isGridless,
                toggle: true,
                active: Boolean(canvas.forceSnapVertices),
                onChange: (event, active) => { canvas.forceSnapVertices = active; }
            }),
            sceneConfig: entry("sceneConfig", { title: "Fog look for this scene", icon: "fa-solid fa-cog", button: true, onChange: () => new FogConfig(canvas.scene).render({ force: true }) }),
            reset: entry("reset", { title: "Reset this scene's fog", icon: "fa-solid fa-trash", button: true, onChange: () => resetFog() })
        }
    };
}

/** While a GM has a player's token selected, show the fog the way players see it. */
function previewPlayerView() {
    const fog = layer();
    if (!fog?.visible || !fog.fogColorLayer || !game.user.isGM || !game.settings.get(MODULE_ID, SETTINGS.previewPlayerView)) return;
    const asPlayer = canvas.tokens.controlled.some(token => token.actor?.hasPlayerOwner);
    fog.setColorAlpha(fog.getSetting(asPlayer ? "playerColorAlpha" : "gmColorAlpha"), true);
    fog.setColorTint(fog.getSetting(asPlayer ? "playerColorTint" : "gmColorTint"));
    fog.setFogImageOverlayAlpha(fog.getSetting(asPlayer ? "fogImageOverlayPlayerAlpha" : "fogImageOverlayGMAlpha") / 100, true);
}

/**
 * New blank scenes start without Foundry's own fog of war (Token Vision and Fog Exploration off),
 * unless the setting says otherwise. Duplicated and imported scenes carry their own values and keep
 * them.
 */
function initNewSceneVision() {
    game.settings.register(MODULE_ID, SETTINGS.newSceneVision, {
        name: "New scenes: Foundry vision and fog",
        hint: "Off: new scenes start with Token Vision and Fog Exploration off, so players see the whole map until you switch them on (scene settings, Lighting tab). On: Foundry's default (both on). Duplicated and imported scenes keep their own.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
    Hooks.on("preCreateScene", (scene, data, options, userId) => {
        if (userId !== game.user.id || game.settings.get(MODULE_ID, SETTINGS.newSceneVision)) return;
        const changes = {};
        if (!("tokenVision" in data)) changes.tokenVision = false;
        if (foundry.utils.getProperty(data, "fog.exploration") === undefined) changes["fog.exploration"] = false;
        if (!foundry.utils.isEmpty(changes)) scene.updateSource(changes);
    });
}

export function initFog() {
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Manual fog",
        hint: "GM-drawn fog of war (brush, grid, room, shapes), from Simple Fog. It can run next to the Simple Fog module while you switch over.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    initNewSceneVision();
    if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;

    registerSettings();
    registerKeybindings();
    CONFIG.Canvas.layers[LAYER] = { group: "interface", layerClass: FogLayer };

    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([BRUSH_TEMPLATE, CONFIG_TEMPLATE]));
    Hooks.on("getSceneControlButtons", sceneControls);
    Hooks.on("updateScene", (...args) => layer()?._updateScene(...args));
    Hooks.on("controlToken", () => previewPlayerView());
    Hooks.on("canvasInit", () => {
        const overlay = canvas.scene?.getFlag(MODULE_ID, `${FLAG}.fogImageOverlayFilePath`)
            ?? game.settings.get(MODULE_ID, SETTINGS.config).fogImageOverlayFilePath;
        if (overlay) canvas.loadTexturesOptions.additionalSources.push(overlay);
    });
    // Only the GM who made the scene writes the flag (players cannot, and one write is enough).
    Hooks.on("createScene", (scene, options, userId) => {
        if (userId !== game.user.id || simpleFogActive() || !game.settings.get(MODULE_ID, SETTINGS.autoEnable)) return;
        scene.setFlag(MODULE_ID, `${FLAG}.visible`, true);
    });
}
