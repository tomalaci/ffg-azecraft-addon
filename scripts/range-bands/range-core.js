/**
 * Range bands: pure logic (configuration, radii, which band a grid cell is in). No Foundry globals,
 * so it is unit tested (tests/range-bands.test.js).
 */

export const MODULE_ID = "ffg-azecraft-addon";
export const SETTINGS = {
    enabled: "rangeBandsEnabled",
    config: "rangeBandsConfig",
    shading: "rangeBandsShading"
};
export const SHADING = {
    none: "None (rings only)",
    full: "Cells fully inside a band",
    partial: "Cells a band touches"
};
export const MAX_BANDS = 8;

/**
 * Genesys bands on a 1.5 m (5 ft) square grid, counted in squares from the token's edge (see
 * docs/range-bands.md for why these numbers).
 */
export const DEFAULT_CONFIG = Object.freeze({
    unit: "squares",
    lineWidth: 3,
    lineAlpha: 80,
    fillAlpha: 20,
    labels: true,
    bands: Object.freeze([
        { label: "Engaged", distance: 1, color: "#e53935" },
        { label: "Short", distance: 6, color: "#fb8c00" },
        { label: "Medium", distance: 16, color: "#fdd835" },
        { label: "Long", distance: 40, color: "#43a047" },
        { label: "Extreme", distance: 80, color: "#1e88e5" }
    ].map(band => Object.freeze(band)))
});

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
};

/** A stored or submitted configuration, cleaned up: valid bands only, nearest first. */
export function normalizeConfig(raw = {}) {
    const d = DEFAULT_CONFIG;
    const bands = Array.isArray(raw.bands) ? raw.bands : d.bands;
    return {
        unit: raw.unit === "scene" ? "scene" : "squares",
        lineWidth: clamp(raw.lineWidth, 1, 20, d.lineWidth),
        lineAlpha: clamp(raw.lineAlpha, 0, 100, d.lineAlpha),
        fillAlpha: clamp(raw.fillAlpha, 0, 100, d.fillAlpha),
        labels: raw.labels === undefined ? d.labels : Boolean(raw.labels),
        bands: bands
            .map(band => ({
                label: String(band?.label ?? "").trim(),
                distance: Number(band?.distance),
                color: HEX.test(band?.color) ? band.color.toLowerCase() : "#ffffff"
            }))
            .filter(band => Number.isFinite(band.distance) && band.distance > 0)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, MAX_BANDS)
    };
}

/**
 * The flat form data of the configuration window ("bands.0.label": ...) as a configuration, bands
 * in form order and not yet cleaned up (so a new, empty row survives a re-render).
 */
export function configFromForm(data) {
    const config = { bands: [] };
    for (const [key, value] of Object.entries(data)) {
        const match = /^bands\.(\d+)\.(label|distance|color)$/.exec(key);
        if (match) (config.bands[Number(match[1])] ??= {})[match[2]] = value;
        else config[key] = value;
    }
    config.bands = config.bands.filter(Boolean);
    return config;
}

/** Pixels per configured distance unit: a grid square, or one scene unit (ft, m). */
export function pixelsPerUnit(unit, gridSize, gridDistance) {
    return unit === "scene" ? gridSize / (gridDistance || 1) : gridSize;
}

/** Ring radii in pixels from the token's centre: its half size plus each band's distance. */
export function bandRadii(config, { gridSize, gridDistance, base = 0 }) {
    const scale = pixelsPerUnit(config.unit, gridSize, gridDistance);
    return config.bands.map(band => base + band.distance * scale);
}

/** A band's distance in the scene's units, for its label ("30 ft"). */
export function sceneDistance(config, distance, gridDistance, units = "") {
    const value = config.unit === "scene" ? distance : distance * gridDistance;
    const rounded = Math.round(value * 10) / 10;
    return units ? `${rounded} ${units}` : `${rounded}`;
}

/** "#rrggbb" as a number for PIXI. */
export function colorNumber(hex) {
    return HEX.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
}

function segmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / length, 0), 1) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insidePolygon(p, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const a = vertices[i];
        const b = vertices[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** Shortest distance from a point to a polygon (0 when the point is inside it). */
export function polygonDistance(point, vertices) {
    if (insidePolygon(point, vertices)) return 0;
    let nearest = Infinity;
    for (let i = 0; i < vertices.length; i++) {
        nearest = Math.min(nearest, segmentDistance(point, vertices[i], vertices[(i + 1) % vertices.length]));
    }
    return nearest;
}

/**
 * The band a grid cell is shaded with, or -1. "full": the nearest ring the whole cell fits in;
 * "partial": the nearest ring that reaches into the cell.
 */
export function cellBand(vertices, center, radii, mode) {
    if (mode === "full") {
        const far = Math.max(...vertices.map(v => Math.hypot(v.x - center.x, v.y - center.y)));
        return radii.findIndex(r => far <= r + 1e-6);
    }
    if (mode === "partial") {
        const near = polygonDistance(center, vertices);
        return radii.findIndex(r => near < r - 1e-6);
    }
    return -1;
}
