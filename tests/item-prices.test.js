import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeDraft } from "../scripts/item-maker/item-maker-core.js";
import { PROPERTY_DEFAULTS, normalizeTable, priceBreakdown, priceHtml, propertyKey, propertyPrice } from "../scripts/item-maker/item-prices.js";

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
    assert.deepEqual(custom.properties.accurate, { flat: 0, perRank: 400 });
    assert.deepEqual(custom.properties.phasic, PROPERTY_DEFAULTS.phasic);
    assert.equal(total({ type: "weapon", damage: 4, crit: 5, range: "Short" }, [], custom), 80);
});

test("the description lists each line and the total, escaped", () => {
    const html = priceHtml({ lines: [{ label: "Damage 6", amount: 175 }, { label: "<Melee> weapon", amount: -100 }], total: 75 }, { maker: "Tomass" });
    assert.match(html, /<h3>Price<\/h3>/);
    assert.match(html, /&lt;Melee&gt; weapon: −100/);
    assert.match(html, /75 credits, from the Item Maker price table; made by Tomass/);
    assert.equal(priceHtml({ lines: [], total: 0 }), "");
});
