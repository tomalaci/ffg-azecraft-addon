/**
 * Editor for a power preset: name, power, subtype (Tech element, construct, ...) and the modifiers
 * to tick in advance. Saves into the Actor's `powerPresets` flag.
 */

import {
    POWER_MODIFIER_CATALOG,
    PRESET_NAME_MAX_LENGTH,
    allowedModifierKeys,
    difficultyLabel,
    findPower,
    findSubtype,
    modifierGroups,
    normalizePreset,
    normalizePresets,
    powersFor,
    presetDifficulty
} from "./power-catalog.js";

const MODULE_ID = "ffg-azecraft-addon";
const FLAG = "powerPresets";
const TEMPLATE = `modules/${MODULE_ID}/templates/actors/parts/power-preset-editor.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PowerPresetEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Open the editor for a new preset of a discipline, or for an existing preset.
     * @param {Actor} actor
     * @param {{discipline?: string, presetId?: string}} options
     */
    static open(actor, { discipline = "biotics", presetId = null } = {}) {
        const existing = presetId
            ? normalizePresets(actor.getFlag(MODULE_ID, FLAG)).find(preset => preset.id === presetId)
            : null;
        const power = existing ? findPower(existing.power) : powersFor(discipline)[0];
        const draft = existing ?? { id: foundry.utils.randomID(), name: "", power: power.id, subtype: null, modifiers: [] };
        return new PowerPresetEditor({ actor, draft, isNew: !existing }).render({ force: true });
    }

    constructor({ actor, draft, isNew, ...options }) {
        super({ id: `azecraft-power-preset-${actor.id}-${draft.id}`, ...options });
        this.actor = actor;
        this.draft = draft;
        this.isNew = isNew;
    }

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["azecraft-power-preset"],
        window: { icon: "fa-solid fa-bookmark", contentClasses: ["standard-form"], resizable: true },
        position: { width: 480 },
        form: { handler: PowerPresetEditor.#onSubmit, closeOnSubmit: true }
    };

    static PARTS = {
        form: { template: TEMPLATE, scrollable: [".azpp-mods"] },
        footer: { template: "templates/generic/form-footer.hbs" }
    };

    get title() {
        return `${this.isNew ? "New" : "Edit"} preset: ${this.actor.name}`;
    }

    async _prepareContext() {
        const power = findPower(this.draft.power);
        const discipline = power.discipline;
        const chosen = new Set(this.draft.modifiers);
        const subtype = findSubtype(power, this.draft.subtype);
        const loaded = power.loadout ? findSubtype(power, this.actor.getFlag(MODULE_ID, "techLoadout")?.[power.id]) ?? power.subtypes[0] : null;
        const preview = presetDifficulty(power.id, subtype?.id ?? loaded?.id, this.draft.modifiers);

        return {
            name: this.draft.name,
            nameMax: PRESET_NAME_MAX_LENGTH,
            namePlaceholder: power.label,
            skill: POWER_MODIFIER_CATALOG[discipline].skill,
            powers: powersFor(discipline).map(p => ({ id: p.id, label: p.label, selected: p.id === power.id })),
            subtypes: power.subtypes?.map(s => ({ id: s.id, label: s.label, selected: s.id === subtype?.id })) ?? null,
            subtypeLabel: power.subtypeLabel,
            noSubtypeLabel: loaded ? `Loaded ${power.subtypeLabel.toLowerCase()} (now ${loaded.label})` : "Any / not specified",
            groups: modifierGroups(discipline, power.id, subtype?.id ?? loaded?.id)
                .filter(group => group.options.length)
                .map(group => ({
                    label: group.label,
                    options: group.options.map(option => {
                        const key = `${group.id}:${option.id}`;
                        return { key, label: option.label, modifierText: option.modifierText, checked: chosen.has(key) };
                    })
                })),
            preview: difficultyLabel(preview.difficulty)
                + (preview.upgrades ? `, upgraded ${preview.upgrades}×` : "")
                + (preview.setback ? `, +${preview.setback} Setback` : ""),
            buttons: [{ type: "submit", icon: "fa-solid fa-save", label: "Save preset" }]
        };
    }

    /** Read the form into the draft, keeping only modifiers the chosen power allows. */
    #readForm() {
        const data = new foundry.applications.ux.FormDataExtended(this.element).object;
        const power = findPower(data.power) ?? findPower(this.draft.power);
        const subtype = findSubtype(power, data.subtype)?.id ?? null;
        const allowed = allowedModifierKeys(power, subtype);
        const modifiers = [...this.element.querySelectorAll("input[data-modifier]:checked")]
            .map(input => input.dataset.modifier)
            .filter(key => allowed.has(key));
        return { ...this.draft, name: String(data.name ?? ""), power: power.id, subtype, modifiers };
    }

    _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        if (event.target.name === "name") {
            this.draft = this.#readForm();
            return;
        }
        // Power, subtype or modifiers changed: the options and the difficulty preview follow.
        const previousPower = this.draft.power;
        this.draft = this.#readForm();
        if (this.draft.power !== previousPower) this.draft.subtype = null;
        this.render();
    }

    static async #onSubmit() {
        const preset = normalizePreset(this.#readForm());
        if (!preset) return;
        const presets = normalizePresets(this.actor.getFlag(MODULE_ID, FLAG));
        const index = presets.findIndex(p => p.id === preset.id);
        if (index >= 0) presets[index] = preset;
        else presets.push(preset);
        await this.actor.setFlag(MODULE_ID, FLAG, presets);
    }
}
