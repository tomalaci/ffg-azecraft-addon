import { test } from "node:test";
import assert from "node:assert/strict";

import { FrameStats, TimingTable, formatBytes, largest, scriptOwner } from "../scripts/perf/perf-core.js";

test("TimingTable sorts by total time with averages", () => {
    const table = new TimingTable();
    table.add("renderActorSheet", 40);
    table.add("renderActorSheet", 60);
    table.add("updateActor", 5);
    assert.deepEqual(table.top(), [
        { name: "renderActorSheet", count: 2, total: 100, avg: 50, max: 60 },
        { name: "updateActor", count: 1, total: 5, avg: 5, max: 5 }
    ]);
    table.clear();
    assert.deepEqual(table.top(), []);
});

test("FrameStats counts slow frames and freezes", () => {
    const stats = new FrameStats();
    for (let i = 0; i < 8; i++) stats.add(16.7);
    stats.add(50);
    stats.add(150);
    const s = stats.summary();
    assert.equal(s.frames, 10);
    assert.equal(s.slowFrames, 2);
    assert.equal(s.slowShare, 20);
    assert.equal(s.freezes, 1);
    assert.equal(s.worstFrame, 150);
    assert.equal(s.avgFps, 30);
});

test("scriptOwner attributes URLs to modules, systems and core", () => {
    assert.equal(scriptOwner("https://f.example/modules/ffg-azecraft-addon/scripts/a.js"), "module:ffg-azecraft-addon");
    assert.equal(scriptOwner("https://f.example/systems/starwarsffg/modules/x.js"), "system:starwarsffg");
    assert.equal(scriptOwner("https://f.example/scripts/foundry.mjs"), "foundry");
    assert.equal(scriptOwner("https://cdn.example/lib.js"), "cdn.example");
    assert.equal(scriptOwner(""), "unknown");
});

test("largest and formatBytes", () => {
    assert.deepEqual(largest([{ s: 1 }, { s: 5 }, { s: 3 }], "s", 2), [{ s: 5 }, { s: 3 }]);
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(formatBytes(76 * 1048576), "76 MB");
});
