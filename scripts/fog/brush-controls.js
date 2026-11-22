/**
 * Manual fog brush window (GM): brush size (brush tool only) and opacity, with Reveal / Hide
 * shortcuts. Open while the fog controls are active; it cannot be closed by hand. Ported from Simple
 * Fog 1.4.4 (MIT, see LICENSE).
 */

import { MODULE_ID, SETTINGS } from "./mask-layer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const BRUSH_TEMPLATE = `modules/${MODULE_ID}/templates/fog/brush-controls.hbs`;

export class BrushControls extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-fog-brush",
        tag: "aside",
        classes: ["azecraft-fog-brush"],
        position: { width: 300, height: "auto" },
        window: { title: "Fog Brush", icon: "fa-solid fa-cloud", minimizable: false },
        actions: {
            opacityPreset: BrushControls.#onOpacityPreset
        }
    };

    static PARTS = {
        body: { template: BRUSH_TEMPLATE }
    };

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        // Next to the scene navigation, like Foundry's own palettes.
        if (options.isFirstRender && ui.nav?.element) {
            const { right, top } = ui.nav.element.getBoundingClientRect();
            const scale = game.settings.get("core", "uiConfig")?.uiScale ?? 1;
            options.position.left ??= right + 16 * scale;
            options.position.top ??= top;
        }
    }

    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        this.window.close?.remove();
        return frame;
    }

    /** Only the layer closes it (Escape does not). */
    async close(options = {}) {
        if (options.closeKey) return this;
        return super.close(options);
    }

    async _prepareContext() {
        return {
            showSize: canvas.azecraftFog?.activeTool === "brush",
            brushSize: game.settings.get(MODULE_ID, SETTINGS.brushSize),
            brushOpacity: game.settings.get(MODULE_ID, SETTINGS.brushOpacity)
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        for (const input of this.element.querySelectorAll("input[type=range]")) {
            // Live label while dragging; saved on release.
            input.addEventListener("input", () => this.#label(input));
            input.addEventListener("change", () => {
                const key = input.name === "brushSize" ? SETTINGS.brushSize : SETTINGS.brushOpacity;
                game.settings.set(MODULE_ID, key, Number(input.value));
            });
        }
    }

    #label(input) {
        const unit = input.name === "brushSize" ? "px" : "%";
        input.closest(".flexrow").querySelector(".range-value").textContent = `${input.value}${unit}`;
    }

    /** Set the size or opacity from a key binding, updating the slider. */
    setValue(name, value) {
        const input = this.element?.querySelector(`input[name=${name}]`);
        if (input) {
            input.value = value;
            this.#label(input);
        }
        return game.settings.set(MODULE_ID, name === "brushSize" ? SETTINGS.brushSize : SETTINGS.brushOpacity, Number(value));
    }

    static #onOpacityPreset(event, target) {
        return this.setValue("brushOpacity", Number(target.dataset.value));
    }
}
