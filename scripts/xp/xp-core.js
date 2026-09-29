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
 * XP spent according to the XP log: purchases and "adjusted" entries (the sheet's Adjust XP, which
 * players use to record spending: negative spends, positive gives spent XP back), minus refunds.
 * XP given is "granted" (by GMs, negative for corrections) and does not count.
 *
 * Before the addon replaced it, the sheet's Adjust XP also changed the total, and was used both to
 * record spending and to give XP ("DM gave me 15 xp"). Each entry records the total after it, so a
 * positive adjustment that raised the recorded total by exactly its amount was XP given, not spent
 * XP given back.
 */
export function spentFromLog(log) {
    let spent = 0;
    let previousTotal = 0;
    // The log is newest first; walk it oldest first to know the total before each entry.
    for (const entry of [...(Array.isArray(log) ? log : [])].reverse()) {
        const cost = int(entry?.xp?.cost);
        const total = Number(entry?.xp?.total);
        if (entry?.action === "purchased") spent += Math.abs(cost);
        else if (entry?.action === "refunded") spent -= Math.abs(cost);
        else if (entry?.action === "adjusted") {
            const given = cost > 0 && Number.isFinite(total) && total - previousTotal === cost;
            if (!given) spent -= cost;
        }
        if (Number.isFinite(total)) previousTotal = total;
    }
    return Math.max(0, spent);
}

/**
 * A character's XP: available as the system has it; spent from the log (or total − available when
 * that is more); total = available + spent, i.e. all XP ever given. The system's Adjust XP dialog
 * used to lower the stored total along with available when XP was spent, so the stored total can
 * be too low: `storedTotal` shows what is stored, `needsRepair` whether it differs.
 */
export function xpStatus(experience, log) {
    const stored = xpSummary(experience);
    const spent = Math.max(spentFromLog(log), stored.spent);
    const total = stored.available + spent;
    return { total, available: stored.available, spent, storedTotal: stored.total, needsRepair: total !== stored.total };
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

/**
 * The XP log entry for a GM change: "granted", negative for reductions (a correction, not spending;
 * "adjusted" with a negative amount means spent XP, see spentFromLog).
 */
export function changeLogEntry({ delta, total, available }, reason, now = new Date()) {
    return {
        action: "granted",
        id: undefined,
        xp: { cost: delta, available, total },
        date: logDate(now),
        description: String(reason ?? "").trim()
    };
}

/** How an XP log entry changed available XP: purchases take, refunds give back. */
export function entryDelta(entry) {
    const cost = int(entry?.xp?.cost);
    if (entry?.action === "purchased") return -Math.abs(cost);
    if (entry?.action === "refunded") return Math.abs(cost);
    return cost;
}

const ACTION_LABELS = { granted: "Given", adjusted: "Adjusted", purchased: "Purchased", refunded: "Refunded", undid: "Undone" };

/** A readable name for an XP log action. */
export function actionLabel(action) {
    return ACTION_LABELS[action] ?? String(action ?? "");
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
    if (mode === "repair") return "Repair stored total";
    if (mode === "adjust") return "Adjust available";
    return `${mode === "reduce" ? "Reduce" : "Add"} ${int(amount)}`;
}
