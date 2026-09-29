/**
 * Lightweight copies of large images (pure rules, unit-tested).
 *
 * Character art in this world is often huge (5000+ px PNGs of 40-80 MB). Shown in the dashboard,
 * the Actors tab or a sheet header at a few hundred pixels, it still has to be downloaded and
 * decoded at full size, which makes the UI stutter on ordinary machines. A GM client makes a WebP
 * copy of such images (see thumbnails.js); every client then shows the copy instead, and the
 * original stays available (image viewer, file picker, the actor's data).
 */

/** Images smaller than this (bytes) are left alone: a copy would save little. */
export const MIN_BYTES = 600 * 1024;
/** Or wider/taller than this (px). */
export const MIN_SIDE = 2000;
/** Longest side of the copy: sharp on high-DPI screens and with the card art zoomed in. */
export const MAX_SIDE = 1400;
export const QUALITY = 0.85;

const SKIP_EXTENSIONS = /\.(svg|gif|webm|mp4)$/i;

/**
 * The form an image path takes as a registry key: decoded, without origin, query or a leading
 * slash, so "worlds/x/Mass%20Effect/a.png?1" and "/worlds/x/Mass Effect/a.png" match.
 */
export function normalizeSrc(src, origin = "") {
    let path = String(src ?? "").trim();
    if (!path || path.startsWith("data:") || path.startsWith("blob:")) return "";
    if (origin && path.startsWith(origin)) path = path.slice(origin.length);
    if (/^[a-z]+:\/\//i.test(path)) return "";
    path = path.split(/[?#]/)[0].replace(/^\/+/, "");
    try {
        path = decodeURIComponent(path);
    } catch {
        // Keep the path as written.
    }
    return path;
}

/** Whether an image could get a lightweight copy at all (by its path). */
export function isCandidatePath(src) {
    const path = normalizeSrc(src);
    return Boolean(path) && !SKIP_EXTENSIONS.test(path) && !path.includes("/azecraft-thumbs/");
}

/** Whether an image of this size is worth a copy (bytes and/or pixel size, when known). */
export function worthCopying({ bytes = 0, width = 0, height = 0 } = {}) {
    return bytes >= MIN_BYTES || Math.max(width, height) >= MIN_SIDE;
}

/** Size of the copy, keeping the aspect ratio and never enlarging. */
export function copySize(width, height, maxSide = MAX_SIDE) {
    const longest = Math.max(width, height);
    if (!longest) return { width: 0, height: 0 };
    const scale = Math.min(1, maxSide / longest);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Short stable hash (FNV-1a, 32 bit) for file names. */
export function hash(text) {
    let h = 0x811c9dc5;
    for (const char of String(text)) {
        h ^= char.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

/** Where the copy of an image is stored: one folder per world, named after the source. */
export function copyPath(worldId, src) {
    const path = normalizeSrc(src);
    const base = (path.split("/").pop() ?? "image").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "image";
    return { directory: `worlds/${worldId}/azecraft-thumbs`, name: `${hash(path)}-${base}.webp` };
}

/**
 * The registry (a world setting): {normalized source path: {thumb, width, height, bytes, thumbBytes}}.
 * Returns the copy's path for a source, or null.
 */
export function lookup(registry, src, origin = "") {
    const entry = registry?.[normalizeSrc(src, origin)];
    return entry?.thumb ?? null;
}
