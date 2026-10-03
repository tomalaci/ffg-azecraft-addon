/**
 * Biotics and Tech tabs on the character sheet (templates/actors/ffg-character-sheet.html has the
 * empty tab containers). Each tab has:
 *  - one button per base power, rolling the skill at the power's base difficulty with only that
 *    power's modifiers in the dice dialog;
 *  - Tech only: the omni-tool panel (which tech powers are readied: each attack element, augment
 *    mode and construct is its own readied power, Sabotage one; slots used against the omni-tool's
 *    slots and readied powers against Tech ranks, warnings only; see omni-tool-core.js), and the
 *    loadout, i.e. which Tech Attack element and Tech Augment mode a roll uses;
 *  - presets: named power rolls with modifiers ticked in advance (edited in PowerPresetEditor).
 *
 * Stored on the Actor as flags: `powerPresets` (list), `techLoadout` ({power id: subtype id}) and
 * `techReadied` (list of readied unit ids, e.g. "tech-attack:overload", "tech-sabotage").
 */

import { initSteppers } from "./stepper.js";
import {
    DIFFICULTY_NAMES,
    POWER_MODIFIER_CATALOG,
    difficultyLabel,
    findModifier,
    findPower,
    findSubtype,
    modifierCounts,
    normalizeConcentration,
    normalizeLoadout,
    normalizePresets,
    powersFor,
    presetDifficulty,
    toggleConcentration
} from "./power-catalog.js";
import { rollPower } from "../roll-power-modifiers.js";
import { isReadied, normalizeReadied, omniToolStatus, pickOmniTool, readyUnits, toggleReadied } from "./omni-tool-core.js";
import { PowerPresetEditor } from "./preset-editor.js";

const MODULE_ID = "ffg-azecraft-addon";
const TEMPLATE = `modules/${MODULE_ID}/templates/actors/parts/power-tab.hbs`;
const ACTOR_TYPES = new Set(["character", "minion", "rival", "nemesis"]);
const DISCIPLINES = ["biotics", "tech"];

export const FLAGS = { presets: "powerPresets", loadout: "techLoadout", concentration: "concentration", readied: "techReadied" };

export function readPresets(actor) {
    return normalizePresets(actor.getFlag(MODULE_ID, FLAGS.presets));
}

export function readLoadout(actor) {
    return normalizeLoadout(actor.getFlag(MODULE_ID, FLAGS.loadout));
}

const techUnits = () => readyUnits(powersFor("tech"));

export function readReadied(actor) {
    return normalizeReadied(actor.getFlag(MODULE_ID, FLAGS.readied), techUnits());
}

/** The omni-tool panel: the tool, its installed software, the readied powers and the limits. */
function omniToolContext(actor, readied, techRank) {
    const items = actor.items.filter(item => item.type === "weapon").map(item => ({ item, type: item.type, name: item.name, equipped: Boolean(item.system.equippable?.equipped) }));
    const picked = pickOmniTool(items)?.item ?? null;
    const software = picked ? (picked.system.itemattachment ?? []).map(entry => ({ name: entry.name, slots: Number(entry.system?.hardpoints?.value) || 0 })) : [];
    const customizedRanks = actor.items.filter(item => item.type === "talent" && /customi[sz]ed omni[\s-]?tool/i.test(item.name))
        .reduce((sum, item) => sum + (item.system.ranks?.ranked ? Number(item.system.ranks.current) || 1 : 1), 0);
    const status = omniToolStatus(picked ? { slots: Number(picked.system.hardpoints?.value) || 0, software } : null, customizedRanks, techRank, readied.length);
    const groups = [];
    for (const unit of techUnits()) {
        let group = groups.find(entry => entry.label === unit.group);
        if (!group) groups.push(group = { label: unit.group, units: [] });
        group.units.push({ ...unit, on: readied.includes(unit.id) });
    }
    return {
        ...status,
        name: picked?.name ?? null,
        equipped: Boolean(picked?.system.equippable?.equipped),
        software,
        customizedRanks,
        groups
    };
}

/** Dice for display: n Difficulty diamonds, plus counts for upgrades and Setback. */
function diceView({ difficulty, setback = 0, upgrades = 0 }) {
    return {
        dice: Array.from({ length: difficulty }),
        level: DIFFICULTY_NAMES[Math.min(difficulty, DIFFICULTY_NAMES.length - 1)],
        text: difficultyLabel(difficulty) + (upgrades ? `, upgraded ${upgrades}×` : "") + (setback ? `, +${setback} Setback` : ""),
        setback: Array.from({ length: setback }),
        upgrades
    };
}

function context(actor, discipline) {
    const entry = POWER_MODIFIER_CATALOG[discipline];
    const loadout = readLoadout(actor);
    const concentrating = new Set(normalizeConcentration(actor.getFlag(MODULE_ID, FLAGS.concentration)));

    const rank = Number(actor.system.skills?.[entry.skill]?.rank ?? 0);
    const readied = discipline === "tech" ? readReadied(actor) : [];

    const powers = powersFor(discipline).map(power => {
        const loaded = power.loadout ? findSubtype(power, loadout[power.id]) : null;
        return {
            id: power.id,
            label: power.label,
            concentration: power.concentration,
            concentrating: concentrating.has(power.id),
            loaded,
            loadoutLabel: power.subtypeLabel,
            loadoutOptions: power.loadout
                ? power.subtypes.map(subtype => ({ ...subtype, active: subtype.id === loaded?.id, readied: isReadied(readied, power.id, subtype.id) }))
                : null,
            ...diceView(presetDifficulty(power.id, loaded?.id))
        };
    });

    const presets = readPresets(actor)
        .filter(preset => findPower(preset.power).discipline === discipline)
        .map(preset => {
            const power = findPower(preset.power);
            const subtypeId = preset.subtype ?? (power.loadout ? loadout[power.id] : null);
            const subtype = findSubtype(power, subtypeId);
            return {
                ...preset,
                powerLabel: power.label,
                subtypeLabel: subtype?.label ?? "",
                followsLoadout: !preset.subtype && power.loadout,
                modifierLabels: [...modifierCounts(preset.modifiers)]
                    .map(([key, count]) => {
                        const label = findModifier(key)?.option.label;
                        return label && (count > 1 ? `${label} ×${count}` : label);
                    })
                    .filter(Boolean),
                ...diceView(presetDifficulty(power.id, subtypeId, preset.modifiers))
            };
        });

    return {
        discipline,
        skill: entry.skill,
        rank,
        canEdit: actor.isOwner,
        omniTool: discipline === "tech" ? omniToolContext(actor, readied, rank) : null,
        powers,
        presets,
        hasLoadout: powers.some(power => power.loadoutOptions)
    };
}

async function renderTab(app, root, discipline) {
    const tab = root.querySelector(`.tab[data-tab="${discipline}"]`);
    if (!tab) return;
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, context(app.actor, discipline));
    // A newer render of the sheet may have replaced the element meanwhile.
    if (!tab.isConnected) return;
    tab.innerHTML = html;
}

/** Tech powers that are not readied on the omni-tool can still be rolled; the player is told. */
function warnIfNotReadied(actor, power, subtypeId) {
    if (power?.discipline !== "tech" || !actor.getFlag(MODULE_ID, FLAGS.readied)) return;
    const readied = readReadied(actor);
    const exact = power.loadout || power.id === "tech-sabotage" ? subtypeId : null;
    const ready = power.loadout || power.id === "tech-sabotage"
        ? isReadied(readied, power.id, exact)
        : readied.some(id => id.startsWith(`${power.id}:`));
    if (!ready) {
        const name = findSubtype(power, subtypeId)?.label ?? power.label;
        ui.notifications.warn(`${name} is not readied on ${actor.name}'s omni-tool (rolling anyway).`);
    }
}

async function onClick(app, event) {
    const actor = app.actor;
    const target = event.target.closest("[data-azpw]");
    if (!target || !actor.isOwner) return;
    const { azpw: action, power, preset: presetId, subtype, discipline, unit } = target.dataset;

    switch (action) {
        case "roll": {
            const found = findPower(power);
            const loaded = found?.loadout ? readLoadout(actor)[found.id] : null;
            warnIfNotReadied(actor, found, loaded);
            return rollPower(app, power, { subtype: loaded });
        }
        case "ready":
            return actor.setFlag(MODULE_ID, FLAGS.readied, toggleReadied(actor.getFlag(MODULE_ID, FLAGS.readied), unit, techUnits()));
        case "concentrate":
            return actor.setFlag(MODULE_ID, FLAGS.concentration, toggleConcentration(actor.getFlag(MODULE_ID, FLAGS.concentration), power));
        case "load":
            return actor.setFlag(MODULE_ID, FLAGS.loadout, { ...readLoadout(actor), [power]: subtype });
        case "rollPreset": {
            const preset = readPresets(actor).find(p => p.id === presetId);
            if (!preset) return;
            const found = findPower(preset.power);
            const subtypeId = preset.subtype ?? (found.loadout ? readLoadout(actor)[found.id] : null);
            warnIfNotReadied(actor, found, subtypeId);
            return rollPower(app, preset.power, { subtype: subtypeId, modifiers: preset.modifiers, name: preset.name });
        }
        case "addPreset":
            return PowerPresetEditor.open(actor, { discipline });
        case "editPreset":
            return PowerPresetEditor.open(actor, { presetId });
        case "deletePreset": {
            const presets = readPresets(actor);
            const preset = presets.find(p => p.id === presetId);
            if (!preset) return;
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Delete preset" },
                content: `<p>Delete the preset <strong>${foundry.utils.escapeHTML(preset.name)}</strong>?</p>`,
                rejectClose: false
            });
            if (confirmed) await actor.setFlag(MODULE_ID, FLAGS.presets, presets.filter(p => p.id !== presetId));
        }
    }
}

export function initPowerTabs() {
    initSteppers();
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));

    // ActorSheet is an Application V1 sheet in starwarsffg 2.0: html is a jQuery object.
    Hooks.on("renderActorSheet", (app, html) => {
        if (!ACTOR_TYPES.has(app.actor?.type)) return;
        const root = app.element?.[0] ?? html?.[0];
        if (!root) return;
        for (const discipline of DISCIPLINES) renderTab(app, root, discipline);
        // The sheet element persists across its re-renders; listen once.
        if (!root.dataset.azpwListening) {
            root.dataset.azpwListening = "true";
            root.addEventListener("click", event => onClick(app, event));
        }
    });
}
