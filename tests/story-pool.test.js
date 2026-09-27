import { test } from "node:test";
import assert from "node:assert/strict";

import { adjustPool, fromSystemPool, poolSegments, squadShare, toSystemPool, usePoint } from "../scripts/story-points/story-pool.js";

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

test("GM adjustments never go below zero; mapping to the system's Light/Dark settings", () => {
    assert.deepEqual(adjustPool({ squad: 1, threat: 0 }, "squad", -3), { squad: 0, threat: 0 });
    assert.deepEqual(adjustPool({ squad: 1, threat: 0 }, "threat", 2), { squad: 1, threat: 2 });
    assert.deepEqual(toSystemPool({ squad: 4, threat: 1 }), { light: 4, dark: 1 });
    assert.deepEqual(fromSystemPool("2", undefined), { squad: 2, threat: 0 });
});
