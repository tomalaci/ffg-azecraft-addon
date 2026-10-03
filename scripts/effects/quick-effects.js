/**
 * Quick effects from the mission dashboard: statuses (the system's, e.g. Disoriented or Boost Next
 * Check) and custom roll effects (dice on all / combat / power / chosen checks, for the next check,
 * this combat or until removed) on one character or the whole squad, without finding tokens.
 *
 * Effects are ordinary Active Effects, built like the system's statuses (see effect-core.js), so the
 * system's dice pools and its "next check" / "this combat" clean-up handle them. Anyone may add or
 * remove them on any squad member: changes to actors the user does not own go to the active GM over
 * the module socket. GMs can save custom effects as presets (world setting) for everyone.
 */

import { DICE_FIELDS, DURATIONS, EFFECT_FLAG, SCOPES, describeSpec, effectChanges, normalizeSpec, systemDuration } from "./effect-core.js";

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const PRESETS = "effectPresets";
const TEMPLATE = `modules/${MODULE_ID}/templates/effects/effect-picker.hbs`;
const ICONS = ["icons/svg/aura.svg", "icons/svg/upgrade.svg", "icons/svg/downgrade.svg", "icons/svg/daze.svg", "icons/svg/terror.svg",
    "icons/svg/eye.svg", "icons/svg/blind.svg", "icons/svg/shield.svg", "icons/svg/target.svg", "icons/svg/fire.svg",
    "icons/svg/frozen.svg", "icons/svg/poison.svg", "icons/svg/lightning.svg", "icons/svg/sun.svg", "icons/svg/mystery-man.svg"];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function skillList(actor) {
    return Object.entries(actor?.system?.skills ?? {}).map(([key, skill]) => ({
        key,
        type: skill.type ?? "",
        label: game.i18n.localize(skill.label ?? key)
    })).sort((a, b) => a.label.localeCompare(b.label));
}

/* -------------------------------------------- */
/*  Operations (run by an owner or the GM)      */
/* -------------------------------------------- */

async function perform(op) {
    const actors = (op.actorUuids ?? []).map(uuid => fromUuidSync(uuid)).filter(actor => actor?.documentName === "Actor");
    for (const actor of actors) {
        if (op.kind === "status") {
            await actor.toggleStatusEffect(op.statusId, { active: true });
        } else if (op.kind === "custom") {
            const spec = normalizeSpec(op.spec);
            const data = {
                name: spec.name || "Effect",
                img: op.img || ICONS[0],
                changes: effectChanges(spec, skillList(actor)),
                flags: { [MODULE_ID]: { [EFFECT_FLAG]: { spec, group: op.group ?? null } } }
            };
            const duration = systemDuration(spec);
            if (duration) data.system = { duration };
            await actor.createEmbeddedDocuments("ActiveEffect", [data]);
        } else if (op.kind === "remove") {
            if (actor.effects.has(op.effectId)) await actor.deleteEmbeddedDocuments("ActiveEffect", [op.effectId]);
        } else if (op.kind === "removeGroup") {
            const ids = actor.effects.filter(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG)?.group === op.group).map(effect => effect.id);
            if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
        }
    }
}

/** Run an operation: directly on actors this user owns, through the active GM for the others. */
export async function runEffectOp(op) {
    const actors = op.actorUuids.map(uuid => fromUuidSync(uuid)).filter(Boolean);
    const mine = actors.filter(actor => actor.isOwner).map(actor => actor.uuid);
    const others = actors.filter(actor => !actor.isOwner).map(actor => actor.uuid);
    if (mine.length) await perform({ ...op, actorUuids: mine });
    if (!others.length) return;
    if (!game.users.activeGM) {
        ui.notifications.warn("Changing effects on someone else's character needs a GM online.");
        return;
    }
    game.socket.emit(SOCKET, { type: "quickEffect", op: { ...op, actorUuids: others }, userId: game.user.id });
}

/* -------------------------------------------- */
/*  Presets                                     */
/* -------------------------------------------- */

function readPresets() {
    const presets = game.settings.get(MODULE_ID, PRESETS);
    return (Array.isArray(presets) ? presets : []).map(preset => ({ id: preset.id, img: preset.img, spec: normalizeSpec(preset.spec) }));
}

/* -------------------------------------------- */
/*  Picker window                               */
/* -------------------------------------------- */

export class EffectPickerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-effect-picker",
        classes: ["azecraft-effect-picker"],
        window: { title: "Add effect", icon: "fa-solid fa-wand-sparkles" },
        position: { width: 460 },
        actions: {
            status: EffectPickerApp.#onStatus,
            preset: EffectPickerApp.#onPreset,
            deletePreset: EffectPickerApp.#onDeletePreset,
            apply: EffectPickerApp.#onApply,
            savePreset: EffectPickerApp.#onSavePreset,
            icon: EffectPickerApp.#onIcon
        }
    };

    static PARTS = { body: { template: TEMPLATE } };

    /**
     * @param {{actors: Actor[], label: string, squad?: boolean}} target
     */
    constructor(target, options = {}) {
        super(options);
        this.target = target;
        this.chosen = new Set(target.actors.map(actor => actor.uuid));
        this.draft = { name: "", img: ICONS[0], dice: {}, scope: "all", skills: [], duration: "permanent" };
    }

    static open(target) {
        foundry.applications.instances.get(this.DEFAULT_OPTIONS.id)?.close();
        return new this(target).render({ force: true });
    }

    get title() {
        return `Add effect: ${this.target.label}`;
    }

    async _prepareContext() {
        const spec = normalizeSpec(this.draft);
        const skills = skillList(this.target.actors[0]);
        return {
            squad: Boolean(this.target.squad),
            members: this.target.actors.map(actor => ({ uuid: actor.uuid, name: actor.name, chosen: this.chosen.has(actor.uuid) })),
            statuses: CONFIG.statusEffects.filter(status => status.id !== "starwarsffg-defeated" && status.id !== "dead")
                .map(status => ({ id: status.id, img: status.img, name: game.i18n.localize(status.name ?? status.label ?? status.id) })),
            presets: readPresets().map(preset => ({ ...preset, name: preset.spec.name || "Effect", text: describeSpec(preset.spec) })),
            isGM: game.user.isGM,
            draft: this.draft,
            icons: ICONS.map(src => ({ src, on: src === this.draft.img })),
            dice: DICE_FIELDS.map(field => ({ ...field, value: this.draft.dice[field.key] ?? 0 })),
            scopes: SCOPES.map(scope => ({ ...scope, on: scope.id === this.draft.scope })),
            durations: DURATIONS.map(duration => ({ ...duration, on: duration.id === this.draft.duration })),
            chooseSkills: this.draft.scope === "skills",
            skills: skills.map(skill => ({ ...skill, on: this.draft.skills.includes(skill.key) })),
            summary: describeSpec(spec, Object.fromEntries(skills.map(s => [s.key, s.label]))),
            canApply: Object.keys(spec.dice).length > 0 && this.chosen.size > 0
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        for (const box of root.querySelectorAll("[data-member]")) {
            box.addEventListener("change", () => {
                if (box.checked) this.chosen.add(box.dataset.member);
                else this.chosen.delete(box.dataset.member);
                this.render();
            });
        }
        root.querySelector("[data-draft=name]")?.addEventListener("input", event => {
            this.draft.name = event.target.value;
        });
        for (const input of root.querySelectorAll("[data-dice]")) {
            input.addEventListener("change", () => {
                this.draft.dice[input.dataset.dice] = Number(input.value) || 0;
                this.render();
            });
        }
        for (const select of root.querySelectorAll("select[data-draft]")) {
            select.addEventListener("change", () => {
                this.draft[select.dataset.draft] = select.value;
                this.render();
            });
        }
        for (const box of root.querySelectorAll("[data-skill]")) {
            box.addEventListener("change", () => {
                const skills = new Set(this.draft.skills);
                if (box.checked) skills.add(box.dataset.skill);
                else skills.delete(box.dataset.skill);
                this.draft.skills = [...skills];
                this.render();
            });
        }
    }

    #targets() {
        return [...this.chosen];
    }

    static async #onStatus(event, target) {
        if (!this.chosen.size) return ui.notifications.warn("Choose who gets it.");
        await runEffectOp({ kind: "status", statusId: target.dataset.status, actorUuids: this.#targets() });
        ui.notifications.info(`${target.dataset.name} added.`);
    }

    static async #onPreset(event, target) {
        const preset = readPresets().find(p => p.id === target.dataset.preset);
        if (!preset || !this.chosen.size) return;
        await runEffectOp({ kind: "custom", spec: preset.spec, img: preset.img, group: this.target.squad ? foundry.utils.randomID() : null, actorUuids: this.#targets() });
        ui.notifications.info(`${preset.spec.name || "Effect"} added.`);
    }

    static async #onDeletePreset(event, target) {
        if (!game.user.isGM) return;
        await game.settings.set(MODULE_ID, PRESETS, readPresets().filter(p => p.id !== target.dataset.preset));
        this.render();
    }

    static #onIcon(event, target) {
        this.draft.img = target.dataset.src;
        this.render();
    }

    static async #onApply() {
        const spec = normalizeSpec({ ...this.draft, name: this.draft.name || "Effect" });
        if (!Object.keys(spec.dice).length) return ui.notifications.warn("Give the effect at least one die.");
        await runEffectOp({ kind: "custom", spec, img: this.draft.img, group: this.target.squad ? foundry.utils.randomID() : null, actorUuids: this.#targets() });
        ui.notifications.info(`${spec.name} added to ${this.chosen.size === 1 ? "1 character" : `${this.chosen.size} characters`}.`);
        this.close();
    }

    static async #onSavePreset() {
        if (!game.user.isGM) return;
        const spec = normalizeSpec({ ...this.draft, name: this.draft.name || "Effect" });
        if (!Object.keys(spec.dice).length) return ui.notifications.warn("Give the effect at least one die.");
        await game.settings.set(MODULE_ID, PRESETS, [...readPresets(), { id: foundry.utils.randomID(), img: this.draft.img, spec }]);
        ui.notifications.info(`Preset "${spec.name}" saved.`);
        this.render();
    }
}

export function initQuickEffects() {
    game.settings.register(MODULE_ID, PRESETS, {
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange: () => foundry.applications.instances.get(EffectPickerApp.DEFAULT_OPTIONS.id)?.render()
    });
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));
    Hooks.once("ready", () => {
        game.socket.on(SOCKET, message => {
            if (message?.type !== "quickEffect" || game.user !== game.users.activeGM) return;
            perform(message.op).catch(error => console.warn("Azecraft | Quick effect failed", error));
        });
    });
}
