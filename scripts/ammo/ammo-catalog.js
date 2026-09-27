/**
 * Mass Effect ammunition upgrades (pure rules, unit-tested).
 *
 * An upgrade is a consumable: a maneuver applies it to a weapon, which keeps the benefit until it
 * runs out (the GM's call). Each gives the weapon a quality at a set rating, or raises the rating
 * when the weapon already has that quality.
 */

export const AMMO_TYPES = [
    { id: "armor-piercing", label: "Armor-Piercing", quality: "Pierce", gain: 2, increase: 1, match: /\b(ap|armou?r[- ]?piercing)\b/i },
    { id: "cryo", label: "Cryo", quality: "Ensnare", gain: 2, increase: 2, match: /\bcryo\b/i },
    { id: "disruptor", label: "Disruptor", quality: "Phasic", gain: 2, increase: 2, match: /\bdisruptor\b/i },
    {
        id: "explosive", label: "Explosive", quality: "Disorient", gain: 2, increase: 1, match: /\bexplosive\b/i,
        note: "Spend a Triumph from a combat check with this weapon to stagger the target for one round."
    },
    { id: "incendiary", label: "Incendiary", quality: "Burn", gain: 2, increase: 1, match: /\bincendiary\b/i },
    { id: "shredder", label: "Shredder", quality: "Vicious", gain: 3, increase: 2, match: /\bshredder\b/i }
];

export function findAmmo(id) {
    return AMMO_TYPES.find(type => type.id === id) ?? null;
}

/** The ammo type an item name stands for ("Incendiary Ammo", "AP Ammo"...), or null. */
export function ammoForItemName(name) {
    const text = String(name ?? "");
    if (!/\b(ammo|ammunition)\b/i.test(text)) return null;
    return AMMO_TYPES.find(type => type.match.test(text)) ?? null;
}

/** "Burn (active)" -> "burn": quality names in worlds often carry an (active)/(passive) suffix. */
export function qualityKey(name) {
    return String(name ?? "").replace(/\(.*?\)/g, "").trim().toLowerCase();
}

/** The weapon's rating for a quality once the ammo is applied. */
export function ammoRating(ammo, existingRank) {
    const rank = Number(existingRank) || 0;
    return rank > 0 ? rank + ammo.increase : ammo.gain;
}

/**
 * Add an ammo upgrade to a weapon's summarized qualities (the system's
 * `doNotSubmit.qualities` list: {name, totalRanks, summarizedRanks, ...}).
 *
 * @param {object[]} qualities       The weapon's qualities, not modified
 * @param {object} ammo              An AMMO_TYPES entry
 * @param {object} [known]           Quality items in the world by qualityKey: {name, img, description}
 * @returns {object[]} The new list
 */
export function withAmmoQualities(qualities, ammo, known = {}) {
    const list = (qualities ?? []).map(quality => ({ ...quality, summarizedRanks: { ...quality.summarizedRanks } }));
    const source = `${ammo.label} Ammo`;
    const key = qualityKey(ammo.quality);
    const existing = list.find(quality => qualityKey(quality.name) === key);

    if (existing) {
        const added = ammoRating(ammo, existing.totalRanks) - (Number(existing.totalRanks) || 0);
        existing.totalRanks = (Number(existing.totalRanks) || 0) + added;
        existing.summarizedRanks[source] = added;
    } else {
        const item = known[key];
        list.push({
            name: item?.name ?? ammo.quality,
            img: item?.img,
            description: item?.description ?? "",
            itemIndex: list.length,
            totalRanks: ammo.gain,
            includeControls: false,
            summarizedRanks: { [source]: ammo.gain }
        });
    }

    if (ammo.note) {
        list.push({
            name: source,
            description: ammo.note,
            itemIndex: list.length,
            totalRanks: "",
            includeControls: false,
            summarizedRanks: {}
        });
    }
    return list;
}
