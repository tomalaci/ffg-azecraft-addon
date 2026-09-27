import { test } from "node:test";
import assert from "node:assert/strict";

import {
    MYSTERY_MAN,
    addonDefaultArt,
    defaultArtConfig,
    isPlaceholderArt,
    normalizeArtConfig,
    placedTokenUpdate,
    placeholderUpdate,
    resolveArt,
    systemDefaultArt
} from "../scripts/default-art/default-art-core.js";

const custom = { ...defaultArtConfig(), minion: { art: "worlds/me/grunt.webp", token: "worlds/me/grunt-token.webp" } };

test("normalizeArtConfig fills every type and falls back to the addon art", () => {
    const config = normalizeArtConfig({ rival: { art: "  ", token: " t.png " }, bogus: {} });
    assert.equal(config.rival.art, addonDefaultArt("rival"));
    assert.equal(config.rival.token, "t.png");
    assert.equal(config.nemesis.art, addonDefaultArt("nemesis"));
    assert.equal(config.bogus, undefined);
    assert.deepEqual(normalizeArtConfig(null), defaultArtConfig());
});

test("resolveArt uses the portrait for an empty token and ignores unknown types", () => {
    assert.deepEqual(resolveArt(defaultArtConfig(), "minion"), { art: addonDefaultArt("minion"), token: addonDefaultArt("minion") });
    assert.equal(resolveArt(custom, "minion").token, "worlds/me/grunt-token.webp");
    assert.equal(resolveArt(custom, "homebrew"), null);
});

test("isPlaceholderArt recognises system, generic and addon art only", () => {
    assert.ok(isPlaceholderArt("rival", systemDefaultArt("rival")));
    assert.ok(isPlaceholderArt("rival", MYSTERY_MAN));
    assert.ok(isPlaceholderArt("rival", ""));
    assert.ok(isPlaceholderArt("rival", addonDefaultArt("rival")));
    assert.ok(!isPlaceholderArt("rival", systemDefaultArt("nemesis")));
    assert.ok(!isPlaceholderArt("rival", "worlds/me/rival.webp"));
});

test("a new actor with the system placeholder gets the configured portrait and token", () => {
    const update = placeholderUpdate({ type: "minion", img: systemDefaultArt("minion"), token: systemDefaultArt("minion") }, custom);
    assert.deepEqual(update, { img: "worlds/me/grunt.webp", token: "worlds/me/grunt-token.webp" });
});

test("an empty token follows a replaced portrait", () => {
    const update = placeholderUpdate({ type: "nemesis", img: systemDefaultArt("nemesis") }, defaultArtConfig());
    assert.deepEqual(update, { img: addonDefaultArt("nemesis"), token: addonDefaultArt("nemesis") });
});

test("chosen art is never replaced", () => {
    assert.equal(placeholderUpdate({ type: "rival", img: "worlds/me/boss.webp", token: "worlds/me/boss.webp" }, defaultArtConfig()), null);
    // A generic token next to a chosen portrait is left for the system to handle.
    assert.equal(placeholderUpdate({ type: "rival", img: "worlds/me/boss.webp", token: MYSTERY_MAN }, defaultArtConfig()), null);
    // ...but a Star Wars placeholder token is still swapped.
    assert.deepEqual(placeholderUpdate({ type: "rival", img: "worlds/me/boss.webp", token: systemDefaultArt("rival") }, defaultArtConfig()),
        { token: addonDefaultArt("rival") });
});

test("up-to-date actors and unknown types need no update", () => {
    const art = addonDefaultArt("vehicle");
    assert.equal(placeholderUpdate({ type: "vehicle", img: art, token: art }, defaultArtConfig()), null);
    assert.equal(placeholderUpdate({ type: "homebrew", img: MYSTERY_MAN }, defaultArtConfig()), null);
});

test("after a configuration change the previous default art counts as placeholder", () => {
    const actor = { type: "minion", img: "worlds/me/grunt.webp", token: "worlds/me/grunt-token.webp" };
    assert.equal(placeholderUpdate(actor, defaultArtConfig()), null);
    assert.deepEqual(placeholderUpdate(actor, defaultArtConfig(), custom), { img: addonDefaultArt("minion"), token: addonDefaultArt("minion") });
});

test("placed tokens swap only placeholder images", () => {
    assert.equal(placedTokenUpdate("minion", systemDefaultArt("minion"), custom), "worlds/me/grunt-token.webp");
    assert.equal(placedTokenUpdate("minion", "worlds/me/other.webp", custom), null);
    assert.equal(placedTokenUpdate("minion", "worlds/me/grunt-token.webp", custom), null);
    assert.equal(placedTokenUpdate("minion", "", custom), null);
    assert.equal(placedTokenUpdate(undefined, systemDefaultArt("minion"), custom), null);
});
