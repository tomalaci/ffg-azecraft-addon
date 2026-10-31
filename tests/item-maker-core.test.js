import { test } from "node:test";
import assert from "node:assert/strict";

import {
    buildItemData,
    cleanFolderPath,
    cleanImagePath,
    defaultImage,
    descriptionHtml,
    iconSource,
    isWithinRoots,
    nameSimilarity,
    normalizeDraft,
    searchProperties,
    similarItems,
    validateDraft
} from "../scripts/item-maker/item-maker-core.js";

test("drafts are cleaned: unknown types, numbers clamped, text trimmed", () => {
    const draft = normalizeDraft({ type: "talent", name: "  Phalanx  ", damage: "7.9", rarity: 50, basePrice: -4, quantity: 0, range: "Far", extra: "x" });
    assert.equal(draft.type, "weapon");
    assert.equal(draft.name, "Phalanx");
    assert.equal(draft.damage, 7);
    assert.equal(draft.rarity, 20);
    assert.equal(draft.basePrice, 0);
    assert.equal(draft.quantity, 1);
    assert.equal(draft.range, "Short");
    assert.equal("extra" in draft, false);
    assert.deepEqual(validateDraft(normalizeDraft({ name: " " })), ["The item needs a name."]);
});

test("properties: valid ids only, no duplicates, only for types that have them", () => {
    const draft = normalizeDraft({ type: "weapon", properties: [{ id: "abc123", rank: 3 }, { id: "abc123", rank: 1 }, { id: "../x" }, { id: "def456" }] });
    assert.deepEqual(draft.properties, [{ id: "abc123", rank: 3 }, { id: "def456", rank: 1 }]);
});

test("descriptions are escaped paragraphs", () => {
    assert.equal(descriptionHtml("A <b>blade</b>.\nSharp.\n\nSecond"), "<p>A &lt;b&gt;blade&lt;/b&gt;.<br>Sharp.</p><p>Second</p>");
    assert.equal(descriptionHtml("  "), "");
});

test("a weapon gets its stats, Brawn for melee, and property copies with ranks", () => {
    const blast = { _id: "blast1", name: "Blast (active)", type: "itemmodifier", system: { rank: 0, type: "all" } };
    let n = 0;
    const data = buildItemData(normalizeDraft({ type: "weapon", name: "Omni-blade", skill: "Melee", damage: 2, crit: 3, range: "Engaged", properties: [{ id: "blast1", rank: 4 }, { id: "gone" }] }), {
        properties: new Map([["blast1", blast]]),
        newId: () => `new${++n}`,
        folder: "F1",
        ownership: { default: 2, u1: 3 },
        flags: { m: { itemMaker: { createdBy: "u1" } } }
    });
    assert.equal(data.type, "weapon");
    assert.equal(data.img, defaultImage("weapon"));
    assert.equal(data.folder, "F1");
    assert.deepEqual(data.system.damage, { value: 2 });
    assert.deepEqual(data.system.characteristic, { value: "Brawn" });
    assert.equal(data.system.itemmodifier.length, 1);
    assert.equal(data.system.itemmodifier[0].id, "new1");
    assert.equal(data.system.itemmodifier[0].system.rank, 4);
    assert.equal(data.system.itemmodifier[0].system.rank_current, 4);
    assert.equal(blast.system.rank, 0, "the source property is not changed");
    assert.equal(data.system.itemmodifier[0]._id, "blast1", "the copy keeps _id for the system's rank dialog");
});

test("other types only get their own fields; the price is the worked-out one", () => {
    const armour = buildItemData(normalizeDraft({ type: "armour", name: "Suit", soak: 2, defence: 1, basePrice: 999 }), { price: { total: 750, html: "<h3>Price</h3>" } });
    assert.deepEqual(armour.system.soak, { value: 2 });
    assert.equal(armour.system.damage, undefined);
    assert.deepEqual(armour.system.price, { value: 750 });
    assert.ok(armour.system.description.endsWith("<h3>Price</h3>"));
    const attachment = buildItemData(normalizeDraft({ type: "itemattachment", name: "Scope" }));
    assert.equal(attachment.img, "systems/starwarsffg/images/defaults/items/attachment.png");
    assert.equal(armour.img, "systems/starwarsffg/images/defaults/items/armor.png");
    assert.equal(normalizeDraft({ type: "ability" }).type, "weapon", "only weapons, armour, gear and attachments");
});

test("image paths: relative image files only", () => {
    assert.equal(cleanImagePath("icons/svg/sword.svg"), "icons/svg/sword.svg");
    assert.equal(cleanImagePath("worlds/test/Mass%20Effect/x.webp"), "worlds/test/Mass%20Effect/x.webp");
    assert.equal(cleanImagePath("javascript:alert(1).png"), null);
    assert.equal(cleanImagePath("data:image/png;base64,xx"), null);
    assert.equal(cleanImagePath("../secret.png"), null);
    assert.equal(cleanImagePath("icons/a/%2e%2e/b.png"), null);
    assert.equal(cleanImagePath("/etc/x.png"), null);
    assert.equal(cleanImagePath("icons/readme.txt"), null);
});

test("icon folders: clean paths, sources, and staying inside the allowed folders", () => {
    assert.equal(cleanFolderPath(" /icons/weapons/ "), "icons/weapons");
    assert.equal(cleanFolderPath("icons/../worlds"), null);
    assert.equal(cleanFolderPath("https://x.y/z"), null);
    assert.equal(iconSource("icons/svg"), "public");
    assert.equal(iconSource("systems/starwarsffg/images"), "data");
    const roots = ["icons/weapons", "systems/starwarsffg/images"];
    assert.equal(isWithinRoots("icons/weapons/guns", roots), true);
    assert.equal(isWithinRoots("icons/weapons", roots), true);
    assert.equal(isWithinRoots("icons/weaponsx", roots), false);
    assert.equal(isWithinRoots("icons/weapons/../../worlds", roots), false);
    assert.equal(isWithinRoots("worlds/test", roots), false);
    // Folder paths from Foundry's browser are URL-encoded.
    assert.equal(cleanFolderPath("worlds/test/Mass%20Effect"), "worlds/test/Mass Effect");
    assert.equal(isWithinRoots("worlds/test/Mass%20Effect/Weapons", ["worlds/test/Mass%20Effect"]), true);
    assert.equal(isWithinRoots("worlds/test/Mass Effect/Weapons", ["worlds/test/Mass%20Effect"]), true);
});

test("similar items: same words and close spellings rank first", () => {
    const items = [
        { id: "1", name: "Heavy Pistol", type: "weapon" },
        { id: "2", name: "Light Pistol", type: "weapon" },
        { id: "3", name: "Medkit", type: "gear" },
        { id: "4", name: "Pistol Scope", type: "itemattachment" },
        { id: "5", name: "HE Grenade", type: "weapon" }
    ];
    const found = similarItems("heavy pistl", items);
    assert.equal(found[0].name, "Heavy Pistol");
    assert.ok(found.some(i => i.name === "Light Pistol"));
    assert.ok(!found.some(i => i.name === "Medkit"));
    assert.ok(!found.some(i => i.name === "HE Grenade"), "a two-letter word is not a prefix match");
    assert.deepEqual(similarItems("h", items), []);
    assert.equal(nameSimilarity("Blast (active)", "blast"), 1);
});

test("property search matches every typed word", () => {
    const props = [{ id: "a", name: "Auto-Fire (active)" }, { id: "b", name: "Blast (active)" }, { id: "c", name: "Burn (active)" }];
    assert.deepEqual(searchProperties("b", props).map(p => p.id), ["b", "c"]);
    assert.deepEqual(searchProperties("auto fire", props).map(p => p.id), ["a"]);
});
