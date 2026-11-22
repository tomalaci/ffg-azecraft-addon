/**
 * Manual fog configuration: colours and opacity for GMs and players, an overlay image, blur and fade.
 * Opened from the module settings it edits the world defaults; from the fog controls it edits the
 * current scene, storing only what differs from the defaults. Ported from Simple Fog 1.4.4 (MIT, see
 * LICENSE).
 */

import { hexToWeb, sceneOverrides } from "./fog-core.js";
import { roundPercent } from "./fog-raster.js";
import { FLAG, MODULE_ID, SETTINGS } from "./mask-layer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/fog/fog-config.hbs`;

/** The world default fog configuration (also the form's fields). */
export function registerFogConfig() {
    const { BooleanField, ColorField, FilePathField, NumberField, SchemaField } = foundry.data.fields;
    const percent = (initial, label, hint) => new NumberField({ required: true, nullable: false, initial, min: 0, max: 100, step: 5, integer: true, label, hint });

    game.settings.register(MODULE_ID, SETTINGS.config, {
        scope: "world",
        config: false,
        type: new SchemaField({
            precision: new NumberField({
                required: true, nullable: false, initial: 10, min: 1, max: 200, step: 1, integer: true,
                label: "Precision (px)",
                hint: "Size of the smallest piece of fog. Rounded down to fit the scene's grid (10 on a 100 px grid: 10 x 10 pieces per square; the grid size: whole squares). Smaller is finer but bigger to store; huge maps get coarser automatically. Changing it converts the fog already drawn."
            }),
            gmColorTint: new ColorField({ required: true, nullable: false, initial: "#000000", label: "Colour" }),
            gmColorAlpha: percent(60, "Opacity (%)", "GMs see the map through the fog."),
            playerColorTint: new ColorField({ required: true, nullable: false, initial: "#000000", label: "Colour" }),
            playerColorAlpha: percent(100, "Opacity (%)"),
            fogImageOverlayFilePath: new FilePathField({
                categories: ["IMAGE", "VIDEO"], nullable: true, initial: null, required: false,
                label: "Image", hint: "Shown in the fogged areas, above or below the colour. Use an image the size of the scene's background."
            }),
            fogImageOverlayGMAlpha: percent(60, "Image opacity for GMs (%)"),
            fogImageOverlayPlayerAlpha: percent(100, "Image opacity for players (%)"),
            fogImageOverlayZIndex: new NumberField({
                required: true, nullable: false, initial: 6000, integer: true, label: "Order",
                choices: { 4000: "Colour above the image", 6000: "Image above the colour" }
            }),
            blurEnable: new BooleanField({ initial: true, label: "Soft edges (blur)" }),
            blurRadius: new NumberField({ required: true, nullable: false, initial: 5, min: 0, max: 50, step: 1, integer: true, label: "Blur radius" }),
            blurQuality: new NumberField({
                required: true, nullable: false, initial: 2, min: 1, max: 8, step: 1, integer: true, positive: true,
                label: "Blur quality", hint: "Higher looks smoother but costs performance."
            }),
            transition: new BooleanField({ initial: true, label: "Fade opacity changes" }),
            transitionSpeed: new NumberField({ required: true, nullable: false, initial: 800, min: 100, max: 5000, step: 100, integer: true, label: "Fade time (ms)" })
        }),
        onChange: value => {
            if (canvas.azecraftFog) canvas.azecraftFog.settings = value;
        }
    });

    game.settings.registerMenu(MODULE_ID, "fogConfigMenu", {
        name: "Manual fog: default look",
        label: "Configure fog",
        hint: "Colours, opacity, overlay image, blur and fade used by every scene without its own fog configuration.",
        icon: "fa-solid fa-cloud",
        type: FogConfig,
        restricted: true
    });
}

export class FogConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @param {Scene|null} scene  The scene to configure, or none for the world defaults. */
    constructor(scene = null, options = {}) {
        super(options);
        this.scene = scene instanceof Scene ? scene : null;
    }

    static DEFAULT_OPTIONS = {
        id: "azecraft-fog-config",
        tag: "form",
        classes: ["azecraft-fog-config"],
        form: { handler: FogConfig.#onSubmit, closeOnSubmit: true },
        position: { width: 520, height: 720 },
        window: { icon: "fa-solid fa-cloud", title: "Fog Configuration", contentClasses: ["standard-form"] },
        actions: { reset: FogConfig.#onReset }
    };

    static PARTS = {
        body: { template: CONFIG_TEMPLATE, scrollable: [""] },
        footer: { template: "templates/generic/form-footer.hbs" }
    };

    get title() {
        return this.scene ? `Fog Configuration: ${this.scene.name}` : "Fog Configuration: defaults";
    }

    #defaults() {
        return game.settings.get(MODULE_ID, SETTINGS.config);
    }

    #value(key) {
        return (this.scene?.getFlag(MODULE_ID, `${FLAG}.${key}`)) ?? this.#defaults()[key];
    }

    async _prepareContext() {
        const fields = game.settings.settings.get(`${MODULE_ID}.${SETTINGS.config}`).type.fields;
        const values = Object.fromEntries(Object.keys(fields).map(key => [key, this.#value(key)]));
        for (const key of ["gmColorTint", "playerColorTint"]) values[key] = hexToWeb(values[key]);
        for (const key of ["gmColorAlpha", "playerColorAlpha", "fogImageOverlayGMAlpha", "fogImageOverlayPlayerAlpha"]) values[key] = roundPercent(values[key]);
        const fog = canvas.azecraftFog;
        const raster = this.scene && this.scene === canvas.scene ? fog?.raster : null;
        return {
            fields,
            values,
            scene: this.scene?.name ?? null,
            cellNote: raster ? `Now: ${raster.cell} px pieces, ${raster.cols} x ${raster.rows} for this scene.` : "",
            buttons: [
                { type: "submit", icon: "fa-solid fa-save", label: this.scene ? "Save for this scene" : "Save as default" },
                { type: "button", action: "reset", icon: "fa-solid fa-undo", label: this.scene ? "Use the defaults" : "Reset defaults" }
            ]
        };
    }

    static async #onSubmit(event, form, formData) {
        const values = foundry.utils.getProperty(foundry.utils.expandObject(formData.object), `${MODULE_ID}.${SETTINGS.config}`) ?? {};
        if (this.scene) {
            const { set, unset } = sceneOverrides(values, this.#defaults());
            const update = {};
            for (const [key, value] of Object.entries(set)) update[`flags.${MODULE_ID}.${FLAG}.${key}`] = value;
            for (const key of unset) update[`flags.${MODULE_ID}.${FLAG}.-=${key}`] = null;
            await this.scene.update(update);
        } else {
            await game.settings.set(MODULE_ID, SETTINGS.config, { ...this.#defaults(), ...values });
        }
        if (canvas.ready) await canvas.azecraftFog?.draw();
    }

    static async #onReset() {
        const keys = Object.keys(this.#defaults());
        if (this.scene) {
            await this.scene.update(Object.fromEntries(keys.map(key => [`flags.${MODULE_ID}.${FLAG}.-=${key}`, null])));
            if (canvas.ready) await canvas.azecraftFog?.draw();
        } else {
            await game.settings.set(MODULE_ID, SETTINGS.config, {});
        }
        this.render();
    }
}
