import { test } from "node:test";
import assert from "node:assert/strict";

import { storyPointsBox } from "../scripts/story-points/story-layout.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const players = rect(16, 983, 200, 81);
const hotbar = rect(578, 1004, 764, 60);

test("wide screens: horizontal, right of the player list, filling the corner under the rail", () => {
    const box = storyPointsBox({ width: 1920, height: 1080, players, hotbar, rail: rect(100, 128, 420, 648) });
    assert.deepEqual(box, { left: 226, bottom: 16, width: 294, maxHeight: 278, vertical: false });
});

test("no rail (dashboard hidden): up to the default width, clear of the hotbar", () => {
    const box = storyPointsBox({ width: 1920, height: 1080, players, hotbar });
    assert.equal(box.vertical, false);
    assert.equal(box.width, 330);
    const squeezed = storyPointsBox({ width: 1920, height: 1080, players, hotbar: rect(400, 1004, 600, 60) });
    assert.equal(squeezed.vertical, true, "the hotbar leaves only 164px");
});

test("narrow corner: vertical bar", () => {
    const box = storyPointsBox({ width: 1280, height: 800, players: rect(16, 703, 200, 81), rail: rect(100, 100, 280, 400) });
    assert.equal(box.vertical, true);
    assert.equal(box.left, 226);
    assert.equal(box.width, 150);
    assert.equal(box.maxHeight, 274);
});
