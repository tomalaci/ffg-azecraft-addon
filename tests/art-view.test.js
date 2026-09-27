import { test } from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_ART_VIEW,
    MAX_ART_ZOOM,
    MIN_ART_ZOOM,
    artOverflow,
    artViewStyle,
    normalizeArtView,
    panArtView,
    zoomArtView
} from "../scripts/mission-dashboard/art-view.js";

// A 171×231 card art box (1920px layout) and a portrait image of 865×1080.
const box = { width: 171, height: 231 };
const portrait = { width: 865, height: 1080 };

test("default view: 1.5× cover, centred horizontally, top-aligned", () => {
    assert.deepEqual(DEFAULT_ART_VIEW, { x: 50, y: 0, z: 1.5 });
    assert.equal(artViewStyle(undefined), "--azd-art-x: 50; --azd-art-y: 0; --azd-art-z: 1.5;");
});

test("the extra default zoom lets art pan on both axes", () => {
    const atCover = artOverflow(box, portrait, 1);
    assert.equal(Math.round(atCover.y), 0, "at plain cover a tall portrait only pans sideways");

    const zoomed = artOverflow(box, portrait, 1.5);
    assert.ok(zoomed.x > 0 && zoomed.y > 0);
    // cover scale = 231/1080; 1.5× → image 277.5 × 346.5 in a 171 × 231 box
    assert.equal(Math.round(zoomed.x), 107);
    assert.equal(Math.round(zoomed.y), 116);
});

test("panning follows the pointer 1:1 and stops at the image edges", () => {
    const overflow = artOverflow(box, portrait, 1.5);
    const right = panArtView(DEFAULT_ART_VIEW, -overflow.x / 4, 0, overflow);
    assert.equal(right.x, 75);
    const down = panArtView(DEFAULT_ART_VIEW, 0, -overflow.y / 2, overflow);
    assert.equal(down.y, 50);
    const beyond = panArtView(DEFAULT_ART_VIEW, 5000, 5000, overflow);
    assert.deepEqual([beyond.x, beyond.y], [0, 0]);
    // No overflow on an axis: that axis does not move.
    assert.equal(panArtView(DEFAULT_ART_VIEW, 40, 0, { x: 0, y: 10 }).x, 50);
});

test("zoom is clamped and keeps the pan position; bad saved data falls back", () => {
    assert.equal(zoomArtView(DEFAULT_ART_VIEW, 0.25).z, 1.75);
    assert.equal(zoomArtView({ x: 20, y: 30, z: 3.9 }, 0.25).z, MAX_ART_ZOOM);
    assert.equal(zoomArtView({ x: 20, y: 30, z: 1.1 }, -0.25).z, MIN_ART_ZOOM);
    assert.deepEqual(zoomArtView({ x: 20, y: 30, z: 2 }, 0.1), { x: 20, y: 30, z: 2.1 });
    assert.deepEqual(normalizeArtView({ x: "a", y: 500, z: -3 }), { x: 50, y: 100, z: MIN_ART_ZOOM });
});
