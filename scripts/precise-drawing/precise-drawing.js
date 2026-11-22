/**
 * Precise drawing: finer freehand drawing, an eyedropper (K) and "convert drawings to an image", a port
 * of Precise Drawing Tools 1.6.1 (MIT, see LICENSE in this folder). See docs/precise-drawing.md.
 *
 * Foundry's freehand tool keeps a point at most every 75 ms (`Drawing.FREEHAND_SAMPLE_RATE`), handles
 * pointer moves at most once a frame (`MouseInteractionManager#dragTime`) and starts a drag only after
 * 10 screen pixels (`options.dragResistance`). While a freehand stroke is drawn, this lowers the drag
 * resistance and picks the sampling interval from the pointer's speed; when the stroke ends (or the
 * canvas is torn down) Foundry's values are put back, so nothing else changes.
 *
 * It does not run while the Precise Drawing Tools module is active: both change the same values.
 */

import { addConvertButton } from "./convert-drawings.js";
import { registerEyedropper } from "./eyedropper.js";
import { MODULE_ID, SETTINGS, StrokeSampler } from "./drawing-core.js";

/** Drag resistance while drawing: tiny but not 0, which Foundry treats as "use the default". */
const DRAWING_DRAG_RESISTANCE = 0.1;

const setting = key => game.settings.get(MODULE_ID, SETTINGS[key]);
const DrawingClass = () => foundry.canvas.placeables.Drawing;
const isFreehand = () => ui.controls?.control?.name === "drawings" && game.activeTool === "freehand";
const otherModuleActive = () => Boolean(game.modules.get("precise-drawing-tools")?.active);

/** The current freehand stroke, and Foundry's values while they are changed (null when not). */
const stroke = {
    active: false,
    sampler: new StrokeSampler(),
    sampleRate: null,
    manager: null,
    dragResistance: undefined
};

function setSampleRate(ms) {
    const Drawing = DrawingClass();
    stroke.sampleRate ??= Drawing.FREEHAND_SAMPLE_RATE;
    Drawing.FREEHAND_SAMPLE_RATE = ms;
}

/** Put Foundry's values back. Safe to call at any time. */
function endStroke() {
    if (stroke.sampleRate !== null) {
        DrawingClass().FREEHAND_SAMPLE_RATE = stroke.sampleRate;
        stroke.sampleRate = null;
    }
    if (stroke.manager) {
        stroke.manager.options.dragResistance = stroke.dragResistance;
        stroke.manager = null;
        stroke.dragResistance = undefined;
    }
    stroke.sampler.reset();
    stroke.active = false;
}

function onPointerDown(event) {
    if (event.button !== 0 || !isFreehand()) return;
    endStroke();
    stroke.active = true;
    if (setting("noDragResistance")) {
        const manager = canvas.mouseInteractionManager;
        stroke.manager = manager;
        stroke.dragResistance = manager.options.dragResistance;
        manager.options.dragResistance = DRAWING_DRAG_RESISTANCE;
    }
}

function onPointerMove(event) {
    if (!stroke.active || !setting("dynamicSampling")) return;
    const manager = canvas.mouseInteractionManager;
    if (manager.state !== manager.states.DRAG || manager._dragRight || !isFreehand()) return;
    const interval = stroke.sampler.add(event.global.x, event.global.y, performance.now(), setting("samplingDistance"));
    setSampleRate(interval);
    // Let the next pointer move through at once instead of waiting for the next frame.
    manager.dragTime = 0;
}

function onPointerUp() {
    if (stroke.active) endStroke();
}

const STAGE_LISTENERS = {
    pointerdown: onPointerDown,
    pointermove: onPointerMove,
    pointerup: onPointerUp,
    pointerupoutside: onPointerUp
};

/**
 * Pointer events, not the original's mouse events, so pens and touch work too. Foundry removes all
 * stage listeners when it draws a scene; these are added once per canvas and removed on tear-down
 * (the original added them and a scene-controls hook again on every canvasReady).
 */
function attachStage() {
    for (const [type, listener] of Object.entries(STAGE_LISTENERS)) {
        canvas.stage.off(type, listener);
        canvas.stage.on(type, listener);
    }
}

function detachStage() {
    endStroke();
    for (const [type, listener] of Object.entries(STAGE_LISTENERS)) canvas.stage?.off(type, listener);
}

function registerSettings() {
    const { NumberField } = foundry.data.fields;
    game.settings.register(MODULE_ID, SETTINGS.noDragResistance, {
        name: "Precise drawing: no drag resistance",
        hint: "Freehand strokes start at once, so short strokes work. Otherwise the pointer has to move 10 pixels first.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, SETTINGS.dynamicSampling, {
        name: "Precise drawing: points follow the pointer's speed",
        hint: "Foundry keeps a freehand point at most every 75 ms. With this, slow strokes keep points as often as every 4 ms, so they follow the pointer closely.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, SETTINGS.samplingDistance, {
        name: "Precise drawing: point spacing",
        hint: "With the setting above: about two points per this many screen pixels. Lower is more detailed (more points per drawing).",
        scope: "client",
        config: true,
        type: new NumberField({ required: true, nullable: false, initial: 50, min: 5, max: 200, step: 5, integer: true })
    });
    game.settings.register(MODULE_ID, SETTINGS.eyedropper, {
        name: "Precise drawing: eyedropper",
        hint: "With the drawing controls open, hold K over the map and let go to take the colour under the pointer as the line colour for new drawings; with Shift, the fill colour. The key can be changed in Configure Controls.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
    game.settings.register(MODULE_ID, SETTINGS.convertButton, {
        name: "Precise drawing: convert to image button",
        hint: "A button in the drawing controls that turns the selected drawings into one image: download it, or (GMs) replace the drawings with a tile of it.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => ui.controls?.render({ reset: true })
    });
}

export function initPreciseDrawing() {
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Precise drawing",
        hint: "Finer freehand drawing, an eyedropper (K) and a convert-to-image button in the drawing controls, from Precise Drawing Tools. Off while the Precise Drawing Tools module is active.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;

    if (otherModuleActive()) {
        console.log("Azecraft Addon | Precise drawing is off: the Precise Drawing Tools module is active.");
        Hooks.once("ready", () => {
            if (game.user.isGM) {
                ui.notifications.info("Precise drawing (Azecraft Addon) is off while the Precise Drawing Tools module is active. Disable that module to use it.");
            }
        });
        return;
    }

    registerSettings();
    registerEyedropper();
    Hooks.on("canvasReady", attachStage);
    Hooks.on("canvasTearDown", detachStage);
    // Switching tools in the middle of a stroke puts Foundry's values back.
    Hooks.on("renderSceneControls", () => {
        if (stroke.active && !isFreehand()) endStroke();
    });
    Hooks.on("getSceneControlButtons", controls => {
        if (setting("convertButton")) addConvertButton(controls);
    });
}
