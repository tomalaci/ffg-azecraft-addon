/**
 * Weapon properties from descriptions (pure rules, unit-tested).
 *
 * The GMs copied each NPC weapon's qualities from the books into the weapon's description, in the
 * books' stat-block form ("Blast 5, Inferior, Knockdown, Stun Damage."), but the weapons themselves
 * have no properties, so rolls show none. These rules read such a quality list and work out which
 * property items (Items › Item Properties, e.g. "Blast (active)") to add and which ranks to fix.
 * Only a sentence that is entirely a quality list counts: flavour text is never keyword-matched.
 */

/** Matching key of a property name: "Auto-Fire (active)", "auto-fire", "Autofire" → "autofire". */
export function propertyKey(name) {
    return String(name ?? "")
        .replace(/\(.*?\)/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

/** Plain text of an HTML description. */
export function plainText(html) {
    return String(html ?? "")
        .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ");
}

/**
 * The quality list in a description, if one of its sentences (or lines) is entirely made of known
 * qualities with optional ranks.
 * @param {string} html  the weapon's description
 * @param {Set<string>} known  property keys that exist (see propertyKey)
 * @returns {{key: string, label: string, rank: number}[]|null}  null when there is no quality list
 */
export function parseQualityList(html, known) {
    const sentences = plainText(html).split(/\n|\.(?:\s|$)/).map(s => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
        const parts = sentence.split(/\s*[,;]\s*/).filter(Boolean);
        const qualities = [];
        for (const part of parts) {
            const match = part.match(/^([A-Za-z][A-Za-z' -]*?)(?:\s+(\d+))?$/);
            const key = match && propertyKey(match[1]);
            if (!key || !known.has(key)) {
                qualities.length = 0;
                break;
            }
            qualities.push({ key, label: match[1].trim(), rank: match[2] ? Number(match[2]) : 1 });
        }
        if (qualities.length) return mergeDuplicates(qualities);
    }
    return null;
}

function mergeDuplicates(qualities) {
    const byKey = new Map();
    for (const quality of qualities) {
        const existing = byKey.get(quality.key);
        if (existing) existing.rank = Math.max(existing.rank, quality.rank);
        else byKey.set(quality.key, { ...quality });
    }
    return [...byKey.values()];
}

/**
 * What to change on a weapon: properties to add, ranks to fix, and properties the weapon has but the
 * list does not (reported only; never removed).
 * @param {{key: string, rank: number}[]} current  the weapon's properties
 * @param {{key: string, rank: number, label?: string}[]} wanted
 */
export function planWeapon(current, wanted) {
    const have = new Map(current.map(quality => [quality.key, quality]));
    const add = [];
    const ranks = [];
    for (const quality of wanted) {
        const existing = have.get(quality.key);
        if (!existing) add.push(quality);
        else if (Number(existing.rank) !== quality.rank) ranks.push({ key: quality.key, label: quality.label, from: Number(existing.rank), to: quality.rank });
    }
    const wantedKeys = new Set(wanted.map(quality => quality.key));
    const extra = current.filter(quality => !wantedKeys.has(quality.key)).map(quality => quality.key);
    return { add, ranks, extra, changed: add.length > 0 || ranks.length > 0 };
}

/** "Blast 5" / "Knockdown" for a quality. */
export function qualityLabel(name, rank) {
    const base = String(name ?? "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    return Number(rank) > 1 ? `${base} ${rank}` : base;
}
