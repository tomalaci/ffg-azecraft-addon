/**
 * Weapon properties from descriptions (Admin Panel, GM): give NPC weapons the properties their
 * descriptions list (see weapon-props-core.js), using the world's property items (Items › Item
 * Properties). Each property is added the way dropping it on the weapon adds it: a copy of the
 * property item in the weapon's `system.itemmodifier`, with its rank.
 *
 * Where a weapon's description is not a quality list (flavour text), the properties of the world
 * weapon item with the same name (the Items catalog) are used, if that one has any.
 */

import { parseQualityList, planWeapon, propertyKey, qualityLabel } from "./weapon-props-core.js";

/** World property items by key; ones in an "Item Properties" folder win over strays. */
function propertyItems() {
    const byKey = new Map();
    const inPropertyFolder = item => /propert/i.test(item.folder?.name ?? "");
    for (const item of game.items.filter(i => i.type === "itemmodifier")) {
        const key = propertyKey(item.name);
        const existing = byKey.get(key);
        if (!existing || (!inPropertyFolder(existing) && inPropertyFolder(item))) byKey.set(key, item);
    }
    return byKey;
}

function qualitiesOf(weapon) {
    return (weapon.system.itemmodifier ?? []).map(mod => ({ key: propertyKey(mod.name), rank: Number(mod.system?.rank) || 1, name: mod.name }));
}

/** World weapon items (the catalog) with properties, by lower-case name. */
function catalogWeapons() {
    const byName = new Map();
    for (const item of game.items.filter(i => i.type === "weapon")) {
        const qualities = qualitiesOf(item);
        if (qualities.length) byName.set(item.name.trim().toLowerCase(), { item, qualities });
    }
    return byName;
}

/** Actor folders to choose from, with their full path; the "NPC Stats" folder first if there is one. */
export function actorFolders() {
    const path = folder => {
        const parts = [];
        for (let f = folder; f; f = f.folder) parts.unshift(f.name);
        return parts.join(" / ");
    };
    return game.folders.filter(f => f.type === "Actor")
        .map(folder => ({ id: folder.id, path: path(folder) }))
        .sort((a, b) => Number(/^npc stats$/i.test(b.path)) - Number(/^npc stats$/i.test(a.path)) || a.path.localeCompare(b.path));
}

function inFolder(actor, folderId) {
    for (let f = actor.folder; f; f = f.folder) if (f.id === folderId) return true;
    return false;
}

/**
 * Check the weapons of the actors in a folder (sub-folders included).
 * @returns {{results: object[], unknown: {actor: string, weapon: string}[], weapons: number, actors: number}}
 *          results: weapons to change, with their plan; unknown: weapons with no properties and no
 *          source for them
 */
export function scanWeapons(folderId) {
    const properties = propertyItems();
    const known = new Set(properties.keys());
    const catalog = catalogWeapons();
    const actors = game.actors.filter(actor => inFolder(actor, folderId));
    const results = [];
    const unknown = [];
    let weapons = 0;
    for (const actor of actors) {
        for (const weapon of actor.items.filter(i => i.type === "weapon")) {
            weapons++;
            const current = qualitiesOf(weapon);
            let wanted = parseQualityList(weapon.system.description, known);
            let source = "description";
            if (!wanted && !current.length) {
                const match = catalog.get(weapon.name.trim().toLowerCase());
                if (match) {
                    wanted = match.qualities.map(q => ({ key: q.key, rank: q.rank, label: qualityLabel(q.name, 1) }));
                    source = `Items: ${match.item.name}`;
                }
            }
            if (!wanted) {
                if (!current.length) unknown.push({ actor: actor.name, weapon: weapon.name });
                continue;
            }
            const plan = planWeapon(current, wanted);
            if (plan.changed) results.push({ actor, weapon, source, plan, wanted });
        }
    }
    return { results, unknown, weapons, actors: actors.length };
}

/**
 * Apply the plans: add missing property copies and fix ranks (nothing is removed).
 * @returns {Promise<{weapons: number, failed: string[]}>}
 */
export async function applyWeaponPlans(results) {
    const properties = propertyItems();
    let weapons = 0;
    const failed = [];
    for (const { actor, weapon, plan } of results) {
        try {
            const fixes = new Map(plan.ranks.map(fix => [fix.key, fix.to]));
            const list = (weapon.system.itemmodifier ?? []).map(mod => {
                const rank = fixes.get(propertyKey(mod.name));
                if (rank === undefined) return mod;
                const copy = foundry.utils.deepClone(mod);
                copy.system.rank = rank;
                copy.system.rank_current = rank;
                return copy;
            });
            for (const quality of plan.add) {
                const source = properties.get(quality.key);
                if (!source) continue;
                const copy = source.toObject();
                copy.id = foundry.utils.randomID();
                copy.system.rank = quality.rank;
                copy.system.rank_current = quality.rank;
                list.push(copy);
            }
            await weapon.update({ system: { itemmodifier: list } });
            weapons++;
        } catch (error) {
            console.warn(`Azecraft | Could not update ${actor.name} › ${weapon.name}`, error);
            failed.push(`${actor.name} › ${weapon.name}`);
        }
    }
    return { weapons, failed };
}

/** Readable summary of a plan: "+ Blast 5, Inferior · Vicious 1 → 2". */
export function describePlan(plan) {
    const parts = [];
    if (plan.add.length) parts.push(`+ ${plan.add.map(q => qualityLabel(q.label, q.rank)).join(", ")}`);
    if (plan.ranks.length) parts.push(plan.ranks.map(fix => `${fix.label} ${fix.from} → ${fix.to}`).join(", "));
    return parts.join(" · ");
}
