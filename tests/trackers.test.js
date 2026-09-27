import { test } from "node:test";
import assert from "node:assert/strict";

import { TRACKERS, computeStanding, normalizeAdjustment, validateAdjustment } from "../scripts/mission-dashboard/trackers.js";

const ledger = {
    factions: [
        { id: "alliance", name: "Systems Alliance" },
        { id: "council", name: "Citadel Council", archived: true }
    ]
};

function event(eventId, target, delta, createdAt, extra = {}) {
    return { eventId, target, delta, reason: `r-${eventId}`, authorUserId: "gm", createdAt, ...extra };
}

test("totals start at zero and include opening balances", () => {
    const standing = computeStanding(ledger, [
        event("e1", { kind: "faction", id: "alliance" }, 3, "2026-01-01T00:00:00Z", { reason: "Opening balance" }),
        event("e2", { kind: "fame" }, 2, "2026-01-02T00:00:00Z")
    ]);

    assert.equal(standing.fame, 2);
    assert.deepEqual(standing.entries.map(f => [f.id, f.total]), [["alliance", 3], ["council", 0]]);
});

test("fame and factions are independent; no cap is applied", () => {
    const events = Array.from({ length: 40 }, (_, i) => event(`f${i}`, { kind: "fame" }, 1, `2026-02-${String(i % 28 + 1).padStart(2, "0")}`));
    const standing = computeStanding(ledger, events);

    assert.equal(standing.fame, 40);
    assert.equal(standing.entries[0].total, 0);
});

test("corrections are new entries that reverse the original", () => {
    const standing = computeStanding(ledger, [
        event("e1", { kind: "faction", id: "alliance" }, 2, "2026-03-01T00:00:00Z"),
        event("e2", { kind: "faction", id: "alliance" }, -2, "2026-03-02T00:00:00Z", { correctsEventId: "e1" })
    ]);

    assert.equal(standing.entries[0].total, 0);
    assert.equal(standing.history.length, 2);
    assert.equal(standing.history.find(e => e.eventId === "e1").corrected, true);
    assert.equal(standing.history[0].eventId, "e2");
});

test("two GMs' concurrent adjustments both count", () => {
    const standing = computeStanding(ledger, [
        event("gmA", { kind: "faction", id: "alliance" }, 1, "2026-04-01T10:00:00.000Z"),
        event("gmB", { kind: "faction", id: "alliance" }, 1, "2026-04-01T10:00:00.000Z")
    ]);
    assert.equal(standing.entries[0].total, 2);
});

test("invalid stored adjustments are ignored, unknown factions stay visible", () => {
    const standing = computeStanding(ledger, [
        { eventId: "bad", target: { kind: "fame" }, delta: 0 },
        { eventId: "bad2", target: { kind: "fame" }, delta: 1.5 },
        event("orphan", { kind: "faction", id: "gone" }, -1, "2026-05-01")
    ]);

    assert.equal(standing.fame, 0);
    const orphan = standing.entries.find(f => f.id === "gone");
    assert.equal(orphan.total, -1);
    assert.equal(orphan.unknown, true);
    assert.equal(normalizeAdjustment({ target: { kind: "faction" }, delta: 1 }), null);
    // Pages written before Resources existed used target kind "faction"; they still count.
    assert.deepEqual(normalizeAdjustment({ target: { kind: "faction", id: "x" }, delta: 2 }).target, { kind: "entry", id: "x" });
});

test("validation requires a reason, a non-zero integer and an active target", () => {
    const alliance = { kind: "faction", id: "alliance" };
    assert.deepEqual(validateAdjustment({ target: alliance, delta: 1, reason: "Saved the team" }, ledger), []);
    assert.equal(validateAdjustment({ target: alliance, delta: 1, reason: "   " }, ledger).length, 1);
    assert.equal(validateAdjustment({ target: alliance, delta: 0, reason: "x" }, ledger).length, 1);
    assert.equal(validateAdjustment({ target: { kind: "faction", id: "council" }, delta: 1, reason: "x" }, ledger).length, 1);
    assert.deepEqual(validateAdjustment({ target: { kind: "faction", id: "council" }, delta: -1, reason: "x", correctsEventId: "e1" }, ledger), []);
    assert.equal(validateAdjustment({ target: { kind: "fame" }, delta: 5, reason: "x" }, ledger).length, 0);
});

test("resources: no Fame target, entries are resources, defaults include Credits", () => {
    const resources = TRACKERS.resources;
    const data = { kind: "resources", entries: resources.defaults };
    assert.ok(resources.defaults.some(e => e.id === "credits" && e.name === "Credits"));
    assert.ok(resources.defaults.some(e => e.name === "Element Zero"));
    assert.ok(TRACKERS.reputation.defaults.some(e => e.name === "Systems Alliance"));

    const errors = validateAdjustment({ target: { kind: "fame" }, delta: 5, reason: "x" }, data, resources);
    assert.equal(errors.length, 1);
    assert.deepEqual(validateAdjustment({ target: { kind: "entry", id: "credits" }, delta: -2500, reason: "Bought armour" }, data, resources), []);

    const standing = computeStanding(data, [
        event("c1", { kind: "entry", id: "credits" }, 10000, "2026-06-01"),
        event("c2", { kind: "entry", id: "credits" }, -2500, "2026-06-02")
    ], resources);
    assert.equal(standing.entries.find(e => e.id === "credits").total, 7500);
});
