import { test } from "node:test";
import assert from "node:assert/strict";

import { ammoForItemName, ammoRating, findAmmo, qualityKey, withAmmoQualities } from "../scripts/ammo/ammo-catalog.js";

test("ammo gear is recognised by name", () => {
    assert.equal(ammoForItemName("AP Ammo").id, "armor-piercing");
    assert.equal(ammoForItemName("Armor-Piercing Ammunition").id, "armor-piercing");
    assert.equal(ammoForItemName("Incendiary Ammo").id, "incendiary");
    assert.equal(ammoForItemName("Shredder ammo").id, "shredder");
    assert.equal(ammoForItemName("Cryo Grenade"), null);
    assert.equal(ammoForItemName("Assault Rifle"), null);
    assert.equal(ammoForItemName("Limited Ammo (passive)"), null);
});

test("quality keys ignore the (active)/(passive) suffix", () => {
    assert.equal(qualityKey("Burn (active)"), "burn");
    assert.equal(qualityKey("Pierce"), "pierce");
});

test("ammo gains a quality or raises an existing one by the rules", () => {
    assert.equal(ammoRating(findAmmo("incendiary"), 0), 2);
    assert.equal(ammoRating(findAmmo("incendiary"), 1), 2);
    assert.equal(ammoRating(findAmmo("incendiary"), 3), 4);
    assert.equal(ammoRating(findAmmo("cryo"), 1), 3);
    assert.equal(ammoRating(findAmmo("shredder"), 0), 3);
});

test("withAmmoQualities adds a new quality with its world item", () => {
    const qualities = [{ name: "Accurate", totalRanks: 1, summarizedRanks: { mods: 1 } }];
    const known = { burn: { name: "Burn (active)", img: "burn.svg", description: "<p>Burn</p>" } };
    const result = withAmmoQualities(qualities, findAmmo("incendiary"), known);
    assert.equal(result.length, 2);
    assert.deepEqual(result[1], {
        name: "Burn (active)", img: "burn.svg", description: "<p>Burn</p>", itemIndex: 1, totalRanks: 2,
        includeControls: false, summarizedRanks: { "Incendiary Ammo": 2 }
    });
    assert.equal(qualities.length, 1, "input untouched");
});

test("withAmmoQualities raises an existing quality and notes Explosive's Triumph", () => {
    const qualities = [{ name: "Disorient (active)", totalRanks: 3, summarizedRanks: { mods: 3 } }];
    const result = withAmmoQualities(qualities, findAmmo("explosive"));
    assert.equal(result[0].totalRanks, 4);
    assert.deepEqual(result[0].summarizedRanks, { mods: 3, "Explosive Ammo": 1 });
    assert.equal(result[1].name, "Explosive Ammo");
    assert.match(result[1].description, /Triumph/);
    assert.equal(qualities[0].totalRanks, 3, "input untouched");
});
