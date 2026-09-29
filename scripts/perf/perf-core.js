/**
 * Performance monitor statistics (pure, unit-tested). The browser side is perf-monitor.js.
 */

/** Frames longer than this (ms) count as slow (under 30 fps); longer than FREEZE_MS as a freeze. */
export const SLOW_FRAME_MS = 34;
export const FREEZE_MS = 100;

/** Count / total / max of a timed operation, keyed by name. */
export class TimingTable {
    #rows = new Map();

    add(name, ms) {
        const row = this.#rows.get(name) ?? { name, count: 0, total: 0, max: 0 };
        row.count += 1;
        row.total += ms;
        row.max = Math.max(row.max, ms);
        this.#rows.set(name, row);
    }

    clear() {
        this.#rows.clear();
    }

    /** Rows sorted by total time, with the average, rounded to 0.1 ms. */
    top(limit = 15) {
        return [...this.#rows.values()]
            .sort((a, b) => b.total - a.total)
            .slice(0, limit)
            .map(row => ({
                name: row.name,
                count: row.count,
                total: round(row.total),
                avg: round(row.total / row.count),
                max: round(row.max)
            }));
    }
}

/** Frame durations: fps, slow frames and freezes, with a small ring of recent frames. */
export class FrameStats {
    frames = 0;
    slow = 0;
    freezes = 0;
    worst = 0;
    #elapsed = 0;
    #recent = [];

    add(ms) {
        this.frames += 1;
        this.#elapsed += ms;
        if (ms > SLOW_FRAME_MS) this.slow += 1;
        if (ms > FREEZE_MS) this.freezes += 1;
        this.worst = Math.max(this.worst, ms);
        this.#recent.push(ms);
        if (this.#recent.length > 120) this.#recent.shift();
    }

    clear() {
        this.frames = this.slow = this.freezes = this.worst = this.#elapsed = 0;
        this.#recent = [];
    }

    /** Average fps over everything recorded, and over the last ~2 seconds. */
    summary() {
        const recentMs = this.#recent.reduce((sum, ms) => sum + ms, 0);
        return {
            frames: this.frames,
            avgFps: this.#elapsed ? round(1000 * this.frames / this.#elapsed) : 0,
            recentFps: recentMs ? round(1000 * this.#recent.length / recentMs) : 0,
            slowFrames: this.slow,
            slowShare: this.frames ? round(100 * this.slow / this.frames) : 0,
            freezes: this.freezes,
            worstFrame: round(this.worst)
        };
    }
}

/**
 * Which code a script URL belongs to: "module:<id>", "system:<id>", "foundry" (core), or the host
 * for other URLs. Used to attribute slow frames.
 */
export function scriptOwner(url) {
    const text = String(url ?? "");
    const module = text.match(/\/modules\/([^/]+)\//);
    if (module) return `module:${module[1]}`;
    const system = text.match(/\/systems\/([^/]+)\//);
    if (system) return `system:${system[1]}`;
    if (/\/scripts\/foundry|\/common\/|\/client\//.test(text)) return "foundry";
    if (!text) return "unknown";
    try {
        const url = new URL(text);
        // The page itself (/game): inline and event-handler code, including Foundry's own.
        if (/^\/(game|join)?$/.test(url.pathname)) return "page (inline)";
        return url.host || text;
    } catch {
        return text;
    }
}

/** Keep the N largest entries by a key, for "heaviest resources" lists. */
export function largest(entries, key, limit = 10) {
    return [...entries].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, limit);
}

export function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/** Human-readable size. */
export function formatBytes(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${round(bytes / 1024)} KB`;
    return `${round(bytes / 1048576)} MB`;
}

/**
 * SVG path ("M x y L ...") for a line chart of `values` in a width × height box, scaled to
 * `max` (default: the largest value, at least 1). Null values break the line.
 */
export function chartPath(values, width, height, max = null) {
    const top = max ?? Math.max(1, ...values.filter(v => Number.isFinite(v)));
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    let path = "";
    let drawing = false;
    values.forEach((value, index) => {
        if (!Number.isFinite(value)) {
            drawing = false;
            return;
        }
        const x = round(index * step);
        const y = round(height - (Math.min(value, top) / top) * height);
        path += `${drawing ? "L" : "M"}${x} ${y} `;
        drawing = true;
    });
    return path.trim();
}

/** What kind of asset a URL is, by extension. */
export function assetKind(url) {
    const path = String(url ?? "").split(/[?#]/)[0].toLowerCase();
    if (/\.(png|jpe?g|webp|gif|avif|svg|bmp)$/.test(path)) return "image";
    if (/\.(webm|mp4|m4v|ogv)$/.test(path)) return "video";
    if (/\.(ogg|mp3|wav|flac|m4a|opus)$/.test(path)) return "audio";
    if (/\.(m?js)$/.test(path)) return "script";
    if (/\.css$/.test(path)) return "style";
    if (/\.(woff2?|ttf|otf)$/.test(path)) return "font";
    if (/\.(json|db)$/.test(path)) return "data";
    return "other";
}
