import { test } from "node:test";
import assert from "node:assert/strict";

import {
    configFingerprint,
    normalizeDashboardConfig,
    referencedUuids,
    validateDashboardConfig
} from "../scripts/mission-dashboard/dashboard-state.js";

test("missing flag normalizes to six deterministic empty slots, disabled", () => {
    const config = normalizeDashboardConfig(undefined);

    assert.equal(config.enabled, false);
    assert.equal(config.party.length, 6);
    assert.deepEqual(config.party.map(s => s.id), ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"]);
    assert.ok(config.party.every(s => s.actorUuid === null));
    assert.deepEqual(normalizeDashboardConfig(undefined), config);
});

test("normalization does not mutate its input", () => {
    const raw = { enabled: true, party: [{ id: "a", actorUuid: " Actor.x " }], mission: { summaryPageUuid: "" } };
    const copy = structuredClone(raw);
    const config = normalizeDashboardConfig(raw);

    assert.deepEqual(raw, copy);
    assert.equal(config.party[0].actorUuid, "Actor.x");
    assert.deepEqual(config.mission, { objective: [], summary: [], intel: [] });
});

test("mission panels are ordered, de-duplicated page lists; legacy single pages become one entry", () => {
    const config = normalizeDashboardConfig({
        mission: {
            objective: ["P.1", " P.2 ", "P.1", "", null, "P.3"],
            summaryPageUuid: "P.legacy",
            intel: []
        }
    });

    assert.deepEqual(config.mission.objective, ["P.1", "P.2", "P.3"]);
    assert.deepEqual(config.mission.summary, ["P.legacy"]);
    assert.deepEqual(config.mission.intel, []);
});

test("keeps a four-person party and its order", () => {
    const raw = { enabled: true, party: ["d", "c", "b", "a"].map(id => ({ id, actorUuid: `Actor.${id}` })) };
    const config = normalizeDashboardConfig(raw);

    assert.equal(config.party.length, 4);
    assert.deepEqual(config.party.map(s => s.id), ["d", "c", "b", "a"]);
});

test("repairs duplicate or invalid slot ids in memory", () => {
    const config = normalizeDashboardConfig({ party: [{ id: "x" }, { id: "x" }, { id: "bad id!" }] });
    const ids = config.party.map(s => s.id);
    assert.equal(new Set(ids).size, 3);
});

test("validation rejects duplicate actors and empty people", () => {
    const config = normalizeDashboardConfig({
        party: [{ id: "a", actorUuid: "Actor.1" }, { id: "b", actorUuid: "Actor.1" }],
        people: [{ id: "p", actorUuid: null }]
    });
    const { errors } = validateDashboardConfig(config);

    assert.equal(errors.length, 2);
    assert.match(errors[0], /same Actor/);
    assert.match(errors[1], /no Actor/);
});

test("people text fields are trimmed and length-limited", () => {
    const config = normalizeDashboardConfig({ people: [{ id: "p1", actorUuid: "Actor.n", role: "  Doctor  ", note: "x".repeat(900) }] });
    assert.equal(config.people[0].role, "Doctor");
    assert.equal(config.people[0].note.length, 500);
});

test("fingerprint detects a concurrent change", () => {
    const a = { enabled: true, party: [{ id: "s1", actorUuid: "Actor.1" }] };
    const b = { enabled: true, party: [{ id: "s1", actorUuid: "Actor.2" }] };
    assert.equal(configFingerprint(a), configFingerprint(structuredClone(a)));
    assert.notEqual(configFingerprint(a), configFingerprint(b));
});

test("referenced uuids for hook relevance", () => {
    const refs = referencedUuids(normalizeDashboardConfig({
        party: [{ id: "s1", actorUuid: "Actor.1" }, { id: "s2", actorUuid: null }],
        mission: { summary: ["JournalEntry.j.JournalEntryPage.p"], objective: ["JournalEntry.j.JournalEntryPage.o1", "JournalEntry.j.JournalEntryPage.o2"] },
        people: [{ id: "p", actorUuid: "Actor.9" }]
    }));

    assert.deepEqual([...refs.actors], ["Actor.1"]);
    assert.deepEqual([...refs.people], ["Actor.9"]);
    assert.deepEqual([...refs.pages].sort(), ["JournalEntry.j.JournalEntryPage.o1", "JournalEntry.j.JournalEntryPage.o2", "JournalEntry.j.JournalEntryPage.p"]);
});
