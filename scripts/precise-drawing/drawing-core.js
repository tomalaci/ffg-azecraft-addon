/**
 * Pure helpers for precise drawing (no Foundry globals), unit-tested in tests/precise-drawing.test.js.
 * See docs/precise-drawing.md.
 */

export const MODULE_ID = "ffg-azecraft-addon";
export const SETTINGS = {
    enabled: "preciseDrawing",
    noDragResistance: "preciseDrawingNoDragResistance",
    dynamicSampling: "preciseDrawingDynamicSampling",
    samplingDistance: "preciseDrawingSamplingDistance",
    eyedropper: "preciseDrawingEyedropper",
    convertButton: "preciseDrawingConvertButton"
};

/** Slowest and fastest freehand sampling, in milliseconds between points (Foundry's own is 75). */
export const MAX_SAMPLE_MS = 75;
/** Faster than this gives too many points per drawing. */
export const MIN_SAMPLE_MS = 4;
/** Pointer positions kept to work out the recent speed. */
export const SAMPLE_BUFFER = 30;
/** Pointer positions closer together in time than this are skipped (half of a 60 fps frame). */
export const MIN_SAMPLE_GAP_MS = 8;

/**
 * Sampling interval that gives about two points per `distance` screen pixels at `speed` pixels per
 * millisecond (twice the rate needed, as in Nyquist's theorem), between the fastest and slowest.
 */
export function samplingInterval(speed, distance) {
    if (!(speed > 0)) return MAX_SAMPLE_MS;
    return Math.min(MAX_SAMPLE_MS, Math.max(MIN_SAMPLE_MS, distance / speed / 2));
}

/** Average speed, in pixels per millisecond, over a list of `{x, y, t}` pointer samples. */
export function averageSpeed(samples) {
    const speeds = [];
    for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const dt = b.t - a.t;
        if (dt > 0) speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);
    }
    if (!speeds.length) return 0;
    return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
}

/**
 * The recent pointer positions of one freehand stroke, and the sampling interval they call for.
 * Positions and times are kept together (the original kept them in two lists and trimmed only one,
 * so after 30 points the speeds used the wrong times).
 */
export class StrokeSampler {
    samples = [];

    reset() {
        this.samples = [];
    }

    /** Record a pointer position (screen pixels) at time `t` (ms); returns the new interval. */
    add(x, y, t, distance) {
        const last = this.samples.at(-1);
        if (this.samples.length < 2 || t - last.t >= MIN_SAMPLE_GAP_MS) {
            this.samples.push({ x, y, t });
            if (this.samples.length > SAMPLE_BUFFER) this.samples.shift();
        }
        return this.interval(distance);
    }

    /** The fastest sampling until there are two points to measure a speed from (no ugly first segment). */
    interval(distance) {
        if (this.samples.length < 2) return MIN_SAMPLE_MS;
        return samplingInterval(averageSpeed(this.samples), distance);
    }
}

/**
 * A pixel's `[r, g, b, a]` (0-255 each) as a drawing colour `"#rrggbb"` and an alpha 0-1 rounded to
 * two decimals. (The original lost the alpha of fully transparent pixels and stored NaN.)
 */
export function pixelToColor([r, g, b, a = 255]) {
    const hex = [r, g, b].map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
    return { color: `#${hex}`, alpha: Math.round((a / 255) * 100) / 100 };
}

/**
 * Lower any channel at full strength (255) to 254 in a half-transparent colour (number 0xRRGGBB).
 * Rendering such colours to an image gives wrong colours; one step less is invisible.
 */
export function softenFullChannels(color, alpha) {
    if (!(alpha > 0 && alpha < 1)) return color;
    let result = 0;
    for (const shift of [16, 8, 0]) {
        const channel = (color >> shift) & 0xff;
        result |= (channel === 0xff ? 0xfe : channel) << shift;
    }
    return result;
}

/** A safe image file name from what was typed: no folders or odd characters, always `.webp`. */
export function imageFileName(name) {
    const base = String(name ?? "")
        .trim()
        .replace(/\.webp$/i, "")
        .replace(/[^\p{L}\p{N} _.-]+/gu, "_")
        .replace(/^[.\s]+|[.\s]+$/g, "");
    return base ? `${base}.webp` : "";
}

/** Where converted drawings are uploaded (in the Foundry user data folder). */
export function uploadFolder(worldId) {
    return `worlds/${worldId}/converted-drawings`;
}
