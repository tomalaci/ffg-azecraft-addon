import { test } from "node:test";
import assert from "node:assert/strict";

import { conditionPlan, describeCondition, describeSpec, effectChanges, effectChips, normalizeConditions, normalizeSpec, squadGroups, systemDuration, targetSkills } from "../scripts/effects/effect-core.js";

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

test("normalizeConditions: needs ids, a status or dice; custom ones last until removed", () => {
    const list = normalizeConditions([
        { id: "c1", squadId: "s1", name: "Toxic air", spec: { dice: { setback: 1 }, duration: "once" } },
        { id: "c2", squadId: "s1", statusId: "starwarsffg-disoriented", name: "Disoriented", on: false },
        { id: "c3", squadId: "s1", spec: { dice: {} } },
        { id: "c1", squadId: "s1", statusId: "x" },
        { squadId: "s1", statusId: "x" }
    ]);
    assert.deepEqual(list.map(c => [c.id, c.on]), [["c1", true], ["c2", false]]);
    assert.equal(list[0].spec.duration, "permanent");
    assert.equal(describeCondition(list[0]), "Toxic air: +1 Setback on all checks, on every squad member");
    assert.match(describeCondition(list[1]), /\(off\)$/);
});

test("conditionPlan adds missing effects and removes off, removed, duplicate and left-squad ones", () => {
    const conditions = normalizeConditions([
        { id: "fog", squadId: "a", spec: { dice: { setback: 1 } } },
        { id: "off", squadId: "a", statusId: "s", on: false },
        { id: "other", squadId: "b", statusId: "s" }
    ]);
    const plan = conditionPlan(conditions, { a: ["A1", "A2"], b: ["B1"] }, {
        A1: [{ id: "e1", condition: "fog" }, { id: "e2", condition: "fog" }, { id: "e3", condition: "off" }],
        X: [{ id: "e4", condition: "fog" }],
        B1: [{ id: "e5", condition: "gone" }]
    });
    assert.deepEqual(plan.create, [{ actorUuid: "A2", conditionId: "fog" }, { actorUuid: "B1", conditionId: "other" }]);
    assert.deepEqual(plan.remove, [
        { actorUuid: "A1", effectIds: ["e2", "e3"] },
        { actorUuid: "B1", effectIds: ["e5"] },
        { actorUuid: "X", effectIds: ["e4"] }
    ]);
});

test("condition effects are marked on cards and kept out of one-off squad groups", () => {
    const chips = effectChips([
        { id: "e1", name: "Fog", img: "f", flags: { m: { quickEffect: { condition: "fog", group: "g" } } } },
        { id: "e2", name: "Smoke", img: "s", flags: { m: { quickEffect: { spec: { dice: { setback: 1 } }, group: "g2" } } } }
    ], "m");
    assert.equal(chips[0].condition, "fog");
    assert.deepEqual(squadGroups([chips]).map(g => g.group), ["g2"]);
});
