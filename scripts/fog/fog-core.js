/**
 * Manual fog: pure helpers (unit-tested). Ported from Simple Fog 1.4.4 (MIT, see LICENSE in this
 * folder).
 *
 * A scene's fog is a history of brush strokes: { events: [[stroke, ...], ...], pointer }. Each event
 * is one committed action (a brush drag, a box, a room...); `pointer` is how many events are applied,
 * so undo only moves the pointer and a new action drops the undone events.
 */

/** Brush shapes stored in the history. */
export const BRUSH_TYPES = Object.freeze({ ELLIPSE: 0, BOX: 1, ROUNDED_RECT: 2, POLYGON: 3 });

/** 0-100 brush opacity to a grey PIXI colour string: 0 reveals ("0x000000"), 100 hides ("0xffffff"). */
export function percentToHex(percent) {
    let c = Math.ceil(Number(percent) * 2.55).toString(16);
    if (c.length === 1) c = `0${c}`;
    return `0x${c}${c}${c}`;
}

/** A grey colour (number or "0x..." string) back to 0-100. */
export function hexToPercent(hex) {
    return Math.ceil((Number(hex) / 0xffffff) * 100);
}

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

export function emptyHistory() {
    return { events: [], pointer: 0 };
}

export function normalizeHistory(raw) {
    const events = Array.isArray(raw?.events) ? raw.events.filter(Array.isArray) : [];
    const pointer = Number.isInteger(raw?.pointer) ? Math.min(Math.max(raw.pointer, 0), events.length) : events.length;
    return { events, pointer };
}

/** Add one action (a list of strokes): undone events after the pointer are dropped. */
export function appendHistory(raw, strokes) {
    const history = normalizeHistory(raw);
    if (!strokes?.length) return history;
    const events = [...history.events.slice(0, history.pointer), strokes];
    return { events, pointer: events.length };
}

/** Undo `steps` actions from `pointer` (the one this client has drawn up to). */
export function undoHistory(raw, pointer, steps = 1) {
    const history = normalizeHistory(raw);
    return { ...history, pointer: Math.max(0, Math.min(pointer, history.events.length) - steps) };
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
