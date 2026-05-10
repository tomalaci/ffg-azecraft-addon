const MODULE_ID = "ffg-azecraft-addon";
const ROLL_OPTIONS_TEMPLATE = `modules/${MODULE_ID}/templates/dice/roll-options-ffg.html`;

const POWER_MODIFIER_CATALOG = {
    biotics: {
        label: "Biotic",
        categories: [
            {
                id: "biotic-attack",
                label: "Attack",
                options: [
                    { id: "blast", label: "Blast", difficulty: 1 },
                    { id: "warp", label: "Warp", difficulty: 2 }
                ]
            }
        ]
    },
    tech: {
        label: "Tech",
        categories: []
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
            label: `${power.label} - ${category.label}`,
            summaryLabel: `${power.label} ${category.label}`,
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

        grouped.get(option.categorySummary).push(`${option.label} (+${option.difficulty} Difficulty)`);
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
            const id = input.dataset.modifierId;
            const label = input.dataset.modifierLabel;
            const categorySummary = input.dataset.categorySummary;
            const difficulty = Number.parseInt(input.dataset.difficulty, 10) || 0;
            const previous = this._azecraftPowerModifiers.get(key);

            if (input.checked) {
                if (!previous) {
                    this.dicePool.difficulty = Math.max(0, Number(this.dicePool.difficulty ?? 0) + difficulty);
                }

                this._azecraftPowerModifiers.set(key, { id, label, categorySummary, difficulty });
            } else {
                if (previous) {
                    this.dicePool.difficulty = Math.max(0, Number(this.dicePool.difficulty ?? 0) - previous.difficulty);
                }

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
