/**
 * starwarsffg (2.0.x, Genesys mode) Actor -> normalized, permission-filtered card view model.
 *
 * All knowledge of the system's Actor shape lives here. Verified against starwarsffg 2.0.3:
 * - actor.system.stats.{wounds,strain}.{value,max} are accumulated values and thresholds after
 *   prepareDerivedData (ActorFFG) and active effects, the same values the character sheet shows.
 * - actor.system.stats.soak.value and actor.system.stats.defence.{melee,ranged} are the sheet values.
 * - Species and career are embedded Items of type "species"/"career"; system.species.value and
 *   system.career.value are legacy text fields, used only as a fallback.
 * - Critical injuries are embedded Items of type "criticalinjury" with system.severity.
 * - Desire is the Genesys Motivation field system.motivation.desire (rich text, edited on the sheet's
 *   Basic Information tab); the card shows it as plain text and can write it back as paragraphs.
 */

import { DESIRE_MAX_LENGTH, FLAG_KEY, MODULE_ID, OWNERSHIP, PLACEHOLDER_ART } from "./constants.js";
import { findPower, normalizeConcentration } from "../powers/power-catalog.js";
import { effectChips } from "../effects/effect-core.js";

const CRITICAL_INJURY_TYPE = "criticalinjury";

/** Number or null; never turns a missing value into 0. */
export function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function formatNumber(value) {
    return value === null ? "—" : String(value);
}

function track(stat) {
    const value = toNumber(stat?.value);
    const threshold = toNumber(stat?.max);
    const known = value !== null && threshold !== null && threshold > 0;
    // The bar clamps to its track; the displayed numbers never do.
    const percent = known ? Math.min(100, Math.max(0, Math.round((value / threshold) * 100))) : 0;

    return {
        value,
        threshold,
        valueLabel: formatNumber(value),
        thresholdLabel: formatNumber(threshold),
        percent,
        // starwarsffg derives stats.woundsOverThreshold / strainOverThreshold as value - max.
        overThreshold: known && value > threshold
    };
}

function itemNames(actor, type) {
    return actor.items
        .filter(item => item.type === type)
        .map(item => item.name)
        .filter(Boolean);
}

function textFallback(field) {
    return typeof field?.value === "string" ? field.value.trim() : "";
}

export function readDashboardFlags(actor) {
    const flags = actor?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};

    return {
        fullArt: typeof flags.fullArt === "string" && flags.fullArt.trim() ? flags.fullArt.trim() : null
    };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", apos: "'", nbsp: " " };

/** Rich-text HTML to plain text with paragraph breaks. Pure (no DOM), for display only. */
export function htmlToText(html) {
    return String(html ?? "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#39|[a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** Plain text to simple paragraph HTML, escaping everything. Pure. */
export function textToHtml(text) {
    const escape = value => value.replace(/[&<>"']/g, c => `&${{ "&": "amp", "<": "lt", ">": "gt", "\"": "quot", "'": "#39" }[c]};`);
    return String(text ?? "")
        .trim()
        .split(/\n{2,}/)
        .filter(Boolean)
        .map(paragraph => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/** True when the HTML uses formatting that a plain-text edit would lose (anything but p/br). */
export function hasRichFormatting(html) {
    return /<(?!\/?(p|br)\b)[a-z]/i.test(String(html ?? ""));
}

/**
 * Actor types whose starwarsffg sheet shows the Motivations block (Strength, Flaw, Desire, Fear).
 * `system.motivation` is not part of their default data: it only exists once someone has typed
 * into one of those sheet fields, so a missing field means "empty", not "unsupported".
 */
const MOTIVATION_TYPES = new Set(["character", "nemesis", "rival"]);

/** The Genesys Desire motivation, or null when this Actor type has no motivations. */
export function readDesire(actor) {
    if (!MOTIVATION_TYPES.has(actor?.type)) return null;

    const desire = actor.system?.motivation?.desire;
    const html = typeof desire === "string" ? desire : "";
    return { html, text: htmlToText(html).slice(0, DESIRE_MAX_LENGTH), rich: hasRichFormatting(html) };
}

function permissionLevel(actor, user) {
    if (actor.testUserPermission(user, OWNERSHIP.OWNER)) return OWNERSHIP.OWNER;
    if (actor.testUserPermission(user, OWNERSHIP.OBSERVER)) return OWNERSHIP.OBSERVER;
    if (actor.testUserPermission(user, OWNERSHIP.LIMITED)) return OWNERSHIP.LIMITED;
    return OWNERSHIP.NONE;
}

/**
 * Build the card view model for one party slot.
 * @param {{id: string, actorUuid: string|null}} slot
 * @param {Actor|null} actor   Resolved world Actor, or null if missing
 * @param {User} user
 */
/** Concentration powers the character is keeping up (Biotics / Tech tabs), as labels. */
export function readConcentration(actor) {
    return normalizeConcentration(actor?.flags?.[MODULE_ID]?.concentration)
        .map(id => ({ id, label: findPower(id).label }));
}

export function buildCharacterCard(slot, actor, user) {
    const base = {
        slotId: slot.id,
        uuid: slot.actorUuid,
        isGM: Boolean(user?.isGM)
    };

    if (!slot.actorUuid) {
        return { ...base, availability: "empty" };
    }

    if (!actor) {
        return { ...base, availability: "missing" };
    }

    const level = permissionLevel(actor, user);

    if (level < OWNERSHIP.LIMITED) {
        return { ...base, availability: "restricted" };
    }

    const flags = readDashboardFlags(actor);
    const desire = readDesire(actor);
    const canEdit = Boolean(actor.canUserModify?.(user, "update"));
    const identity = {
        ...base,
        actorId: actor.id,
        name: actor.name,
        art: flags.fullArt ?? actor.img ?? PLACEHOLDER_ART,
        portrait: actor.img || PLACEHOLDER_ART,
        hasFullArt: Boolean(flags.fullArt),
        fullArtPath: flags.fullArt ?? "",
        canOpenSheet: true,
        canEditArt: canEdit
    };

    if (level < OWNERSHIP.OBSERVER) {
        return { ...identity, availability: "limited" };
    }

    const stats = actor.system?.stats;
    const species = itemNames(actor, "species").join(" / ") || textFallback(actor.system?.species);
    const career = itemNames(actor, "career").join(" / ") || textFallback(actor.system?.career);
    const criticalInjuries = actor.items
        .filter(item => item.type === CRITICAL_INJURY_TYPE)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map(item => ({
            id: item.id,
            uuid: item.uuid,
            name: item.name,
            severity: toNumber(item.system?.severity)
        }));

    const card = {
        ...identity,
        availability: stats ? "available" : "unsupported",
        subtitle: [species, career].filter(Boolean).join(" · "),
        species,
        career,
        wounds: track(stats?.wounds),
        strain: track(stats?.strain),
        soak: formatNumber(toNumber(stats?.soak?.value)),
        defense: {
            melee: formatNumber(toNumber(stats?.defence?.melee)),
            ranged: formatNumber(toNumber(stats?.defence?.ranged))
        },
        criticalInjuries,
        concentrating: readConcentration(actor),
        canEditConcentration: canEdit,
        // Statuses and quick effects; anyone may change them (the GM relays for non-owners).
        effects: effectChips(actor.effects?.contents ?? actor.effects ?? [], MODULE_ID),
        hasDesire: Boolean(desire),
        desire: desire?.text ?? "",
        desireRich: Boolean(desire?.rich),
        canEditDesire: canEdit && Boolean(desire)
    };

    return card;
}
