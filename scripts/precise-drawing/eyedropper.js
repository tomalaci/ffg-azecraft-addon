/**
 * Eyedropper for drawings (precise drawing, see docs/precise-drawing.md): with the drawing controls
 * open, hold K and the active tool button shows the colour under the pointer; letting go stores it as
 * the line colour (with Shift: the fill colour) of new drawings, in Foundry's own default drawing
 * settings. While K is held the scene is shown without darkness and weather, so the map's own
 * colours are picked.
 */

import { MODULE_ID, SETTINGS, pixelToColor } from "./drawing-core.js";

const enabled = () => game.settings.get(MODULE_ID, SETTINGS.eyedropper);
const drawingsActive = () => canvas.ready && ui.controls?.control?.name === "drawings";
const isShift = () => game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT);

/** What was changed while K is held, to put back afterwards (null when not picking). */
let picking = null;

/**
 * The colour under the pointer. The primary group's render texture has the background, tiles, tokens
 * and drawings, without lighting or the interface (it still has darkness and weather, hidden while
 * picking).
 */
function colorUnderPointer() {
    const { x, y } = canvas.stage.toGlobal(canvas.mousePosition);
    const pixel = canvas.app.renderer.extract.pixels(canvas.primary.renderTexture, new PIXI.Rectangle(x, y, 1, 1));
    const picked = pixelToColor(Array.from(pixel.subarray(0, 4)));
    if (CONFIG.debug.eyedropper) console.log(`%c${picked.color}    `, `background: ${picked.color}`);
    return picked;
}

/** Show the colour on the active tool button: as background for fill (Shift), as outline for line. */
function showColor(color) {
    const button = document.querySelector('#scene-controls-tools button.tool[aria-pressed="true"]');
    if (!button) return;
    if (isShift()) button.style.background = color;
    else {
        button.style.color = color;
        button.style.border = `2px solid ${color}`;
    }
}

function onPointerMove() {
    showColor(colorUnderPointer().color);
}

function start() {
    const weather = canvas.weather?.weatherEffects;
    const controls = document.getElementById("scene-controls");
    picking = {
        scene: canvas.scene,
        darkness: canvas.environment.darknessLevel,
        weather: weather ? weather.visible : null,
        faded: Boolean(controls?.classList.contains("faded-ui"))
    };
    if (picking.darkness !== 0) canvas.environment.initialize({ environment: { darknessLevel: 0 } });
    if (weather) weather.visible = false;
    controls?.classList.remove("faded-ui");
    canvas.stage.on("pointermove", onPointerMove);
    canvas.stage.on("pointerdown", onPointerMove);
    onPointerMove();
}

/**
 * Put the scene back; `pick` stores the colour under the pointer first. `live` is false while the
 * canvas is being torn down.
 */
async function finish(pick, live = true) {
    const changed = picking;
    picking = null;
    canvas.stage?.off("pointermove", onPointerMove);
    canvas.stage?.off("pointerdown", onPointerMove);
    const picked = pick && live ? colorUnderPointer() : null;
    if (changed.darkness !== 0) {
        // Initialising the environment also writes the level into the scene's data (not saved).
        if (live) canvas.environment.initialize({ environment: { darknessLevel: changed.darkness } });
        else changed.scene.environment.darknessLevel = changed.darkness;
    }
    const weather = canvas.weather?.weatherEffects;
    if (weather && changed.weather !== null) weather.visible = changed.weather;
    if (changed.faded) document.getElementById("scene-controls")?.classList.add("faded-ui");
    if (!picked) return;

    const fill = isShift();
    const key = foundry.canvas.layers.DrawingsLayer.DEFAULT_CONFIG_SETTING;
    const changes = fill
        ? { fillColor: picked.color, fillAlpha: picked.alpha }
        : { strokeColor: picked.color, strokeAlpha: picked.alpha };
    await game.settings.set("core", key, { ...game.settings.get("core", key), ...changes });
    showColor(picked.color);
}

export function registerEyedropper() {
    const { SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register(MODULE_ID, "preciseDrawingEyedropper", {
        name: "Precise drawing: eyedropper",
        hint: "With the drawing controls open: hold over the map, let go to take that colour as the line colour for new drawings (with Shift: the fill colour).",
        editable: [{ key: "KeyK" }],
        reservedModifiers: [SHIFT],
        onDown: () => {
            if (!enabled() || !drawingsActive()) return false;
            if (!picking) start();
            return true;
        },
        onUp: () => {
            if (!picking) return false;
            // Always put the scene back, also when the controls were switched while K was held.
            finish(drawingsActive(), canvas.ready).catch(error => {
                console.error(error);
                ui.notifications.error(`Eyedropper: ${error.message}`);
            });
            return true;
        }
    });
    // Leaving the scene while K is held.
    Hooks.on("canvasTearDown", () => {
        if (picking) finish(false, false);
    });
}
