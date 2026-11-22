import { test } from "node:test";
import assert from "node:assert/strict";

import { hexToWeb, pointsToPolygon, sceneOverrides } from "../scripts/fog/fog-core.js";

test("colours print as css", () => {
    assert.equal(hexToWeb("0xff6400"), "#ff6400");
});

test("polygon points are flattened and closed", () => {
    assert.deepEqual(pointsToPolygon([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]), [1, 2, 3, 4, 5, 6, 1, 2]);
    assert.deepEqual(pointsToPolygon([]), []);
});

test("scene overrides keep only values that differ from the world default", () => {
    const defaults = { blurEnable: true, blurRadius: 5, gmColorTint: { css: "#000000" }, fogImageOverlayFilePath: null };
    const { set, unset } = sceneOverrides({ blurEnable: false, blurRadius: 5, gmColorTint: "#000000", fogImageOverlayFilePath: "" }, defaults);
    assert.deepEqual(set, { blurEnable: false });
    assert.deepEqual(unset.sort(), ["blurRadius", "fogImageOverlayFilePath", "gmColorTint"]);
    assert.deepEqual(sceneOverrides({ blurRadius: 0 }, defaults).set, { blurRadius: 0 });
});
