import { test } from "node:test";
import assert from "node:assert/strict";

import { isReadied, normalizeReadied, omniToolStatus, pickOmniTool, readyUnits, toggleReadied } from "../scripts/powers/omni-tool-core.js";
import { POWER_MODIFIER_CATALOG } from "../scripts/powers/power-catalog.js";

const tech = POWER_MODIFIER_CATALOG.tech.categories.filter(c => !c.general);
const units = readyUnits(tech);

test("every attack element, augment mode and construct is its own readied power; sabotage is one", () => {
    const ids = units.map(u => u.id);
    assert.ok(ids.includes("tech-attack:cryo-blast"));
    assert.ok(ids.includes("tech-augment:tactical-cloak"));
    assert.ok(ids.includes("tech-construct:combat-drone"));
    assert.ok(ids.includes("tech-sabotage"));
    assert.equal(ids.filter(id => id.startsWith("tech-sabotage")).length, 1);
    assert.equal(units.length, 13);
});

test("readied list: known ids only, no duplicates, toggling", () => {
    assert.deepEqual(normalizeReadied(["tech-sabotage", "bogus", "tech-attack:overload", "tech-sabotage"], units), ["tech-attack:overload", "tech-sabotage"]);
    const on = toggleReadied([], "tech-attack:incinerate", units);
    assert.deepEqual(on, ["tech-attack:incinerate"]);
    assert.deepEqual(toggleReadied(on, "tech-attack:incinerate", units), []);
    assert.ok(isReadied(on, "tech-attack", "incinerate"));
    assert.ok(!isReadied(on, "tech-attack", "overload"));
    assert.ok(isReadied(["tech-sabotage"], "tech-sabotage", "vi-hacking"));
});

test("pickOmniTool: the equipped omni-tool, else the first", () => {
    const items = [{ type: "weapon", name: "Heavy Pistol", equipped: true }, { type: "weapon", name: "Omni-Tool - Basic", equipped: false }, { type: "weapon", name: "Omni-Tool - Nexus", equipped: true }];
    assert.equal(pickOmniTool(items).name, "Omni-Tool - Nexus");
    assert.equal(pickOmniTool(items.slice(0, 2)).name, "Omni-Tool - Basic");
    assert.equal(pickOmniTool([{ type: "gear", name: "Omni-tool manual" }]), null);
});

test("omniToolStatus counts software and readied powers against slots, and powers against Tech ranks", () => {
    const tool = { slots: 3, software: [{ name: "Advanced Scanner", slots: 1 }] };
    assert.deepEqual(omniToolStatus(tool, 1, 2, 2), { hasTool: true, total: 4, used: 3, softwareSlots: 1, readied: 2, techRank: 2, overSlots: false, overRank: false });
    const over = omniToolStatus(tool, 0, 1, 3);
    assert.equal(over.overSlots, true);
    assert.equal(over.overRank, true);
    assert.equal(omniToolStatus(null, 0, 2, 1).hasTool, false);
});
