import { test } from "node:test";
import assert from "node:assert/strict";

import { allPowers, difficultyLabel, disciplineForSkill, findPower, modifierGroups, visiblePowers } from "../scripts/powers/power-catalog.js";

test("every power has a skill and a base difficulty from the rules", () => {
    const powers = allPowers();
    assert.equal(powers.length, 9);
    assert.deepEqual(Object.fromEntries(powers.map(p => [p.id, p.base])), {
        "biotic-attack": 1,
        "biotic-augment": 2,
        "biotic-barrier": 1,
        "biotic-domination": 2,
        "biotic-telekinesis": 1,
        "tech-attack": 2,
        "tech-construct": 2,
        "tech-sabotage": 2,
        "tech-augment": 2
    });
    assert.ok(powers.every(p => p.skill === (p.discipline === "biotics" ? "Biotics" : "Tech")));
    assert.equal(findPower("biotic-barrier").concentration, true);
    assert.equal(findPower("biotic-general"), null);
});

test("disciplineForSkill matches skill names loosely", () => {
    assert.equal(disciplineForSkill("Biotics"), "biotics");
    assert.equal(disciplineForSkill("SWFFG.SkillsBiotics"), "biotics");
    assert.equal(disciplineForSkill("Tech"), "tech");
    assert.equal(disciplineForSkill("Pilot"), null);
});

test("difficultyLabel names the dice", () => {
    assert.equal(difficultyLabel(1), "Easy (1 Difficulty die)");
    assert.equal(difficultyLabel(2), "Average (2 Difficulty dice)");
    assert.equal(difficultyLabel(9), "Formidable (9 Difficulty dice)");
});

test("visiblePowers follows skill ranks until powers are chosen", () => {
    const skills = { Biotics: { rank: 2 }, Tech: { rank: 0 } };
    assert.deepEqual(visiblePowers(skills, null).map(p => p.id),
        ["biotic-attack", "biotic-augment", "biotic-barrier", "biotic-domination", "biotic-telekinesis"]);
    assert.deepEqual(visiblePowers(skills, ["tech-sabotage", "biotic-barrier"]).map(p => p.id), ["biotic-barrier", "tech-sabotage"]);
    assert.deepEqual(visiblePowers(skills, []), []);
    assert.deepEqual(visiblePowers({}, null), []);
});

test("modifierGroups narrows the dialog to the rolled power plus general modifiers", () => {
    assert.deepEqual(modifierGroups("biotics").map(g => g.id),
        ["biotic-general", "biotic-attack", "biotic-augment", "biotic-barrier", "biotic-domination", "biotic-telekinesis"]);
    const one = modifierGroups("tech", "tech-attack");
    assert.deepEqual(one.map(g => [g.id, g.open]), [["tech-general", false], ["tech-attack", true]]);
    assert.deepEqual(modifierGroups("unknown"), []);
});
