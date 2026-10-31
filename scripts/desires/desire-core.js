/**
 * Desire Tracker rules (pure, unit-tested): which characters' Desires were fulfilled in the current
 * session, and the earlier sessions. Stored as one world setting:
 *
 *   { session: { number, label, startedAt, marks: { [actorId]: { at, desire, note } } },
 *     history: [{ number, label, startedAt, endedAt, marks: [{ actorId, name, desire, note, at }] }] }
 *
 * A mark keeps the Desire's text from when it was marked, so later edits on the sheet don't change
 * what was fulfilled.
 */

export const NOTE_MAX = 300;
export const LABEL_MAX = 80;
export const HISTORY_MAX = 100;
const ID = /^[A-Za-z0-9]{1,32}$/;

function text(value, max) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function time(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeMark(raw) {
    return { at: time(raw?.at, 0), desire: text(raw?.desire, 1000), note: text(raw?.note, NOTE_MAX) };
}

/** The stored tracker with every field valid; a fresh session 1 when nothing is stored. */
export function normalizeTracker(raw = {}, now = Date.now()) {
    const session = raw?.session ?? {};
    const number = Math.max(1, Math.trunc(Number(session.number)) || 1);
    const marks = {};
    for (const [actorId, mark] of Object.entries(session.marks ?? {})) {
        if (ID.test(actorId)) marks[actorId] = normalizeMark(mark);
    }
    const history = (Array.isArray(raw?.history) ? raw.history : []).slice(0, HISTORY_MAX).map(entry => ({
        number: Math.max(1, Math.trunc(Number(entry?.number)) || 1),
        label: text(entry?.label, LABEL_MAX),
        startedAt: time(entry?.startedAt),
        endedAt: time(entry?.endedAt),
        marks: (Array.isArray(entry?.marks) ? entry.marks : []).map(mark => ({
            actorId: ID.test(mark?.actorId) ? mark.actorId : "",
            name: text(mark?.name, 120),
            ...normalizeMark(mark)
        }))
    }));
    return {
        session: { number, label: text(session.label, LABEL_MAX), startedAt: time(session.startedAt, now), marks },
        history
    };
}

/** The session's name: what the GMs typed, else "Session N". */
export function sessionLabel(session) {
    return session.label || `Session ${session.number}`;
}

/** Mark a character's Desire fulfilled (with its current text) or not. Returns a new tracker. */
export function setFulfilled(tracker, actorId, done, { desire = "", now = Date.now() } = {}) {
    if (!ID.test(actorId)) return tracker;
    const marks = { ...tracker.session.marks };
    if (done) marks[actorId] = { at: now, desire: text(desire, 1000), note: marks[actorId]?.note ?? "" };
    else delete marks[actorId];
    return { ...tracker, session: { ...tracker.session, marks } };
}

/** A note on a fulfilled Desire (how it was fulfilled). Ignored for unmarked characters. */
export function setNote(tracker, actorId, note) {
    const mark = tracker.session.marks[actorId];
    if (!mark) return tracker;
    return { ...tracker, session: { ...tracker.session, marks: { ...tracker.session.marks, [actorId]: { ...mark, note: text(note, NOTE_MAX) } } } };
}

export function setLabel(tracker, label) {
    return { ...tracker, session: { ...tracker.session, label: text(label, LABEL_MAX) } };
}

/**
 * End the session: its marks go to the front of the history (with the characters' names, kept in
 * case a character is deleted later) and the next session starts empty. A session without marks
 * is not kept. Returns a new tracker.
 */
export function closeSession(tracker, { now = Date.now(), names = {} } = {}) {
    const { session } = tracker;
    const marks = Object.entries(session.marks)
        .map(([actorId, mark]) => ({ actorId, name: names[actorId] ?? "", ...mark }))
        .sort((a, b) => a.at - b.at);
    const history = marks.length
        ? [{ number: session.number, label: session.label, startedAt: session.startedAt, endedAt: now, marks }, ...tracker.history].slice(0, HISTORY_MAX)
        : tracker.history;
    return { session: { number: session.number + 1, label: "", startedAt: now, marks: {} }, history };
}

/** How many times each character's Desire was fulfilled, over the history and this session. */
export function fulfilledCounts(tracker) {
    const counts = {};
    const add = actorId => { if (actorId) counts[actorId] = (counts[actorId] ?? 0) + 1; };
    for (const entry of tracker.history) for (const mark of entry.marks) add(mark.actorId);
    for (const actorId of Object.keys(tracker.session.marks)) add(actorId);
    return counts;
}
