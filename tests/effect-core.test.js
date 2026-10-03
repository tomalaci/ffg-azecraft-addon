import { test } from "node:test";
import assert from "node:assert/strict";

import { describeSpec, effectChanges, normalizeSpec, systemDuration, targetSkills } from "../scripts/effects/effect-core.js";

const SKILLS = [
    { key: "Brawl", type: "Combat" }, { key: "Ranged-Light", type: "Combat" },
    { key: "Cool", type: "General" }, { key: "Biotics", type: "Powers" }, { key: "Tech", type: "Powers" }
];

test("normalizeSpec keeps known dice (1-9), scope and duration", () => {
    assert.deepEqual(normalizeSpec({ name: " Inspired ", dice: { boost: "2", setback: 0, bogus: 3, threat: 12 }, scope: "weird", duration: "forever" }),
        { name: "Inspired", dice: { boost: 2, threat: 9 }, scope: "all", skills: [], duration: "permanent" });
    assert.deepEqual(normalizeSpec({ scope: "skills", skills: ["Cool", "Cool", "", 3] }).skills, ["Cool"]);
});

test("targetSkills by scope", () => {
    assert.deepEqual(targetSkills(normalizeSpec({ scope: "combat" }), SKILLS), ["Brawl", "Ranged-Light"]);
    assert.deepEqual(targetSkills(normalizeSpec({ scope: "powers" }), SKILLS), ["Biotics", "Tech"]);
    assert.deepEqual(targetSkills(normalizeSpec({ scope: "skills", skills: ["Cool"] }), SKILLS), ["Cool"]);
    assert.equal(targetSkills(normalizeSpec({}), SKILLS).length, 5);
});

test("effectChanges add the system's skill dice fields", () => {
    const spec = normalizeSpec({ dice: { setback: 1, upgrades: 1 }, scope: "combat" });
    assert.deepEqual(effectChanges(spec, SKILLS), [
        { key: "system.skills.Brawl.setback", mode: 2, value: "1" },
        { key: "system.skills.Brawl.upgrades", mode: 2, value: "1" },
        { key: "system.skills.Ranged-Light.setback", mode: 2, value: "1" },
        { key: "system.skills.Ranged-Light.upgrades", mode: 2, value: "1" }
    ]);
});

test("describeSpec and systemDuration", () => {
    const spec = normalizeSpec({ dice: { boost: 1, remsetback: 1 }, scope: "skills", skills: ["Cool"], duration: "once" });
    assert.equal(describeSpec(spec, { Cool: "Cool" }), "+1 Boost, −1 Setback on Cool · next check");
    assert.equal(systemDuration(spec), "once");
    assert.equal(systemDuration(normalizeSpec({})), undefined);
});

import { effectChips, squadGroups } from "../scripts/effects/effect-core.js";

test("effectChips: statuses and quick effects, not item effects or XP purchases", () => {
    const effects = [
        { id: "a", name: "Disoriented", img: "d.svg", statuses: new Set(["starwarsffg-disoriented"]) },
        { id: "b", name: "Boost Next Check", img: "b.png", statuses: ["starwarsffg-boost-once"], system: { duration: "once" } },
        { id: "c", name: "purchased-xyz", img: "p.png", statuses: [] },
        { id: "d", name: "Inspired", img: "i.svg", flags: { m: { quickEffect: { group: "g1", spec: { dice: { boost: 1 }, duration: "combat" } } } } },
        { id: "e", name: "Off", img: "o.svg", statuses: ["x"], disabled: true }
    ];
    const chips = effectChips(effects, "m");
    assert.deepEqual(chips.map(c => c.id), ["a", "b", "d"]);
    assert.equal(chips[1].tooltip, "Boost Next Check (next check)");
    assert.equal(chips[2].tooltip, "Inspired: +1 Boost on all checks · this combat");
    assert.equal(chips[2].group, "g1");
    assert.deepEqual(effectChips(undefined, "m"), []);
});

test("squadGroups counts members per squad-wide effect", () => {
    const one = [{ group: "g1", name: "Smoke", img: "s", tooltip: "t" }, { group: null }];
    const two = [{ group: "g1", name: "Smoke", img: "s", tooltip: "t" }];
    assert.deepEqual(squadGroups([one, two, []]), [{ group: "g1", name: "Smoke", img: "s", tooltip: "t", count: 2 }]);
});
