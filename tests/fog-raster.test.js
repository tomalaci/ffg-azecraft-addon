import { test } from "node:test";
import assert from "node:assert/strict";

import {
    LEVELS, TILE, cellSizeFor, createRaster, decodeRaster, decodeRuns, encodeRaster, encodeRuns, encodeTile,
    levelFromPercent, paintEllipse, paintPolygon, paintRect, paintShape, resampleRaster, roundPercent
} from "../scripts/fog/fog-raster.js";

const at = (r, x, y) => r.data[y * r.cols + x];
const count = (r, level) => r.data.filter(v => v === level).length;

test("opacity is kept in 5% steps", () => {
    assert.equal(levelFromPercent(0), 0);
    assert.equal(levelFromPercent(100), LEVELS);
    assert.equal(levelFromPercent(83), 17);
    assert.equal(roundPercent(83), 85);
    assert.equal(roundPercent(-4), 0);
    assert.equal(roundPercent(140), 100);
});

test("cell size: a divisor of the grid size, never above the precision, raised for huge scenes", () => {
    assert.equal(cellSizeFor({ precision: 10, gridSize: 100, width: 2500, height: 2500 }), 10);
    assert.equal(cellSizeFor({ precision: 10, gridSize: 64, width: 2500, height: 2500 }), 8);
    assert.equal(cellSizeFor({ precision: 30, gridSize: 100, width: 2500, height: 2500 }), 25);
    assert.equal(cellSizeFor({ precision: 100, gridSize: 100, width: 2500, height: 2500 }), 100);
    assert.equal(cellSizeFor({ precision: 7, gridSize: 0, width: 2500, height: 2500 }), 7);
    // 1px on a 10000x8000 map is 80M cells: raised to stay under the cap.
    assert.equal(cellSizeFor({ precision: 1, gridSize: 100, width: 10000, height: 8000 }), 5);
});

test("run-length encoding round-trips and stays short for uniform areas", () => {
    const values = new Uint8Array([20, 20, 20, 0, 0, 7, 20]);
    const text = encodeRuns(values);
    assert.equal(text, "U3A2HU");
    assert.deepEqual(decodeRuns(text, values.length), values);
    assert.equal(encodeRuns(new Uint8Array(4096).fill(0)), "A35s");
    // Malformed input leaves the rest as fill.
    assert.deepEqual(decodeRuns("A2?", 4, 20), new Uint8Array([0, 0, 20, 20]));
});

test("tiles equal to the fill are not stored; the raster round-trips", () => {
    const r = createRaster(150, 70, LEVELS, 10);
    assert.deepEqual(encodeRaster(r).tiles, {});
    paintRect(r, 100, 3, 140, 5, 0);
    const stored = encodeRaster(r);
    assert.deepEqual(Object.keys(stored.tiles), ["1_0", "2_0"]);
    assert.equal(encodeTile(r, 0, 1), null);
    const back = decodeRaster(stored);
    assert.deepEqual(back.data, r.data);
    assert.equal(back.cell, 10);
    assert.equal(decodeRaster({ cols: 0, rows: 5 }), null);
});

test("shapes paint the cells whose centres they cover, and report the tiles they touch", () => {
    const r = createRaster(200, 200);
    const touched = new Set();
    paintRect(r, 2, 2, 6, 4, 0, (tx, ty) => touched.add(`${tx}_${ty}`));
    assert.equal(count(r, 0), 8); // 4 x 2 cells
    assert.deepEqual([...touched], ["0_0"]);

    const e = createRaster(40, 40);
    paintEllipse(e, 20, 20, 10, 10, 0);
    assert.equal(at(e, 20, 20), 0);
    assert.equal(at(e, 20, 10), 0);
    assert.equal(at(e, 20, 9), LEVELS);
    assert.ok(Math.abs(count(e, 0) - Math.PI * 100) < 20);

    const p = createRaster(20, 20);
    paintPolygon(p, [0, 0, 10, 0, 0, 10], 5);
    assert.equal(at(p, 1, 1), 5);
    assert.equal(at(p, 9, 9), LEVELS);
    assert.ok(Math.abs(count(p, 5) - 50) <= 6);

    // A tiny stroke still paints the cell it is in.
    const t = createRaster(10, 10);
    paintEllipse(t, 3.2, 4.7, 0.1, 0.1, 0);
    assert.equal(at(t, 3, 4), 0);

    // A box across tiles touches each.
    const big = createRaster(TILE * 2, TILE * 2);
    const tiles = new Set();
    paintRect(big, TILE - 1, TILE - 1, TILE + 1, TILE + 1, 0, (tx, ty) => tiles.add(`${tx}_${ty}`));
    assert.deepEqual([...tiles].sort(), ["0_0", "0_1", "1_0", "1_1"]);
});

test("strokes in scene pixels map onto cells from the scene's top-left", () => {
    const r = createRaster(25, 25, LEVELS, 10);
    paintShape(r, { shape: 1, x: 300, y: 300, width: 100, height: -100, level: 0 }, { originX: 200, originY: 200 });
    assert.equal(count(r, 0), 100); // cells 10..19 x 0..9
    assert.equal(at(r, 10, 0), 0);
    paintShape(r, { shape: 0, x: 400, y: 400, width: 50, height: 50, level: 10 }, { originX: 200, originY: 200 });
    assert.equal(at(r, 20, 20), 10);
    paintShape(r, { shape: 3, x: 0, y: 0, vertices: [200, 400, 300, 400, 300, 500], level: 3 }, { originX: 200, originY: 200 });
    assert.equal(at(r, 9, 21), 3);
    assert.equal(at(r, 1, 23), LEVELS);
});

test("resampling keeps the drawing at a new precision", () => {
    const r = createRaster(10, 10, LEVELS, 10);
    paintRect(r, 0, 0, 5, 10, 0);
    const fine = resampleRaster(r, 20, 20, 5);
    assert.equal(fine.cell, 5);
    assert.equal(count(fine, 0), 200);
    const coarse = resampleRaster(r, 5, 5, 20);
    assert.equal(count(coarse, 0), 10); // columns 1 and 3 of 0..9 are revealed
});
