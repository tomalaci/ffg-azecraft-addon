/**
 * Minimal stand-ins for Foundry documents, shaped after starwarsffg 2.0.3 actors in the local world
 * (names, ids and art are invented).
 */

export const LEVELS = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };

export function makeUser({ id = "user1", isGM = false } = {}) {
    return { id, isGM, name: isGM ? "GM" : "Player" };
}

/** A document whose permission for non-GM users is a fixed level. */
function permissions(level) {
    return {
        testUserPermission(user, permission) {
            const target = typeof permission === "string" ? LEVELS[permission] : permission;
            return user.isGM || level >= target;
        },
        canUserModify(user) {
            return user.isGM || level >= LEVELS.OWNER;
        }
    };
}

export function makeItem({ id, type, name, severity, sort = 0 }) {
    return { id, uuid: `Actor.a1.Item.${id}`, type, name, sort, system: severity === undefined ? {} : { severity } };
}

export function makeActor({ level = LEVELS.OBSERVER, stats, flags = {}, items, img = "worlds/x/pc.png", system = {} } = {}) {
    return {
        id: "a1",
        uuid: "Actor.a1",
        type: "character",
        name: "Test Operative",
        img,
        flags,
        items: items ?? [
            makeItem({ id: "sp", type: "species", name: "Turian" }),
            makeItem({ id: "ca", type: "career", name: "Pilot" }),
            makeItem({ id: "ta", type: "talent", name: "Grit" })
        ],
        system: {
            species: { value: "", type: "String" },
            career: { value: "", type: "String" },
            stats: stats ?? {
                wounds: { value: 4, min: 0, max: 12, adjusted: 0 },
                strain: { value: 0, min: 0, max: 11, adjusted: 0 },
                soak: { value: 2, adjusted: 0 },
                defence: { ranged: 1, melee: 0, adjusted: 0 },
                woundsOverThreshold: -8,
                strainOverThreshold: -11
            },
            ...system
        },
        ...permissions(level)
    };
}

export function makePage({ type = "text", level = LEVELS.OBSERVER, entryLevel = LEVELS.OBSERVER, name = "Summary" } = {}) {
    const entry = { name: "Mission: Test", uuid: "JournalEntry.j1", ...permissions(entryLevel) };
    return {
        documentName: "JournalEntryPage",
        uuid: "JournalEntry.j1.JournalEntryPage.p1",
        type,
        name,
        parent: entry,
        ...permissions(level)
    };
}
