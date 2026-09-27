/**
 * Campaign-wide faction reputation and Fame.
 *
 * Storage: one JournalEntry (the ledger), referenced by a world setting. Faction definitions live in
 * the entry's flags. Every adjustment is its own JournalEntryPage with structured flags, so two GMs
 * adding adjustments at the same time create two pages instead of overwriting one shared total.
 * Totals are always derived by summing adjustments. Ranges, caps and mechanical effects are
 * deliberately not modelled.
 */

import { MODULE_ID, OWNERSHIP, REASON_MAX_LENGTH, SCHEMA_VERSION, SETTINGS } from "./constants.js";

export const LEDGER_FLAG = "ledger";
export const ADJUSTMENT_FLAG = "adjustment";
export const FAME_TARGET = Object.freeze({ kind: "fame", id: "fame" });
export const FAME_LABEL = "Fame";

/* -------------------------------------------- */
/*  Pure logic                                  */
/* -------------------------------------------- */

export function normalizeLedgerData(raw) {
    const factions = Array.isArray(raw?.factions) ? raw.factions : [];
    const seen = new Set();

    return {
        schemaVersion: SCHEMA_VERSION,
        factions: factions
            .filter(f => typeof f?.id === "string" && f.id && !seen.has(f.id) && seen.add(f.id))
            .map(f => ({ id: f.id, name: String(f.name ?? f.id).trim() || f.id, archived: f.archived === true }))
    };
}

export function normalizeAdjustment(raw) {
    if (!raw || typeof raw !== "object") return null;

    const delta = Number(raw.delta);
    const kind = raw.target?.kind;
    const id = raw.target?.id;

    if (!Number.isInteger(delta) || delta === 0) return null;
    if (kind !== "fame" && kind !== "faction") return null;
    if (kind === "faction" && (typeof id !== "string" || !id)) return null;

    return {
        eventId: String(raw.eventId ?? ""),
        target: kind === "fame" ? { ...FAME_TARGET } : { kind, id },
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
    return target.kind === "fame" ? "fame" : `faction:${target.id}`;
}

/**
 * Derive totals and history. Unknown faction ids (e.g. from a deleted definition) still count toward
 * a visible "unknown" row rather than silently vanishing.
 */
export function computeStanding(ledgerData, adjustments) {
    const ledger = normalizeLedgerData(ledgerData);
    const totals = new Map([["fame", 0]]);
    const events = adjustments.map(normalizeAdjustment).filter(Boolean);

    for (const faction of ledger.factions) totals.set(`faction:${faction.id}`, 0);

    for (const event of events) {
        const key = targetKey(event.target);
        totals.set(key, (totals.get(key) ?? 0) + event.delta);
    }

    const known = new Set(ledger.factions.map(f => f.id));
    const factions = ledger.factions.map(f => ({ ...f, total: totals.get(`faction:${f.id}`) }));

    for (const event of events) {
        if (event.target.kind === "faction" && !known.has(event.target.id)) {
            known.add(event.target.id);
            factions.push({ id: event.target.id, name: `Unknown faction (${event.target.id})`, archived: true, unknown: true, total: totals.get(targetKey(event.target)) });
        }
    }

    const names = new Map(factions.map(f => [f.id, f.name]));
    const corrected = new Set(events.map(e => e.correctsEventId).filter(Boolean));
    const history = events
        .map(event => ({
            ...event,
            targetLabel: event.target.kind === "fame" ? FAME_LABEL : names.get(event.target.id),
            corrected: corrected.has(event.eventId)
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return { fame: totals.get("fame"), factions, history };
}

/**
 * Validate a proposed adjustment. Returns a list of human-readable errors.
 */
export function validateAdjustment({ target, delta, reason, correctsEventId = null }, ledgerData) {
    const errors = [];
    const ledger = normalizeLedgerData(ledgerData);

    if (!Number.isInteger(delta) || delta === 0) {
        errors.push("The adjustment must be a whole number other than zero.");
    }

    if (typeof reason !== "string" || !reason.trim()) {
        errors.push("A reason is required.");
    } else if (reason.trim().length > REASON_MAX_LENGTH) {
        errors.push(`The reason can be at most ${REASON_MAX_LENGTH} characters.`);
    }

    if (target?.kind === "faction") {
        const faction = ledger.factions.find(f => f.id === target.id);
        if (!faction) errors.push("Unknown faction.");
        else if (faction.archived && !correctsEventId) errors.push("This faction is archived; restore it before adjusting.");
    } else if (target?.kind !== "fame") {
        errors.push("Choose Fame or a faction.");
    }

    return errors;
}

function signed(delta) {
    return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/* -------------------------------------------- */
/*  Foundry runtime                             */
/* -------------------------------------------- */

function assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can change campaign reputation.");
}

export function getLedgerUuid() {
    return game.settings.get(MODULE_ID, SETTINGS.ledger) || null;
}

/** The configured ledger entry, if it exists and this user can see it. */
export function getLedger() {
    const uuid = getLedgerUuid();
    if (!uuid) return null;

    const entry = foundry.utils.fromUuidSync(uuid, { strict: false });
    return entry?.documentName === "JournalEntry" ? entry : null;
}

export function isLedgerEntry(entry) {
    return Boolean(entry?.flags?.[MODULE_ID]?.[LEDGER_FLAG]);
}

export function findLedgerCandidates() {
    return game.journal.filter(isLedgerEntry);
}

/** View model for the standing display, filtered by what the current user can read. */
export function buildStanding() {
    const uuid = getLedgerUuid();
    const entry = getLedger();

    if (!uuid) return { state: "unconfigured" };
    if (!entry) return { state: "missing" };
    if (!entry.testUserPermission(game.user, OWNERSHIP.OBSERVER)) return { state: "restricted" };

    const adjustments = entry.pages
        .filter(page => page.testUserPermission(game.user, OWNERSHIP.OBSERVER))
        .map(page => page.flags?.[MODULE_ID]?.[ADJUSTMENT_FLAG])
        .filter(Boolean);
    const standing = computeStanding(entry.flags[MODULE_ID][LEDGER_FLAG], adjustments);

    for (const event of standing.history) {
        event.authorName = game.users.get(event.authorUserId)?.name ?? "Unknown user";
    }

    return { state: "ready", entry, ...standing };
}

export async function createLedger(name = "Campaign Reputation Ledger") {
    assertGM();

    const entry = await JournalEntry.implementation.create({
        name,
        ownership: { default: OWNERSHIP.OBSERVER },
        flags: { [MODULE_ID]: { [LEDGER_FLAG]: { schemaVersion: SCHEMA_VERSION, factions: [] } } }
    });

    await game.settings.set(MODULE_ID, SETTINGS.ledger, entry.uuid);
    return entry;
}

export async function selectLedger(uuid) {
    assertGM();
    await game.settings.set(MODULE_ID, SETTINGS.ledger, uuid ?? "");
}

function requireLedger() {
    const entry = getLedger();
    if (!entry) throw new Error("The campaign ledger is missing. Create or select one first.");
    return entry;
}

/** Read-modify-write of faction definitions from the current document state, never from a stale form. */
async function updateFactions(mutate) {
    assertGM();
    const entry = requireLedger();
    const ledger = normalizeLedgerData(entry.flags[MODULE_ID][LEDGER_FLAG]);
    const factions = mutate(ledger.factions.map(f => ({ ...f })));

    await entry.update({ [`flags.${MODULE_ID}.${LEDGER_FLAG}`]: { schemaVersion: SCHEMA_VERSION, factions } });
}

export async function addFaction(name) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("A faction needs a name.");

    const id = foundry.utils.randomID(12);
    await updateFactions(factions => [...factions, { id, name: clean, archived: false }]);
    return id;
}

export async function renameFaction(id, name) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("A faction needs a name.");

    await updateFactions(factions => factions.map(f => (f.id === id ? { ...f, name: clean } : f)));
}

export async function setFactionArchived(id, archived) {
    await updateFactions(factions => factions.map(f => (f.id === id ? { ...f, archived: Boolean(archived) } : f)));
}

/**
 * Record one adjustment as a new ledger page. `eventId` doubles as the page id, so a repeated
 * submission of the same dialog cannot create a second entry.
 */
export async function recordAdjustment({ eventId, target, delta, reason, sessionLabel = null, sceneUuid = null, correctsEventId = null }) {
    assertGM();
    const entry = requireLedger();
    const ledgerData = entry.flags[MODULE_ID][LEDGER_FLAG];
    const errors = validateAdjustment({ target, delta, reason, correctsEventId }, ledgerData);

    if (errors.length) throw new Error(errors.join(" "));
    if (entry.pages.has(eventId)) return entry.pages.get(eventId);

    const ledger = normalizeLedgerData(ledgerData);
    const label = target.kind === "fame" ? FAME_LABEL : ledger.factions.find(f => f.id === target.id).name;
    const cleanReason = reason.trim();
    const createdAt = new Date().toISOString();
    const escape = foundry.utils.escapeHTML;
    const payload = {
        schemaVersion: SCHEMA_VERSION,
        eventId,
        target: target.kind === "fame" ? { ...FAME_TARGET } : { kind: "faction", id: target.id },
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
