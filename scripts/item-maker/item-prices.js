/**
 * Item Maker price table (pure, unit-tested): what each stat point and item property adds to an
 * item's price, the price of a draft worked out from it, what crafting the item takes, and design
 * warnings (property ratings outside the recommended ranks).
 *
 * The defaults follow the Genesys Core weapon and armour design guidance and the Mass Effect
 * crafting rules, checked against the prices of the world's weapons and armour; GMs change them in
 * the Item Maker's price table (world setting).
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
            { key: "otherProperty", label: "Any property not in the list below", unit: "each rank", value: 100 },
            { key: "maxProperties", label: "Properties on one item before a warning", unit: "properties", value: 4 }
        ]
    },
    {
        key: "crafting",
        label: "Crafting",
        rows: [
            { key: "materialsPercent", label: "Materials", unit: "% of the price", value: 50 },
            { key: "fabricatorPercent", label: "Crafting time with a fabricator", unit: "% of the time", value: 50 }
        ]
    }
];

/**
 * Default property prices by name (lower case, without "(active)"/"(passive)"): a flat amount plus
 * an amount per rank. Drawbacks are negative. Cumbersome and Unwieldy 1 do nothing, so they only
 * lower the price from rank 2. `min`/`max`: the recommended ranks (0: no limit); outside them the
 * form warns (e.g. Stun above 4 can stun a target for the whole fight).
 */
export const PROPERTY_DEFAULTS = {
    "accurate": { flat: 0, perRank: 250, min: 1, max: 2 },
    "auto-fire": { flat: 300, perRank: 0 },
    "blast": { flat: 0, perRank: 40 },
    "breach": { flat: 0, perRank: 600 },
    "burn": { flat: 0, perRank: 150, min: 1, max: 3 },
    "concussive": { flat: 0, perRank: 750, min: 1, max: 2 },
    "cumbersome": { flat: 100, perRank: -100, min: 2, max: 0 },
    "defensive": { flat: 0, perRank: 100, min: 1, max: 2 },
    "deflection": { flat: 0, perRank: 100, min: 1, max: 2 },
    "disorient": { flat: 0, perRank: 40, min: 2, max: 5 },
    "ensnare": { flat: 0, perRank: 150, min: 1, max: 3 },
    "guided": { flat: 0, perRank: 150, min: 2, max: 4 },
    "inaccurate": { flat: 0, perRank: -100, min: 1, max: 2 },
    "inferior": { flat: -150, perRank: 0 },
    "knockdown": { flat: 150, perRank: 0 },
    "limited ammo": { flat: 0, perRank: 0 },
    "linked": { flat: 0, perRank: 150 },
    "phasic": { flat: 0, perRank: 150 },
    "pierce": { flat: 0, perRank: 100 },
    "prepare": { flat: 0, perRank: -75, min: 1, max: 2 },
    "reinforced": { flat: 2500, perRank: 0 },
    "slow-firing": { flat: 0, perRank: -75, min: 1, max: 2 },
    "stun": { flat: 0, perRank: 40, min: 1, max: 4 },
    "stun damage": { flat: 0, perRank: 0 },
    "sunder": { flat: 150, perRank: 0 },
    "superior": { flat: 400, perRank: 0 },
    "tractor": { flat: 0, perRank: 100 },
    "unwieldy": { flat: 100, perRank: -100, min: 2, max: 0 },
    "vicious": { flat: 0, perRank: 150, min: 1, max: 5 },
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
        const fallback = propertyFallback(clean, values);
        const entry = stored[key] ?? {};
        properties[clean] = {
            flat: amount(entry.flat, fallback.flat),
            perRank: amount(entry.perRank, fallback.perRank),
            min: amount(entry.min, fallback.min, { min: 0, max: 99 }),
            max: amount(entry.max, fallback.max, { min: 0, max: 99 })
        };
    }
    return { values, properties };
}

/** A property's default row: from PROPERTY_DEFAULTS, else the "any other property" price, no rank limits. */
export function propertyFallback(key, values) {
    const known = PROPERTY_DEFAULTS[key];
    return { flat: 0, perRank: values.otherProperty, min: 0, max: 0, ...known };
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

/**
 * Design warnings from the Genesys weapon design guidance, as sentences: property ranks outside the
 * recommended ranks, too many properties, Pierce with Breach, and critical ratings of 1 or 6. They
 * never block making the item.
 */
export function designWarnings(draft, table, properties = []) {
    const warnings = [];
    for (const { name, rank } of properties) {
        const entry = table.properties[propertyKey(name)];
        if (!entry) continue;
        if (entry.min && rank < entry.min) warnings.push(`${name} ${rank}: recommended rank ${entry.min}${entry.max ? `–${entry.max}` : " or more"}${entry.min === 2 && rank === 1 ? " (rank 1 does nothing)" : ""}.`);
        else if (entry.max && rank > entry.max) warnings.push(`${name} ${rank}: recommended rank ${entry.min && entry.min !== entry.max ? `${entry.min}–` : "up to "}${entry.max}.`);
    }
    const max = table.values.maxProperties;
    if (max > 0 && properties.length > max) warnings.push(`${properties.length} properties: more than ${max} make an item hard to use at the table.`);
    const keys = new Set(properties.map(p => propertyKey(p.name)));
    if (keys.has("pierce") && keys.has("breach")) warnings.push("Pierce and Breach both ignore soak; use one of them.");
    if (draft.type === "weapon" && (draft.crit === 1 || draft.crit >= 6)) warnings.push(`Critical rating ${draft.crit}: ratings of 1 and 6 or more are very rare (3 is average).`);
    return warnings;
}

export const DIFFICULTIES = ["Simple", "Easy", "Average", "Hard", "Daunting", "Formidable"];
const COMPUTER_SKILLS = new Set(["tech", "biotics"]);
export const CRAFT_SKILLS = ["Mechanics", "Computers", "Medicine"];

/**
 * What crafting the item takes (Mass Effect crafting rules): materials as a share of the price
 * (used up whether the check succeeds or not), a check whose difficulty is half the rarity rounded
 * up, the skill (Computers for omni-tools and amps, otherwise Mechanics, unless chosen), and the time
 * (encumbrance 1 or less: 1 hour plus 1 per rarity; otherwise days), shorter with a fabricator.
 */
export function craftingPlan(draft, table, total) {
    const { values } = table;
    const dice = Math.min(DIFFICULTIES.length - 1, Math.ceil(draft.rarity / 2));
    const skill = CRAFT_SKILLS.includes(draft.craftSkill) ? draft.craftSkill
        : draft.type === "weapon" && COMPUTER_SKILLS.has(String(draft.skill).toLowerCase()) ? "Computers" : "Mechanics";
    const unit = draft.encumbrance <= 1 ? "hour" : "day";
    const time = 1 + draft.rarity;
    const fabricator = Math.max(1, Math.ceil((time * values.fabricatorPercent) / 100));
    return {
        materials: Math.ceil((total * values.materialsPercent) / 100),
        skill,
        dice,
        difficulty: DIFFICULTIES[dice],
        time,
        fabricator,
        unit
    };
}

/** "3 days" / "1 hour". */
export function duration(amount, unit) {
    return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/** The "Crafting" part of the item description. */
export function craftingHtml(plan) {
    const format = value => value.toLocaleString("en-US");
    return `<h3>Crafting</h3><ul><li>Materials: ${format(plan.materials)} credits (used up whether the check succeeds or not)</li>`
        + `<li>Check: ${plan.skill}, ${plan.difficulty} (${plan.dice} difficulty ${plan.dice === 1 ? "die" : "dice"})</li>`
        + `<li>Time: ${duration(plan.time, plan.unit)} (${duration(plan.fabricator, plan.unit)} with a fabricator)</li></ul>`;
}

/** The "Price" part of the item description: each line and the total, escaped. */
export function priceHtml({ lines, total }, { maker = "" } = {}) {
    if (!lines.length) return "";
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const format = value => value.toLocaleString("en-US");
    const items = lines.map(line => `<li>${escape(line.label)}: ${line.amount < 0 ? "−" : ""}${format(Math.abs(line.amount))}</li>`).join("");
    return `<h3>Price</h3><ul>${items}</ul><p><em>${format(total)} credits, from the Item Maker price table${maker ? `; made by ${escape(maker)}` : ""}.</em></p>`;
}
