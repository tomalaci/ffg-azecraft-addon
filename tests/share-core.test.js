import { test } from "node:test";
import assert from "node:assert/strict";

import { imageLink, isFor, recipients, scaled, shareTitle, shareToLabel, sideSteps } from "../scripts/share/share-core.js";

test("sideSteps shrinks from 1600 px down to the minimum, never enlarging", () => {
    assert.deepEqual(sideSteps(4000), [1600, 1280, 1024, 819, 655, 600]);
    assert.deepEqual(sideSteps(800), [800, 640, 600]);
    assert.deepEqual(sideSteps(500), [500]);
});

test("scaled keeps the aspect ratio", () => {
    assert.deepEqual(scaled(4000, 2000, 1600), { width: 1600, height: 800 });
    assert.deepEqual(scaled(300, 200, 1600), { width: 300, height: 200 });
});

test("recipients: everyone, or the chosen users without the sender", () => {
    assert.equal(recipients(true, ["a"], "me"), null);
    assert.deepEqual(recipients(false, ["a", "me", "a", "b"], "me"), ["a", "b"]);
    assert.deepEqual(recipients(false, [], "me"), []);
});

test("isFor: everyone but the sender, or only the chosen users", () => {
    assert.equal(isFor({ from: "me", to: null }, "you"), true);
    assert.equal(isFor({ from: "me", to: null }, "me"), false);
    assert.equal(isFor({ from: "me", to: ["you"] }, "you"), true);
    assert.equal(isFor({ from: "me", to: ["you"] }, "them"), false);
    assert.equal(isFor(null, "you"), false);
});

test("imageLink accepts web links and Foundry image paths, not text", () => {
    assert.equal(imageLink(" https://i.imgur.com/abc.png "), "https://i.imgur.com/abc.png");
    assert.equal(imageLink("worlds/test/Mass%20Effect/a.webp"), "worlds/test/Mass%20Effect/a.webp");
    assert.equal(imageLink("look at this"), null);
    assert.equal(imageLink(""), null);
});

test("shareTitle", () => {
    assert.equal(shareTitle("Jesper", ""), "Shared by Jesper");
    assert.equal(shareTitle("Jesper", " The door code "), "Shared by Jesper: The door code");
});

test("shareToLabel", () => {
    assert.equal(shareToLabel(true, 3), "everyone online");
    assert.equal(shareToLabel(false, 1), "the 1 person chosen");
    assert.equal(shareToLabel(false, 2), "the 2 people chosen");
});
