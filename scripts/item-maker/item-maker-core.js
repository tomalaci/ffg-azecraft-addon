/**
 * Item Maker rules (pure, unit-tested): which item types can be made and with which fields, turning
 * the form into Item data, finding similarly named items, and keeping icon paths inside the icon
 * folders GMs allow.
 *
 * Players' items are created by the active GM's client from a draft (plain values only), so the
 * draft is normalized here and the Item data is always built by this code, never taken from a client.
 */

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const SPECIAL_MAX = 300;
export const MAX_PROPERTIES = 20;
export const MAX_COSTS = 10;
/** Cost line paid from a character's own credits (their sheet); other lines are `entry:<id>` of the Resources tracker. */
export const SHEET_CREDITS = "sheet";
const NUMBER_MAX = 9999999;

/** Item types the maker offers, with the stat groups each one has (starwarsffg 2.0 data). */
export const MAKER_TYPES = {
    weapon: { label: "Weapon", icon: "fa-solid fa-gun", groups: ["basic", "hardpoints", "weapon"], properties: true },
    armour: { label: "Armour", icon: "fa-solid fa-shield-halved", groups: ["basic", "hardpoints", "armour"], properties: true },
    gear: { label: "Gear", icon: "fa-solid fa-toolbox", groups: ["basic", "quantity"], properties: true },
    itemattachment: { label: "Attachment", icon: "fa-solid fa-puzzle-piece", groups: ["basic", "hardpoints", "attachment"], properties: true },
    itemmodifier: { label: "Item property", icon: "fa-solid fa-tag", groups: ["modifier"], properties: false },
    talent: { label: "Talent", icon: "fa-solid fa-star", groups: ["talent"], properties: false },
    ability: { label: "Ability", icon: "fa-solid fa-bolt", groups: [], properties: false }
};

/** The system's own default image per type (as on its new items); Foundry's item bag otherwise. */
const DEFAULT_IMAGES = { weapon: "weapon", armour: "armor", gear: "gear", itemattachment: "attachment", itemmodifier: "itemmodifier" };

export function defaultImage(type) {
    return DEFAULT_IMAGES[type] ? `systems/starwarsffg/images/defaults/items/${DEFAULT_IMAGES[type]}.png` : "icons/svg/item-bag.svg";
}

export const WEAPON_SKILLS = ["Ranged-Light", "Ranged-Heavy", "Gunnery", "Melee", "Brawl", "Biotics", "Tech", "Mechanics"];
export const RANGES = ["Engaged", "Short", "Medium", "Long", "Extreme"];
export const ACTIVATIONS = ["Passive", "Active (Incidental)", "Active (Incidental, Out of Turn)", "Active (Maneuver)", "Active (Action)"];
/** Skills whose weapons add Brawn to their damage. */
const BRAWN_SKILLS = new Set(["melee", "brawl"]);

/** Icon folders offered by default; GMs can add and remove folders. */
export const DEFAULT_ICON_PATHS = [
    "systems/starwarsffg/images",
    "icons/svg",
    "icons/weapons",
    "icons/equipment",
    "icons/tools",
    "icons/consumables",
    "icons/commodities",
    "icons/containers",
    "icons/sundries",
    "icons/skills"
];

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"];

/* -------------------------------------------- */
/*  Paths                                       */
/* -------------------------------------------- */

/** A folder path as GMs type it: no leading/trailing slashes, no "..", no protocol. Null if unusable. */
export function cleanFolderPath(raw) {
    // Foundry's file browser returns URL-encoded paths ("Mass%20Effect"); compare them decoded.
    const path = decodePath(raw).trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
    if (!path || path.length > 300) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
    if (path.split("/").some(part => part === ".." || part === ".")) return null;
    return path;
}

/** Foundry's file source for a path: core icons and UI art are "public", everything else "data". */
export function iconSource(path) {
    return /^(icons|ui|sounds)\//.test(path) || path === "icons" ? "public" : "data";
}

/** Whether `path` is one of `roots` or inside one of them. */
export function isWithinRoots(path, roots) {
    const clean = cleanFolderPath(path);
    if (!clean) return false;
    return roots.map(cleanFolderPath).filter(Boolean).some(root => clean === root || clean.startsWith(`${root}/`));
}

function decodePath(path) {
    try {
        return decodeURIComponent(String(path ?? ""));
    } catch {
        return String(path ?? "");
    }
}

/** A usable item image: a relative image path without "..", else null. */
export function cleanImagePath(raw) {
    const path = String(raw ?? "").trim();
    if (!path || path.length > 500) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("/") || path.startsWith("\\")) return null;
    if (decodePath(path).split(/[\\/]/).some(part => part === "..")) return null;
    const extension = path.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    return extension && IMAGE_EXTENSIONS.includes(extension) ? path : null;
}

/* -------------------------------------------- */
/*  Drafts                                      */
/* -------------------------------------------- */

function int(value, { min = 0, max = NUMBER_MAX, fallback = 0 } = {}) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function text(value, max) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function oneOf(value, list, fallback) {
    return list.includes(value) ? value : fallback;
}

/** A blank draft for a type. */
export function emptyDraft(type = "weapon") {
    return normalizeDraft({ type });
}

/**
 * The form's values, cleaned and clamped. Unknown fields are dropped; every field has a value, so
 * switching types keeps what was typed.
 */
export function normalizeDraft(raw = {}, { attachmentTypes = ["all", "weapon", "armour"], modifierTypes = ["all", "weapon", "armour"] } = {}) {
    const type = Object.hasOwn(MAKER_TYPES, raw.type) ? raw.type : "weapon";
    const seen = new Set();
    const properties = (Array.isArray(raw.properties) ? raw.properties : [])
        .filter(p => typeof p?.id === "string" && /^[A-Za-z0-9]{1,32}$/.test(p.id) && !seen.has(p.id) && seen.add(p.id))
        .slice(0, MAX_PROPERTIES)
        .map(p => ({ id: p.id, rank: int(p.rank, { min: 1, max: 99, fallback: 1 }) }));

    return {
        type,
        name: text(raw.name, NAME_MAX),
        img: cleanImagePath(raw.img) ?? "",
        description: text(raw.description, DESCRIPTION_MAX),
        price: int(raw.price),
        rarity: int(raw.rarity, { max: 20 }),
        restricted: raw.restricted === true || raw.restricted === "true" || raw.restricted === "on",
        encumbrance: int(raw.encumbrance, { max: 999 }),
        quantity: int(raw.quantity, { min: 1, max: 99999, fallback: 1 }),
        hardpoints: int(raw.hardpoints, { max: 99 }),
        skill: text(raw.skill, 60) || WEAPON_SKILLS[0],
        damage: int(raw.damage, { max: 999 }),
        crit: int(raw.crit, { max: 99 }),
        range: oneOf(raw.range, RANGES, "Short"),
        special: text(raw.special, SPECIAL_MAX),
        soak: int(raw.soak, { max: 99 }),
        defence: int(raw.defence, { max: 99 }),
        attachmentType: oneOf(raw.attachmentType, attachmentTypes, attachmentTypes[0] ?? "all"),
        modifierType: oneOf(raw.modifierType, modifierTypes, modifierTypes[0] ?? "all"),
        rank: int(raw.rank, { max: 99 }),
        activation: oneOf(raw.activation, ACTIVATIONS, "Passive"),
        ranked: raw.ranked === true || raw.ranked === "true" || raw.ranked === "on",
        tier: int(raw.tier, { min: 1, max: 5, fallback: 1 }),
        properties: MAKER_TYPES[type].properties ? properties : [],
        costs: normalizeCosts(raw.costs),
        pay: raw.pay === undefined ? true : raw.pay === true || raw.pay === "true" || raw.pay === "on",
        payer: typeof raw.payer === "string" && /^[A-Za-z0-9]{1,32}$/.test(raw.payer) ? raw.payer : ""
    };
}

/** Cost lines: {resource: "sheet" | "entry:<id>", amount}. Lines without an amount are kept while editing. */
export function normalizeCosts(raw) {
    return (Array.isArray(raw) ? raw : [])
        .filter(c => typeof c?.resource === "string" && (c.resource === SHEET_CREDITS || /^entry:[\w-]{1,64}$/.test(c.resource)))
        .slice(0, MAX_COSTS)
        .map(c => ({ resource: c.resource, amount: int(c.amount, { max: NUMBER_MAX }) }));
}

/**
 * What to pay: cost lines with an amount, the same resource added up. Pure.
 * @returns {{resource: string, amount: number}[]}
 */
export function costTotals(costs) {
    const totals = new Map();
    for (const { resource, amount } of normalizeCosts(costs)) {
        if (amount > 0) totals.set(resource, (totals.get(resource) ?? 0) + amount);
    }
    return [...totals].map(([resource, amount]) => ({ resource, amount }));
}

/**
 * Problems with paying `totals`: unknown resources, no character for credits, or not enough.
 * @param {object} available  {sheet: number|null (the payer's credits; null without a payer), entries: Map<id, {name, total}>}
 */
export function checkPayment(totals, { sheet = null, entries = new Map() } = {}) {
    const errors = [];
    for (const { resource, amount } of totals) {
        if (resource === SHEET_CREDITS) {
            if (sheet === null) errors.push("Choose the character who pays the credits.");
            else if (sheet < amount) errors.push(`Not enough credits: ${amount.toLocaleString()} needed, the character has ${sheet.toLocaleString()}.`);
            continue;
        }
        const entry = entries.get(resource.slice("entry:".length));
        if (!entry) errors.push("A cost uses a resource that no longer exists.");
        else if (entry.total < amount) errors.push(`Not enough ${entry.name}: ${amount.toLocaleString()} needed, ${entry.total.toLocaleString()} available.`);
    }
    return errors;
}

/** A suggested material cost from the GMs' percentage of the price (null when not set). Pure. */
export function suggestedCost(price, percent) {
    const p = Number(percent);
    if (!Number.isFinite(p) || p <= 0 || !(price > 0)) return null;
    return Math.ceil((price * p) / 100);
}

/**
 * The "Crafting cost" part of the item description. `lines` are {label, amount}; `paid` says whether
 * the cost was deducted when the item was made.
 */
export function costHtml(lines, { paid = false, payerName = "", maker = "" } = {}) {
    if (!lines.length) return "";
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const items = lines.map(line => `<li>${escape(line.amount.toLocaleString("en-US"))} ${escape(line.label)}</li>`).join("");
    const who = [maker && `made by ${escape(maker)}`, paid ? `paid${payerName ? ` (credits from ${escape(payerName)})` : ""}` : "not paid through the Item Maker"].filter(Boolean).join("; ");
    return `<h3>Crafting cost</h3><ul>${items}</ul><p><em>${who}.</em></p>`;
}

export function validateDraft(draft) {
    const errors = [];
    if (!draft.name) errors.push("The item needs a name.");
    return errors;
}

/** Plain text to the HTML of an item description: escaped paragraphs and line breaks. */
export function descriptionHtml(plain) {
    const escape = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    return String(plain ?? "")
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/**
 * Item data for `Item.create` from a normalized draft.
 * @param {object} draft            normalizeDraft output
 * @param {object} options
 * @param {Map<string, object>} [options.properties]  property items by id, as plain data (toObject)
 * @param {() => string} [options.newId]             id for each property copy
 * @param {string|null} [options.folder]
 * @param {object} [options.ownership]
 * @param {object} [options.flags]
 * @param {string} [options.cost]                    the "Crafting cost" HTML (costHtml), appended
 */
export function buildItemData(draft, { properties = new Map(), newId = () => "", folder = null, ownership = undefined, flags = {}, cost = "" } = {}) {
    const groups = new Set(MAKER_TYPES[draft.type].groups);
    const system = { description: descriptionHtml(draft.description) + cost };

    if (groups.has("basic")) {
        system.price = { value: draft.price };
        system.rarity = { value: draft.rarity, isrestricted: draft.restricted };
        system.encumbrance = { value: draft.encumbrance };
        system.quantity = { value: groups.has("quantity") ? draft.quantity : 1 };
    }
    if (groups.has("hardpoints")) system.hardpoints = { value: draft.hardpoints };
    if (groups.has("weapon")) {
        system.skill = { value: draft.skill };
        system.damage = { value: draft.damage };
        system.crit = { value: draft.crit };
        system.range = { value: draft.range };
        system.special = { value: draft.special };
        system.characteristic = { value: BRAWN_SKILLS.has(draft.skill.toLowerCase()) ? "Brawn" : "" };
    }
    if (groups.has("armour")) {
        system.soak = { value: draft.soak };
        system.defence = { value: draft.defence };
    }
    if (groups.has("attachment")) system.type = draft.attachmentType;
    if (groups.has("modifier")) {
        system.type = draft.modifierType;
        system.rank = draft.rank;
        system.rank_current = draft.rank;
    }
    if (groups.has("talent")) {
        system.activation = { value: draft.activation };
        system.ranks = { ranked: draft.ranked, current: 1, min: 0 };
        system.tier = draft.tier;
    }

    if (MAKER_TYPES[draft.type].properties) {
        system.itemmodifier = draft.properties
            .map(({ id, rank }) => {
                const source = properties.get(id);
                if (!source) return null;
                // Like dropping a property on an item: the copy keeps the property's _id (the system's
                // rank dialog finds it by _id) and gets its own id.
                const copy = structuredClone(source);
                copy.id = newId();
                copy.system = { ...copy.system, rank, rank_current: rank };
                return copy;
            })
            .filter(Boolean);
    }

    return {
        name: draft.name,
        type: draft.type,
        img: draft.img || defaultImage(draft.type),
        system,
        ...(folder ? { folder } : {}),
        ...(ownership ? { ownership } : {}),
        flags
    };
}

/** Item types that take a dropped property's Active Effects (as the system's item sheet does). */
export const EFFECT_TARGET_TYPES = new Set(["armour", "weapon", "itemattachment"]);

/* -------------------------------------------- */
/*  Similar items                               */
/* -------------------------------------------- */

function normalizeName(name) {
    return String(name ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function bigrams(value) {
    const s = ` ${value} `;
    const grams = new Map();
    for (let i = 0; i < s.length - 1; i++) {
        const gram = s.slice(i, i + 2);
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
    }
    return grams;
}

/** Shared letter pairs of two strings, 0..1 (Sørensen–Dice). */
function dice(x, y) {
    const gx = bigrams(x);
    const gy = bigrams(y);
    let overlap = 0;
    for (const [gram, count] of gx) overlap += Math.min(count, gy.get(gram) ?? 0);
    const total = [...gx.values()].reduce((s, n) => s + n, 0) + [...gy.values()].reduce((s, n) => s + n, 0);
    return total ? (2 * overlap) / total : 0;
}

/** Two words match when equal, one starts the other, or they are spelled nearly alike ("pistl"). */
function wordsMatch(w, v) {
    return v === w || (w.length > 2 && v.length > 2 && (v.startsWith(w) || w.startsWith(v))) || (w.length > 3 && v.length > 3 && dice(w, v) >= 0.6);
}

/** Similarity of two names, 0..1 (matching words count strongly, then shared letter pairs). */
export function nameSimilarity(a, b) {
    const x = normalizeName(a);
    const y = normalizeName(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const wordsX = x.split(" ");
    const wordsY = y.split(" ");
    const shared = wordsX.filter(w => wordsY.some(v => wordsMatch(w, v))).length;
    const wordScore = shared ? 0.5 + 0.4 * (shared / Math.max(wordsX.length, wordsY.length)) : 0;
    return Math.max(wordScore, dice(x, y));
}

/**
 * Items whose names look like `name`, best first. `items` are {id, name, type, ...}.
 * Needs at least two letters; items below `threshold` are left out.
 */
export function similarItems(name, items, { limit = 6, threshold = 0.45 } = {}) {
    if (normalizeName(name).replace(/ /g, "").length < 2) return [];
    return items
        .map(item => ({ item, score: nameSimilarity(name, item.name) }))
        .filter(entry => entry.score >= threshold)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
        .slice(0, limit)
        .map(entry => ({ ...entry.item, score: Math.round(entry.score * 100) / 100 }));
}

/** Property items matching a search (name contains every typed word), best first. */
export function searchProperties(query, properties, limit = 12) {
    const words = normalizeName(query).split(" ").filter(Boolean);
    return properties
        .filter(p => {
            const name = normalizeName(p.name);
            return words.every(w => name.includes(w));
        })
        .sort((a, b) => Number(normalizeName(b.name).startsWith(words[0] ?? "")) - Number(normalizeName(a.name).startsWith(words[0] ?? "")) || a.name.localeCompare(b.name))
        .slice(0, limit);
}
