/**
 * Powers tab on the character sheet (templates/actors/ffg-character-sheet.html): one button per
 * readied Biotics / Tech power. A button rolls the power's skill at the power's base difficulty,
 * with only that power's optional effects (and the general modifiers) in the dice dialog.
 *
 * Readied powers are stored on the Actor (flag `readiedPowers`, a list of power ids). Until someone
 * chooses, the block shows every power of each discipline the character has ranks in.
 */

import { POWER_MODIFIER_CATALOG, DIFFICULTY_NAMES, difficultyLabel, visiblePowers } from "./power-catalog.js";
import { rollPower } from "../roll-power-modifiers.js";

const MODULE_ID = "ffg-azecraft-addon";
const FLAG = "readiedPowers";
const TEMPLATE = `modules/${MODULE_ID}/templates/actors/parts/powers.hbs`;
const ACTOR_TYPES = new Set(["character"]);

/** Sheets currently in "choose readied powers" mode (by sheet id; not persisted). */
const editing = new Set();

function readied(actor) {
    const value = actor.getFlag(MODULE_ID, FLAG);
    return Array.isArray(value) ? value : null;
}

function context(app) {
    const actor = app.actor;
    const skills = actor.system.skills ?? {};
    const chosen = readied(actor);
    const shown = visiblePowers(skills, chosen);
    const shownIds = new Set(shown.map(power => power.id));

    return {
        canEdit: actor.isOwner,
        canRoll: actor.isOwner,
        editing: editing.has(app.id),
        automatic: chosen === null,
        disciplines: Object.entries(POWER_MODIFIER_CATALOG).map(([key, entry]) => ({
            key,
            skill: entry.skill,
            rank: Number(skills[entry.skill]?.rank ?? 0),
            powers: entry.categories.filter(category => !category.general)
                .map(category => ({ id: category.id, label: category.label, readied: shownIds.has(category.id) }))
        })),
        powers: shown.map(power => ({
            id: power.id,
            label: power.label,
            skill: power.skill,
            discipline: power.discipline,
            concentration: power.concentration,
            dice: Array.from({ length: power.base }),
            baseName: DIFFICULTY_NAMES[power.base],
            baseText: difficultyLabel(power.base)
        }))
    };
}

async function render(app, root) {
    const tab = root.querySelector(".tab.powers");
    if (!tab) return;
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, context(app));
    // A newer render of the sheet may have replaced the element meanwhile.
    if (!tab.isConnected) return;
    tab.querySelector("[data-azpw]")?.remove();
    tab.insertAdjacentHTML("beforeend", html);
    activate(app, tab.querySelector("[data-azpw]"));
}

function activate(app, block) {
    const actor = app.actor;

    block.addEventListener("click", async event => {
        const roll = event.target.closest("[data-azpw-roll]");
        if (roll && actor.isOwner) return rollPower(app, roll.dataset.azpwRoll);

        const action = event.target.closest("[data-azpw-action]")?.dataset.azpwAction;
        if (action === "manage") {
            if (editing.has(app.id)) editing.delete(app.id);
            else editing.add(app.id);
            return render(app, app.element[0]);
        }
        if (action === "automatic") return actor.unsetFlag(MODULE_ID, FLAG);
    });

    block.addEventListener("change", event => {
        if (!event.target.matches("[data-azpw-ready]")) return;
        // The sheet's own form handling must not submit this checkbox.
        event.stopPropagation();
        const ids = [...block.querySelectorAll("[data-azpw-ready]:checked")].map(input => input.dataset.azpwReady);
        actor.setFlag(MODULE_ID, FLAG, ids);
    }, true);
}

export function initPowerBlock() {
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));

    // ActorSheet is an Application V1 sheet in starwarsffg 2.0: html is a jQuery object.
    Hooks.on("renderActorSheet", (app, html) => {
        if (!ACTOR_TYPES.has(app.actor?.type)) return;
        const root = app.element?.[0] ?? html?.[0];
        if (root) render(app, root);
    });

    Hooks.on("closeActorSheet", app => editing.delete(app.id));
}
