/**
 * XP Management data (GMs only; everything is stored in the world, so every GM sees the same):
 *
 * - The roster: a world setting with the ids of the characters added to XP Management.
 * - XP changes: the actor's `system.experience` plus an entry in its own XP log (the
 *   `starwarsffg.xpLog` flag the character sheet shows, read-only here), and a row in the XP Ledger
 *   journal.
 * - The XP Ledger: a GM-only Journal Entry. Its rows are kept as data in a flag; its "Log" page is
 *   rewritten from them after every change, so it reads as a table.
 */

import { applyXpChange, changeLabel, changeLogEntry, ledgerRow, signed, xpStatus, xpSummary } from "./xp-core.js";

export const MODULE_ID = "ffg-azecraft-addon";
export const ROSTER_SETTING = "xpRoster";
const LEDGER_FLAG = "xpLedger";
const LOG_FLAG = ["starwarsffg", "xpLog"];

const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

function assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can manage XP.");
}

/* -------------------------------------------- */
/*  Roster                                      */
/* -------------------------------------------- */

export function readRoster() {
    const ids = game.settings.get(MODULE_ID, ROSTER_SETTING) ?? [];
    return (Array.isArray(ids) ? ids : []).filter(id => typeof id === "string");
}

/** The roster's actors (ids of deleted actors are skipped). */
export function rosterActors() {
    return readRoster().map(id => game.actors.get(id)).filter(Boolean);
}

export async function addToRoster(actorId) {
    assertGM();
    const ids = readRoster();
    if (!ids.includes(actorId)) await game.settings.set(MODULE_ID, ROSTER_SETTING, [...ids, actorId]);
}

export async function removeFromRoster(actorId) {
    assertGM();
    await game.settings.set(MODULE_ID, ROSTER_SETTING, readRoster().filter(id => id !== actorId));
}

/** Player characters that can still be added, player-owned first. */
export function addableCharacters() {
    const inRoster = new Set(readRoster());
    const owned = actor => game.users.some(user => !user.isGM && actor.testUserPermission(user, "OWNER"));
    return game.actors
        .filter(actor => actor.type === "character" && !inRoster.has(actor.id))
        .map(actor => ({ id: actor.id, name: actor.name, owned: owned(actor) }))
        .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
}

/* -------------------------------------------- */
/*  XP and the character's XP log               */
/* -------------------------------------------- */

export function xpLog(actor) {
    const log = actor.getFlag(...LOG_FLAG);
    return Array.isArray(log) ? log : [];
}

/** Total (all XP ever given), available and spent XP, from the actor and its XP log. */
export function actorXp(actor) {
    return xpStatus(actor.system.experience, xpLog(actor));
}

/**
 * Add, reduce or set XP for characters, with the reason logged on each character and in the ledger.
 * Writes the actor's stored values (not the ones after Active Effects), so purchases stay intact.
 * @returns {Promise<{changed: string[], failed: string[]}>}
 */
export async function changeXp(actorIds, mode, amount, reason) {
    assertGM();
    const rows = [];
    const changed = [];
    const failed = [];
    for (const id of actorIds) {
        const actor = game.actors.get(id);
        if (!actor) continue;
        const before = actorXp(actor);
        const result = applyXpChange(before, mode, amount);
        if (result.error) {
            failed.push(`${actor.name}: ${result.error}`);
            continue;
        }
        const stored = xpSummary(actor._source.system?.experience);
        const entry = changeLogEntry(result, reason);
        await actor.update({
            "system.experience.total": stored.total + result.delta,
            "system.experience.available": stored.available + result.delta,
            [`flags.${LOG_FLAG.join(".")}`]: [entry, ...xpLog(actor)]
        });
        rows.push(ledgerRow({ actorId: actor.id, actorName: actor.name, gm: game.user.name, mode, amount, before, after: result, reason }));
        changed.push(`${actor.name} ${signed(result.delta)}`);
    }
    if (rows.length) await appendLedger(rows);
    return { changed, failed };
}

/**
 * Set the stored total XP of characters to all XP ever given (available + spent). Spending recorded
 * with the system's Adjust XP dialog used to lower the stored total too. Logged in the ledger only
 * (the character's XP log is about XP given and spent, and neither changes).
 * @returns {Promise<string[]>} "Name: 5 → 95" per repaired character
 */
export async function repairTotals(actorIds) {
    assertGM();
    const rows = [];
    const repaired = [];
    for (const id of actorIds) {
        const actor = game.actors.get(id);
        if (!actor) continue;
        const xp = actorXp(actor);
        if (!xp.needsRepair) continue;
        const stored = xpSummary(actor._source.system?.experience);
        await actor.update({ "system.experience.total": stored.total + (xp.total - xp.storedTotal) });
        rows.push(ledgerRow({
            actorId: actor.id, actorName: actor.name, gm: game.user.name, mode: "repair", amount: xp.total,
            before: { total: xp.storedTotal, available: xp.available }, after: { total: xp.total, available: xp.available },
            reason: `Stored total set to available + spent (${xp.available} + ${xp.spent})`
        }));
        repaired.push(`${actor.name}: ${xp.storedTotal} → ${xp.total}`);
    }
    if (rows.length) await appendLedger(rows);
    return repaired;
}

/** Record in the ledger an Adjust XP made from XP Management (available XP only). */
export async function recordAdjustment(actor, { amount, reason, before, after }) {
    assertGM();
    await appendLedger([ledgerRow({ actorId: actor.id, actorName: actor.name, gm: game.user.name, mode: "adjust", amount, before, after, reason })]);
}

/* -------------------------------------------- */
/*  XP Ledger journal                           */
/* -------------------------------------------- */

export function findLedger() {
    return game.journal.find(entry => entry.getFlag(MODULE_ID, LEDGER_FLAG)) ?? null;
}

export function ledgerRows() {
    const rows = findLedger()?.getFlag(MODULE_ID, "rows");
    return Array.isArray(rows) ? rows : [];
}

function ledgerHtml(rows) {
    const time = iso => new Date(iso).toLocaleString();
    const body = rows.map(row => `<tr><td>${esc(time(row.time))}</td><td>${esc(row.actorName)}</td><td>${esc(changeLabel(row.mode, row.amount))}</td>`
        + `<td>${esc(signed(row.delta))}</td><td>${row.before.total} → ${row.after.total}</td><td>${row.after.available}</td><td>${esc(row.reason)}</td><td>${esc(row.gm)}</td></tr>`).join("");
    return `<p><em>Written by XP Management (toolbar, GMs); newest first. Edits to this page are replaced on the next change.</em></p>`
        + `<table><thead><tr><th>When</th><th>Character</th><th>Change</th><th>XP</th><th>Total</th><th>Available</th><th>Reason</th><th>GM</th></tr></thead><tbody>${body}</tbody></table>`;
}

async function ensureLedger() {
    const existing = findLedger();
    if (existing) return existing;
    return JournalEntry.implementation.create({
        name: "XP Ledger",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [MODULE_ID]: { [LEDGER_FLAG]: true, rows: [] } },
        pages: [{ name: "Log", type: "text", text: { content: ledgerHtml([]) } }]
    });
}

async function appendLedger(newRows) {
    const journal = await ensureLedger();
    const rows = [...[...newRows].reverse(), ...ledgerRows()];
    await journal.update({ [`flags.${MODULE_ID}.rows`]: rows });
    const page = journal.pages.contents[0];
    if (page) await page.update({ "text.content": ledgerHtml(rows) });
    else await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Log", type: "text", text: { content: ledgerHtml(rows) } }]);
}

export function registerXpSettings(onChange) {
    game.settings.register(MODULE_ID, ROSTER_SETTING, {
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange
    });
}
