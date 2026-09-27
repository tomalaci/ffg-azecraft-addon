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
        modifierText: `${sign}${amount} Difficulty ${amount === 1 ? "die" : "dice"}${perRank ? " per rank" : ""}`
    };
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
                options: [
                    difficultyModifier("blast", "Blast", 1),
                    difficultyModifier("close-combat", "Close Combat", 1),
                    difficultyModifier("deadly", "Deadly", 1),
                    difficultyModifier("impact", "Impact", 1),
                    difficultyModifier("non-lethal", "Non-Lethal", 1),
                    difficultyModifier("anti-synthetic", "Anti-Synthetic", 1),
                    difficultyModifier("anti-organic", "Anti-Organic", 1),
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

/**
 * The powers to show on a character's sheet: the readied list if one was saved, otherwise every
 * power of each discipline the character has ranks in.
 *
 * @param {Record<string, {rank?: number}>} skills  The actor's skills keyed by skill name
 * @param {string[] | null | undefined} readied     Saved power ids, or nothing when never chosen
 */
export function visiblePowers(skills, readied) {
    const powers = allPowers();
    if (Array.isArray(readied)) {
        const chosen = new Set(readied);
        return powers.filter(power => chosen.has(power.id));
    }
    return powers.filter(power => Number(skills?.[power.skill]?.rank ?? 0) > 0);
}

/**
 * The roll dialog's modifier groups for a discipline: its general modifiers and either every power
 * or, when rolling one power, only that power (open).
 */
export function modifierGroups(discipline, powerId = null) {
    const categories = POWER_MODIFIER_CATALOG[discipline]?.categories ?? [];
    return categories
        .filter(category => category.general || !powerId || category.id === powerId)
        .map(category => ({ ...category, open: Boolean(powerId) && category.id === powerId }));
}
