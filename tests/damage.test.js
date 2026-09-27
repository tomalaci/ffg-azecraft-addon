import { test } from "node:test";
import assert from "node:assert/strict";

import { damageAfterSoak, effectiveSoak, hasQuality, hitDamage, qualityRank } from "../scripts/combat/damage.js";

test("a hit deals weapon damage plus successes; a miss deals nothing", () => {
    assert.equal(hitDamage(8, 3), 11);
    assert.equal(hitDamage(8, 0), 0);
    assert.equal(hitDamage(8, -2), 0);
});

test("soak, Pierce and Breach", () => {
    assert.equal(effectiveSoak(5), 5);
    assert.equal(effectiveSoak(5, { pierce: 2 }), 3);
    assert.equal(effectiveSoak(5, { pierce: 9 }), 0);
    assert.equal(effectiveSoak(14, { breach: 1 }), 4);
    assert.equal(damageAfterSoak(11, 5), 6);
    assert.equal(damageAfterSoak(11, 5, { pierce: 2 }), 8);
    assert.equal(damageAfterSoak(3, 5), 0);
});

test("quality ranks come from the summarized list, ignoring (active)/(passive)", () => {
    const qualities = [{ name: "Pierce (passive)", totalRanks: 3 }, { name: "Stun Damage (passive)", totalRanks: 0 }];
    assert.equal(qualityRank(qualities, "Pierce"), 3);
    assert.equal(qualityRank(qualities, "Breach"), 0);
    assert.equal(qualityRank(qualities, "Stun Damage"), 1);
    assert.ok(hasQuality(qualities, "Stun Damage"));
    assert.ok(!hasQuality(qualities, "Burn"));
});
