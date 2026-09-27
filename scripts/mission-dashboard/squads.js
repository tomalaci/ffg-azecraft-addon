/**
 * Squads: named groups a GM defines (members for the card rail, People of Note, and a default
 * ledger per mission tab). One squad is active world-wide and every Scene shows it.
 *
 * Stored in world settings (`squads`, `activeSquadId`). Each viewer's last active ledger per squad
 * and tab is a client setting. A squad keeps a revision number per tab; a remembered choice only
 * counts while its revision matches, so changing a squad's default ledger, or activating a squad,
 * sends everyone back to the default without writing to anyone else's storage.
 */

import { MISSION_PANELS, MODULE_ID, SCHEMA_VERSION, SETTINGS } from "./constants.js";
import { normalizeDashboardConfig, validateDashboardConfig } from "./dashboard-state.js";

const TABS = MISSION_PANELS.map(panel => panel.key);

/* -------------------------------------------- */
/*  Pure logic                                  */
/* -------------------------------------------- */

function cleanId(value) {
    return typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : null;
}

export function normalizeSquad(raw, index = 0) {
    const config = normalizeDashboardConfig(raw);
    const revisions = raw?.revisions ?? {};

    return {
        id: cleanId(raw?.id) ?? `squad-${index + 1}`,
        name: (typeof raw?.name === "string" && raw.name.trim().slice(0, 80)) || `Squad ${index + 1}`,
        party: config.party,
        people: config.people,
        ledgers: config.ledgers,
        revisions: Object.fromEntries(TABS.map(tab => [tab, Number.isInteger(revisions[tab]) && revisions[tab] >= 0 ? revisions[tab] : 0]))
    };
}

export function normalizeSquads(raw) {
    const list = Array.isArray(raw?.squads) ? raw.squads : [];
    const seen = new Set();

    return list.map(normalizeSquad).map((squad, index) => {
        while (seen.has(squad.id)) squad.id = `${squad.id}-${index + 1}`;
        seen.add(squad.id);
        return squad;
    });
}

/** The active squad: the chosen one, else the first. */
export function pickActiveSquad(squads, activeId) {
    return squads.find(squad => squad.id === activeId) ?? squads[0] ?? null;
}

/** The viewer's remembered ledger for a squad's tab, if it is still valid for the squad's revision. */
export function rememberedLedger(choices, squad, tab) {
    const choice = choices?.[squad?.id]?.[tab];
    return choice && choice.revision === squad.revisions[tab] && typeof choice.uuid === "string" ? choice.uuid : null;
}

/** Tabs whose default ledger differs between two versions of a squad. */
export function changedLedgerTabs(before, after) {
    return TABS.filter(tab => (before?.ledgers?.[tab] ?? null) !== (after?.ledgers?.[tab] ?? null));
}

export function bumpRevisions(squad, tabs = TABS) {
    return { ...squad, revisions: { ...squad.revisions, ...Object.fromEntries(tabs.map(tab => [tab, (squad.revisions[tab] ?? 0) + 1])) } };
}

export function validateSquads(squads) {
    const errors = [];
    if (!squads.length) errors.push("There must be at least one squad.");

    for (const squad of squads) {
        for (const error of validateDashboardConfig(squad).errors) errors.push(`${squad.name}: ${error}`);
    }

    return errors;
}

/** Stable JSON of what a GM edits (revisions excluded), to detect concurrent edits. */
export function squadsFingerprint(squads) {
    return JSON.stringify(normalizeSquads({ squads }).map(({ revisions, ...rest }) => rest));
}

/* -------------------------------------------- */
/*  Foundry runtime                             */
/* -------------------------------------------- */

export class SquadConflictError extends Error {}

function assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can manage squads.");
}

export function readSquads() {
    return normalizeSquads(game.settings.get(MODULE_ID, SETTINGS.squads));
}

export function readActiveSquad() {
    return pickActiveSquad(readSquads(), game.settings.get(MODULE_ID, SETTINGS.activeSquad));
}

async function writeSquads(squads) {
    return game.settings.set(MODULE_ID, SETTINGS.squads, { schemaVersion: SCHEMA_VERSION, squads });
}

/**
 * Save all squads from the configuration form. Default ledgers that changed bump that tab's
 * revision, so everyone returns to the new default. Refuses if the stored squads changed since
 * `expectedFingerprint` was taken.
 */
export async function saveSquads(squads, { expectedFingerprint = null } = {}) {
    assertGM();

    const stored = readSquads();
    if (expectedFingerprint !== null && squadsFingerprint(stored) !== expectedFingerprint) {
        throw new SquadConflictError("The squads were changed by someone else while you were editing them.");
    }

    const next = normalizeSquads({ squads }).map(squad => {
        const before = stored.find(s => s.id === squad.id);
        const base = before ? { ...squad, revisions: before.revisions } : squad;
        return bumpRevisions(base, before ? changedLedgerTabs(before, squad) : []);
    });

    const errors = validateSquads(next);
    if (errors.length) throw new Error(errors.join(" "));

    await writeSquads(next);

    // Keep a valid active squad.
    const activeId = game.settings.get(MODULE_ID, SETTINGS.activeSquad);
    if (!next.some(squad => squad.id === activeId)) await game.settings.set(MODULE_ID, SETTINGS.activeSquad, next[0].id);
}

/** Make a squad active for everyone; all its tabs return to their default ledgers. */
export async function setActiveSquad(squadId) {
    assertGM();

    const squads = readSquads();
    if (!squads.some(squad => squad.id === squadId)) throw new Error("That squad no longer exists.");

    await writeSquads(squads.map(squad => (squad.id === squadId ? bumpRevisions(squad) : squad)));
    await game.settings.set(MODULE_ID, SETTINGS.activeSquad, squadId);
}

/** Set a squad's default ledger for one tab; everyone's view of that tab returns to it. */
export async function setSquadDefaultLedger(squadId, tab, ledgerUuid) {
    assertGM();
    if (!TABS.includes(tab)) throw new Error(`Unknown mission tab: ${tab}`);

    const squads = readSquads();
    if (!squads.some(squad => squad.id === squadId)) throw new Error("That squad no longer exists.");

    await writeSquads(squads.map(squad => (squad.id === squadId
        ? bumpRevisions({ ...squad, ledgers: { ...squad.ledgers, [tab]: ledgerUuid ?? null } }, [tab])
        : squad)));
}

/** Remember this viewer's ledger for a squad's tab (client setting, this browser only). */
export async function rememberLedgerChoice(squad, tab, ledgerUuid) {
    const choices = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.ledgerChoices) ?? {});
    choices[squad.id] ??= {};

    if (ledgerUuid) choices[squad.id][tab] = { uuid: ledgerUuid, revision: squad.revisions[tab] };
    else delete choices[squad.id][tab];

    await game.settings.set(MODULE_ID, SETTINGS.ledgerChoices, choices);
}

export function newSquadId() {
    return `squad-${foundry.utils.randomID(8)}`;
}

/** A new, empty squad (six empty member slots, no default ledgers). */
export function defaultSquad(name) {
    return normalizeSquad({ id: newSquadId(), name });
}

/**
 * One-time setup (active GM only): if no squads exist yet, create "Main Squad" from the earlier
 * campaign dashboard (members, People of Note, default ledgers) and make it active.
 */
export async function ensureSquads() {
    assertGM();
    if (readSquads().length) return;

    const campaign = game.settings.get(MODULE_ID, SETTINGS.campaignDashboard) ?? {};
    const squad = normalizeSquad({ ...campaign, id: newSquadId(), name: "Main Squad" });

    await writeSquads([squad]);
    await game.settings.set(MODULE_ID, SETTINGS.activeSquad, squad.id);
}
