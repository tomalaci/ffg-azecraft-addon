import { MAX_RANKS, baseDifficulty, difficultyLabel, disciplineForSkill, findModifier, findPower, findSubtype, modifierCounts, modifierGroups } from "./powers/power-catalog.js";

const MODULE_ID = "ffg-azecraft-addon";
const ROLL_OPTIONS_TEMPLATE = `modules/${MODULE_ID}/templates/dice/roll-options-ffg.html`;

/**
 * Power rolls started from the sheet's Biotics / Tech tabs. The system's rollSkill opens the dialog
 * asynchronously and cannot carry extra data, so each power is queued here and claimed, in order,
 * by the next roll dialog for the same actor and discipline (two quick clicks open two dialogs, each
 * with its own power).
 */
const pendingPowers = [];
const PENDING_POWER_TTL = 5000;

function claimPendingPower(rollBuilder) {
    const now = Date.now();
    while (pendingPowers.length && now - pendingPowers[0].at > PENDING_POWER_TTL) pendingPowers.shift();
    const discipline = disciplineForSkill(rollBuilder?.roll?.skillName);
    const actorId = rollBuilder?.roll?.data?.actor?._id ?? null;
    const index = pendingPowers.findIndex(pending => pending.power.discipline === discipline
        && (!pending.actorId || !actorId || pending.actorId === actorId));
    return index < 0 ? null : pendingPowers.splice(index, 1)[0];
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

    pendingPowers.push({ power, subtype: findSubtype(power, subtype), modifiers, name, actorId: sheet.actor?.id ?? null, at: Date.now() });
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
    for (const [key, count] of modifierCounts(pending.modifiers)) {
        const found = findModifier(key);
        if (!found || rollBuilder._azecraftPowerModifiers.has(found.key)) continue;
        setModifierCount(rollBuilder, found.key, {
            id: found.option.id,
            label: found.option.label,
            categorySummary: found.category.label,
            modifierText: found.option.modifierText,
            modifier: found.option
        }, found.option.perRank ? Math.min(count, MAX_RANKS) : 1);
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
            options: category.options.map(option => {
                const count = rollBuilder._azecraftPowerModifiers?.get(`${category.id}:${option.id}`)?.applied.length ?? 0;
                return { ...option, key: `${category.id}:${option.id}`, count, checked: count > 0, maxRanks: MAX_RANKS };
            })
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

        const times = option.applied?.length > 1 ? ` ×${option.applied.length}` : "";
        grouped.get(option.categorySummary).push(`${option.label}${times} (${option.modifierText})`);
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

/**
 * Apply or remove ranks of a modifier until it is applied `count` times. Each rank's dice changes
 * are kept separately, so removing a rank undoes exactly that rank.
 */
function setModifierCount(rollBuilder, key, meta, count) {
    const map = rollBuilder._azecraftPowerModifiers;
    const entry = map.get(key) ?? { ...meta, applied: [] };
    while (entry.applied.length < count) entry.applied.push(applyModifier(rollBuilder.dicePool, meta.modifier));
    while (entry.applied.length > count) removeModifier(rollBuilder.dicePool, entry.applied.pop());
    if (entry.applied.length) map.set(key, entry);
    else map.delete(key);
}

/**
 * Undo a modifier. An upgrade turned Difficulty dice into Challenge dice: turn a Challenge die back
 * only while one is left (the player may have downgraded it by hand meanwhile). Dice that were
 * added or removed outright are removed or added back.
 */
function removeModifier(dicePool, appliedChanges) {
    const num = key => Number(dicePool[key] ?? 0);
    const applied = key => Number(appliedChanges[key] ?? 0);
    const converted = Math.min(Math.max(0, applied("challenge")), Math.max(0, -applied("difficulty")));

    for (let i = 0; i < converted; i++) {
        if (num("challenge") <= 0) break;
        dicePool.challenge = num("challenge") - 1;
        dicePool.difficulty = num("difficulty") + 1;
    }

    dicePool.challenge = Math.max(0, num("challenge") - (applied("challenge") - converted));
    dicePool.difficulty = Math.max(0, num("difficulty") - (applied("difficulty") + converted));
    dicePool.setback = Math.max(0, num("setback") - applied("setback"));
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
            const count = input.type === "number"
                ? Math.max(0, Math.min(MAX_RANKS, Number.parseInt(input.value, 10) || 0))
                : (input.checked ? 1 : 0);
            if (input.type === "number") input.value = String(count);
            setModifierCount(this, input.dataset.modifierKey, {
                id: input.dataset.modifierId,
                label: input.dataset.modifierLabel,
                categorySummary: input.dataset.categorySummary,
                modifierText: input.dataset.modifierText,
                modifier: {
                    difficulty: Number.parseInt(input.dataset.difficulty, 10) || 0,
                    setback: Number.parseInt(input.dataset.setback, 10) || 0,
                    upgradeDifficulty: Number.parseInt(input.dataset.upgradeDifficulty, 10) || 0
                }
            }, count);

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

        await foundry.applications.handlebars.loadTemplates([ROLL_OPTIONS_TEMPLATE]);

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
