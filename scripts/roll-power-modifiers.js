const MODULE_ID = "ffg-azecraft-addon";
const ROLL_OPTIONS_TEMPLATE = `modules/${MODULE_ID}/templates/dice/roll-options-ffg.html`;

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

const POWER_MODIFIER_CATALOG = {
    biotics: {
        categories: [
            {
                id: "biotic-general",
                label: "General Biotics",
                options: [
                    setbackModifier("no-free-hand", "No free hand"),
                    setbackModifier("heavy-armor-or-shield", "Armor grants +2 soak or more, or carrying a shield"),
                    upgradeModifier("disrupted-concentration", "Concentration is disrupted")
                ]
            },
            {
                id: "biotic-attack",
                label: "Biotic Attack",
                baseDifficulty: "Base: Easy (1 Difficulty die)",
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
                label: "Biotic Augment",
                baseDifficulty: "Base: Average (2 Difficulty dice)",
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
                label: "Biotic Barrier",
                baseDifficulty: "Base: Easy (1 Difficulty die)",
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
                label: "Biotic Domination",
                baseDifficulty: "Base: Average (2 Difficulty dice), or opposed Biotics vs. Discipline",
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
                label: "Biotic Telekinesis",
                baseDifficulty: "Base: Easy (1 Difficulty die)",
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
        categories: [
            {
                id: "tech-general",
                label: "General Tech",
                options: [
                    setbackModifier("no-free-hand", "No free hand"),
                    setbackModifier("biotic-barrier", "Target is protected by Biotic Barrier"),
                    upgradeModifier("electronic-interference", "Electronic interference")
                ]
            },
            {
                id: "tech-attack",
                label: "Tech Attack",
                baseDifficulty: "Base: Average (2 Difficulty dice)",
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
                label: "Tech Construct",
                baseDifficulty: "Base: Average (2 Difficulty dice)",
                options: [
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("detonate", "Detonate", 1)
                ]
            },
            {
                id: "tech-sabotage",
                label: "Tech Sabotage",
                baseDifficulty: "Base: Average (2 Difficulty dice); VI Hacking: Daunting (4 Difficulty dice)",
                options: [
                    difficultyModifier("damping", "Damping", 1),
                    difficultyModifier("range", "Range", 1, { perRank: true }),
                    difficultyModifier("additional-target", "Additional Target", 2),
                    difficultyModifier("malfunction", "Malfunction", 2)
                ]
            },
            {
                id: "tech-augment",
                label: "Tech Augment",
                baseDifficulty: "Base: Average (2 Difficulty dice)",
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

function normalizeSkillName(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

function getPowerKeyForRoll(rollBuilder) {
    const skillName = normalizeSkillName(rollBuilder?.roll?.skillName);

    if (skillName.includes("biotic")) {
        return "biotics";
    }

    if (skillName.includes("tech")) {
        return "tech";
    }

    return null;
}

function getModifierGroups(rollBuilder) {
    const powerKey = getPowerKeyForRoll(rollBuilder);
    const power = POWER_MODIFIER_CATALOG[powerKey];

    if (!power?.categories?.length) {
        return [];
    }

    return power.categories
        .filter(category => category.options?.length)
        .map(category => ({
            id: category.id,
            label: category.label,
            baseDifficulty: category.baseDifficulty,
            summaryLabel: category.label,
            options: category.options.map(option => ({
                ...option,
                key: `${category.id}:${option.id}`,
                checked: rollBuilder._azecraftPowerModifiers?.has(`${category.id}:${option.id}`) ?? false
            }))
        }));
}

function getSelectedModifierSummary(rollBuilder) {
    const selected = Array.from(rollBuilder._azecraftPowerModifiers?.values() ?? []);

    if (!selected.length) {
        return "";
    }

    const grouped = new Map();

    for (const option of selected) {
        if (!grouped.has(option.categorySummary)) {
            grouped.set(option.categorySummary, []);
        }

        grouped.get(option.categorySummary).push(`${option.label} (${option.modifierText})`);
    }

    return `Power modifiers: ${Array.from(grouped.entries()).map(([category, options]) => `${category} - ${options.join(", ")}`).join("; ")}`;
}

function appendModifierFlavor(rollBuilder, html) {
    const summary = getSelectedModifierSummary(rollBuilder);

    if (!summary) {
        return;
    }

    const inputFlavor = html?.find(".flavor-text")?.[0]?.value;
    const currentFlavor = String(rollBuilder.roll.flavor || inputFlavor || "").trim();

    if (currentFlavor.includes(summary)) {
        return;
    }

    rollBuilder.roll.flavor = currentFlavor ? `${currentFlavor} | ${summary}` : summary;
}

function applyModifier(dicePool, modifier) {
    const before = {
        difficulty: Number(dicePool.difficulty ?? 0),
        challenge: Number(dicePool.challenge ?? 0),
        setback: Number(dicePool.setback ?? 0)
    };
    const difficulty = Number(modifier.difficulty ?? 0);
    const setback = Number(modifier.setback ?? 0);
    const upgradeDifficulty = Number(modifier.upgradeDifficulty ?? 0);

    dicePool.difficulty = Math.max(0, before.difficulty + difficulty);
    dicePool.setback = Math.max(0, before.setback + setback);

    if (upgradeDifficulty > 0) {
        dicePool.upgradeDifficulty(upgradeDifficulty);
    }

    return {
        difficulty: Number(dicePool.difficulty ?? 0) - before.difficulty,
        challenge: Number(dicePool.challenge ?? 0) - before.challenge,
        setback: Number(dicePool.setback ?? 0) - before.setback
    };
}

function removeModifier(dicePool, appliedChanges) {
    for (const die of ["difficulty", "challenge", "setback"]) {
        dicePool[die] = Math.max(0, Number(dicePool[die] ?? 0) - Number(appliedChanges[die] ?? 0));
    }
}

function getPropertyDescriptor(object, property) {
    let current = object;

    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);

        if (descriptor) {
            return descriptor;
        }

        current = Object.getPrototypeOf(current);
    }

    return null;
}

function patchDefaultOptions(RollBuilderFFG) {
    const defaultOptionsDescriptor = getPropertyDescriptor(RollBuilderFFG, "defaultOptions");
    const originalDefaultOptions = defaultOptionsDescriptor?.get;

    if (typeof originalDefaultOptions !== "function") {
        console.warn("Azecraft | Could not patch RollBuilderFFG.defaultOptions");
        return false;
    }

    Object.defineProperty(RollBuilderFFG, "defaultOptions", {
        configurable: true,
        get() {
            const options = originalDefaultOptions.call(this);

            return foundry.utils.mergeObject(options, {
                template: ROLL_OPTIONS_TEMPLATE
            }, { inplace: false });
        }
    });

    return true;
}

function patchGetData(RollBuilderFFG) {
    const originalGetData = RollBuilderFFG.prototype.getData;

    if (typeof originalGetData !== "function") {
        console.warn("Azecraft | Could not patch RollBuilderFFG.getData");
        return false;
    }

    RollBuilderFFG.prototype.getData = async function (...args) {
        const data = await originalGetData.call(this, ...args);
        const azecraftPowerModifiers = getModifierGroups(this);

        return {
            ...data,
            azecraftPowerModifiers,
            hasAzecraftPowerModifiers: azecraftPowerModifiers.length > 0
        };
    };

    return true;
}

function patchActivateListeners(RollBuilderFFG) {
    const originalActivateListeners = RollBuilderFFG.prototype.activateListeners;

    if (typeof originalActivateListeners !== "function") {
        console.warn("Azecraft | Could not patch RollBuilderFFG.activateListeners");
        return false;
    }

    RollBuilderFFG.prototype.activateListeners = function (html) {
        this._azecraftPowerModifiers ??= new Map();

        html.find(".btn").on("click", () => {
            appendModifierFlavor(this, html);
        });

        originalActivateListeners.call(this, html);

        html.find(".azecraft-power-modifier").on("change", event => {
            const input = event.currentTarget;
            const key = input.dataset.modifierKey;
            const previous = this._azecraftPowerModifiers.get(key);

            if (input.checked) {
                if (!previous) {
                    const modifier = {
                        difficulty: Number.parseInt(input.dataset.difficulty, 10) || 0,
                        setback: Number.parseInt(input.dataset.setback, 10) || 0,
                        upgradeDifficulty: Number.parseInt(input.dataset.upgradeDifficulty, 10) || 0
                    };

                    this._azecraftPowerModifiers.set(key, {
                        id: input.dataset.modifierId,
                        label: input.dataset.modifierLabel,
                        categorySummary: input.dataset.categorySummary,
                        modifierText: input.dataset.modifierText,
                        appliedChanges: applyModifier(this.dicePool, modifier)
                    });
                }
            } else if (previous) {
                removeModifier(this.dicePool, previous.appliedChanges);
                this._azecraftPowerModifiers.delete(key);
            }

            this._initializeInputs(html);
        });
    };

    return true;
}

export function patchRollPowerModifiers() {
    Hooks.once("setup", async () => {
        const RollBuilderFFG = game.ffg?.RollBuilderFFG;

        if (!RollBuilderFFG) {
            console.warn("Azecraft | Could not find game.ffg.RollBuilderFFG to patch");
            return;
        }

        if (RollBuilderFFG.prototype._azecraftPowerModifiersPatched) {
            return;
        }

        if (typeof loadTemplates === "function") {
            await loadTemplates([ROLL_OPTIONS_TEMPLATE]);
        }

        const patched = [
            patchDefaultOptions(RollBuilderFFG),
            patchGetData(RollBuilderFFG),
            patchActivateListeners(RollBuilderFFG)
        ].every(Boolean);

        if (!patched) {
            return;
        }

        RollBuilderFFG.prototype._azecraftPowerModifiersPatched = true;
        console.log(`Azecraft | Roll power modifiers enabled -> ${ROLL_OPTIONS_TEMPLATE}`);
    });
}
