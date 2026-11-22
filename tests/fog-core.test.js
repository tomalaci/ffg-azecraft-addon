import { test } from "node:test";
import assert from "node:assert/strict";

import { appendHistory, hexToPercent, hexToWeb, normalizeHistory, percentToHex, pointsToPolygon, sceneOverrides, undoHistory } from "../scripts/fog/fog-core.js";

test("brush opacity: percent to grey and back", () => {
    assert.equal(percentToHex(0), "0x000000");
    assert.equal(percentToHex(100), "0xffffff");
    assert.equal(percentToHex(50), "0x808080");
    assert.equal(hexToPercent("0xffffff"), 100);
    assert.equal(hexToPercent(percentToHex(0)), 0);
    assert.equal(hexToWeb("0xff6400"), "#ff6400");
});

test("polygon points are flattened and closed", () => {
    assert.deepEqual(pointsToPolygon([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]), [1, 2, 3, 4, 5, 6, 1, 2]);
    assert.deepEqual(pointsToPolygon([]), []);
});

test("history: append drops undone events, undo moves the pointer", () => {
    const stroke = { shape: 1 };
    let history = appendHistory(undefined, [stroke]);
    assert.deepEqual(history, { events: [[stroke]], pointer: 1 });
    history = appendHistory(history, [stroke, stroke]);
    assert.equal(history.pointer, 2);

    history = undoHistory(history, 2);
    assert.deepEqual(history.pointer, 1);
    assert.equal(history.events.length, 2);
    // A new action after an undo replaces the undone one.
    history = appendHistory(history, [{ shape: 0 }]);
    assert.deepEqual(history.events, [[stroke], [{ shape: 0 }]]);

    assert.equal(undoHistory(history, 2, 5).pointer, 0);
    assert.deepEqual(appendHistory(history, []), history);
    assert.deepEqual(normalizeHistory({ events: [[stroke], "bad"], pointer: 9 }), { events: [[stroke]], pointer: 1 });
});

test("scene overrides keep only values that differ from the world default", () => {
    const defaults = { blurEnable: true, blurRadius: 5, gmColorTint: { css: "#000000" }, fogImageOverlayFilePath: null };
    const { set, unset } = sceneOverrides({ blurEnable: false, blurRadius: 5, gmColorTint: "#000000", fogImageOverlayFilePath: "" }, defaults);
    assert.deepEqual(set, { blurEnable: false });
    assert.deepEqual(unset.sort(), ["blurRadius", "fogImageOverlayFilePath", "gmColorTint"]);
    assert.deepEqual(sceneOverrides({ blurRadius: 0 }, defaults).set, { blurRadius: 0 });
});
