/**
 * Item Maker price table (pure, unit-tested): what each stat point and item property adds to an
 * item's price, and the price of a draft worked out from it.
 *
 * The defaults are the module's own estimates, checked against the prices of the world's weapons
 * and armour; GMs change them in the Item Maker's price table (world setting).
 */

/** Rows of the price table, by section. `unit` explains the value in the table. */
export const PRICE_SECTIONS = [
    {
        key: "weapon",
        label: "Weapons",
        rows: [
            { key: "damage4", label: "Damage 4–5", unit: "each point", value: 50 },
            { key: "damage6", label: "Damage 6–7", unit: "each point", value: 75 },
            { key: "damage8", label: "Damage 8–9", unit: "each point", value: 125 },
            { key: "damage10", label: "Damage 10–12", unit: "each point", value: 175 },
            { key: "damage13", label: "Damage 13 and up", unit: "each point", value: 500 },
            { key: "crit4", label: "Critical rating 4", unit: "credits", value: 50 },
            { key: "crit3", label: "Critical rating 3", unit: "credits", value: 150 },
            { key: "crit2", label: "Critical rating 2", unit: "credits", value: 350 },
            { key: "crit1", label: "Critical rating 1", unit: "credits", value: 700 },
            { key: "rangeMedium", label: "Medium range", unit: "credits", value: 100 },
            { key: "rangeLong", label: "Long range", unit: "credits", value: 300 },
            { key: "rangeExtreme", label: "Extreme range", unit: "credits", value: 600 },
            { key: "meleePercent", label: "Melee and Brawl weapons (add Brawn)", unit: "% of the price", value: 50 },
            { key: "singleUsePercent", label: "Single use (grenades, charges; ticked on the form)", unit: "% of the price", value: 15 }
        ]
    },
    {
        key: "armour",
        label: "Armour",
        rows: [
            { key: "soak1", label: "Soak, 1st point", unit: "credits", value: 50 },
            { key: "soak2", label: "Soak, 2nd point", unit: "credits", value: 400 },
            { key: "soak3", label: "Soak, 3rd point", unit: "credits", value: 600 },
            { key: "soak4", label: "Soak, 4th point and up", unit: "each point", value: 1500 },
            { key: "defence1", label: "Defense, 1st point", unit: "credits", value: 50 },
            { key: "defence2", label: "Defense, 2nd point", unit: "credits", value: 500 },
            { key: "defence3", label: "Defense, 3rd point", unit: "credits", value: 1500 },
            { key: "defence4", label: "Defense, 4th point and up", unit: "each point", value: 3000 },
            { key: "soakAndDefence", label: "Both soak and defense", unit: "credits", value: 300 }
        ]
    },
    {
        key: "properties",
        label: "Item properties",
        rows: [
            { key: "otherProperty", label: "Any property not in the list below", unit: "each rank", value: 100 }
        ]
    }
];

/**
 * Default property prices by name (lower case, without "(active)"/"(passive)"): a flat amount plus
 * an amount per rank. Drawbacks are negative. Cumbersome and Unwieldy 1 do nothing, so they only
 * lower the price from rank 2.
 */
export const PROPERTY_DEFAULTS = {
    "accurate": { flat: 0, perRank: 250 },
    "auto-fire": { flat: 300, perRank: 0 },
    "blast": { flat: 0, perRank: 40 },
    "breach": { flat: 0, perRank: 600 },
    "burn": { flat: 0, perRank: 150 },
    "concussive": { flat: 0, perRank: 750 },
    "cumbersome": { flat: 100, perRank: -100 },
    "defensive": { flat: 0, perRank: 100 },
    "deflection": { flat: 0, perRank: 100 },
    "disorient": { flat: 0, perRank: 40 },
    "ensnare": { flat: 0, perRank: 150 },
    "guided": { flat: 0, perRank: 150 },
    "inaccurate": { flat: 0, perRank: -100 },
    "inferior": { flat: -150, perRank: 0 },
    "knockdown": { flat: 150, perRank: 0 },
    "limited ammo": { flat: 0, perRank: 0 },
    "linked": { flat: 0, perRank: 150 },
    "phasic": { flat: 0, perRank: 150 },
    "pierce": { flat: 0, perRank: 100 },
    "prepare": { flat: 0, perRank: -75 },
    "reinforced": { flat: 2500, perRank: 0 },
    "slow-firing": { flat: 0, perRank: -75 },
    "stun": { flat: 0, perRank: 40 },
    "stun damage": { flat: 0, perRank: 0 },
    "sunder": { flat: 150, perRank: 0 },
    "superior": { flat: 400, perRank: 0 },
    "tractor": { flat: 0, perRank: 100 },
    "unwieldy": { flat: 100, perRank: -100 },
    "vicious": { flat: 0, perRank: 150 }
};

const ROWS = PRICE_SECTIONS.flatMap(section => section.rows);
const AMOUNT_MAX = 9999999;

/** A property's key in the table: its name in lower case without a trailing "(active)"-style note. */
export function propertyKey(name) {
    return String(name ?? "").toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
}

function amount(value, fallback, { min = -AMOUNT_MAX, max = AMOUNT_MAX } = {}) {
    const number = Math.round(Number(value));
    return value !== "" && value !== null && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * The price table with every value filled in: stored values where valid, defaults elsewhere.
 * @returns {{values: Record<string, number>, properties: Record<string, {flat: number, perRank: number}>}}
 */
export function normalizeTable(raw = {}) {
    const values = {};
    for (const row of ROWS) {
        const percent = row.unit.startsWith("%");
        values[row.key] = amount(raw?.values?.[row.key], row.value, percent ? { min: 0, max: 1000 } : {});
    }
    const properties = {};
    const stored = raw?.properties && typeof raw.properties === "object" ? raw.properties : {};
    for (const key of new Set([...Object.keys(PROPERTY_DEFAULTS), ...Object.keys(stored)])) {
        const clean = propertyKey(key);
        if (!clean || clean.length > 80) continue;
        const fallback = PROPERTY_DEFAULTS[clean] ?? { flat: 0, perRank: values.otherProperty };
        const entry = stored[key] ?? {};
        properties[clean] = { flat: amount(entry.flat, fallback.flat), perRank: amount(entry.perRank, fallback.perRank) };
    }
    return { values, properties };
}

/** What a property adds: from the table, else the "any other property" price per rank. */
export function propertyPrice(name, rank, table) {
    const entry = table.properties[propertyKey(name)];
    if (entry) return entry.flat + entry.perRank * rank;
    return table.values.otherProperty * rank;
}

function damagePrice(damage, values) {
    const bands = [[4, 5, "damage4"], [6, 7, "damage6"], [8, 9, "damage8"], [10, 12, "damage10"], [13, Infinity, "damage13"]];
    return bands.reduce((sum, [from, to, key]) => sum + Math.max(0, Math.min(damage, to) - from + 1) * values[key], 0);
}

function pointsPrice(points, keys, values) {
    let sum = 0;
    for (let point = 1; point <= points; point++) sum += values[keys[Math.min(point, keys.length) - 1]];
    return sum;
}

const MELEE_SKILLS = new Set(["melee", "brawl"]);

/**
 * The price of a draft, line by line. `properties` are the chosen properties as {name, rank}.
 * Stats count for weapons and armour; every type counts its base price and properties.
 * @returns {{lines: {label: string, amount: number}[], total: number}}
 */
export function priceBreakdown(draft, table, properties = []) {
    const { values } = table;
    const lines = [];
    const add = (label, value) => { if (value) lines.push({ label, amount: value }); };

    add("Base price", draft.basePrice ?? 0);
    if (draft.type === "weapon") {
        add(`Damage ${draft.damage}`, damagePrice(draft.damage, values));
        const crit = draft.crit >= 1 && draft.crit <= 4 ? values[`crit${draft.crit}`] : 0;
        add(`Critical rating ${draft.crit}`, crit);
        add(`${draft.range} range`, { Medium: values.rangeMedium, Long: values.rangeLong, Extreme: values.rangeExtreme }[draft.range] ?? 0);
    }
    if (draft.type === "armour") {
        add(`Soak ${draft.soak}`, pointsPrice(draft.soak, ["soak1", "soak2", "soak3", "soak4"], values));
        add(`Defense ${draft.defence}`, pointsPrice(draft.defence, ["defence1", "defence2", "defence3", "defence4"], values));
        if (draft.soak > 0 && draft.defence > 0) add("Soak and defense", values.soakAndDefence);
    }
    for (const { name, rank } of properties) add(`${name} ${rank}`, propertyPrice(name, rank, table));

    let total = lines.reduce((sum, line) => sum + line.amount, 0);
    const percent = (label, value) => {
        const change = Math.round((total * value) / 100) - total;
        if (change) lines.push({ label, amount: change });
        total += change;
    };
    if (draft.type === "weapon" && MELEE_SKILLS.has(String(draft.skill).toLowerCase())) percent(`${draft.skill} weapon (${values.meleePercent}%)`, values.meleePercent);
    if (draft.singleUse && ["weapon", "gear"].includes(draft.type)) percent(`Single use (${values.singleUsePercent}%)`, values.singleUsePercent);

    return { lines, total: Math.max(0, total) };
}

/** The "Price" part of the item description: each line and the total, escaped. */
export function priceHtml({ lines, total }, { maker = "" } = {}) {
    if (!lines.length) return "";
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const format = value => value.toLocaleString("en-US");
    const items = lines.map(line => `<li>${escape(line.label)}: ${line.amount < 0 ? "−" : ""}${format(Math.abs(line.amount))}</li>`).join("");
    return `<h3>Price</h3><ul>${items}</ul><p><em>${format(total)} credits, from the Item Maker price table${maker ? `; made by ${escape(maker)}` : ""}.</em></p>`;
}
