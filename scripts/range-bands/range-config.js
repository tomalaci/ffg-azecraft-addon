/**
 * Range bands configuration (GM, from the module settings): the bands (label, distance, colour),
 * the distance unit and the look of the rings. Saved as a world setting, so every client follows.
 */

import { DEFAULT_CONFIG, MAX_BANDS, MODULE_ID, SETTINGS, configFromForm, normalizeConfig } from "./range-core.js";
import { getConfig } from "./range-layer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/range-bands/range-config.hbs`;

export class RangeBandsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    /** Unsaved edits, kept while rows are added or removed. */
    #draft = null;

    static DEFAULT_OPTIONS = {
        id: "azecraft-range-bands-config",
        tag: "form",
        classes: ["azrb-config-window"],
        form: { handler: RangeBandsConfig.#onSubmit, closeOnSubmit: true },
        position: { width: 520, height: "auto" },
        window: { icon: "fa-regular fa-circle-dot", title: "Range Bands", contentClasses: ["standard-form"] },
        actions: { addBand: RangeBandsConfig.#onAdd, removeBand: RangeBandsConfig.#onRemove, reset: RangeBandsConfig.#onReset }
    };

    static PARTS = {
        body: { template: CONFIG_TEMPLATE },
        footer: { template: "templates/generic/form-footer.hbs" }
    };

    async _prepareContext() {
        const config = this.#draft ?? getConfig();
        const units = canvas.scene?.grid.units;
        return {
            config,
            bands: config.bands.map((band, index) => ({ ...band, index })),
            canAdd: config.bands.length < MAX_BANDS,
            units: { squares: "Grid squares", scene: units ? `Scene units (${units} on this scene)` : "Scene units (ft, m...)" },
            buttons: [
                { type: "submit", icon: "fa-solid fa-save", label: "Save" },
                { type: "button", action: "reset", icon: "fa-solid fa-undo", label: "Genesys defaults" }
            ]
        };
    }

    #read() {
        return configFromForm(new foundry.applications.ux.FormDataExtended(this.element).object);
    }

    static #onAdd() {
        const draft = this.#read();
        const last = draft.bands.at(-1);
        draft.bands.push({ label: "", distance: (Number(last?.distance) || 0) * 2 || 1, color: "#ffffff" });
        this.#draft = draft;
        this.render();
    }

    static #onRemove(event, target) {
        const draft = this.#read();
        draft.bands.splice(Number(target.dataset.index), 1);
        this.#draft = draft;
        this.render();
    }

    static #onReset() {
        this.#draft = foundry.utils.deepClone(DEFAULT_CONFIG);
        this.render();
    }

    static async #onSubmit(event, form, formData) {
        await game.settings.set(MODULE_ID, SETTINGS.config, normalizeConfig(configFromForm(formData.object)));
    }
}
