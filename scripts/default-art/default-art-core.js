/**
 * Pure rules for default actor art (no Foundry globals, so they are unit-tested).
 *
 * starwarsffg gives new actors Star Wars placeholder art (stormtrooper minion, imperial rival,
 * Vader nemesis...) from systems/starwarsffg/images/defaults/actors/<type>.png. The addon swaps
 * those placeholders for configurable art, by default the abstract Mass Effect style tokens in
 * assets/default-art/. Only placeholders are replaced: art someone picked is never touched.
 */

export const MODULE_ID = "ffg-azecraft-addon";

/** Actor types the system gives placeholder art, in the order the settings form lists them. */
export const ART_TYPES = ["minion", "rival", "nemesis", "character", "vehicle"];

export const TYPE_LABELS = {
    minion: "Minion",
    rival: "Rival",
    nemesis: "Nemesis",
    character: "Character",
    vehicle: "Vehicle"
};

/** Foundry's generic actor and token placeholder. */
export const MYSTERY_MAN = "icons/svg/mystery-man.svg";

export function systemDefaultArt(type) {
    return `systems/starwarsffg/images/defaults/actors/${type}.png`;
}

export function addonDefaultArt(type) {
    return `modules/${MODULE_ID}/assets/default-art/${type}.svg`;
}

/** The out-of-the-box configuration: the addon's art for both portrait and token. */
export function defaultArtConfig() {
    return Object.fromEntries(ART_TYPES.map(type => [type, { art: addonDefaultArt(type), token: "" }]));
}

function cleanPath(value) {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize a stored configuration: every type present, paths trimmed. An empty art path falls
 * back to the addon default; an empty token path means "same as the art".
 */
export function normalizeArtConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return Object.fromEntries(ART_TYPES.map(type => {
        const entry = source[type] && typeof source[type] === "object" ? source[type] : {};
        return [type, { art: cleanPath(entry.art) || addonDefaultArt(type), token: cleanPath(entry.token) }];
    }));
}

/** The portrait and token image to use for a type, or null for types without configured art. */
export function resolveArt(config, type) {
    if (!ART_TYPES.includes(type)) return null;
    const entry = normalizeArtConfig(config)[type];
    return { art: entry.art, token: entry.token || entry.art };
}

/**
 * Images that count as placeholders for a type: empty, Foundry's generic placeholder, the system's
 * Star Wars art, the addon's own art and, when the configuration changed, the art it had before.
 */
function placeholders(type, previous) {
    const known = new Set(["", MYSTERY_MAN, systemDefaultArt(type), addonDefaultArt(type)]);
    const before = previous ? resolveArt(previous, type) : null;
    if (before) {
        known.add(before.art);
        known.add(before.token);
    }
    return known;
}

/** True for a portrait the system, Foundry or this addon filled in rather than someone choosing it. */
export function isPlaceholderArt(type, src, previous = null) {
    return placeholders(type, previous).has(cleanPath(src));
}

/**
 * The update that swaps placeholder art for configured art, or null when nothing changes.
 * The portrait and token are judged separately, except that an empty or generic token (a new
 * actor's) is only replaced along with the portrait, so it never overrides a chosen portrait.
 *
 * @param {{type: string, img?: string, token?: string}} actor  Current portrait and prototype token image
 * @param {object} config    The default art configuration to apply
 * @param {object} [previous]  The configuration before a change, whose art also counts as placeholder
 * @returns {{img?: string, token?: string} | null}
 */
export function placeholderUpdate(actor, config, previous = null) {
    const art = resolveArt(config, actor?.type);
    if (!art) return null;

    const known = placeholders(actor.type, previous);
    const img = cleanPath(actor.img);
    const token = cleanPath(actor.token);
    const replaceArt = known.has(img);
    const replaceToken = !token || token === MYSTERY_MAN ? replaceArt : known.has(token);

    const update = {};
    if (replaceArt && img !== art.art) update.img = art.art;
    if (replaceToken && token !== art.token) update.token = art.token;
    return Object.keys(update).length ? update : null;
}

/** A placed token's new image, or null when it is not a placeholder (or already up to date). */
export function placedTokenUpdate(type, src, config, previous = null) {
    const art = resolveArt(config, type);
    const path = cleanPath(src);
    if (!art || !path || path === art.token || !placeholders(type, previous).has(path)) return null;
    return art.token;
}
