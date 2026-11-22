import { test } from "node:test";
import assert from "node:assert/strict";

import {
    DEAD_COLORS, actorHealth, bracket, diesAtZero, estimate, estimateColors, hslToHex, readFlags, trackFraction, visibleTo
} from "../scripts/health-estimate/health-core.js";

const actor = (type, stats) => ({ type, system: { stats } });
const wounds = (value, max) => ({ wounds: { value, max } });
const noFlags = { hidden: false, dead: false, dontMarkDead: false };

test("health left from wounds taken and the threshold", () => {
    assert.equal(trackFraction({ value: 0, max: 10 }), 1);
    assert.equal(trackFraction({ value: 4, max: 10 }), 0.6);
    // Genesys: down only once the wounds exceed the threshold.
    assert.ok(trackFraction({ value: 10, max: 10 }) > 0);
    assert.equal(trackFraction({ value: 11, max: 10 }), 0);
    assert.equal(trackFraction({ value: -2, max: 10 }), 1);
    assert.equal(trackFraction({ value: 0, max: 0 }), null);
    assert.equal(trackFraction(undefined), null);
    assert.equal(trackFraction({ value: "3", max: "12" }), 0.75);
});

test("actor types: wounds for people, hull trauma for vehicles, nothing for homesteads", () => {
    for (const type of ["character", "minion", "rival", "nemesis"]) {
        assert.deepEqual(actorHealth(actor(type, wounds(5, 10))), { fraction: 0.5, vehicle: false });
    }
    assert.deepEqual(actorHealth(actor("vehicle", { hullTrauma: { value: 2, max: 10 } })), { fraction: 0.8, vehicle: true });
    assert.equal(actorHealth(actor("vehicle", { hullTrauma: { value: 2, max: 10 } }), { hideVehicles: true }), null);
    assert.equal(actorHealth({ type: "homestead", system: {} }), null);
    assert.equal(actorHealth(actor("rival", wounds(0, 0))), null);
    assert.equal(actorHealth(null), null);
});

test("minion groups: the group threshold is unit wounds x members", () => {
    // 3 minions of 5 wounds (max 15, as ActorFFG derives it).
    const group = taken => actor("minion", wounds(taken, 15));
    assert.equal(bracket(actorHealth(group(0)).fraction).label, "Unharmed");
    assert.equal(bracket(actorHealth(group(10)).fraction).label, "Badly Injured");
    // At 15 the last minion is still up (starwarsffg: quantity 1); at 16 the group is out.
    assert.equal(bracket(actorHealth(group(15)).fraction).label, "Near Death");
    assert.equal(bracket(actorHealth(group(16)).fraction).label, "Unconscious");
});

test("brackets as Health Estimate picks them", () => {
    assert.equal(bracket(1).label, "Unharmed");
    assert.equal(bracket(0.995).label, "Barely Injured");
    assert.equal(bracket(0.75).label, "Injured");
    assert.equal(bracket(0.5).label, "Badly Injured");
    assert.equal(bracket(0.2).label, "Near Death");
    assert.equal(bracket(0.004).label, "Near Death");
    assert.deepEqual(bracket(0), { label: "Unconscious", index: 0 });
});

test("vehicle brackets", () => {
    const vehicle = taken => estimate({ actor: actor("vehicle", { hullTrauma: { value: taken, max: 10 } }), playerOwned: false, flags: noFlags });
    assert.equal(vehicle(0).label, "Pristine");
    assert.equal(vehicle(1).label, "Pristine");
    assert.equal(vehicle(2).label, "Scratched");
    assert.equal(vehicle(5).label, "Battered");
    assert.equal(vehicle(7).label, "Smoking");
    assert.equal(vehicle(9).label, "Flaming");
    // Vehicles are never "Dead", even when flagged.
    assert.equal(estimate({ actor: actor("vehicle", { hullTrauma: { value: 11, max: 10 } }), playerOwned: false, flags: { ...noFlags, dead: true } }).label, "Wrecked");
});

test("colours run red to green with a dark outline", () => {
    assert.equal(hslToHex(0, 1, 0.5), "#ff0000");
    assert.equal(hslToHex(120, 1, 0.5), "#00ff00");
    assert.equal(hslToHex(60, 1, 0.5), "#ffff00");
    assert.deepEqual(estimateColors(1), { fill: "#00ff00", stroke: "#005c00" });
    assert.equal(estimateColors(0).fill, "#ff0000");
    assert.equal(estimateColors(2).fill, "#00ff00");
});

test("NPCs die at their threshold: minions, rivals, nemeses and unowned characters", () => {
    const base = { fraction: 0, playerOwned: false, npcsDie: true, dontMarkDead: false };
    for (const type of ["minion", "rival", "nemesis", "character"]) assert.ok(diesAtZero({ ...base, type }), type);
    assert.ok(!diesAtZero({ ...base, type: "character", playerOwned: true }));
    assert.ok(!diesAtZero({ ...base, type: "vehicle" }));
    assert.ok(!diesAtZero({ ...base, type: "rival", fraction: 0.001 }));
    assert.ok(!diesAtZero({ ...base, type: "rival", npcsDie: false }));
    assert.ok(!diesAtZero({ ...base, type: "rival", dontMarkDead: true }));
});

test("estimate: dead label and colours, the PC stays unconscious", () => {
    const down = actor("rival", wounds(13, 12));
    assert.deepEqual(estimate({ actor: down, playerOwned: false, flags: noFlags }), { label: "Dead", ...DEAD_COLORS, dead: true });
    assert.equal(estimate({ actor: down, playerOwned: false, flags: noFlags, npcsDie: false }).label, "Unconscious");
    assert.equal(estimate({ actor: down, playerOwned: false, flags: { ...noFlags, dontMarkDead: true } }).label, "Unconscious");
    const pc = actor("character", wounds(15, 14));
    assert.equal(estimate({ actor: pc, playerOwned: true, flags: noFlags }).label, "Unconscious");
    assert.equal(estimate({ actor: pc, playerOwned: true, flags: noFlags, statusDead: true }).label, "Dead");
    assert.equal(estimate({ actor: actor("minion", wounds(0, 6)), playerOwned: false, flags: { ...noFlags, dead: true } }).label, "Dead");
});

test("hidden estimates carry an asterisk for GMs", () => {
    const flags = { ...noFlags, hidden: true };
    const hurt = actor("nemesis", wounds(10, 20));
    assert.equal(estimate({ actor: hurt, playerOwned: false, flags, isGM: true }).label, "Badly Injured*");
    assert.equal(estimate({ actor: hurt, playerOwned: false, flags, isGM: false }).label, "Badly Injured");
});

test("flags: ours first, Health Estimate's as a fallback, token or actor", () => {
    assert.deepEqual(readFlags({}, {}), noFlags);
    assert.equal(readFlags({ healthEstimate: { hideHealthEstimate: true } }, {}).hidden, true);
    assert.equal(readFlags({}, { healthEstimate: { hideHealthEstimate: true } }).hidden, true);
    assert.equal(readFlags({ healthEstimate: { dead: true, dontMarkDead: true } }, undefined).dead, true);
    assert.equal(readFlags({ healthEstimate: { dontMarkDead: true } }, undefined).dontMarkDead, true);
    const overridden = { "ffg-azecraft-addon": { healthEstimateHidden: false }, healthEstimate: { hideHealthEstimate: true } };
    assert.equal(readFlags(overridden, {}).hidden, false);
    assert.equal(readFlags({ "ffg-azecraft-addon": { healthEstimateDead: true } }, {}).dead, true);
});

test("who sees estimates", () => {
    const gm = { isGM: true, npc: false };
    const playerOnPc = { isGM: false, npc: false };
    const playerOnNpc = { isGM: false, npc: true };
    assert.ok(visibleTo("all", playerOnPc));
    assert.ok(visibleTo("playersNpcs", gm) && visibleTo("playersNpcs", playerOnNpc) && !visibleTo("playersNpcs", playerOnPc));
    assert.ok(!visibleTo("npcs", gm) && visibleTo("npcs", playerOnNpc));
    assert.ok(visibleTo("gm", gm) && !visibleTo("gm", playerOnNpc));
});
