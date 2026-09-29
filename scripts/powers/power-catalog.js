/**
 * Mass Effect Biotics and Tech powers (docs/BIOTIC-TECH-POWERS.md): each power's base difficulty and
 * optional effects, plus the general modifiers of each discipline. Pure data and helpers, shared by
 * the roll dialog integration and the character sheet's Powers block.
 */

export const DIFFICULTY_NAMES = ["Simple", "Easy", "Average", "Hard", "Daunting", "Formidable"];

function difficultyModifier(id, label, difficulty, { perRank = false } = {}) {
    const sign = difficulty > 0 ? "+" : "−";
    const amount = Math.abs(difficulty);

    return {
        id,
        label,
        difficulty,
        perRank,
        modifierText: `${sign}${amount} Difficulty ${amount === 1 ? "die" : "dice"}${perRank ? " per rank" : ""}`
    };
}

/** Limit an option to some subtypes of its power (e.g. Anti-Synthetic: Overload only). */
function onlyFor(option, ...subtypes) {
    return { ...option, onlyFor: subtypes };
}

function subtype(id, label, effect = "", extra = {}) {
    return { id, label, effect, ...extra };
}

function setbackModifier(id, label) {
    return {
        id,
        label,
        setback: 1,
        modifierText: "+1 Setback die"
    };
}

function upgradeModifier(id, label) {
    return {
        id,
        label,
        upgradeDifficulty: 1,
        modifierText: "Upgrade difficulty once"
    };
}

export const POWER_MODIFIER_CATALOG = {
    biotics: {
        skill: "Biotics",
        categories: [
            {
                id: "biotic-general",
                general: true,
                label: "General Biotics",
                options: [
                    setbackModifier("no-free-hand", "No free hand"),
                    setbackModifier("heavy-armor-or-shield", "Armor grants +2 soak or more, or carrying a shield"),
                    upgradeModifier("disrupted-concentration", "Concentration is disrupted")
                ]
            },
            {
                id: "biotic-attack",
                base: 1,
                concentration: false,
                label: "Biotic Attack",
                options: [
                    difficultyModifier("blast", "Blast", 1),
                    difficultyModifier("close-combat", "Close Combat", 1),
                    difficultyModifier("reave", "Reave", 1),
                    difficultyModifier("annihilation", "Annihilation", 1),
                    difficultyModifier("lift", "Lift", 1),
                    difficultyModifier("shockwave", "Shockwave", 1),
                    difficultyModifier("non-lethal", "Non-Lethal", 1),
                    difficultyModifier("pull", "Pull", 1),
                    difficultyModifier("charge", "Charge", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("priming", "Priming", -1),
                    difficultyModifier("warp", "Warp", 2),
                    difficultyModifier("detonating", "Detonating", 2)
                ]
            },
            {
                id: "biotic-augment",
                base: 2,
                concentration: true,
                label: "Biotic Augment",
                options: [
                    difficultyModifier("speed", "Speed", 1),
                    difficultyModifier("biotic-warrior", "Biotic Warrior", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("levitate", "Levitate", 1),
                    difficultyModifier("warp-ammunition", "Warp Ammunition", 1),
                    difficultyModifier("additional-target", "Additional Target", 2)
                ]
            },
            {
                id: "biotic-barrier",
                base: 1,
                concentration: true,
                label: "Biotic Barrier",
                options: [
                    difficultyModifier("additional-target", "Additional Target", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("add-defense", "Add Defense", 2),
                    difficultyModifier("empowered", "Empowered", 2),
                    difficultyModifier("backlash", "Backlash", 2)
                ]
            },
            {
                id: "biotic-domination",
                baseNote: "or opposed Biotics vs. Discipline",
                base: 2,
                concentration: true,
                label: "Biotic Domination",
                options: [
                    difficultyModifier("enervate", "Enervate", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("additional-target", "Additional Target", 2),
                    difficultyModifier("confusion", "Confusion", 2),
                    difficultyModifier("stasis", "Stasis", 3),
                    difficultyModifier("mind-control", "Mind Control", 3)
                ]
            },
            {
                id: "biotic-telekinesis",
                base: 1,
                concentration: false,
                label: "Biotic Telekinesis",
                options: [
                    difficultyModifier("silhouette", "Silhouette", 1, { perRank: true }),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("fine-control", "Fine Control", 1),
                    difficultyModifier("throw", "Throw", 2)
                ]
            }
        ]
    },
    tech: {
        skill: "Tech",
        categories: [
            {
                id: "tech-general",
                general: true,
                label: "General Tech",
                options: [
                    setbackModifier("no-free-hand", "No free hand"),
                    setbackModifier("biotic-barrier", "Target is protected by Biotic Barrier"),
                    upgradeModifier("electronic-interference", "Electronic interference")
                ]
            },
            {
                id: "tech-attack",
                base: 2,
                concentration: false,
                label: "Tech Attack",
                // Each subtype is readied separately: the sheet keeps one loaded.
                loadout: true,
                subtypeLabel: "Element",
                subtypes: [
                    subtype("incinerate", "Incinerate", "Burn equal to Knowledge (PhysSci); Sunder against the target's armor.", { icon: "fa-fire" }),
                    subtype("cryo-blast", "Cryo Blast", "Ensnare equal to Knowledge (PhysSci); spend Triumph to stagger the target for one round.", { icon: "fa-snowflake" }),
                    subtype("overload", "Overload", "Phasic equal to half Knowledge (PhysSci), rounded up; Sunder against electronic equipment.", { icon: "fa-bolt" }),
                    subtype("neural-shock", "Neural Shock", "Disorient equal to Knowledge (LifeSci); spend Triumph to stagger for one round; organic targets only.", { icon: "fa-brain" })
                ],
                options: [
                    difficultyModifier("blast", "Blast", 1),
                    difficultyModifier("close-combat", "Close Combat", 1),
                    difficultyModifier("deadly", "Deadly", 1),
                    difficultyModifier("impact", "Impact", 1),
                    difficultyModifier("non-lethal", "Non-Lethal", 1),
                    onlyFor(difficultyModifier("anti-synthetic", "Anti-Synthetic", 1), "overload"),
                    onlyFor(difficultyModifier("anti-organic", "Anti-Organic", 1), "incinerate", "cryo-blast", "neural-shock"),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("priming", "Priming", -1),
                    difficultyModifier("multi-target", "Multi-Target", 2),
                    difficultyModifier("detonating", "Detonating", 2)
                ]
            },
            {
                id: "tech-construct",
                base: 2,
                concentration: true,
                label: "Tech Construct",
                subtypeLabel: "Construct",
                subtypes: [
                    subtype("barricade", "Barricade"),
                    subtype("combat-drone", "Combat Drone"),
                    subtype("decoy", "Decoy"),
                    subtype("supply-pylon", "Supply Pylon")
                ],
                options: [
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("detonate", "Detonate", 1)
                ]
            },
            {
                id: "tech-sabotage",
                baseNote: "VI Hacking: Daunting (4 Difficulty dice)",
                base: 2,
                concentration: true,
                label: "Tech Sabotage",
                subtypeLabel: "Sabotage",
                subtypes: [
                    subtype("invasion", "Invasion"),
                    subtype("overheat", "Overheat"),
                    subtype("energy-drain", "Energy Drain"),
                    subtype("tactical-scan", "Tactical Scan"),
                    subtype("vi-hacking", "VI Hacking", "Daunting, or opposed Tech vs. Computers at the GM's discretion.", { base: 4 })
                ],
                options: [
                    difficultyModifier("damping", "Damping", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("additional-target", "Additional Target", 2),
                    difficultyModifier("malfunction", "Malfunction", 2)
                ]
            },
            {
                id: "tech-augment",
                base: 2,
                concentration: true,
                label: "Tech Augment",
                // Each subtype is readied separately: the sheet keeps one loaded.
                loadout: true,
                subtypeLabel: "Mode",
                subtypes: [
                    subtype("tech-armor", "Tech Armor", "", { icon: "fa-shield-halved" }),
                    subtype("charged-melee", "Charged Melee", "", { icon: "fa-hand-fist" }),
                    subtype("turbocharge", "Turbocharge", "", { icon: "fa-gauge-high" }),
                    subtype("tactical-cloak", "Tactical Cloak", "", { icon: "fa-user-secret" })
                ],
                options: [
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("recon-visor", "Recon Visor", 1),
                    difficultyModifier("overcharge-shields", "Overcharge Shields", 2),
                    difficultyModifier("additional-target", "Additional Target", 2)
                ]
            }
        ]
    }
};

/** Every power (not the general modifiers), with its discipline key and skill. */
export function allPowers() {
    return Object.entries(POWER_MODIFIER_CATALOG).flatMap(([discipline, entry]) => entry.categories
        .filter(category => !category.general)
        .map(category => ({ ...category, discipline, skill: entry.skill })));
}

export function findPower(id) {
    return allPowers().find(power => power.id === id) ?? null;
}

/** The discipline ("biotics" / "tech") a skill name belongs to, or null. */
export function disciplineForSkill(skillName) {
    const name = String(skillName ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (name.includes("biotic")) return "biotics";
    if (name.includes("tech")) return "tech";
    return null;
}

export function difficultyLabel(dice) {
    const count = Math.max(0, Math.round(Number(dice) || 0));
    const name = DIFFICULTY_NAMES[Math.min(count, DIFFICULTY_NAMES.length - 1)];
    return `${name} (${count} Difficulty ${count === 1 ? "die" : "dice"})`;
}

/** The powers of one discipline ("biotics" / "tech"). */
export function powersFor(discipline) {
    return allPowers().filter(power => power.discipline === discipline);
}

export function findSubtype(power, subtypeId) {
    return power?.subtypes?.find(entry => entry.id === subtypeId) ?? null;
}

/** Base difficulty of a power, or of its subtype when that has its own (VI Hacking). */
export function baseDifficulty(power, subtypeId = null) {
    return findSubtype(power, subtypeId)?.base ?? power?.base ?? 2;
}

/** Whether a power option applies with the given subtype (options without a limit always do). */
export function optionApplies(option, subtypeId) {
    return !option.onlyFor || !subtypeId || option.onlyFor.includes(subtypeId);
}

/** Look up a modifier by its dialog key "<category id>:<option id>". */
export function findModifier(key) {
    const [categoryId, optionId] = String(key ?? "").split(":");
    for (const entry of Object.values(POWER_MODIFIER_CATALOG)) {
        const category = entry.categories.find(c => c.id === categoryId);
        const option = category?.options.find(o => o.id === optionId);
        if (option) return { category, option, key: `${categoryId}:${optionId}` };
    }
    return null;
}

/** Modifier keys a power may use: its own options and its discipline's general ones. */
export function allowedModifierKeys(power, subtypeId = null) {
    if (!power) return new Set();
    const general = POWER_MODIFIER_CATALOG[power.discipline].categories.filter(c => c.general);
    return new Set([...general, power].flatMap(category => category.options
        .filter(option => optionApplies(option, subtypeId))
        .map(option => `${category.id}:${option.id}`)));
}

/** The tech loadout: {power id: subtype id} for powers with a loadout, defaulting to the first subtype. */
export function normalizeLoadout(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return Object.fromEntries(allPowers().filter(power => power.loadout).map(power => [
        power.id,
        findSubtype(power, source[power.id])?.id ?? power.subtypes[0].id
    ]));
}

/** Concentration powers the character is keeping up: known concentration power ids, no duplicates. */
export function normalizeConcentration(raw) {
    const ids = new Set(Array.isArray(raw) ? raw : []);
    return allPowers().filter(power => power.concentration && ids.has(power.id)).map(power => power.id);
}

/** Add or remove a power from the concentration list. */
export function toggleConcentration(raw, powerId) {
    const current = normalizeConcentration(raw);
    return current.includes(powerId)
        ? current.filter(id => id !== powerId)
        : normalizeConcentration([...current, powerId]);
}

export const PRESET_NAME_MAX_LENGTH = 60;
/** Most ranks of a per-rank modifier (e.g. Range) a roll or preset can take. */
export const MAX_RANKS = 5;

/** How many times each modifier key appears: presets list a per-rank modifier once per rank. */
export function modifierCounts(keys) {
    const counts = new Map();
    for (const key of keys ?? []) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
}

/**
 * Clean a stored preset: a known power, a subtype of that power (or none), and only modifiers the
 * power allows. Returns null for presets that cannot be used.
 */
export function normalizePreset(raw) {
    const power = findPower(raw?.power);
    if (!power || typeof raw?.id !== "string" || !raw.id) return null;
    const subtype = findSubtype(power, raw.subtype)?.id ?? null;
    const allowed = allowedModifierKeys(power, subtype);
    // Per-rank modifiers keep their repeats (up to MAX_RANKS); others count once.
    const modifiers = [];
    for (const [key, count] of modifierCounts(Array.isArray(raw.modifiers) ? raw.modifiers : [])) {
        if (!allowed.has(key)) continue;
        const ranks = findModifier(key)?.option.perRank ? Math.min(count, MAX_RANKS) : 1;
        for (let i = 0; i < ranks; i++) modifiers.push(key);
    }
    const name = String(raw.name ?? "").trim().slice(0, PRESET_NAME_MAX_LENGTH) || power.label;
    return { id: raw.id, name, power: power.id, subtype, modifiers };
}

export function normalizePresets(raw) {
    return (Array.isArray(raw) ? raw : []).map(normalizePreset).filter(Boolean);
}

/**
 * The dice a power roll starts with once modifiers are applied (before the character's own
 * pool): Difficulty dice, Setback dice and difficulty upgrades.
 */
export function presetDifficulty(powerId, subtypeId = null, modifierKeys = []) {
    const power = findPower(powerId);
    let difficulty = baseDifficulty(power, subtypeId);
    let setback = 0;
    let upgrades = 0;
    for (const key of modifierKeys) {
        const option = findModifier(key)?.option;
        if (!option) continue;
        difficulty += option.difficulty ?? 0;
        setback += option.setback ?? 0;
        upgrades += option.upgradeDifficulty ?? 0;
    }
    return { difficulty: Math.max(0, difficulty), setback, upgrades };
}

/**
 * The roll dialog's modifier groups for a discipline: its general modifiers and either every power
 * or, when rolling one power, only that power (open, without options its subtype excludes).
 */
export function modifierGroups(discipline, powerId = null, subtypeId = null) {
    const categories = POWER_MODIFIER_CATALOG[discipline]?.categories ?? [];
    return categories
        .filter(category => category.general || !powerId || category.id === powerId)
        .map(category => ({
            ...category,
            options: category.id === powerId ? category.options.filter(option => optionApplies(option, subtypeId)) : category.options,
            open: Boolean(powerId) && category.id === powerId
        }));
}
