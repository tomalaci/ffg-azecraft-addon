import { test } from "node:test";
import assert from "node:assert/strict";

import {
    allPowers,
    allowedModifierKeys,
    baseDifficulty,
    difficultyLabel,
    disciplineForSkill,
    findPower,
    modifierGroups,
    normalizeConcentration,
    normalizeLoadout,
    normalizePreset,
    normalizePresets,
    powersFor,
    presetDifficulty,
    toggleConcentration
} from "../scripts/powers/power-catalog.js";

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

test("powersFor lists one discipline in order", () => {
    assert.deepEqual(powersFor("tech").map(p => p.id), ["tech-attack", "tech-construct", "tech-sabotage", "tech-augment"]);
    assert.equal(powersFor("biotics").length, 5);
});

test("subtypes: loadouts default to the first, VI Hacking has its own base", () => {
    assert.deepEqual(normalizeLoadout(null), { "tech-attack": "incinerate", "tech-augment": "tech-armor" });
    assert.deepEqual(normalizeLoadout({ "tech-attack": "overload", "tech-augment": "bogus", "tech-sabotage": "vi-hacking" }),
        { "tech-attack": "overload", "tech-augment": "tech-armor" });
    const sabotage = findPower("tech-sabotage");
    assert.equal(baseDifficulty(sabotage), 2);
    assert.equal(baseDifficulty(sabotage, "vi-hacking"), 4);
    assert.equal(baseDifficulty(sabotage, "invasion"), 2);
});

test("element-limited options only apply to their elements", () => {
    const attack = findPower("tech-attack");
    assert.ok(allowedModifierKeys(attack, "overload").has("tech-attack:anti-synthetic"));
    assert.ok(!allowedModifierKeys(attack, "overload").has("tech-attack:anti-organic"));
    assert.ok(allowedModifierKeys(attack, "incinerate").has("tech-attack:anti-organic"));
    assert.ok(allowedModifierKeys(attack, null).has("tech-attack:anti-organic"));
    assert.ok(allowedModifierKeys(attack, null).has("tech-general:no-free-hand"));
    assert.ok(!allowedModifierKeys(attack, null).has("biotic-attack:blast"));
    assert.deepEqual(modifierGroups("tech", "tech-attack", "cryo-blast")[1].options.map(o => o.id).filter(id => id.startsWith("anti")), ["anti-organic"]);
});

test("normalizePreset keeps only usable data", () => {
    assert.deepEqual(normalizePreset({
        id: "a1", name: "  Frost wave  ", power: "tech-attack", subtype: "cryo-blast",
        modifiers: ["tech-attack:blast", "tech-attack:anti-synthetic", "biotic-attack:warp", "tech-general:no-free-hand", "tech-attack:blast"]
    }), { id: "a1", name: "Frost wave", power: "tech-attack", subtype: "cryo-blast", modifiers: ["tech-attack:blast", "tech-general:no-free-hand"] });
    assert.deepEqual(normalizePreset({ id: "b", power: "biotic-barrier", subtype: "incinerate" }),
        { id: "b", name: "Biotic Barrier", power: "biotic-barrier", subtype: null, modifiers: [] });
    assert.equal(normalizePreset({ id: "c", power: "force-choke" }), null);
    assert.equal(normalizePreset({ power: "biotic-attack" }), null);
    assert.equal(normalizePresets("nope").length, 0);
});

test("presetDifficulty adds up the preset's modifiers", () => {
    assert.deepEqual(presetDifficulty("biotic-attack", null, ["biotic-attack:shockwave", "biotic-attack:range"]), { difficulty: 3, setback: 0, upgrades: 0 });
    assert.deepEqual(presetDifficulty("biotic-attack", null, ["biotic-attack:priming", "biotic-general:no-free-hand", "biotic-general:disrupted-concentration"]),
        { difficulty: 0, setback: 1, upgrades: 1 });
    assert.deepEqual(presetDifficulty("tech-sabotage", "vi-hacking", ["tech-sabotage:damping"]), { difficulty: 5, setback: 0, upgrades: 0 });
});

test("modifierGroups narrows the dialog to the rolled power plus general modifiers", () => {
    assert.deepEqual(modifierGroups("biotics").map(g => g.id),
        ["biotic-general", "biotic-attack", "biotic-augment", "biotic-barrier", "biotic-domination", "biotic-telekinesis"]);
    const one = modifierGroups("tech", "tech-attack");
    assert.deepEqual(one.map(g => [g.id, g.open]), [["tech-general", false], ["tech-attack", true]]);
    assert.deepEqual(modifierGroups("unknown"), []);
});

test("concentration keeps only known concentration powers, toggling on and off", () => {
    assert.deepEqual(normalizeConcentration(["biotic-barrier", "biotic-attack", "bogus", "biotic-barrier"]), ["biotic-barrier"]);
    assert.deepEqual(normalizeConcentration(null), []);
    assert.deepEqual(toggleConcentration([], "tech-augment"), ["tech-augment"]);
    assert.deepEqual(toggleConcentration(["tech-augment", "biotic-barrier"], "tech-augment"), ["biotic-barrier"]);
    assert.deepEqual(toggleConcentration([], "biotic-attack"), [], "not a concentration power");
});
