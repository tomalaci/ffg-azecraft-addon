import { test } from "node:test";
import assert from "node:assert/strict";

import {
    bumpRevisions,
    changedLedgerTabs,
    normalizeSquads,
    pickActiveSquad,
    rememberedLedger,
    squadsFingerprint,
    validateSquads
} from "../scripts/mission-dashboard/squads.js";

const raw = {
    squads: [
        { id: "alpha", name: "Alpha", party: [{ id: "s1", actorUuid: "Actor.a" }], ledgers: { objective: "JournalEntry.o1" } },
        { id: "bravo", name: " Bravo ", ledgers: { summary: "JournalEntry.s1" }, revisions: { objective: 3 } }
    ]
};

test("squads normalize with members, default ledgers and revisions", () => {
    const [alpha, bravo] = normalizeSquads(raw);
    assert.equal(alpha.name, "Alpha");
    assert.equal(alpha.party.length, 1);
    assert.deepEqual(alpha.ledgers, { objective: "JournalEntry.o1", summary: null, intel: null });
    assert.deepEqual(alpha.revisions, { objective: 0, summary: 0, intel: 0 });
    assert.equal(bravo.name, "Bravo");
    assert.equal(bravo.party.length, 6, "a squad without members gets six empty slots");
    assert.equal(bravo.revisions.objective, 3);
});

test("the active squad is the chosen one, else the first", () => {
    const squads = normalizeSquads(raw);
    assert.equal(pickActiveSquad(squads, "bravo").id, "bravo");
    assert.equal(pickActiveSquad(squads, "gone").id, "alpha");
    assert.equal(pickActiveSquad([], "x"), null);
});

test("a remembered ledger counts only while the squad's revision for that tab matches", () => {
    const [alpha] = normalizeSquads(raw);
    const choices = { alpha: { objective: { uuid: "JournalEntry.side", revision: 0 } } };
    assert.equal(rememberedLedger(choices, alpha, "objective"), "JournalEntry.side");
    assert.equal(rememberedLedger(choices, alpha, "summary"), null);

    // Changing the default (or activating the squad) bumps the revision: back to the default.
    const bumped = bumpRevisions(alpha, ["objective"]);
    assert.equal(rememberedLedger(choices, bumped, "objective"), null);
    assert.deepEqual(bumpRevisions(alpha).revisions, { objective: 1, summary: 1, intel: 1 });
});

test("changed default ledgers are detected per tab", () => {
    const [alpha] = normalizeSquads(raw);
    const edited = { ...alpha, ledgers: { ...alpha.ledgers, intel: "JournalEntry.i2" } };
    assert.deepEqual(changedLedgerTabs(alpha, edited), ["intel"]);
    assert.deepEqual(changedLedgerTabs(alpha, alpha), []);
});

test("fingerprints ignore revisions; validation needs a squad and valid members", () => {
    const squads = normalizeSquads(raw);
    assert.equal(squadsFingerprint(squads), squadsFingerprint(squads.map(s => bumpRevisions(s))));
    assert.notEqual(squadsFingerprint(squads), squadsFingerprint([{ ...squads[0], name: "Renamed" }, squads[1]]));
    assert.deepEqual(validateSquads(squads), []);
    assert.equal(validateSquads([]).length, 1);
    const duplicate = normalizeSquads({ squads: [{ id: "x", party: [{ id: "a", actorUuid: "Actor.1" }, { id: "b", actorUuid: "Actor.1" }] }] });
    assert.match(validateSquads(duplicate)[0], /same Actor/);
});
