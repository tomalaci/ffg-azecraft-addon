/**
 * Manual fog: pure helpers (unit-tested). Ported from Simple Fog 1.4.4 (MIT, see LICENSE in this
 * folder).
 *
 * The fog itself is a grid of cells: see fog-raster.js.
 */

/** Brush shapes stored in the history. */
export const BRUSH_TYPES = Object.freeze({ ELLIPSE: 0, BOX: 1, ROUNDED_RECT: 2, POLYGON: 3 });

/** "0xff0000" or a number to "#ff0000"; other values (e.g. a Color, which prints as css) as text. */
export function hexToWeb(value) {
    return `${value}`.replace("0x", "#");
}

/** [{x, y}, ...] to a closed flat [x, y, x, y, ..., x0, y0] list for PIXI polygons. */
export function pointsToPolygon(points) {
    if (!points?.length) return [];
    const flat = points.flatMap(point => [point.x, point.y]);
    return [...flat, points[0].x, points[0].y];
}

/**
 * Scene overrides from the fog configuration form: a key is stored only when it differs from the
 * world default. Returns { set: {key: value}, unset: [key] }. Unlike Simple Fog, 0 and false can be
 * stored (e.g. no blur on one scene while the default blurs); an empty image path is unset.
 */
export function sceneOverrides(values, defaults) {
    const set = {};
    const unset = [];
    for (const [key, value] of Object.entries(values ?? {})) {
        const fallback = defaults?.[key];
        const same = value === fallback || (fallback != null && typeof fallback === "object" && fallback.css === value);
        if (value === null || value === undefined || value === "" || same) unset.push(key);
        else set[key] = value;
    }
    return { set, unset };
}
