import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeDraft } from "../scripts/item-maker/item-maker-core.js";
import { PROPERTY_DEFAULTS, craftingHtml, craftingPlan, designWarnings, normalizeTable, priceBreakdown, priceHtml, propertyKey, propertyPrice, warningsHtml } from "../scripts/item-maker/item-prices.js";

const table = normalizeTable();
const total = (raw, props = [], t = table) => priceBreakdown(normalizeDraft(raw), t, props).total;

test("property keys drop the (active)/(passive) note", () => {
    assert.equal(propertyKey("Auto-Fire (active)"), "auto-fire");
    assert.equal(propertyKey("  Limited  Ammo (passive) "), "limited ammo");
    assert.equal(propertyKey("Phasic"), "phasic");
});

test("weapon price: damage bands, crit and range add up", () => {
    // damage 6: 2 x 50 + 75; crit 3: 150; medium: 100
    assert.equal(total({ type: "weapon", damage: 6, crit: 3, range: "Medium" }), 425);
    assert.equal(total({ type: "weapon", damage: 3, crit: 5, range: "Short" }), 0);
    // damage 13: 100 + 150 + 250 + 525 + 500
    assert.equal(total({ type: "weapon", damage: 13, crit: 6, range: "Engaged" }), 1525);
});

test("melee halves the price, single use takes its percentage; the base price counts too", () => {
    // pierce 1 + defensive 1 = 200, base 40, halved for Melee
    const props = [{ name: "Pierce (passive)", rank: 1 }, { name: "Defensive (passive)", rank: 1 }];
    assert.equal(total({ type: "weapon", skill: "Melee", damage: 2, crit: 5, range: "Engaged", basePrice: 40 }, props), 120);
    const grenade = { type: "weapon", damage: 8, crit: 4, range: "Short" };
    const blast = [{ name: "Blast (active)", rank: 5 }];
    assert.equal(total(grenade, blast), 625);
    assert.equal(total({ ...grenade, singleUse: true }, blast), 94);
    assert.equal(total({ type: "armour", soak: 1, singleUse: true }), 50, "single use is for weapons and gear");
});

test("armour price: soak and defense per point, plus a surcharge for both", () => {
    assert.equal(total({ type: "armour", soak: 1 }), 50);
    assert.equal(total({ type: "armour", soak: 2, defence: 1 }), 50 + 400 + 50 + 300);
    assert.equal(total({ type: "armour", soak: 5 }), 50 + 400 + 600 + 1500 * 2);
});

test("properties: flat plus per rank, drawbacks lower the price, unknown ones use the fallback", () => {
    assert.equal(propertyPrice("Cumbersome (passive)", 1, table), 0);
    assert.equal(propertyPrice("Cumbersome (passive)", 3, table), -200);
    assert.equal(propertyPrice("Accurate", 2, table), 500);
    assert.equal(propertyPrice("Mystery Field", 3, table), 300);
    assert.equal(total({ type: "gear", basePrice: 50 }, [{ name: "Inferior (passive)", rank: 1 }]), 0, "never below zero");
});

test("the table keeps GM values, falls back to defaults for missing or invalid ones", () => {
    const custom = normalizeTable({ values: { damage4: "80", meleePercent: -5, crit3: "" }, properties: { "Accurate (passive)": { perRank: 400 }, "Phasic": { flat: "x" } } });
    assert.equal(custom.values.damage4, 80);
    assert.equal(custom.values.meleePercent, 0, "percentages are 0-1000");
    assert.equal(custom.values.crit3, 150, "empty is the default");
    assert.deepEqual(custom.properties.accurate, { flat: 0, perRank: 400, min: 1, max: 2 });
    assert.deepEqual(custom.properties.phasic, { ...PROPERTY_DEFAULTS.phasic, min: 0, max: 0 });
    assert.equal(total({ type: "weapon", damage: 4, crit: 5, range: "Short" }, [], custom), 80);
});

test("the description lists each line and the total, escaped", () => {
    const html = priceHtml({ lines: [{ label: "Damage 6", amount: 175 }, { label: "<Melee> weapon", amount: -100 }], total: 75 }, { maker: "Tomass" });
    assert.match(html, /<h3>Price<\/h3>/);
    assert.match(html, /&lt;Melee&gt; weapon: −100/);
    assert.match(html, /75 credits, from the Item Maker price table; made by Tomass/);
    assert.equal(priceHtml({ lines: [], total: 0 }), "");
});

test("design warnings: ranks outside the recommended ones, too many properties, Pierce with Breach, rare crits", () => {
    const weapon = normalizeDraft({ type: "weapon", damage: 6, crit: 3 });
    assert.deepEqual(designWarnings(weapon, table, [{ name: "Stun (active)", rank: 4 }, { name: "Accurate", rank: 1 }]), []);
    const warnings = designWarnings(normalizeDraft({ type: "weapon", crit: 1 }), table, [
        { name: "Stun (active)", rank: 6 }, { name: "Cumbersome (passive)", rank: 1 }, { name: "Pierce", rank: 2 },
        { name: "Breach", rank: 1 }, { name: "Blast", rank: 3 }
    ]);
    assert.match(warnings[0], /Stun \(active\) 6: recommended rank 1–4/);
    assert.match(warnings[1], /Cumbersome \(passive\) 1: recommended rank 2 or more \(rank 1 does nothing\)/);
    assert.ok(warnings.some(w => /5 properties/.test(w)));
    assert.ok(warnings.some(w => /Pierce and Breach/.test(w)));
    assert.ok(warnings.some(w => /Critical rating 1/.test(w)));
    const relaxed = normalizeTable({ properties: { stun: { max: 0 } }, values: { maxProperties: 0 } });
    assert.deepEqual(designWarnings(weapon, relaxed, [{ name: "Stun", rank: 9 }, ...Array.from({ length: 6 }, (_, i) => ({ name: `X${i}`, rank: 1 }))]), []);
});

test("crafting: half the price in materials, difficulty from rarity, time in hours or days", () => {
    const pistol = normalizeDraft({ type: "weapon", skill: "Ranged-Light", rarity: 3, encumbrance: 1 });
    assert.deepEqual(craftingPlan(pistol, table, 250), { materials: 125, skill: "Mechanics", dice: 2, difficulty: "Average", time: 4, fabricator: 2, unit: "hour" });
    const rifle = craftingPlan(normalizeDraft({ type: "weapon", rarity: 7, encumbrance: 4 }), table, 1201);
    assert.deepEqual([rifle.materials, rifle.difficulty, rifle.time, rifle.fabricator, rifle.unit], [601, "Daunting", 8, 4, "day"]);
    assert.equal(craftingPlan(normalizeDraft({ type: "weapon", skill: "Tech" }), table, 0).skill, "Computers");
    assert.equal(craftingPlan(normalizeDraft({ type: "gear", craftSkill: "Medicine" }), table, 0).skill, "Medicine");
    assert.equal(craftingPlan(normalizeDraft({ type: "gear", rarity: 20 }), table, 0).difficulty, "Formidable");
    assert.equal(craftingPlan(normalizeDraft({ type: "gear" }), table, 0).difficulty, "Simple");
    const html = craftingHtml(craftingPlan(pistol, table, 250));
    assert.match(html, /Materials: 125 credits/);
    assert.match(html, /Check: Mechanics, Average \(2 difficulty dice\)/);
    assert.match(html, /Time: 4 hours \(2 hours with a fabricator\)/);
});

test("the description's Warnings section lists the design warnings, escaped; none without warnings", () => {
    const html = warningsHtml(["Stun (active) 6: recommended rank 1–4.", "<b>x</b>"]);
    assert.match(html, /<h3>Warnings<\/h3><ul><li>Stun \(active\) 6: recommended rank 1–4\.<\/li><li>&lt;b&gt;x&lt;\/b&gt;<\/li><\/ul>/);
    assert.equal(warningsHtml([]), "");
});
