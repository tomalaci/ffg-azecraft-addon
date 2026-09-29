import { test } from "node:test";
import assert from "node:assert/strict";

import { applyXpChange, changeLabel, changeLogEntry, editLogEntry, ledgerRow, sameEntry, signed, spentFromLog, xpStatus, xpSummary } from "../scripts/xp/xp-core.js";

const now = new Date("2026-09-29T18:30:00Z");

test("xpSummary reads the system's (sometimes string) values", () => {
    assert.deepEqual(xpSummary({ total: "120", available: 15 }), { total: 120, available: 15, spent: 105 });
    assert.deepEqual(xpSummary(undefined), { total: 0, available: 0, spent: 0 });
});

test("applyXpChange: add, reduce and set move total and available together", () => {
    assert.deepEqual(applyXpChange({ total: 100, available: 10 }, "add", 15), { delta: 15, total: 115, available: 25 });
    assert.deepEqual(applyXpChange({ total: 100, available: 10 }, "reduce", 15), { delta: -15, total: 85, available: -5 });
    assert.deepEqual(applyXpChange({ total: 100, available: 10 }, "set", 150), { delta: 50, total: 150, available: 60 });
    assert.deepEqual(applyXpChange({ total: 100, available: 10 }, "set", 100), { delta: 0, total: 100, available: 10 });
});

test("applyXpChange refuses negative amounts, totals below 0 and unknown modes", () => {
    assert.ok(applyXpChange({ total: 10, available: 0 }, "add", -5).error);
    assert.ok(applyXpChange({ total: 10, available: 0 }, "reduce", 11).error);
    assert.ok(applyXpChange({ total: 10, available: 0 }, "double", 1).error);
});

test("changeLogEntry writes the system's XP log format", () => {
    assert.deepEqual(changeLogEntry({ delta: 5, total: 105, available: 20 }, " Session 12 ", now), {
        action: "granted", id: undefined, xp: { cost: 5, available: 20, total: 105 }, date: "2026-09-29", description: "Session 12"
    });
    // A GM reduction is a (negative) grant, not spending.
    assert.equal(changeLogEntry({ delta: -3, total: 97, available: 12 }, "Correction", now).action, "granted");
});

test("editLogEntry changes only the edited fields and keeps the purchase link", () => {
    const entry = { action: "purchased", id: "abc", xp: { cost: 10, available: 5, total: 100 }, date: "2026-09-01", description: "skill rank Pilot 1 --> 2" };
    const edited = editLogEntry(entry, { description: "Pilot rank 2", cost: "12" });
    assert.deepEqual(edited, { ...entry, description: "Pilot rank 2", xp: { cost: 12, available: 5, total: 100 } });
    assert.equal(entry.xp.cost, 10, "the original entry is not modified");
    assert.equal(editLogEntry(entry, { action: "stolen" }).action, "purchased");
    assert.ok(sameEntry(entry, JSON.parse(JSON.stringify(entry))));
    assert.ok(!sameEntry(entry, edited));
});

test("ledgerRow records who changed what", () => {
    const row = ledgerRow({ actorId: "a1", actorName: "Moyra", gm: "Gamemaster", mode: "add", amount: 5, before: { total: 100, available: 10 }, after: { total: 105, available: 15 }, reason: "Session 12" }, now);
    assert.equal(row.delta, 5);
    assert.equal(row.time, "2026-09-29T18:30:00.000Z");
    assert.deepEqual(row.after, { total: 105, available: 15 });
});

test("labels", () => {
    assert.equal(signed(5), "+5");
    assert.equal(signed(-3), "−3");
    assert.equal(changeLabel("set", 120), "Set total to 120");
    assert.equal(changeLabel("reduce", 4), "Reduce 4");
});

const entry = (action, cost, description = "") => ({ action, xp: { cost }, description });

test("xpStatus: spending recorded with the sheet's Adjust XP (it lowered the stored total too)", () => {
    // Veylan Thar: species grant 95, "Character Creation" −90; stored total and available 5.
    const veylan = [entry("adjusted", -90, "Character Creation"), entry("granted", 95, "received species Drell")];
    assert.deepEqual(xpStatus({ total: 5, available: 5 }, veylan), { total: 95, available: 5, spent: 90, storedTotal: 5, needsRepair: true });
    // Moyra Zoreaux: species grant 80, spent all of it; stored total and available 0.
    const moyra = [entry("adjusted", -80, "Intellect 2->3 (30), ..."), entry("granted", 80, "received species Asari")];
    assert.deepEqual(xpStatus({ total: 0, available: 0 }, moyra), { total: 80, available: 0, spent: 80, storedTotal: 0, needsRepair: true });
});

test("xpStatus: correct data needs no repair", () => {
    assert.deepEqual(xpStatus({ total: 100, available: 100 }, [entry("granted", 100)]), { total: 100, available: 100, spent: 0, storedTotal: 100, needsRepair: false });
    // System purchases (Active Effects lower available, total intact) and a refund.
    const log = [entry("refunded", 10), entry("purchased", 10), entry("purchased", 25), entry("granted", 100)];
    assert.equal(spentFromLog(log), 25);
    assert.deepEqual(xpStatus({ total: 100, available: 75 }, log), { total: 100, available: 75, spent: 25, storedTotal: 100, needsRepair: false });
    // Spending that was never logged still shows as total − available.
    assert.equal(xpStatus({ total: 100, available: 60 }, []).spent, 40);
});

test("spentFromLog ignores grants, positive adjustments and GM corrections", () => {
    assert.equal(spentFromLog([entry("granted", -5), entry("adjusted", 10), entry("granted", 50)]), 0);
});

test("spentFromLog: a positive Adjust XP gives spent XP back", () => {
    assert.equal(spentFromLog([entry("adjusted", 10, "overspent, undo"), entry("adjusted", -30), entry("granted", 100)]), 20);
});
