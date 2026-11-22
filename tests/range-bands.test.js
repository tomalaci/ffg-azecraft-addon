import { test } from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_CONFIG, MAX_BANDS, bandRadii, cellBand, colorNumber, configFromForm, normalizeConfig, pixelsPerUnit, polygonDistance, sceneDistance
} from "../scripts/range-bands/range-core.js";

const square = (cx, cy, s = 100) => [
    { x: cx - s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy + s / 2 }, { x: cx - s / 2, y: cy + s / 2 }
];

test("the defaults are the Genesys bands, nearest first", () => {
    const config = normalizeConfig();
    assert.deepEqual(config.bands.map(b => b.label), ["Engaged", "Short", "Medium", "Long", "Extreme"]);
    assert.equal(config.unit, "squares");
    assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), config);
});

test("normalizing drops empty bands, sorts them and cleans values", () => {
    const config = normalizeConfig({
        unit: "bogus",
        lineWidth: 99,
        lineAlpha: "x",
        labels: false,
        bands: [
            { label: " Far ", distance: "10", color: "#ABCDEF" },
            { label: "None", distance: 0, color: "#000000" },
            { label: "Near", distance: 2, color: "red" },
            { label: "Blank", distance: "" }
        ]
    });
    assert.equal(config.unit, "squares");
    assert.equal(config.lineWidth, 20);
    assert.equal(config.lineAlpha, DEFAULT_CONFIG.lineAlpha);
    assert.equal(config.labels, false);
    assert.deepEqual(config.bands, [
        { label: "Near", distance: 2, color: "#ffffff" },
        { label: "Far", distance: 10, color: "#abcdef" }
    ]);
    assert.deepEqual(normalizeConfig({ bands: [] }).bands, []);
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `${i}`, distance: i + 1, color: "#ffffff" }));
    assert.equal(normalizeConfig({ bands: many }).bands.length, MAX_BANDS);
});

test("form data becomes a configuration with bands in form order", () => {
    const config = configFromForm({
        unit: "scene", labels: true, "bands.1.label": "B", "bands.1.distance": 4, "bands.0.label": "A", "bands.0.distance": 2, "bands.0.color": "#112233"
    });
    assert.equal(config.unit, "scene");
    assert.equal(config.labels, true);
    assert.deepEqual(config.bands, [{ label: "A", distance: 2, color: "#112233" }, { label: "B", distance: 4 }]);
});

test("radii count from the token's edge in squares or scene units", () => {
    const bands = [{ distance: 1 }, { distance: 6 }];
    assert.equal(pixelsPerUnit("squares", 100, 5), 100);
    assert.equal(pixelsPerUnit("scene", 100, 5), 20);
    assert.deepEqual(bandRadii({ unit: "squares", bands }, { gridSize: 100, gridDistance: 5, base: 50 }), [150, 650]);
    assert.deepEqual(bandRadii({ unit: "scene", bands: [{ distance: 15 }] }, { gridSize: 100, gridDistance: 5 }), [300]);
});

test("labels give the distance in scene units", () => {
    assert.equal(sceneDistance({ unit: "squares" }, 6, 5, "ft"), "30 ft");
    assert.equal(sceneDistance({ unit: "squares" }, 6, 1.5, "m"), "9 m");
    assert.equal(sceneDistance({ unit: "scene" }, 12.25, 5, ""), "12.3");
});

test("colours become numbers", () => {
    assert.equal(colorNumber("#ff8000"), 0xff8000);
    assert.equal(colorNumber("nope"), 0xffffff);
});

test("distance to a polygon is 0 inside and to the nearest edge outside", () => {
    const cell = square(0, 0);
    assert.equal(polygonDistance({ x: 10, y: -20 }, cell), 0);
    assert.equal(polygonDistance({ x: 0, y: 80 }, cell), 30);
    assert.equal(polygonDistance({ x: 53, y: 54 }, cell), 5);
});

test("cells get the nearest band they fit in or touch", () => {
    const center = { x: 50, y: 50 };
    const radii = [150, 650];
    // The square right of the token: its far corners are ~158 px away, its near edge 50 px.
    const right = square(150, 50);
    assert.equal(cellBand(right, center, radii, "full"), 1);
    assert.equal(cellBand(right, center, radii, "partial"), 0);
    // A square whose far corner is exactly on the first ring is inside it.
    assert.equal(cellBand(square(50, 50), center, [Math.hypot(50, 50)], "full"), 0);
    // A square only touching the ring (no overlap) is not shaded.
    assert.equal(cellBand(square(250, 50), center, [150], "partial"), -1);
    // Beyond the last ring, or shading off: none.
    assert.equal(cellBand(square(2000, 50), center, radii, "partial"), -1);
    assert.equal(cellBand(right, center, radii, "none"), -1);
});
