import { test } from "node:test";
import assert from "node:assert/strict";

import { storyPointsBox } from "../scripts/story-points/story-layout.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const controls = rect(16, 16, 72, 400);
const hotbar = rect(578, 1004, 764, 60);

test("with the dashboard: bottom-left corner, stretched to the mission tabs", () => {
    assert.deepEqual(storyPointsBox({ width: 1920, height: 1080, controls, hotbar, barLeft: 544 }), { left: 16, bottom: 16, width: 518 });
});

test("without the dashboard: default width, clear of the hotbar", () => {
    assert.deepEqual(storyPointsBox({ width: 1920, height: 1080, controls, hotbar }), { left: 16, bottom: 16, width: 330 });
    assert.equal(storyPointsBox({ width: 1920, height: 1080, controls, hotbar: rect(300, 1004, 600, 60) }).width, 274);
});

test("never narrower than the bar's minimum", () => {
    assert.equal(storyPointsBox({ width: 1280, height: 800, controls, barLeft: 120 }).width, 260);
    assert.deepEqual(storyPointsBox({ width: 800, height: 600 }), { left: 16, bottom: 16, width: 330 });
});
