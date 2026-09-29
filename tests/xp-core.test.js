import { test } from "node:test";
import assert from "node:assert/strict";

import { actionLabel, applyXpChange, changeLabel, changeLogEntry, entryDelta, ledgerRow, signed, spentFromLog, xpStatus, xpSummary } from "../scripts/xp/xp-core.js";

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

test("entryDelta and actionLabel show a log entry's effect on available XP", () => {
    assert.equal(entryDelta({ action: "purchased", xp: { cost: 10 } }), -10);
    assert.equal(entryDelta({ action: "refunded", xp: { cost: 10 } }), 10);
    assert.equal(entryDelta({ action: "adjusted", xp: { cost: -30 } }), -30);
    assert.equal(entryDelta({ action: "granted", xp: { cost: 25 } }), 25);
    assert.equal(actionLabel("granted"), "Given");
    assert.equal(actionLabel("custom"), "custom");
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
    assert.equal(changeLabel("adjust", -30), "Adjust available");
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

const logged = (action, cost, total, description = "") => ({ action, xp: { cost, total }, description });

test("spentFromLog: old Adjust XP entries that gave XP (total rose by the amount) are not spending", () => {
    // Given 80, spent 80 with the old dialog (total 0), then "DM gave me 25" with it (total 25).
    const log = [logged("adjusted", 25, 25, "DM gave me 25 xp"), logged("adjusted", -80, 0, "spent"), logged("granted", 80, 80, "species")].map(e => ({ ...e }));
    assert.equal(spentFromLog(log), 80);
    assert.deepEqual(xpStatus({ total: 25, available: 25 }, log), { total: 105, available: 25, spent: 80, storedTotal: 25, needsRepair: true });
    // The very first entry giving XP (no earlier total).
    assert.equal(spentFromLog([logged("adjusted", 95, 95, "Character")]), 0);
});

test("spentFromLog: a give-back keeps the total, so it still reduces spending", () => {
    // Addon's Adjust XP: total unchanged (95) while available goes back up by 10.
    const log = [logged("adjusted", 10, 95, "undo"), logged("adjusted", -90, 5, "spent (old dialog)"), logged("granted", 95, 95)];
    assert.equal(spentFromLog(log), 80);
});
