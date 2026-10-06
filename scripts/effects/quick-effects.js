/**
 * Quick effects from the mission dashboard: statuses (the system's, e.g. Disoriented or Boost Next
 * Check) and custom roll effects (dice on all / combat / power / chosen checks, for the next check,
 * this combat or until removed) on one character or the whole squad, without finding tokens.
 *
 * Effects are ordinary Active Effects, built like the system's statuses (see effect-core.js), so the
 * system's dice pools and its "next check" / "this combat" clean-up handle them. Anyone may add or
 * remove them on any squad member: changes to actors the user does not own go to the active GM over
 * the module socket. GMs can save custom effects as presets (world setting) for everyone.
 *
 * Squad conditions (world setting `squadConditions`) are effects that stay on every member of a squad
 * while they are on: the active GM's client keeps the members' effects in line with the list (when it
 * changes, when squads change, and when someone removes one), so switching one off or removing it
 * clears it from everybody, and new members get it.
 */

import { DICE_FIELDS, DURATIONS, EFFECT_FLAG, SCOPES, conditionPlan, describeSpec, effectChanges, imagePath, isRemovableEffect, normalizeConditions, nextCheckUsedBy, normalizeSpec, relayedConditionOp, rolledSkillKey, relayedEffectOp, systemDuration } from "./effect-core.js";
import { readSquads } from "../mission-dashboard/squads.js";

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const PRESETS = "effectPresets";
const CONDITIONS = "squadConditions";
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

const statusIds = () => new Set(CONFIG.statusEffects.map(status => status.id));

/** Actor uuids of every squad's members (what the dashboard can change through the GM). */
function squadMemberUuids() {
    return new Set(readSquads().flatMap(squad => squad.party.map(slot => slot.actorUuid)).filter(Boolean));
}

/**
 * A status as a quick effect: made from the system's status (its duration included), marked with the
 * squad group when added to several members, and never a duplicate of one the actor already has.
 * (Not toggleStatusEffect: that sees a squad condition with the same status as "already on", and adds
 * no group.)
 */
async function addStatus(actor, statusId, group) {
    const present = actor.effects.some(effect => effect.statuses.has(statusId) && !effect.getFlag(MODULE_ID, EFFECT_FLAG)?.condition);
    if (present) return;
    const data = (await ActiveEffect.implementation.fromStatusEffect(statusId)).toObject();
    delete data._id;
    foundry.utils.mergeObject(data, { flags: { [MODULE_ID]: { [EFFECT_FLAG]: { status: statusId, group: group ?? null } } } });
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

async function perform(op) {
    const actors = (op.actorUuids ?? []).map(uuid => fromUuidSync(uuid)).filter(actor => actor?.documentName === "Actor");
    for (const actor of actors) {
        if (op.kind === "status") {
            await addStatus(actor, op.statusId, op.group);
        } else if (op.kind === "custom") {
            const spec = normalizeSpec(op.spec);
            const changes = effectChanges(spec, skillList(actor));
            // None of its checks among this character's skills: nothing to add (and nothing would use it up).
            if (!changes.length) continue;
            const data = {
                name: spec.name || "Effect",
                img: imagePath(op.img) ?? ICONS[0],
                changes,
                flags: { [MODULE_ID]: { [EFFECT_FLAG]: { spec, group: op.group ?? null } } }
            };
            const duration = systemDuration(spec);
            if (duration) data.system = { duration };
            await actor.createEmbeddedDocuments("ActiveEffect", [data]);
        } else if (op.kind === "remove") {
            // Only what the cards offer to remove: statuses and quick effects, not conditions or purchases.
            const effect = actor.effects.get(op.effectId);
            if (effect && isRemovableEffect(effect, MODULE_ID)) await actor.deleteEmbeddedDocuments("ActiveEffect", [op.effectId]);
        } else if (op.kind === "removeGroup") {
            const ids = actor.effects.filter(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG)?.group === op.group).map(effect => effect.id);
            if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
        }
    }
}

/**
 * Run an operation: directly on actors this user owns, through the active GM for the others
 * (including squad members this user cannot see at all, which are not on this client).
 */
export async function runEffectOp(op) {
    const owned = uuid => fromUuidSync(uuid, { strict: false })?.isOwner === true;
    const mine = op.actorUuids.filter(owned);
    const others = op.actorUuids.filter(uuid => !owned(uuid));
    // The active GM's own changes queue behind the ones relayed to it.
    if (mine.length) {
        const task = () => perform({ ...op, actorUuids: mine });
        await (isActiveGM() ? queueGM(task, "Quick effect") : task());
    }
    if (!others.length) return;
    if (!game.users.activeGM) {
        ui.notifications.warn("Changing effects on someone else's character needs a GM online.");
        return;
    }
    game.socket.emit(SOCKET, { type: "quickEffect", op: { ...op, actorUuids: others } });
}

/** A check was rolled (roll builder): use up the next-check quick effects on that skill. */
function useUpNextCheck({ actor, skillName }) {
    if (actor?.documentName !== "Actor") return;
    const skills = Object.entries(actor.system?.skills ?? {}).map(([key, skill]) => ({
        key, rawLabel: skill.label, label: game.i18n.localize(skill.label ?? key)
    }));
    const skillKey = rolledSkillKey([skillName, game.i18n.localize(skillName ?? "")], skills);
    for (const effect of actor.effects.filter(effect => nextCheckUsedBy(effect, skillKey, MODULE_ID))) {
        runEffectOp({ kind: "remove", actorUuids: [actor.uuid], effectId: effect.id })
            .catch(error => console.warn("Azecraft | Could not use up a next-check effect", error));
    }
}

/** The active GM's changes to effects and conditions run one at a time (no lost updates). */
let gmQueue = Promise.resolve();

function queueGM(task, label) {
    gmQueue = gmQueue.then(task).catch(error => console.warn(`Azecraft | ${label} failed`, error));
    return gmQueue;
}

/* -------------------------------------------- */
/*  Squad conditions                            */
/* -------------------------------------------- */

export function readConditions() {
    return normalizeConditions(game.settings.get(MODULE_ID, CONDITIONS));
}

function isActiveGM() {
    return game.user.isGM && game.user === game.users.activeGM;
}

/** Change the list (active GM). `op`: {action: "add", condition} | {action: "toggle" | "remove", id}. */
async function changeConditions(op) {
    let list = readConditions();
    if (op.action === "add") list = [...list, { ...op.condition, id: foundry.utils.randomID(), on: true }];
    else if (op.action === "toggle") list = list.map(c => (c.id === op.id ? { ...c, on: !c.on } : c));
    else if (op.action === "remove") list = list.filter(c => c.id !== op.id);
    else return;
    await game.settings.set(MODULE_ID, CONDITIONS, normalizeConditions(list));
}

/** Add, switch on/off or remove a squad condition (anyone; players go through the active GM). */
export async function runConditionOp(op) {
    if (isActiveGM()) return queueGM(() => changeConditions(op), "Squad condition");
    if (!game.users.activeGM) {
        ui.notifications.warn("Changing squad conditions needs a GM online.");
        return;
    }
    game.socket.emit(SOCKET, { type: "squadCondition", op });
}

async function conditionEffectData(condition, actor) {
    const flags = { [MODULE_ID]: { [EFFECT_FLAG]: { condition: condition.id, ...(condition.spec ? { spec: condition.spec } : {}) } } };
    if (condition.statusId) {
        // A status removed from the system's list since the condition was made: skip it.
        if (!statusIds().has(condition.statusId)) return null;
        const effect = await ActiveEffect.implementation.fromStatusEffect(condition.statusId);
        const data = effect.toObject();
        // A condition lasts until it is switched off, not for the next check or this combat.
        if (data.system) delete data.system.duration;
        delete data._id;
        return foundry.utils.mergeObject(data, { flags });
    }
    return { name: condition.name, img: condition.img || ICONS[0], changes: effectChanges(condition.spec, skillList(actor)), flags };
}

let syncing = null;
let syncAgain = false;

/** Make the squads' members' effects match the conditions (active GM; coalesces bursts). */
export function syncConditions() {
    if (!isActiveGM()) return;
    if (syncing) {
        syncAgain = true;
        return;
    }
    syncing = (async () => {
        do {
            syncAgain = false;
            await syncOnce().catch(error => console.warn("Azecraft | Squad conditions", error));
        } while (syncAgain);
        syncing = null;
    })();
}

async function syncOnce() {
    const conditions = readConditions();
    const squadMembers = Object.fromEntries(readSquads().map(squad => [squad.id, squad.party.map(slot => slot.actorUuid).filter(Boolean)]));
    const actorEffects = {};
    for (const actor of game.actors) {
        const effects = actor.effects.filter(effect => effect.getFlag(MODULE_ID, EFFECT_FLAG)?.condition)
            .map(effect => ({ id: effect.id, condition: effect.getFlag(MODULE_ID, EFFECT_FLAG).condition }));
        if (effects.length) actorEffects[actor.uuid] = effects;
    }
    const plan = conditionPlan(conditions, squadMembers, actorEffects);
    // One actor failing (deleted meanwhile, a bad status) must not stop the others.
    for (const { actorUuid, effectIds } of plan.remove) {
        try {
            const actor = fromUuidSync(actorUuid, { strict: false });
            const ids = effectIds.filter(id => actor?.effects.has(id));
            if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
        } catch (error) {
            console.warn(`Azecraft | Squad conditions: could not update ${actorUuid}`, error);
        }
    }
    const byActor = Map.groupBy(plan.create, entry => entry.actorUuid);
    for (const [actorUuid, entries] of byActor) {
        try {
            const actor = fromUuidSync(actorUuid, { strict: false });
            if (actor?.documentName !== "Actor") continue;
            // One by one: a condition Foundry refuses must not keep the member's other conditions away.
            for (const { conditionId } of entries) {
                try {
                    const data = await conditionEffectData(conditions.find(c => c.id === conditionId), actor);
                    if (data) await actor.createEmbeddedDocuments("ActiveEffect", [data]);
                } catch (error) {
                    console.warn(`Azecraft | Squad conditions: could not add ${conditionId} to ${actorUuid}`, error);
                }
            }
        } catch (error) {
            console.warn(`Azecraft | Squad conditions: could not update ${actorUuid}`, error);
        }
    }
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
     * @param {{actors: Actor[], hidden?: string[], label: string, squad?: boolean, condition?: string}} target
     *   `squad`: add to several members at once; `hidden`: uuids of squad members this user cannot
     *   see (the GM adds the effect for them); `condition`: make a squad condition for that squad id.
     */
    constructor(target, options = {}) {
        super(options);
        this.target = target;
        this.chosen = new Set([...target.actors.map(actor => actor.uuid), ...(target.hidden ?? [])]);
        this.draft = { name: "", img: ICONS[0], dice: {}, scope: "all", skills: [], duration: "permanent" };
    }

    static open(target) {
        foundry.applications.instances.get(this.DEFAULT_OPTIONS.id)?.close();
        return new this(target).render({ force: true });
    }

    get title() {
        return this.target.condition ? `Squad condition: ${this.target.label}` : `Add effect: ${this.target.label}`;
    }

    get #isCondition() {
        return Boolean(this.target.condition);
    }

    async _prepareContext() {
        const condition = this.#isCondition;
        const spec = normalizeSpec(condition ? { ...this.draft, duration: "permanent" } : this.draft);
        const skills = skillList(this.target.actors[0]);
        return {
            condition,
            squad: Boolean(this.target.squad),
            members: [
                ...this.target.actors.map(actor => ({ uuid: actor.uuid, name: actor.name, chosen: this.chosen.has(actor.uuid) })),
                ...(this.target.hidden ?? []).map(uuid => ({ uuid, name: "Hidden member", chosen: this.chosen.has(uuid) }))
            ],
            // A condition lasts until switched off, so not the system's next-check / this-combat statuses.
            statuses: CONFIG.statusEffects.filter(status => status.id !== "starwarsffg-defeated" && status.id !== "dead")
                .filter(status => !condition || !status.system?.duration)
                .map(status => ({ id: status.id, img: status.img, name: game.i18n.localize(status.name ?? status.label ?? status.id) })),
            presets: readPresets().map(preset => {
                const presetSpec = condition ? { ...preset.spec, duration: "permanent" } : preset.spec;
                return { ...preset, name: preset.spec.name || "Effect", text: describeSpec(presetSpec) };
            }),
            customOpen: this.customOpen ?? false,
            isGM: game.user.isGM,
            draft: this.draft,
            icons: ICONS.map(src => ({ src, on: src === this.draft.img })),
            dice: DICE_FIELDS.map(field => ({ ...field, value: this.draft.dice[field.key] ?? 0 })),
            scopes: SCOPES.map(scope => ({ ...scope, on: scope.id === this.draft.scope })),
            durations: DURATIONS.map(duration => ({ ...duration, on: duration.id === this.draft.duration })),
            chooseSkills: this.draft.scope === "skills",
            skills: skills.map(skill => ({ ...skill, on: this.draft.skills.includes(skill.key) })),
            summary: describeSpec(spec, Object.fromEntries(skills.map(s => [s.key, s.label]))),
            canApply: Object.keys(spec.dice).length > 0 && (condition || this.chosen.size > 0)
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
        root.querySelector("details.azfx-custom")?.addEventListener("toggle", event => {
            this.customOpen = event.target.open;
        });
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

    /** Make a squad condition from a status, preset or the custom effect, then close. */
    async #addCondition(data) {
        await runConditionOp({ action: "add", condition: { squadId: this.target.condition, ...data } });
        this.close();
    }

    static async #onStatus(event, target) {
        if (this.#isCondition) return this.#addCondition({ statusId: target.dataset.status, name: target.dataset.name, img: target.querySelector("img")?.getAttribute("src") });
        if (!this.chosen.size) return ui.notifications.warn("Choose who gets it.");
        await runEffectOp({ kind: "status", statusId: target.dataset.status, group: this.target.squad ? foundry.utils.randomID() : null, actorUuids: this.#targets() });
    }

    static async #onPreset(event, target) {
        const preset = readPresets().find(p => p.id === target.dataset.preset);
        if (!preset) return;
        if (this.#isCondition) return this.#addCondition({ name: preset.spec.name || "Condition", img: preset.img, spec: preset.spec });
        if (!this.chosen.size) return;
        await runEffectOp({ kind: "custom", spec: preset.spec, img: preset.img, group: this.target.squad ? foundry.utils.randomID() : null, actorUuids: this.#targets() });
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
        if (this.#isCondition) return this.#addCondition({ name: spec.name, img: this.draft.img, spec });
        await runEffectOp({ kind: "custom", spec, img: this.draft.img, group: this.target.squad ? foundry.utils.randomID() : null, actorUuids: this.#targets() });
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
    game.settings.register(MODULE_ID, CONDITIONS, {
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange: () => {
            syncConditions();
            Hooks.callAll("azecraftSquadConditions");
        }
    });
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));
    Hooks.once("ready", () => {
        // Foundry passes the real sender's id; requests are limited to what the dashboard can do.
        game.socket.on(SOCKET, (message, senderId) => {
            if (!isActiveGM() || !game.users.get(senderId)) return;
            if (message?.type === "quickEffect") {
                const op = relayedEffectOp(message.op, { members: squadMemberUuids(), statusIds: statusIds() });
                if (op) queueGM(() => perform(op), "Quick effect");
            }
            if (message?.type === "squadCondition") {
                const op = relayedConditionOp(message.op, { squadIds: new Set(readSquads().map(squad => squad.id)), statusIds: statusIds() });
                if (op) queueGM(() => changeConditions(op), "Squad condition");
            }
        });
        syncConditions();
    });
    // Squad members changed, someone removed a condition's effect, or another GM took over.
    const onSetting = setting => {
        if (setting.key === `${MODULE_ID}.squads`) syncConditions();
    };
    Hooks.on("createSetting", onSetting);
    Hooks.on("updateSetting", onSetting);
    Hooks.on("deleteActiveEffect", effect => {
        if (effect.getFlag(MODULE_ID, EFFECT_FLAG)?.condition) syncConditions();
    });
    Hooks.on("userConnected", () => syncConditions());
    Hooks.on("azecraftCheckRolled", useUpNextCheck);
}
