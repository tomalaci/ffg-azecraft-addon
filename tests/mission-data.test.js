import { test } from "node:test";
import assert from "node:assert/strict";

import { pageAccess, selectEntry } from "../scripts/mission-dashboard/mission-data.js";
import { chooseLedger } from "../scripts/mission-dashboard/ledgers.js";
import { LEVELS, makePage, makeUser } from "./fixtures.js";

const player = makeUser();
const gm = makeUser({ isGM: true });

test("readable text and image pages are available", () => {
    assert.equal(pageAccess("x", makePage(), player), "available");
    assert.equal(pageAccess("x", makePage({ type: "image" }), player), "available");
});

test("unassigned, missing and wrong document types", () => {
    assert.equal(pageAccess(null, null, player), "unassigned");
    assert.equal(pageAccess("x", null, player), "missing");
    assert.equal(pageAccess("x", { documentName: "Actor" }, player), "missing");
});

test("restricted page or restricted parent Journal hides content from players", () => {
    assert.equal(pageAccess("x", makePage({ level: LEVELS.LIMITED }), player), "restricted");
    assert.equal(pageAccess("x", makePage({ entryLevel: LEVELS.NONE }), player), "restricted");
    assert.equal(pageAccess("x", makePage({ level: LEVELS.NONE, entryLevel: LEVELS.NONE }), gm), "available");
});

test("unsupported page types", () => {
    assert.equal(pageAccess("x", makePage({ type: "pdf" }), player), "unsupported");
});

test("history shows the newest entry by default and clamps paging", () => {
    const access = () => "available";
    assert.deepEqual(selectEntry(["a", "b", "c"], access, false), { uuid: "c", index: 2, count: 3, isLatest: true });
    assert.equal(selectEntry(["a", "b", "c"], access, false, 0).uuid, "a");
    assert.equal(selectEntry(["a", "b", "c"], access, false, -5).uuid, "a");
    assert.equal(selectEntry(["a", "b", "c"], access, false, 9).uuid, "c");
    assert.deepEqual(selectEntry([], access, false), { uuid: null, index: -1, count: 0, isLatest: false });
});

test("players never page through entries they cannot read; GMs see all", () => {
    const access = uuid => (uuid === "secret" ? "restricted" : uuid === "gone" ? "missing" : "available");
    const entries = ["old", "secret", "gone", "new"];

    const player = selectEntry(entries, access, false, 1);
    assert.equal(player.count, 2);
    assert.equal(player.uuid, "new");

    const gm = selectEntry(entries, access, true, 1);
    assert.equal(gm.count, 4);
    assert.equal(gm.uuid, "secret");

    // A newest entry that is hidden from players leaves the previous readable one current for them.
    assert.equal(selectEntry(["old", "secret"], access, false).uuid, "old");
});

test("a tab shows the viewer's choice, else the default ledger, else the most recent one", () => {
    const visible = ["L.old", "L.mid", "L.new"];
    assert.equal(chooseLedger(visible, null), "L.new");
    assert.equal(chooseLedger(visible, "L.mid"), "L.mid");
    assert.equal(chooseLedger(visible, "L.mid", "L.old"), "L.old");
    // A choice or default the viewer cannot see (hidden or deleted) falls back.
    assert.equal(chooseLedger(visible, "L.hidden", "L.gone"), "L.new");
    assert.equal(chooseLedger([], "L.mid"), null);
});
