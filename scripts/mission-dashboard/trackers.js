/**
 * Campaign trackers: Reputation (Fame + factions) and Resources (Credits + raw materials).
 *
 * Storage per tracker: one JournalEntry in "Mission Dashboard › Trackers", referenced by a world
 * setting. Entry definitions (factions / resources) live in the Journal's flags. Every adjustment is
 * its own JournalEntryPage with structured flags, so two GMs adjusting at the same time create two
 * pages instead of overwriting one shared total. Totals are always derived by summing adjustments.
 * Ranges, caps and mechanical effects are deliberately not modelled.
 */

import { MODULE_ID, OWNERSHIP, REASON_MAX_LENGTH, SCHEMA_VERSION, SETTINGS } from "./constants.js";
import { ensureLedgerFolders } from "./ledgers.js";

export const LEDGER_FLAG = "ledger";
export const ADJUSTMENT_FLAG = "adjustment";
export const FAME_TARGET = Object.freeze({ kind: "fame", id: "fame" });
export const FAME_LABEL = "Fame";

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const defaults = names => names.map(name => ({ id: slug(name), name, archived: false }));

/** Tracker definitions. Default entries get stable ids derived from their names. */
export const TRACKERS = {
    reputation: {
        key: "reputation",
        title: "Reputation",
        setting: SETTINGS.ledger,
        hasFame: true,
        entryNoun: "faction",
        entriesLabel: "Faction reputation",
        icon: "fa-solid fa-ranking-star",
        defaults: defaults([
            "Systems Alliance", "Citadel Council", "Citadel Security (C-Sec)", "Asari Republics",
            "Turian Hierarchy", "Salarian Union", "Krogan Clans", "Quarian Migrant Fleet", "Volus Protectorate",
            "Batarian Hegemony", "Cerberus", "Shadow Broker", "Terminus Systems", "Blue Suns", "Eclipse",
            "Blood Pack", "Geth"
        ])
    },
    resources: {
        key: "resources",
        title: "Resources",
        setting: SETTINGS.resourcesLedger,
        hasFame: false,
        entryNoun: "resource",
        entriesLabel: "Resources",
        icon: "fa-solid fa-coins",
        defaults: defaults([
            "Credits", "Element Zero", "Platinum", "Palladium", "Iridium", "Aluminum", "Titanium", "Iron",
            "Copper", "Nickel", "Lithium", "Omni-gel"
        ])
    }
};

/* -------------------------------------------- */
/*  Pure logic                                  */
/* -------------------------------------------- */

/** Tracker flag data; `factions` is the pre-Resources name of `entries`. */
export function normalizeTrackerData(raw, kind = "reputation") {
    const entries = Array.isArray(raw?.entries) ? raw.entries : Array.isArray(raw?.factions) ? raw.factions : [];
    const seen = new Set();

    return {
        schemaVersion: SCHEMA_VERSION,
        kind: raw?.kind ?? kind,
        entries: entries
            .filter(e => typeof e?.id === "string" && e.id && !seen.has(e.id) && seen.add(e.id))
            .map(e => ({ id: e.id, name: String(e.name ?? e.id).trim() || e.id, archived: e.archived === true }))
    };
}

/** Adjustment flag data. `faction` targets (older pages) are read as entries. */
export function normalizeAdjustment(raw) {
    if (!raw || typeof raw !== "object") return null;

    const delta = Number(raw.delta);
    const kind = raw.target?.kind;
    const id = raw.target?.id;

    if (!Number.isInteger(delta) || delta === 0) return null;
    if (kind !== "fame" && kind !== "faction" && kind !== "entry") return null;
    if (kind !== "fame" && (typeof id !== "string" || !id)) return null;

    return {
        eventId: String(raw.eventId ?? ""),
        target: kind === "fame" ? { ...FAME_TARGET } : { kind: "entry", id },
        delta,
        reason: String(raw.reason ?? ""),
        authorUserId: raw.authorUserId ?? null,
        createdAt: raw.createdAt ?? null,
        sessionLabel: raw.sessionLabel || null,
        sceneUuid: raw.sceneUuid || null,
        correctsEventId: raw.correctsEventId || null
    };
}

export function targetKey(target) {
    return target.kind === "fame" ? "fame" : `entry:${target.id}`;
}

/**
 * Derive totals and history. Unknown entry ids (e.g. from a deleted definition) still count toward
 * a visible "unknown" row rather than silently vanishing.
 */
export function computeStanding(trackerData, adjustments, { entryNoun = "faction" } = {}) {
    const tracker = normalizeTrackerData(trackerData);
    const totals = new Map([["fame", 0]]);
    const events = adjustments.map(normalizeAdjustment).filter(Boolean);

    for (const entry of tracker.entries) totals.set(`entry:${entry.id}`, 0);

    for (const event of events) {
        const key = targetKey(event.target);
        totals.set(key, (totals.get(key) ?? 0) + event.delta);
    }

    const known = new Set(tracker.entries.map(e => e.id));
    const entries = tracker.entries.map(e => ({ ...e, total: totals.get(`entry:${e.id}`) }));

    for (const event of events) {
        if (event.target.kind === "entry" && !known.has(event.target.id)) {
            known.add(event.target.id);
            entries.push({ id: event.target.id, name: `Unknown ${entryNoun} (${event.target.id})`, archived: true, unknown: true, total: totals.get(targetKey(event.target)) });
        }
    }

    const names = new Map(entries.map(e => [e.id, e.name]));
    const corrected = new Set(events.map(e => e.correctsEventId).filter(Boolean));
    const history = events
        .map(event => ({
            ...event,
            targetLabel: event.target.kind === "fame" ? FAME_LABEL : names.get(event.target.id),
            corrected: corrected.has(event.eventId)
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return { fame: totals.get("fame"), entries, history };
}

/** Validate a proposed adjustment. Returns a list of human-readable errors. */
export function validateAdjustment({ target, delta, reason, correctsEventId = null }, trackerData, { hasFame = true, entryNoun = "faction" } = {}) {
    const errors = [];
    const tracker = normalizeTrackerData(trackerData);

    if (!Number.isInteger(delta) || delta === 0) {
        errors.push("The adjustment must be a whole number other than zero.");
    }

    if (typeof reason !== "string" || !reason.trim()) {
        errors.push("A reason is required.");
    } else if (reason.trim().length > REASON_MAX_LENGTH) {
        errors.push(`The reason can be at most ${REASON_MAX_LENGTH} characters.`);
    }

    if (target?.kind === "entry" || target?.kind === "faction") {
        const entry = tracker.entries.find(e => e.id === target.id);
        if (!entry) errors.push(`Unknown ${entryNoun}.`);
        else if (entry.archived && !correctsEventId) errors.push(`This ${entryNoun} is archived; restore it before adjusting.`);
    } else if (!(hasFame && target?.kind === "fame")) {
        errors.push(hasFame ? `Choose Fame or a ${entryNoun}.` : `Choose a ${entryNoun}.`);
    }

    return errors;
}

function signed(delta) {
    const amount = Math.abs(delta).toLocaleString();
    return delta > 0 ? `+${amount}` : `−${amount}`;
}

/* -------------------------------------------- */
/*  Foundry runtime                             */
/* -------------------------------------------- */

function definition(kind) {
    const tracker = TRACKERS[kind];
    if (!tracker) throw new Error(`Unknown tracker: ${kind}`);
    return tracker;
}

function assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can change campaign trackers.");
}

export function getTrackerUuid(kind) {
    return game.settings.get(MODULE_ID, definition(kind).setting) || null;
}

/** The configured tracker Journal, if it exists. */
export function getTracker(kind) {
    const uuid = getTrackerUuid(kind);
    if (!uuid) return null;

    const entry = foundry.utils.fromUuidSync(uuid, { strict: false });
    return entry?.documentName === "JournalEntry" ? entry : null;
}

/** The tracker kind a Journal holds, if any. Pre-Resources ledgers had no kind: reputation. */
export function trackerKind(entry) {
    const data = entry?.flags?.[MODULE_ID]?.[LEDGER_FLAG];
    return data ? data.kind ?? "reputation" : null;
}

export function findTrackerCandidates(kind) {
    return game.journal.filter(entry => trackerKind(entry) === kind);
}

/** View model for a tracker, filtered by what the current user can read. */
export function buildStanding(kind) {
    const tracker = definition(kind);
    const uuid = getTrackerUuid(kind);
    const entry = getTracker(kind);

    if (!uuid) return { state: "unconfigured", tracker };
    if (!entry) return { state: "missing", tracker };
    if (!entry.testUserPermission(game.user, OWNERSHIP.OBSERVER)) return { state: "restricted", tracker };

    const adjustments = entry.pages
        .filter(page => page.testUserPermission(game.user, OWNERSHIP.OBSERVER))
        .map(page => page.flags?.[MODULE_ID]?.[ADJUSTMENT_FLAG])
        .filter(Boolean);
    const standing = computeStanding(entry.flags[MODULE_ID][LEDGER_FLAG], adjustments, tracker);

    for (const event of standing.history) {
        event.authorName = game.users.get(event.authorUserId)?.name ?? "Unknown user";
    }

    return { state: "ready", tracker, entry, ...standing };
}

/** Create a tracker Journal in "Mission Dashboard › Trackers", pre-filled with its default entries. */
export async function createTracker(kind) {
    assertGM();
    const tracker = definition(kind);
    const folders = await ensureLedgerFolders();

    const entry = await JournalEntry.implementation.create({
        name: tracker.title,
        folder: folders.trackers.id,
        ownership: { default: OWNERSHIP.OBSERVER },
        flags: { [MODULE_ID]: { [LEDGER_FLAG]: { schemaVersion: SCHEMA_VERSION, kind, entries: tracker.defaults.map(e => ({ ...e })) } } }
    });

    await game.settings.set(MODULE_ID, tracker.setting, entry.uuid);
    return entry;
}

export async function selectTracker(kind, uuid) {
    assertGM();
    await game.settings.set(MODULE_ID, definition(kind).setting, uuid ?? "");
}

/**
 * First run (active GM only): create any tracker that was never set up, and move existing tracker
 * Journals into the Trackers folder. A configured tracker that was deleted is not silently
 * recreated; the tracker window offers to create or select one.
 */
export async function ensureTrackers() {
    assertGM();
    const folders = await ensureLedgerFolders();

    for (const kind of Object.keys(TRACKERS)) {
        const entry = getTracker(kind);
        if (!getTrackerUuid(kind)) await createTracker(kind);
        else if (entry && entry.folder?.id !== folders.trackers.id) await entry.update({ folder: folders.trackers.id });
    }
}

function requireTracker(kind) {
    const entry = getTracker(kind);
    if (!entry) throw new Error(`The ${definition(kind).title} tracker is missing. Create or select one first.`);
    return entry;
}

/** Read-modify-write of entry definitions from the current document state, never from a stale form. */
async function updateEntries(kind, mutate) {
    assertGM();
    const entry = requireTracker(kind);
    const data = normalizeTrackerData(entry.flags[MODULE_ID][LEDGER_FLAG], kind);
    const entries = mutate(data.entries.map(e => ({ ...e })));

    await entry.update({ [`flags.${MODULE_ID}.${LEDGER_FLAG}`]: { schemaVersion: SCHEMA_VERSION, kind, entries } });
}

export async function addEntry(kind, name) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error(`A ${definition(kind).entryNoun} needs a name.`);

    const id = foundry.utils.randomID(12);
    await updateEntries(kind, entries => [...entries, { id, name: clean, archived: false }]);
    return id;
}

export async function renameEntry(kind, id, name) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error(`A ${definition(kind).entryNoun} needs a name.`);

    await updateEntries(kind, entries => entries.map(e => (e.id === id ? { ...e, name: clean } : e)));
}

export async function setEntryArchived(kind, id, archived) {
    await updateEntries(kind, entries => entries.map(e => (e.id === id ? { ...e, archived: Boolean(archived) } : e)));
}

/**
 * Record one adjustment as a new tracker page. `eventId` doubles as the page id, so a repeated
 * submission of the same dialog cannot create a second entry.
 */
export async function recordAdjustment(kind, { eventId, target, delta, reason, sessionLabel = null, sceneUuid = null, correctsEventId = null }) {
    assertGM();
    const tracker = definition(kind);
    const entry = requireTracker(kind);
    const trackerData = entry.flags[MODULE_ID][LEDGER_FLAG];
    const errors = validateAdjustment({ target, delta, reason, correctsEventId }, trackerData, tracker);

    if (errors.length) throw new Error(errors.join(" "));
    if (entry.pages.has(eventId)) return entry.pages.get(eventId);

    const data = normalizeTrackerData(trackerData, kind);
    const isFame = target.kind === "fame";
    const label = isFame ? FAME_LABEL : data.entries.find(e => e.id === target.id).name;
    const cleanReason = reason.trim();
    const createdAt = new Date().toISOString();
    const escape = foundry.utils.escapeHTML;
    const payload = {
        schemaVersion: SCHEMA_VERSION,
        eventId,
        target: isFame ? { ...FAME_TARGET } : { kind: "entry", id: target.id },
        delta,
        reason: cleanReason,
        authorUserId: game.user.id,
        createdAt,
        sessionLabel: sessionLabel?.trim() || null,
        sceneUuid,
        correctsEventId
    };

    // Readable page body is presentation only; totals come from the flags.
    const content = [
        `<p><strong>${escape(signed(delta))} ${escape(label)}</strong></p>`,
        `<p>${escape(cleanReason)}</p>`,
        `<p><em>${escape(game.user.name)} · ${escape(createdAt)}${payload.sessionLabel ? ` · ${escape(payload.sessionLabel)}` : ""}</em></p>`
    ].join("");

    return JournalEntryPage.implementation.create({
        _id: eventId,
        name: `${signed(delta)} ${label}: ${cleanReason}`.slice(0, 200),
        type: "text",
        text: { content },
        sort: Date.now(),
        flags: { [MODULE_ID]: { [ADJUSTMENT_FLAG]: payload } }
    }, { parent: entry, keepId: true });
}
