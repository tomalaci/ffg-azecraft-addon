import { test } from "node:test";
import assert from "node:assert/strict";

import { shiftPool, switchSquadPool, fromSystemPool, poolCapacity, poolSegments, resizePool, squadShare, toSystemPool, usePoint } from "../scripts/story-points/story-pool.js";

test("segments: squad fills from the left, threat from the right", () => {
    assert.deepEqual(poolSegments({ squad: 3, threat: 2 }), ["squad", "squad", "squad", "threat", "threat"]);
    assert.deepEqual(poolSegments({ squad: 0, threat: 0 }), []);
    assert.equal(squadShare({ squad: 3, threat: 1 }), 0.75);
    assert.equal(squadShare({ squad: 0, threat: 0 }), 0.5);
});

test("using a point moves it to the other side; nothing to use returns null", () => {
    assert.deepEqual(usePoint({ squad: 3, threat: 2 }, "squad"), { squad: 2, threat: 3 });
    assert.deepEqual(usePoint({ squad: 3, threat: 2 }, "threat"), { squad: 4, threat: 1 });
    assert.equal(usePoint({ squad: 0, threat: 5 }, "squad"), null);
    assert.equal(usePoint({ squad: 2, threat: 0 }, "threat"), null);
});

test("GM side adjustments move points between sides; mapping to the system's Light/Dark settings", () => {
    assert.deepEqual(shiftPool({ squad: 2, threat: 1 }, "squad", -1), { squad: 1, threat: 2 });
    assert.deepEqual(shiftPool({ squad: 2, threat: 1 }, "squad", 1), { squad: 3, threat: 0 });
    assert.deepEqual(shiftPool({ squad: 2, threat: 1 }, "threat", 1), { squad: 1, threat: 2 });
    assert.deepEqual(shiftPool({ squad: 1, threat: 0 }, "squad", -3), { squad: 0, threat: 1 });
    assert.deepEqual(shiftPool({ squad: 1, threat: 0 }, "squad", 1), { squad: 1, threat: 0 });
    assert.deepEqual(toSystemPool({ squad: 4, threat: 1 }), { light: 4, dark: 1 });
    assert.deepEqual(fromSystemPool("2", undefined), { squad: 2, threat: 0 });
});

test("capacity changes keep the tug of war balanced", () => {
    assert.equal(poolCapacity({ squad: 2, threat: 3 }), 5);
    assert.deepEqual(resizePool({ squad: 0, threat: 0 }, 1), { squad: 1, threat: 0 });
    assert.deepEqual(resizePool({ squad: 1, threat: 0 }, 1), { squad: 1, threat: 1 });
    assert.deepEqual(resizePool({ squad: 3, threat: 1 }, 2), { squad: 3, threat: 3 });
    assert.deepEqual(resizePool({ squad: 2, threat: 2 }, -1), { squad: 2, threat: 1 });
    assert.deepEqual(resizePool({ squad: 4, threat: 1 }, -2), { squad: 2, threat: 1 });
    assert.deepEqual(resizePool({ squad: 0, threat: 1 }, -5), { squad: 0, threat: 0 });
});

test("story points per squad: switching saves the live pool and loads the next squad's", () => {
    // First run: the existing pool belongs to the active squad.
    let step = switchSquadPool({}, { squad: 3, threat: 2 }, "a", ["a", "b"]);
    assert.deepEqual(step, { store: { owner: "a", pools: {} }, pool: null, changed: true });

    // A new squad starts empty; squad a's pool is kept.
    step = switchSquadPool(step.store, { squad: 1, threat: 4 }, "b", ["a", "b"]);
    assert.deepEqual(step.pool, { squad: 0, threat: 0 });
    assert.deepEqual(step.store, { owner: "b", pools: { a: { squad: 1, threat: 4 } } });

    // Back to a: its pool returns, b's is kept.
    step = switchSquadPool(step.store, { squad: 2, threat: 0 }, "a", ["a", "b"]);
    assert.deepEqual(step.pool, { squad: 1, threat: 4 });
    assert.deepEqual(step.store, { owner: "a", pools: { b: { squad: 2, threat: 0 } } });

    // Same squad again: nothing to do.
    assert.deepEqual(switchSquadPool(step.store, { squad: 9, threat: 9 }, "a", ["a", "b"]), { store: step.store, pool: null, changed: false });

    // The active squad was deleted: its pool is dropped, and deleted squads' pools are cleaned up.
    step = switchSquadPool({ owner: "x", pools: { b: { squad: 2, threat: 0 }, gone: { squad: 1, threat: 1 } } }, { squad: 5, threat: 5 }, "b", ["b"]);
    assert.deepEqual(step, { store: { owner: "b", pools: {} }, pool: { squad: 2, threat: 0 }, changed: true });
});
