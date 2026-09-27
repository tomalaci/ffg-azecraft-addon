/**
 * Dashboard config shape shared by squads (members, People of Note, default ledgers): defaults,
 * normalization and validation. Plus the per-Scene options: whether the dashboard shows on a Scene
 * and whether it fits the Scene into the frame when opened.
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

/** Whether the dashboard shows on a Scene: on every Scene unless hidden there, or only where enabled. */
export function isShownOnScene(flag, showOnAllScenes) {
    return showOnAllScenes ? flag?.enabled !== false : flag?.enabled === true;
}

function sceneFlag(scene) {
    return scene?.flags?.[MODULE_ID]?.[FLAG_KEY];
}

/** Per-Scene options: whether the dashboard shows there and whether the Scene fits into the frame on open. */
export function readSceneOptions(scene) {
    return {
        shown: isShownOnScene(sceneFlag(scene), game.settings.get(MODULE_ID, SETTINGS.showOnAllScenes)),
        fitOnOpen: sceneFlag(scene)?.fitOnOpen === true
    };
}

export function isDashboardEnabled(scene) {
    return Boolean(scene) && readSceneOptions(scene).shown;
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

function assertGM() {
    if (!game.user?.isGM) {
        throw new Error("Only a GM can change the mission dashboard configuration.");
    }
}

/**
 * Save a Scene's own dashboard options. Only this module's flag is written; the rest of the Scene is
 * untouched. Squad data from earlier builds (party, ledgers…) left in the flag is ignored.
 */
export async function saveSceneOptions(scene, { shown, fitOnOpen = false }) {
    assertGM();
    const base = `flags.${MODULE_ID}.${FLAG_KEY}`;
    return scene.update({
        [`${base}.enabled`]: Boolean(shown),
        [`${base}.fitOnOpen`]: Boolean(fitOnOpen),
        [`${base}.schemaVersion`]: SCHEMA_VERSION
    });
}

export async function setDashboardEnabled(scene, enabled) {
    assertGM();
    return scene.update({
        [`flags.${MODULE_ID}.${FLAG_KEY}.enabled`]: Boolean(enabled),
        [`flags.${MODULE_ID}.${FLAG_KEY}.schemaVersion`]: SCHEMA_VERSION
    });
}
