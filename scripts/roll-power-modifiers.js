import { baseDifficulty, difficultyLabel, disciplineForSkill, findModifier, findPower, findSubtype, modifierGroups } from "./powers/power-catalog.js";

const MODULE_ID = "ffg-azecraft-addon";
const ROLL_OPTIONS_TEMPLATE = `modules/${MODULE_ID}/templates/dice/roll-options-ffg.html`;

/**
 * A power roll started from the character sheet's Biotics / Tech tabs. The system's rollSkill opens the
 * dialog asynchronously and cannot carry extra data, so the power is parked here and claimed by
 * the next roll dialog for that skill.
 */
let pendingPower = null;
const PENDING_POWER_TTL = 5000;

function claimPendingPower(rollBuilder) {
    const pending = pendingPower;
    if (!pending || Date.now() - pending.at > PENDING_POWER_TTL) return null;
    if (disciplineForSkill(rollBuilder?.roll?.skillName) !== pending.power.discipline) return null;
    pendingPower = null;
    return pending;
}

/**
 * Roll a power: the system's skill roll for the power's skill, opened at the power's (or its
 * subtype's) base difficulty with only that power's (and the general) modifiers listed.
 * @param {ActorSheet} sheet  The character sheet rolling (rollSkill reads its data)
 * @param {string} powerId    A power id from the catalog, e.g. "biotic-attack"
 * @param {object} [options]
 * @param {string|null} [options.subtype]    Subtype id (Tech element, construct, ...)
 * @param {string[]} [options.modifiers]     Modifier keys to tick in advance ("<category>:<option>")
 * @param {string} [options.name]            Preset name, shown in the chat flavor
 */
export async function rollPower(sheet, powerId, { subtype = null, modifiers = [], name = "" } = {}) {
    const power = findPower(powerId);
    const DiceHelpers = game.ffg?.DiceHelpers;
    if (!power || !DiceHelpers?.rollSkill) return;

    // rollSkill finds the skill from the clicked element's ancestors ([data-ability]).
    const holder = document.createElement("div");
    holder.dataset.ability = power.skill;
    const row = holder.appendChild(document.createElement("div"));
    const cell = row.appendChild(document.createElement("div"));
    const target = cell.appendChild(document.createElement("span"));

    pendingPower = { power, subtype: findSubtype(power, subtype), modifiers, name, at: Date.now() };
    await DiceHelpers.rollSkill(sheet, { target, currentTarget: target, preventDefault() {} }, null);
}

/** How a power roll is titled: "Preset — Power (Subtype)". */
function powerTitle({ power, subtype, name }) {
    const label = subtype ? `${power.label} (${subtype.label})` : power.label;
    return name && name !== power.label ? `${name} — ${label}` : label;
}

/**
 * Set the pool to the power's base difficulty (keeping anything the system added on top of
 * Average), then tick the preset's modifiers as if clicked.
 */
function applyPowerRoll(rollBuilder, pending) {
    const pool = rollBuilder.dicePool;
    pool.difficulty = Math.max(0, Number(pool.difficulty ?? 0) + baseDifficulty(pending.power, pending.subtype?.id) - 2);
    const effect = pending.subtype?.effect ? `${pending.subtype.label}: ${pending.subtype.effect}` : "";
    rollBuilder.roll.flavor = [powerTitle(pending), effect, rollBuilder.roll.flavor].filter(Boolean).join(" | ");

    rollBuilder._azecraftPowerModifiers ??= new Map();
    for (const key of pending.modifiers ?? []) {
        const found = findModifier(key);
        if (!found || rollBuilder._azecraftPowerModifiers.has(found.key)) continue;
        rollBuilder._azecraftPowerModifiers.set(found.key, {
            id: found.option.id,
            label: found.option.label,
            categorySummary: found.category.label,
            modifierText: found.option.modifierText,
            appliedChanges: applyModifier(pool, found.option)
        });
    }
}

function getModifierGroups(rollBuilder) {
    const discipline = disciplineForSkill(rollBuilder?.roll?.skillName);
    if (!discipline) return [];

    const pending = rollBuilder._azecraftPower;
    return modifierGroups(discipline, pending?.power.id ?? null, pending?.subtype?.id ?? null)
        .filter(category => category.options?.length)
        .map(category => ({
            id: category.id,
            label: category.label,
            open: category.open,
            baseDifficulty: category.base === undefined ? ""
                : pending?.subtype?.base !== undefined && category.id === pending.power.id
                    ? `Base (${pending.subtype.label}): ${difficultyLabel(pending.subtype.base)}`
                    : `Base: ${difficultyLabel(category.base)}${category.baseNote ? `; ${category.baseNote}` : ""}`,
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
        if (!this._azecraftPowerClaimed) {
            this._azecraftPowerClaimed = true;
            this._azecraftPower = claimPendingPower(this);
            if (this._azecraftPower) applyPowerRoll(this, this._azecraftPower);
        }

        const data = await originalGetData.call(this, ...args);
        const azecraftPowerModifiers = getModifierGroups(this);

        return {
            ...data,
            azecraftPowerModifiers,
            hasAzecraftPowerModifiers: azecraftPowerModifiers.length > 0,
            azecraftPower: this._azecraftPower ? {
                label: powerTitle(this._azecraftPower),
                base: difficultyLabel(baseDifficulty(this._azecraftPower.power, this._azecraftPower.subtype?.id)),
                effect: this._azecraftPower.subtype?.effect ?? ""
            } : null
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
