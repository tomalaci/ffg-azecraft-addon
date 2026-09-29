/**
 * File path forms (pure, unit-tested). Foundry stores and returns user-data paths URL-encoded
 * ("worlds/x/Mass%20Effect/a.png": FilePicker results, most document fields), while people type them
 * plain ("Mass Effect"). Compare paths in plain form; turn them into URLs only through urlPath, so a
 * path is never encoded twice ("%2520") or left with a "#" or "?" that cuts the URL short.
 */

/**
 * A path without its URL query or hash ("a.png?v=2", "a.png#x"). Only a suffix without "/" or "."
 * counts, so a "#" or "?" inside a plain file name ("Map #1.png") is kept: safe to apply twice.
 */
export function withoutQuery(path) {
    return String(path ?? "").replace(/[?#][^/.]*$/, "");
}

/** Plain form: decoded once; a path with an invalid escape (e.g. a literal "%") stays as written. */
export function plainPath(path) {
    const text = String(path ?? "");
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

/**
 * URL form, exactly as Foundry writes it (foundry.utils.encodeURL): each segment of the plain path
 * encoded once with encodeURIComponent, plus "'" -> "%27". So "#", "?", "&" in file names are safe.
 */
export function urlPath(path) {
    return plainPath(path).split("/").map(part => encodeURIComponent(part).replace(/'/g, "%27")).join("/");
}
