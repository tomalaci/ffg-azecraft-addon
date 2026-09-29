/**
 * XP Management rules (pure, unit-tested): XP changes, entries of the starwarsffg XP log and rows of
 * the shared XP Ledger journal.
 *
 * The system keeps XP in `system.experience.total` / `.available` (purchases are Active Effects that
 * subtract from available) and the character's XP log in the actor flag `starwarsffg.xpLog`, newest
 * first: {action, id, xp: {cost, available, total}, date, description}. `id` links a purchase to its
 * Active Effect (the sheet's Refund link); `action` is one of LOG_ACTIONS.
 */

export const LOG_ACTIONS = ["granted", "adjusted", "purchased", "refunded", "undid"];
export const CHANGE_MODES = ["add", "reduce", "set"];

const int = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
};

/** Total, available and spent XP of an actor's system data. */
export function xpSummary(experience) {
    const total = int(experience?.total);
    const available = int(experience?.available);
    return { total, available, spent: total - available };
}

/**
 * The effect of a change on a character.
 * @param {{total: number, available: number}} current  total and (effective) available XP
 * @param {"add"|"reduce"|"set"} mode  set: the new total (available moves by the same amount)
 * @param {number} amount
 * @returns {{delta: number, total: number, available: number, error?: string}}
 */
export function applyXpChange(current, mode, amount) {
    const total = int(current?.total);
    const available = int(current?.available);
    const value = int(amount);
    if (!CHANGE_MODES.includes(mode)) return { delta: 0, total, available, error: `Unknown change: ${mode}` };
    if (value < 0) return { delta: 0, total, available, error: "Use a positive amount." };
    const delta = mode === "add" ? value : mode === "reduce" ? -value : value - total;
    if (total + delta < 0) return { delta: 0, total, available, error: `Total XP cannot go below 0 (it is ${total}).` };
    return { delta, total: total + delta, available: available + delta };
}

/** Today as the XP log writes dates (YYYY-MM-DD). */
export function logDate(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

/** The XP log entry for a GM change (the system's format: "granted" for gains, "adjusted" for losses). */
export function changeLogEntry({ delta, total, available }, reason, now = new Date()) {
    return {
        action: delta >= 0 ? "granted" : "adjusted",
        id: undefined,
        xp: { cost: delta, available, total },
        date: logDate(now),
        description: String(reason ?? "").trim()
    };
}

/**
 * An XP log entry after an edit from XP Management (fields that were not edited keep their value,
 * including the purchase link `id`).
 */
export function editLogEntry(entry, changes) {
    const next = clone(entry);
    if ("action" in changes) next.action = LOG_ACTIONS.includes(changes.action) ? changes.action : next.action;
    if ("date" in changes) next.date = String(changes.date ?? "").trim();
    if ("description" in changes) next.description = String(changes.description ?? "");
    next.xp = { ...(next.xp ?? {}) };
    for (const key of ["cost", "available", "total"]) {
        if (key in changes) next.xp[key] = int(changes[key]);
    }
    return next;
}

function clone(value) {
    return value === undefined ? {} : JSON.parse(JSON.stringify(value));
}

/** Whether two XP log entries are the same (to detect an entry that changed meanwhile). */
export function sameEntry(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** A row of the shared XP Ledger. */
export function ledgerRow({ actorId, actorName, gm, mode, amount, before, after, reason }, now = new Date()) {
    return {
        time: now.toISOString(),
        actorId,
        actorName,
        gm,
        mode,
        amount: int(amount),
        delta: after.total - before.total,
        before: { total: before.total, available: before.available },
        after: { total: after.total, available: after.available },
        reason: String(reason ?? "").trim()
    };
}

/** "+5", "−3", "0" for XP deltas. */
export function signed(value) {
    const number = int(value);
    return number > 0 ? `+${number}` : number < 0 ? `−${Math.abs(number)}` : "0";
}

/** One line describing a change ("Add 5", "Set total to 120"). */
export function changeLabel(mode, amount) {
    if (mode === "set") return `Set total to ${int(amount)}`;
    return `${mode === "reduce" ? "Reduce" : "Add"} ${int(amount)}`;
}
