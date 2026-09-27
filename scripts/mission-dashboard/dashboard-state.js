/**
 * Dashboard configuration: defaults, normalization, validation, resolution and narrow writes.
 *
 * Two stores hold the same config shape (squad, mission panels, People of Note):
 * - the campaign dashboard, a world setting shared by every Scene that does not have its own; and
 * - a Scene's own config, in the Scene flag, for one-off missions.
 * The Scene flag also says whether the dashboard shows on that Scene at all.
 *
 * Reads normalize in memory only; nothing here writes unless a GM explicitly saves.
 */

import {
    DEFAULT_SLOT_COUNT,
    FLAG_KEY,
    MAX_SLOT_COUNT,
    MISSION_PANELS,
    MODULE_ID,
    PEOPLE_NOTE_MAX_LENGTH,
    PEOPLE_TEXT_MAX_LENGTH,
    SCHEMA_VERSION,
    SETTINGS
} from "./constants.js";

function cleanString(value, maxLength) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
}

function cleanUuid(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanId(value) {
    return typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : null;
}

/** Deterministic slot ids for a never-saved config, so repeated reads agree without writing. */
export function defaultParty(count = DEFAULT_SLOT_COUNT) {
    return Array.from({ length: count }, (_, index) => ({ id: `slot-${index + 1}`, actorUuid: null }));
}

function emptyLedgers() {
    return Object.fromEntries(MISSION_PANELS.map(panel => [panel.key, null]));
}

export function defaultDashboardConfig() {
    return {
        schemaVersion: SCHEMA_VERSION,
        enabled: false,
        party: defaultParty(),
        // Default ledger (JournalEntry UUID) per tab; null means "the most recent ledger".
        ledgers: emptyLedgers(),
        people: []
    };
}

/**
 * Normalize raw flag data into the current schema without mutating the input.
 * @param {object|undefined} raw  scene.flags[MODULE_ID].dashboard
 */
export function normalizeDashboardConfig(raw) {
    const config = defaultDashboardConfig();

    if (!raw || typeof raw !== "object") {
        return config;
    }

    config.enabled = raw.enabled === true;

    if (Array.isArray(raw.party)) {
        const seen = new Set();
        config.party = raw.party
            .slice(0, MAX_SLOT_COUNT)
            .map((slot, index) => {
                let id = cleanId(slot?.id) ?? `slot-${index + 1}`;

                while (seen.has(id)) {
                    id = `${id}-${index + 1}`;
                }

                seen.add(id);
                return { id, actorUuid: cleanUuid(slot?.actorUuid) };
            });
    }

    const ledgers = raw.ledgers ?? {};
    config.ledgers = Object.fromEntries(MISSION_PANELS.map(({ key }) => [key, cleanUuid(ledgers[key])]));

    if (Array.isArray(raw.people)) {
        config.people = raw.people
            .map((person, index) => normalizePerson(person, index))
            .filter(Boolean);
    }

    return config;
}

export function normalizePerson(person, index = 0) {
    if (!person || typeof person !== "object") {
        return null;
    }

    return {
        id: cleanId(person.id) ?? `person-${index + 1}`,
        actorUuid: cleanUuid(person.actorUuid),
        role: cleanString(person.role, PEOPLE_TEXT_MAX_LENGTH),
        status: cleanString(person.status, PEOPLE_TEXT_MAX_LENGTH),
        relationship: cleanString(person.relationship, PEOPLE_TEXT_MAX_LENGTH),
        note: cleanString(person.note, PEOPLE_NOTE_MAX_LENGTH)
    };
}

/**
 * Does a Scene flag hold the Scene's own config rather than deferring to the campaign dashboard?
 * Scenes configured before the campaign dashboard existed (no `source`) kept everything on the Scene.
 */
export function sceneUsesOwnConfig(flag) {
    if (!flag || typeof flag !== "object") return false;
    if (flag.source === "scene") return true;
    if (flag.source === "campaign") return false;
    return Array.isArray(flag.party) || Boolean(flag.mission) || Boolean(flag.ledgers);
}

/** Whether the dashboard shows on a Scene: on every Scene unless hidden there, or only where enabled. */
export function isShownOnScene(flag, showOnAllScenes) {
    return showOnAllScenes ? flag?.enabled !== false : flag?.enabled === true;
}

/**
 * Resolve what a Scene shows. Pure.
 * @param {object|undefined} flag         scene.flags[MODULE_ID].dashboard
 * @param {{showOnAllScenes: boolean, campaign: object}} world
 * @returns {{shown: boolean, source: "scene"|"campaign", config: object}}
 */
export function resolveDashboard(flag, { showOnAllScenes, campaign }) {
    const source = sceneUsesOwnConfig(flag) ? "scene" : "campaign";

    return {
        shown: isShownOnScene(flag, showOnAllScenes),
        source,
        config: normalizeDashboardConfig(source === "scene" ? flag : campaign)
    };
}

function sceneFlag(scene) {
    return scene?.flags?.[MODULE_ID]?.[FLAG_KEY];
}

function campaignRaw() {
    return game.settings.get(MODULE_ID, SETTINGS.campaignDashboard) ?? {};
}

/** The Scene's own config (normalized), whether or not the Scene currently uses it. */
export function readDashboardConfig(scene) {
    return normalizeDashboardConfig(sceneFlag(scene));
}

export function readCampaignConfig() {
    return normalizeDashboardConfig(campaignRaw());
}

export function resolveSceneDashboard(scene) {
    return resolveDashboard(sceneFlag(scene), {
        showOnAllScenes: game.settings.get(MODULE_ID, SETTINGS.showOnAllScenes),
        campaign: campaignRaw()
    });
}

export function isDashboardEnabled(scene) {
    return Boolean(scene) && resolveSceneDashboard(scene).shown;
}

/** Every document UUID the config refers to, grouped by purpose, for hook relevance checks. */
export function referencedUuids(config) {
    return {
        actors: new Set(config.party.map(slot => slot.actorUuid).filter(Boolean)),
        people: new Set(config.people.map(person => person.actorUuid).filter(Boolean)),
        ledgers: new Set(Object.values(config.ledgers).filter(Boolean))
    };
}

/**
 * Validate a config before saving.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateDashboardConfig(config) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(config.party) || config.party.length < 1) {
        errors.push("The party needs at least one slot.");
    } else if (config.party.length > MAX_SLOT_COUNT) {
        errors.push(`The party can have at most ${MAX_SLOT_COUNT} slots.`);
    }

    const ids = new Set();
    const actorSlots = new Map();

    for (const [index, slot] of (config.party ?? []).entries()) {
        if (!cleanId(slot.id) || ids.has(slot.id)) {
            errors.push(`Slot ${index + 1} has a missing or duplicate id.`);
        }

        ids.add(slot.id);

        if (slot.actorUuid) {
            if (actorSlots.has(slot.actorUuid)) {
                errors.push(`Slots ${actorSlots.get(slot.actorUuid) + 1} and ${index + 1} are assigned the same Actor.`);
            } else {
                actorSlots.set(slot.actorUuid, index);
            }
        }
    }

    const personIds = new Set();

    for (const [index, person] of (config.people ?? []).entries()) {
        if (!person.actorUuid) {
            errors.push(`Person of note ${index + 1} has no Actor selected.`);
        }

        if (!cleanId(person.id) || personIds.has(person.id)) {
            errors.push(`Person of note ${index + 1} has a missing or duplicate id.`);
        }

        personIds.add(person.id);
    }

    const peopleActors = (config.people ?? []).map(person => person.actorUuid).filter(Boolean);

    if (new Set(peopleActors).size !== peopleActors.length) {
        warnings.push("The same Actor appears more than once in People of Note.");
    }

    return { errors, warnings };
}

/** Stable JSON used to detect whether the stored config changed while a form was open. */
export function configFingerprint(config) {
    return JSON.stringify(normalizeDashboardConfig(config));
}

/* -------------------------------------------- */
/*  Writes (Foundry runtime only)               */
/* -------------------------------------------- */

export class DashboardConflictError extends Error {}

function assertGM() {
    if (!game.user?.isGM) {
        throw new Error("Only a GM can change the mission dashboard configuration.");
    }
}

function validateOrThrow(config) {
    const normalized = normalizeDashboardConfig(config);
    const { errors } = validateDashboardConfig(normalized);
    if (errors.length) throw new Error(errors.join(" "));
    return normalized;
}

/**
 * Save a Scene's dashboard settings. With `source: "scene"` the given config becomes the Scene's own;
 * with `source: "campaign"` only visibility and source are written, and any earlier Scene config is
 * kept so the GM can switch back. Refuses if the Scene's own config changed since `expectedFingerprint`.
 * Only this module's flag is written; the rest of the Scene is untouched.
 */
export async function saveSceneDashboard(scene, { shown, source, config = null, expectedFingerprint = null }) {
    assertGM();

    const base = `flags.${MODULE_ID}.${FLAG_KEY}`;
    const update = {
        [`${base}.enabled`]: Boolean(shown),
        [`${base}.source`]: source === "scene" ? "scene" : "campaign",
        [`${base}.schemaVersion`]: SCHEMA_VERSION
    };

    if (source === "scene") {
        const normalized = validateOrThrow(config);

        if (expectedFingerprint !== null && configFingerprint(readDashboardConfig(scene)) !== expectedFingerprint) {
            throw new DashboardConflictError("This Scene's dashboard was changed by someone else while you were editing it.");
        }

        Object.assign(update, {
            [`${base}.party`]: normalized.party,
            [`${base}.ledgers`]: normalized.ledgers,
            [`${base}.people`]: normalized.people
        });

        // Flag updates merge objects, so drop the superseded page-list key explicitly.
        if (sceneFlag(scene)?.mission) update[`${base}.-=mission`] = null;
    }

    return scene.update(update);
}

/** Save the campaign dashboard shared by every Scene without its own config. */
export async function saveCampaignConfig(config, { expectedFingerprint = null } = {}) {
    assertGM();

    const normalized = validateOrThrow(config);

    if (expectedFingerprint !== null && configFingerprint(campaignRaw()) !== expectedFingerprint) {
        throw new DashboardConflictError("The campaign dashboard was changed by someone else while you were editing it.");
    }

    const { enabled, ...stored } = normalized;
    return game.settings.set(MODULE_ID, SETTINGS.campaignDashboard, stored);
}

/**
 * Set a tab's default ledger in whichever store the Scene uses (its own config or the campaign
 * dashboard). Reads the current stored state, so other config fields are not overwritten.
 */
export async function setDefaultLedger(scene, panelKey, ledgerUuid) {
    assertGM();
    if (!MISSION_PANELS.some(panel => panel.key === panelKey)) throw new Error(`Unknown mission tab: ${panelKey}`);

    if (resolveSceneDashboard(scene).source === "scene") {
        return scene.update({ [`flags.${MODULE_ID}.${FLAG_KEY}.ledgers.${panelKey}`]: ledgerUuid ?? null });
    }

    const campaign = foundry.utils.deepClone(campaignRaw());
    delete campaign.mission;
    campaign.ledgers = { ...normalizeDashboardConfig(campaign).ledgers, [panelKey]: ledgerUuid ?? null };
    return game.settings.set(MODULE_ID, SETTINGS.campaignDashboard, campaign);
}

export async function setDashboardEnabled(scene, enabled) {
    assertGM();
    return scene.update({
        [`flags.${MODULE_ID}.${FLAG_KEY}.enabled`]: Boolean(enabled),
        [`flags.${MODULE_ID}.${FLAG_KEY}.schemaVersion`]: SCHEMA_VERSION
    });
}
