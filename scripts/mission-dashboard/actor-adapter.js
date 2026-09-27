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
 */

import { DESIRE_MAX_LENGTH, FLAG_KEY, MODULE_ID, OWNERSHIP, PLACEHOLDER_ART } from "./constants.js";

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
        desire: typeof flags.desire === "string" ? flags.desire.slice(0, DESIRE_MAX_LENGTH) : "",
        fullArt: typeof flags.fullArt === "string" && flags.fullArt.trim() ? flags.fullArt.trim() : null
    };
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
        desire: flags.desire,
        canEditDesire: canEdit
    };

    return card;
}
