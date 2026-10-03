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
            if (!chip.group) continue;
            const entry = groups.get(chip.group) ?? { group: chip.group, name: chip.name, img: chip.img, tooltip: chip.tooltip, count: 0 };
            entry.count++;
            groups.set(chip.group, entry);
        }
    }
    return [...groups.values()];
}
