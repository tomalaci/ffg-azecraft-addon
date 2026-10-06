import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCharacterCard, hasRichFormatting, htmlToText, textToHtml, toNumber } from "../scripts/mission-dashboard/actor-adapter.js";
import { LEVELS, makeActor, makeItem, makeUser } from "./fixtures.js";

const slot = { id: "slot-1", actorUuid: "Actor.a1" };
const player = makeUser();
const gm = makeUser({ isGM: true });

test("maps sheet stats, species and career items", () => {
    const card = buildCharacterCard(slot, makeActor(), player);

    assert.equal(card.availability, "available");
    assert.equal(card.subtitle, "Turian · Pilot");
    assert.equal(card.wounds.valueLabel, "4");
    assert.equal(card.wounds.thresholdLabel, "12");
    assert.equal(card.strain.valueLabel, "0");
    assert.equal(card.soak, "2");
    assert.deepEqual(card.defense, { melee: "0", ranged: "1" });
    assert.deepEqual(card.criticalInjuries, []);
});

test("keeps zero values and shows missing values as a dash", () => {
    const actor = makeActor({
        stats: {
            wounds: { value: null, max: 11 },
            strain: { value: 0, max: 14 },
            soak: { value: 0 },
            defence: { melee: undefined, ranged: 0 }
        }
    });
    const card = buildCharacterCard(slot, actor, player);

    assert.equal(card.wounds.valueLabel, "—");
    assert.equal(card.wounds.percent, 0);
    assert.equal(card.strain.valueLabel, "0");
    assert.equal(card.soak, "0");
    assert.equal(card.defense.melee, "—");
    assert.equal(card.defense.ranged, "0");
    assert.equal(toNumber(""), null);
    assert.equal(toNumber("3"), 3);
});

test("values above threshold stay accurate while the bar clamps", () => {
    const actor = makeActor({ stats: { wounds: { value: 15, max: 12 }, strain: { value: 12, max: 12 }, soak: { value: 2 }, defence: {} } });
    const card = buildCharacterCard(slot, actor, player);

    assert.equal(card.wounds.valueLabel, "15");
    assert.equal(card.wounds.percent, 100);
    assert.equal(card.wounds.overThreshold, true);
    // Equal to threshold is not "over": no rules status is invented from >=.
    assert.equal(card.strain.overThreshold, false);
});

test("extracts critical injuries in sheet order with severity", () => {
    const actor = makeActor({
        items: [
            makeItem({ id: "c2", type: "criticalinjury", name: "Hamstrung", severity: 2, sort: 200 }),
            makeItem({ id: "c1", type: "criticalinjury", name: "Bruised", severity: 1, sort: 100 }),
            makeItem({ id: "w", type: "weapon", name: "Avenger" })
        ]
    });
    const card = buildCharacterCard(slot, actor, player);

    assert.deepEqual(card.criticalInjuries.map(c => [c.name, c.severity]), [["Bruised", 1], ["Hamstrung", 2]]);
    assert.equal(card.criticalInjuries[0].uuid, "Actor.a1.Item.c1");
});

test("falls back to legacy species/career text fields", () => {
    const actor = makeActor({ items: [], system: { species: { value: "Asari" }, career: { value: "" } } });
    assert.equal(buildCharacterCard(slot, actor, player).subtitle, "Asari");
});

test("art prefers the full-art flag, then the portrait", () => {
    const flagged = makeActor({ flags: { "ffg-azecraft-addon": { dashboard: { fullArt: "worlds/x/full.webp" } } } });
    const card = buildCharacterCard(slot, flagged, player);

    assert.equal(card.art, "worlds/x/full.webp");
    assert.equal(card.portrait, "worlds/x/pc.png");
    assert.equal(card.hasFullArt, true);
    assert.equal(buildCharacterCard(slot, makeActor(), player).art, "worlds/x/pc.png");
});

test("permission filtering: none, limited, observer, owner", () => {
    assert.equal(buildCharacterCard(slot, makeActor({ level: LEVELS.NONE }), player).availability, "restricted");
    assert.equal(buildCharacterCard(slot, makeActor({ level: LEVELS.NONE }), player).name, undefined);

    const limited = buildCharacterCard(slot, makeActor({ level: LEVELS.LIMITED }), player);
    assert.equal(limited.availability, "limited");
    assert.equal(limited.wounds, undefined);
    assert.equal(limited.desire, undefined);

    const observer = buildCharacterCard(slot, makeActor({ level: LEVELS.OBSERVER }), player);
    assert.equal(observer.canEditDesire, false);

    const owner = buildCharacterCard(slot, makeActor({ level: LEVELS.OWNER }), player);
    assert.equal(owner.canEditDesire, true);
    assert.equal(buildCharacterCard(slot, makeActor({ level: LEVELS.NONE }), gm).canEditDesire, true);
});

test("empty, missing and unsupported slots", () => {
    assert.equal(buildCharacterCard({ id: "s", actorUuid: null }, null, player).availability, "empty");
    assert.equal(buildCharacterCard(slot, null, player).availability, "missing");

    const vehicle = makeActor();
    delete vehicle.system.stats;
    const card = buildCharacterCard(slot, vehicle, player);
    assert.equal(card.availability, "unsupported");
    assert.equal(card.soak, "—");
});

test("Desire comes from the sheet's Genesys motivation field", () => {
    const actor = makeActor({ system: { motivation: { desire: "<p>Fly something &amp; crash it.</p><p>Then a cocktail.</p>" } } });
    const card = buildCharacterCard(slot, actor, player);

    assert.equal(card.hasDesire, true);
    assert.equal(card.desire, "Fly something & crash it.\n\nThen a cocktail.");
    assert.equal(card.desireRich, false);

    // A character whose sheet Desire was never filled in has no motivation data yet: still editable.
    const blank = buildCharacterCard(slot, makeActor(), gm);
    assert.equal(blank.hasDesire, true);
    assert.equal(blank.desire, "");
    assert.equal(blank.canEditDesire, true);

    // Actor types whose sheet has no Motivations (e.g. vehicles) get no Desire section.
    const vehicle = { ...makeActor(), type: "vehicle" };
    assert.equal(buildCharacterCard(slot, vehicle, gm).hasDesire, false);
    assert.equal(buildCharacterCard(slot, vehicle, gm).canEditDesire, false);
});

test("plain-text Desire edits round-trip through the sheet's HTML safely", () => {
    const html = textToHtml("Fly <fast> & loud\nno brakes\n\n\n\nSecond");
    assert.equal(html, "<p>Fly &lt;fast&gt; &amp; loud<br>no brakes</p><p>Second</p>");
    assert.equal(htmlToText(html), "Fly <fast> & loud\nno brakes\n\nSecond");
    // Indentation from formatted HTML (or from an earlier draft) is not part of the text.
    assert.equal(htmlToText("<p>One!</p>\n        <p>  Two\n        lines</p>"), "One!\n\nTwo\nlines");
    assert.equal(hasRichFormatting(html), false);
    assert.equal(hasRichFormatting("<p><strong>bold</strong></p>"), true);
    assert.equal(hasRichFormatting("<p><a href=\"x\">link</a></p>"), true);
});
