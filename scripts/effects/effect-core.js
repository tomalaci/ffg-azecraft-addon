/**
 * Quick effects on characters (pure rules, unit-tested): a custom roll effect described as
 * {dice, scope, duration} becomes Active Effect changes of the kind the system's own statuses use
 * (e.g. `system.skills.<skill>.boost` + 1, read by the dice pool builder), and a readable summary.
 * Durations use the system's: "once" (removed after the next check), "combat" (removed when the
 * combat ends), or none (until removed).
 */

/** Dice fields of a skill the system's dice pool reads, with their labels and Foundry codes. */
export const DICE_FIELDS = [
    { key: "boost", label: "Boost", code: "BO" },
    { key: "setback", label: "Setback", code: "SE" },
    { key: "remsetback", label: "Remove Setback", code: "SE", remove: true },
    { key: "upgrades", label: "Upgrade ability", code: "PR" },
    { key: "success", label: "Success", code: "SU" },
    { key: "advantage", label: "Advantage", code: "AD" },
    { key: "failure", label: "Failure", code: "FA" },
    { key: "threat", label: "Threat", code: "TH" }
];

export const DURATIONS = [
    { id: "permanent", label: "Until removed" },
    { id: "once", label: "Next check" },
    { id: "combat", label: "This combat" }
];

export const SCOPES = [
    { id: "all", label: "All checks" },
    { id: "combat", label: "Combat checks" },
    { id: "powers", label: "Biotics and Tech" },
    { id: "skills", label: "Chosen skills" }
];

const int = value => Math.max(0, Math.min(9, Math.trunc(Number(value) || 0)));

/** A clean effect description: known dice fields with counts 1-9, a known scope and duration. */
export function normalizeSpec(raw = {}) {
    const dice = {};
    for (const field of DICE_FIELDS) {
        const count = int(raw.dice?.[field.key]);
        if (count) dice[field.key] = count;
    }
    const scope = SCOPES.some(s => s.id === raw.scope) ? raw.scope : "all";
    const skills = scope === "skills" ? [...new Set((Array.isArray(raw.skills) ? raw.skills : []).filter(s => typeof s === "string" && s))] : [];
    const duration = DURATIONS.some(d => d.id === raw.duration) ? raw.duration : "permanent";
    const name = String(raw.name ?? "").trim().slice(0, 60);
    return { name, dice, scope, skills, duration };
}

/**
 * The skills an effect applies to.
 * @param {object} spec  normalized
 * @param {{key: string, type: string}[]} skills  all skills, with the system's type ("Combat", "General", …)
 */
export function targetSkills(spec, skills) {
    if (spec.scope === "skills") return skills.filter(s => spec.skills.includes(s.key)).map(s => s.key);
    if (spec.scope === "combat") return skills.filter(s => /combat/i.test(s.type)).map(s => s.key);
    if (spec.scope === "powers") return skills.filter(s => /powers/i.test(s.type)).map(s => s.key);
    return skills.map(s => s.key);
}

/** Active Effect changes (mode 2 = ADD) for an effect. */
export function effectChanges(spec, skills) {
    const changes = [];
    for (const skill of targetSkills(spec, skills)) {
        for (const [key, count] of Object.entries(spec.dice)) {
            changes.push({ key: `system.skills.${skill}.${key}`, mode: 2, value: String(count) });
        }
    }
    return changes;
}

/** "+1 Boost, +1 Setback on combat checks · next check" */
export function describeSpec(spec, skillLabels = {}) {
    const dice = DICE_FIELDS.filter(f => spec.dice[f.key])
        .map(f => (f.remove ? `−${spec.dice[f.key]} Setback` : f.key === "upgrades" ? `${spec.dice[f.key]}× upgrade` : `+${spec.dice[f.key]} ${f.label}`));
    const scope = spec.scope === "skills"
        ? (spec.skills.map(s => skillLabels[s] ?? s).join(", ") || "no skills")
        : SCOPES.find(s => s.id === spec.scope).label.toLowerCase();
    const duration = DURATIONS.find(d => d.id === spec.duration).label.toLowerCase();
    return `${dice.length ? dice.join(", ") : "no dice"} on ${scope} · ${duration}`;
}

/** The system's `system.duration` for an effect ("once" / "combat"), or undefined. */
export function systemDuration(spec) {
    return spec.duration === "permanent" ? undefined : spec.duration;
}

export const EFFECT_FLAG = "quickEffect";

/**
 * Chips for a character card: statuses (the system's, e.g. Disoriented) and quick effects made
 * here; not item effects or the system's XP purchases.
 * @param {{id: string, name: string, img: string, disabled?: boolean, statuses?: Iterable<string>,
 *          flags?: object, system?: object}[]} effects
 * @param {string} moduleId
 */
export function effectChips(effects, moduleId) {
    const chips = [];
    for (const effect of effects ?? []) {
        if (effect.disabled) continue;
        const quick = effect.flags?.[moduleId]?.[EFFECT_FLAG];
        const statuses = [...(effect.statuses ?? [])];
        if (!quick && !statuses.length) continue;
        const spec = quick?.spec ? normalizeSpec(quick.spec) : null;
        const duration = effect.system?.duration;
        chips.push({
            id: effect.id,
            name: effect.name,
            img: effect.img,
            group: quick?.group ?? null,
            condition: quick?.condition ?? null,
            tooltip: spec ? `${effect.name}: ${describeSpec(spec)}` : `${effect.name}${duration === "once" ? " (next check)" : duration === "combat" ? " (this combat)" : ""}`
        });
    }
    return chips;
}

/**
 * Squad-wide effects: quick effects applied to several members at once share a group id. One entry
 * per group, with how many members have it.
 */
export function squadGroups(cardChips) {
    const groups = new Map();
    for (const chips of cardChips) {
        for (const chip of chips) {
            if (!chip.group || chip.condition) continue;
            const entry = groups.get(chip.group) ?? { group: chip.group, name: chip.name, img: chip.img, tooltip: chip.tooltip, count: 0 };
            entry.count++;
            groups.set(chip.group, entry);
        }
    }
    return [...groups.values()];
}

/* -------------------------------------------- */
/*  Squad conditions                            */
/* -------------------------------------------- */

const cleanId = value => (typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : null);

/**
 * A squad condition: an effect that stays on every member of a squad while it is on (a hazardous
 * environment, a squad-wide buff), switched on and off or removed in one place. It is either one of
 * the system's statuses (`statusId`) or a custom effect (`spec`, always until removed).
 */
export function normalizeCondition(raw = {}) {
    const id = cleanId(raw.id);
    const squadId = cleanId(raw.squadId);
    if (!id || !squadId) return null;
    const statusId = typeof raw.statusId === "string" && raw.statusId ? raw.statusId : null;
    const spec = statusId ? null : normalizeSpec({ ...raw.spec, duration: "permanent" });
    if (!statusId && !Object.keys(spec.dice).length) return null;
    return {
        id,
        squadId,
        name: String(raw.name ?? spec?.name ?? "").trim().slice(0, 60) || "Condition",
        img: typeof raw.img === "string" && raw.img ? raw.img : null,
        statusId,
        spec,
        on: raw.on !== false
    };
}

export function normalizeConditions(raw) {
    const seen = new Set();
    return (Array.isArray(raw) ? raw : []).map(normalizeCondition).filter(c => c && !seen.has(c.id) && seen.add(c.id));
}

/**
 * What to change so that every member of a squad has each of its conditions that are on, and
 * nobody keeps one that is off, removed, or from a squad they left.
 * @param {object[]} conditions  normalized
 * @param {Record<string, string[]>} squadMembers  squad id → member actor uuids
 * @param {Record<string, {id: string, condition: string}[]>} actorEffects  actor uuid → its condition effects
 * @returns {{create: {actorUuid: string, conditionId: string}[], remove: {actorUuid: string, effectIds: string[]}[]}}
 */
export function conditionPlan(conditions, squadMembers, actorEffects) {
    const wanted = new Map();
    for (const condition of conditions) {
        if (!condition.on) continue;
        for (const uuid of squadMembers[condition.squadId] ?? []) {
            if (!wanted.has(uuid)) wanted.set(uuid, new Set());
            wanted.get(uuid).add(condition.id);
        }
    }
    const create = [];
    const remove = [];
    for (const uuid of new Set([...wanted.keys(), ...Object.keys(actorEffects)])) {
        const want = wanted.get(uuid) ?? new Set();
        const have = new Set();
        const extra = [];
        for (const effect of actorEffects[uuid] ?? []) {
            if (want.has(effect.condition) && !have.has(effect.condition)) have.add(effect.condition);
            else extra.push(effect.id);
        }
        for (const conditionId of want) if (!have.has(conditionId)) create.push({ actorUuid: uuid, conditionId });
        if (extra.length) remove.push({ actorUuid: uuid, effectIds: extra });
    }
    return { create, remove };
}

/** A condition's hover text. */
export function describeCondition(condition) {
    const what = condition.spec ? describeSpec(condition.spec).replace(/ · [^·]+$/, "") : "status";
    return `${condition.name}: ${what}, on every squad member${condition.on ? "" : " (off)"}`;
}
