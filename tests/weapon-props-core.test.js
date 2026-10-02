import { test } from "node:test";
import assert from "node:assert/strict";

import { parseQualityList, planWeapon, propertyKey, qualityLabel } from "../scripts/admin/weapon-props-core.js";

const NAMES = ["Accurate", "Auto-Fire (active)", "Blast (active)", "Breach (passive)", "Inferior (passive)", "Knockdown (active)", "Limited Ammo (passive)",
    "Pierce (passive)", "Stun (active)", "Stun Damage (passive)", "Superior (passive)", "Vicious (passive)"];
const KNOWN = new Set(NAMES.map(propertyKey));

test("propertyKey ignores case, punctuation and (active)/(passive)", () => {
    assert.equal(propertyKey("Auto-Fire (active)"), "autofire");
    assert.equal(propertyKey("Auto-fire"), "autofire");
    assert.equal(propertyKey("Stun Damage (passive)"), "stundamage");
    assert.notEqual(propertyKey("Stun"), propertyKey("Stun Damage"));
});

test("parseQualityList reads the books' stat-block quality lists", () => {
    // Batarian Slaver's Outlaw Shotgun with Stun Rounds.
    assert.deepEqual(parseQualityList("<p>Blast 5, Inferior, Knockdown, Stun Damage.</p>", KNOWN), [
        { key: "blast", label: "Blast", rank: 5 },
        { key: "inferior", label: "Inferior", rank: 1 },
        { key: "knockdown", label: "Knockdown", rank: 1 },
        { key: "stundamage", label: "Stun Damage", rank: 1 }
    ]);
    assert.deepEqual(parseQualityList("Auto-fire, Breach 1.", KNOWN).map(q => [q.key, q.rank]), [["autofire", 1], ["breach", 1]]);
    assert.deepEqual(parseQualityList("Limited Ammo 1, Pierce 2, Vicious 2", KNOWN).map(q => [q.key, q.rank]), [["limitedammo", 1], ["pierce", 2], ["vicious", 2]]);
    assert.deepEqual(parseQualityList("Inferior", KNOWN).map(q => q.key), ["inferior"]);
});

test("parseQualityList finds the list sentence among other text, and ignores flavour text", () => {
    assert.deepEqual(parseQualityList("<p>A custom shotgun.</p><p>Blast 5, Vicious 2.</p>", KNOWN).map(q => q.key), ["blast", "vicious"]);
    assert.equal(parseQualityList("A small, personal firearm found with the majority of law enforcement", KNOWN), null);
    assert.equal(parseQualityList("Add +3 damage to tech attacks; adding the Anti-Organic or Non-Lethal effects does not increase difficulty.", KNOWN), null);
    // One unknown word spoils the sentence: no guessing.
    assert.equal(parseQualityList("Blast 5, Overheat 2.", KNOWN), null);
    assert.equal(parseQualityList("", KNOWN), null);
});

test("planWeapon adds missing properties, fixes ranks and only reports extras", () => {
    const current = [{ key: "blast", rank: 1 }, { key: "knockdown", rank: 1 }, { key: "superior", rank: 1 }, { key: "vicious", rank: 1 }];
    const wanted = [{ key: "blast", label: "Blast", rank: 5 }, { key: "knockdown", label: "Knockdown", rank: 1 }, { key: "vicious", label: "Vicious", rank: 2 }, { key: "inferior", label: "Inferior", rank: 1 }];
    const plan = planWeapon(current, wanted);
    assert.deepEqual(plan.add.map(q => q.key), ["inferior"]);
    assert.deepEqual(plan.ranks, [{ key: "blast", label: "Blast", from: 1, to: 5 }, { key: "vicious", label: "Vicious", from: 1, to: 2 }]);
    assert.deepEqual(plan.extra, ["superior"]);
    assert.equal(plan.changed, true);
    assert.equal(planWeapon(wanted, wanted).changed, false);
});

test("qualityLabel", () => {
    assert.equal(qualityLabel("Blast (active)", 5), "Blast 5");
    assert.equal(qualityLabel("Accurate", 1), "Accurate");
});
