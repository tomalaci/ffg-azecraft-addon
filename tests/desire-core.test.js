import { test } from "node:test";
import assert from "node:assert/strict";

import { closeSession, fulfilledCounts, normalizeTracker, sessionLabel, setFulfilled, setLabel, setNote } from "../scripts/desires/desire-core.js";

test("nothing stored is session 1, started now; bad data is cleaned", () => {
    const fresh = normalizeTracker(undefined, 1000);
    assert.deepEqual(fresh, { session: { number: 1, label: "", startedAt: 1000, marks: {} }, history: [] });
    const cleaned = normalizeTracker({ session: { number: "x", marks: { "../bad": { at: 1 }, a1: { at: 5, desire: " Redeem  my honour ", note: 7 } } }, history: "nope" }, 1000);
    assert.deepEqual(Object.keys(cleaned.session.marks), ["a1"]);
    assert.deepEqual(cleaned.session.marks.a1, { at: 5, desire: "Redeem my honour", note: "7" });
    assert.equal(cleaned.session.number, 1);
    assert.deepEqual(cleaned.history, []);
});

test("marking keeps the Desire's text; unmarking removes it; notes only on marked characters", () => {
    let t = normalizeTracker({}, 1);
    t = setFulfilled(t, "a1", true, { desire: "Find my sister", now: 10 });
    t = setNote(t, "a1", "Found her on Omega");
    t = setNote(t, "b2", "ignored");
    assert.deepEqual(t.session.marks, { a1: { at: 10, desire: "Find my sister", note: "Found her on Omega" } });
    t = setFulfilled(t, "a1", true, { desire: "Find my sister", now: 20 });
    assert.equal(t.session.marks.a1.note, "Found her on Omega", "marking again keeps the note");
    t = setFulfilled(t, "a1", false);
    assert.deepEqual(t.session.marks, {});
});

test("a new session files the marks with names, newest first, and starts empty", () => {
    let t = normalizeTracker({}, 1);
    t = setLabel(t, "The Citadel heist");
    t = setFulfilled(t, "b2", true, { desire: "Get rich", now: 30 });
    t = setFulfilled(t, "a1", true, { desire: "Find my sister", now: 20 });
    t = closeSession(t, { now: 100, names: { a1: "Aaron" } });
    assert.deepEqual(t.session, { number: 2, label: "", startedAt: 100, marks: {} });
    assert.equal(t.history.length, 1);
    assert.equal(sessionLabel(t.history[0]), "The Citadel heist");
    assert.deepEqual(t.history[0].marks.map(m => [m.actorId, m.name]), [["a1", "Aaron"], ["b2", ""]]);
    t = closeSession(t, { now: 200 });
    assert.equal(t.history.length, 1, "a session without marks is not kept");
    assert.equal(t.session.number, 3);
    assert.equal(sessionLabel(t.session), "Session 3");
    t = setFulfilled(t, "a1", true, { desire: "Find my sister" });
    assert.deepEqual(fulfilledCounts(t), { a1: 2, b2: 1 });
});
