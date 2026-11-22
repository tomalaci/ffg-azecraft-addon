/**
 * Manual fog as a grid of cells (pure, unit-tested). A scene's fog is a raster over its scene
 * rectangle: one cell per `cell` pixels, each holding an opacity level 0..20 (0% to 100% in 5% steps;
 * 20 is full fog). It is stored in tiles of 64x64 cells, run-length encoded, so a stroke only rewrites
 * the tiles it touched, and a tile equal to the raster's `fill` is not stored at all.
 *
 * Stored form (scene flag `fog.raster`): { cols, rows, cell, fill, tiles: { "tx_ty": "runs" } }.
 */

export const LEVELS = 20;
export const TILE = 64;
/** More cells than this and the cell size is raised (memory and upload time grow with cells). */
export const MAX_CELLS = 4_000_000;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** 0-100% to a level, in 5% steps. */
export function levelFromPercent(percent) {
    return clamp(Math.round(Number(percent) / 5), 0, LEVELS) || 0;
}

export function percentFromLevel(level) {
    return clamp(level, 0, LEVELS) * 5;
}

/** Round a percentage to the nearest 5%. */
export function roundPercent(percent) {
    return percentFromLevel(levelFromPercent(percent));
}

/**
 * The cell size for a scene: the largest divisor of the grid size not above the wanted precision (so
 * cells line up with the grid), raised if the scene would have more than MAX_CELLS cells.
 */
export function cellSizeFor({ precision, gridSize, width, height, maxCells = MAX_CELLS }) {
    const wanted = Math.max(1, Math.round(Number(precision) || 1));
    const grid = Math.round(Number(gridSize) || 0);
    let cell = wanted;
    if (grid > 0) {
        cell = 1;
        for (let d = Math.min(wanted, grid); d >= 1; d -= 1) {
            if (grid % d === 0) {
                cell = d;
                break;
            }
        }
    }
    const minimum = Math.ceil(Math.sqrt((Math.max(width, 1) * Math.max(height, 1)) / maxCells));
    return Math.max(cell, minimum, 1);
}

export function createRaster(cols, rows, fill = LEVELS, cell = 1) {
    return { cols, rows, cell, fill, data: new Uint8Array(cols * rows).fill(fill) };
}

export function tileKey(tx, ty) {
    return `${tx}_${ty}`;
}

export function tileCounts(raster) {
    return { tilesX: Math.ceil(raster.cols / TILE), tilesY: Math.ceil(raster.rows / TILE) };
}

function tileBounds(raster, tx, ty) {
    const x0 = tx * TILE;
    const y0 = ty * TILE;
    return { x0, y0, x1: Math.min(x0 + TILE, raster.cols), y1: Math.min(y0 + TILE, raster.rows) };
}

/* -------------------------------------------- */
/*  Run-length encoding                         */
/* -------------------------------------------- */

const VALUE = "ABCDEFGHIJKLMNOPQRSTU";

/** Levels to runs: a capital letter per value (A = 0 ... U = 20), then the run length in base 36 if over 1. */
export function encodeRuns(values) {
    let out = "";
    let i = 0;
    while (i < values.length) {
        const value = values[i];
        let j = i + 1;
        while (j < values.length && values[j] === value) j += 1;
        out += VALUE[value] + (j - i > 1 ? (j - i).toString(36) : "");
        i = j;
    }
    return out;
}

/** Runs back to levels; anything malformed or short is left as `fill`. */
export function decodeRuns(text, length, fill = LEVELS) {
    const values = new Uint8Array(length).fill(fill);
    let pos = 0;
    let i = 0;
    while (i < text.length && pos < length) {
        const value = VALUE.indexOf(text[i]);
        i += 1;
        let j = i;
        while (j < text.length && VALUE.indexOf(text[j]) === -1) j += 1;
        const count = j > i ? parseInt(text.slice(i, j), 36) : 1;
        i = j;
        if (value < 0 || !Number.isFinite(count) || count < 1) break;
        values.fill(value, pos, Math.min(pos + count, length));
        pos += count;
    }
    return values;
}

/** One tile's runs, or null when it is all `fill` (not stored). */
export function encodeTile(raster, tx, ty) {
    const { x0, y0, x1, y1 } = tileBounds(raster, tx, ty);
    const values = new Uint8Array((x1 - x0) * (y1 - y0));
    let k = 0;
    let uniform = true;
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const v = raster.data[y * raster.cols + x];
            values[k++] = v;
            if (v !== raster.fill) uniform = false;
        }
    }
    return uniform ? null : encodeRuns(values);
}

/** Write a stored tile (null: all `fill`) into the raster. */
export function decodeTile(raster, tx, ty, text) {
    const { x0, y0, x1, y1 } = tileBounds(raster, tx, ty);
    const width = x1 - x0;
    const values = text ? decodeRuns(text, width * (y1 - y0), raster.fill) : null;
    for (let y = y0; y < y1; y += 1) {
        const row = y * raster.cols;
        if (values) raster.data.set(values.subarray((y - y0) * width, (y - y0 + 1) * width), row + x0);
        else raster.data.fill(raster.fill, row + x0, row + x1);
    }
}

export function encodeRaster(raster) {
    const tiles = {};
    const { tilesX, tilesY } = tileCounts(raster);
    for (let ty = 0; ty < tilesY; ty += 1) {
        for (let tx = 0; tx < tilesX; tx += 1) {
            const text = encodeTile(raster, tx, ty);
            if (text) tiles[tileKey(tx, ty)] = text;
        }
    }
    return { cols: raster.cols, rows: raster.rows, cell: raster.cell, fill: raster.fill, tiles };
}

/** The stored raster, or null when there is none (or it is unusable). */
export function decodeRaster(stored) {
    const cols = Number(stored?.cols);
    const rows = Number(stored?.rows);
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols * rows > MAX_CELLS * 2) return null;
    const fill = clamp(Number(stored.fill ?? LEVELS) || 0, 0, LEVELS);
    const raster = createRaster(cols, rows, fill, Number(stored.cell) || 1);
    for (const [key, text] of Object.entries(stored.tiles ?? {})) {
        const [tx, ty] = key.split("_").map(Number);
        if (Number.isInteger(tx) && Number.isInteger(ty) && typeof text === "string") decodeTile(raster, tx, ty, text);
    }
    return raster;
}

/** A copy at a new size (nearest cell), for a changed precision or scene size. */
export function resampleRaster(raster, cols, rows, cell = raster.cell) {
    const next = createRaster(cols, rows, raster.fill, cell);
    for (let y = 0; y < rows; y += 1) {
        const sy = Math.min(raster.rows - 1, Math.floor(((y + 0.5) * raster.rows) / rows));
        for (let x = 0; x < cols; x += 1) {
            const sx = Math.min(raster.cols - 1, Math.floor(((x + 0.5) * raster.cols) / cols));
            next.data[y * cols + x] = raster.data[sy * raster.cols + sx];
        }
    }
    return next;
}

/* -------------------------------------------- */
/*  Painting (cell coordinates)                 */
/* -------------------------------------------- */

/**
 * Set cells [x0, x1) of row y to `level`. `touch(tx, ty)` is called for each tile a span reaches
 * (before it changes), so callers can snapshot tiles for undo and know what to store.
 */
function span(raster, y, x0, x1, level, touch) {
    if (y < 0 || y >= raster.rows) return false;
    const a = Math.max(0, x0);
    const b = Math.min(raster.cols, x1);
    if (a >= b) return false;
    const ty = Math.floor(y / TILE);
    for (let tx = Math.floor(a / TILE); tx <= Math.floor((b - 1) / TILE); tx += 1) touch?.(tx, ty);
    raster.data.fill(level, y * raster.cols + a, y * raster.cols + b);
    return true;
}

/** Cells whose centres are in the rectangle (any corner order). */
export function paintRect(raster, x0, y0, x1, y1, level, touch) {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    let painted = false;
    for (let y = Math.ceil(top - 0.5); y + 0.5 <= bottom; y += 1) {
        painted = span(raster, y, Math.ceil(left - 0.5), Math.floor(right - 0.5) + 1, level, touch) || painted;
    }
    // Too small to cover a cell centre: paint the cell it is in.
    if (!painted) span(raster, Math.floor((top + bottom) / 2), Math.floor((left + right) / 2), Math.floor((left + right) / 2) + 1, level, touch);
}

/** Cells whose centres are in the ellipse (centre, radii). */
export function paintEllipse(raster, cx, cy, rx, ry, level, touch) {
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    let painted = false;
    if (rx > 0 && ry > 0) {
        for (let y = Math.ceil(cy - ry - 0.5); y + 0.5 <= cy + ry; y += 1) {
            const dy = (y + 0.5 - cy) / ry;
            if (dy * dy > 1) continue;
            const half = rx * Math.sqrt(1 - dy * dy);
            painted = span(raster, y, Math.ceil(cx - half - 0.5), Math.floor(cx + half - 0.5) + 1, level, touch) || painted;
        }
    }
    if (!painted) span(raster, Math.floor(cy), Math.floor(cx), Math.floor(cx) + 1, level, touch);
}

/** Cells whose centres are in the polygon (flat [x, y, ...] list; even-odd rule), row by row. */
export function paintPolygon(raster, points, level, touch) {
    const n = Math.floor(points.length / 2);
    if (n < 3) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 1; i < points.length; i += 2) {
        top = Math.min(top, points[i]);
        bottom = Math.max(bottom, points[i]);
    }
    const crossings = [];
    for (let y = Math.max(0, Math.ceil(top - 0.5)); y + 0.5 <= bottom && y < raster.rows; y += 1) {
        const sy = y + 0.5;
        crossings.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = points[2 * i];
            const yi = points[2 * i + 1];
            const xj = points[2 * j];
            const yj = points[2 * j + 1];
            if ((yi > sy) !== (yj > sy)) crossings.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
        }
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
            span(raster, y, Math.ceil(crossings[k] - 0.5), Math.floor(crossings[k + 1] - 0.5) + 1, level, touch);
        }
    }
}

/**
 * Paint a stroke given in scene pixels: { shape, x, y, width, height, vertices, level }. `origin`
 * is the scene rectangle's top-left; `scaleX/scaleY` cells per pixel.
 */
export function paintShape(raster, stroke, { originX = 0, originY = 0, scaleX, scaleY } = {}, touch = undefined) {
    scaleX ??= 1 / raster.cell;
    scaleY ??= scaleX;
    const level = clamp(Math.round(stroke.level ?? LEVELS), 0, LEVELS);
    const px = x => (x - originX) * scaleX;
    const py = y => (y - originY) * scaleY;
    const ox = stroke.x ?? 0;
    const oy = stroke.y ?? 0;
    switch (stroke.shape) {
        case 0: // ellipse: centre and radii
            paintEllipse(raster, px(ox), py(oy), stroke.width * scaleX, stroke.height * scaleY, level, touch);
            break;
        case 1: // box
        case 2:
            paintRect(raster, px(ox), py(oy), px(ox + stroke.width), py(oy + stroke.height), level, touch);
            break;
        case 3: { // polygon
            const v = stroke.vertices ?? [];
            const points = new Array(v.length);
            for (let i = 0; i < v.length; i += 2) {
                points[i] = px(v[i] + ox);
                points[i + 1] = py(v[i + 1] + oy);
            }
            paintPolygon(raster, points, level, touch);
            break;
        }
        default:
            break;
    }
}
