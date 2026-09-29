/**
 * Asset path rules for the Admin Panel (pure, unit-tested): finding asset paths in document data,
 * replacing one path with another everywhere it is used, and naming optimized copies.
 */

export const ASSET_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "webm", "mp4", "m4v", "ogg", "oga", "mp3", "wav", "flac", "m4a", "opus"];
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
/** Formats worth converting to WebP (not SVG/GIF/WebP itself). */
const CONVERTIBLE = new Set(["png", "jpg", "jpeg", "bmp", "avif"]);

const PATH_PATTERN = new RegExp(`[^"'\\s<>()=]+?\\.(?:${ASSET_EXTENSIONS.join("|")})(?=["'\\s<>)?#]|$)`, "gi");

export function extension(path) {
    return String(path ?? "").split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
}

export function isImage(path) {
    return IMAGE_EXTENSIONS.has(extension(path));
}

export function isConvertible(path) {
    return CONVERTIBLE.has(extension(path));
}

/** Decode a path for comparison ("Mass%20Effect" -> "Mass Effect"); invalid escapes stay as written. */
export function decodePath(path) {
    try {
        return decodeURIComponent(String(path ?? ""));
    } catch {
        return String(path ?? "");
    }
}

/** Asset-like paths (by extension) found in a string, e.g. an HTML description or a src field. */
export function extractAssetPaths(text) {
    return [...String(text ?? "").matchAll(PATH_PATTERN)].map(match => decodePath(match[0]).replace(/^\/+/, ""));
}

/** Every form a path may be written in: as is, URI-encoded, and with a leading slash. */
function pathForms(path) {
    const plain = decodePath(path).replace(/^\/+/, "");
    const forms = new Set([plain, encodeURI(plain)]);
    return [...forms].flatMap(form => [`/${form}`, form]);
}

/**
 * Replace a path in a string wherever it appears (whole string or inside HTML), in plain and
 * encoded form. The replacement keeps the form it replaced (encoded stays encoded).
 */
export function replacePathInString(value, oldPath, newPath) {
    if (typeof value !== "string" || !value) return value;
    let result = value;
    const plainNew = decodePath(newPath).replace(/^\/+/, "");
    for (const form of pathForms(oldPath)) {
        if (!result.includes(form)) continue;
        const encoded = form !== decodePath(form);
        const slash = form.startsWith("/") ? "/" : "";
        const target = slash + (encoded ? encodeURI(plainNew) : plainNew);
        // Only whole paths: not followed by more path characters (so "a.png" does not hit "a.png.bak").
        const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`(^|[^A-Za-z0-9_./%-])${escaped}(?![A-Za-z0-9_%-]|\\.[A-Za-z0-9])`, "g"), (_, lead) => lead + target);
    }
    return result;
}

/**
 * Replace a path throughout a plain object (document source data). Returns the new object and the
 * dotted keys that changed; the input is not modified.
 */
export function replacePathDeep(data, oldPath, newPath, prefix = "") {
    const changed = [];
    const walk = (value, key) => {
        if (typeof value === "string") {
            const next = replacePathInString(value, oldPath, newPath);
            if (next !== value) changed.push(key);
            return next;
        }
        if (Array.isArray(value)) return value.map((item, index) => walk(item, `${key}.${index}`));
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, key ? `${key}.${k}` : k)]));
        }
        return value;
    };
    const result = walk(data, prefix);
    return { data: result, changed };
}

/** Whether a string mentions a path (any form), for fast reference scans. */
export function mentionsPath(text, path) {
    return pathForms(path).some(form => String(text ?? "").includes(form));
}

/** "dir/Name.png" -> "dir/Name.optimized.webp" (next to the original, which cannot be deleted). */
export function optimizedPath(path) {
    const plain = decodePath(path);
    const slash = plain.lastIndexOf("/");
    const dir = slash >= 0 ? plain.slice(0, slash) : "";
    const file = plain.slice(slash + 1).replace(/\.[^.]+$/, "");
    return { directory: dir, name: `${file}.optimized.webp`, path: `${dir ? `${dir}/` : ""}${file}.optimized.webp` };
}

/** Where a file lands when moved to a folder (same file name). */
export function movedPath(path, folder) {
    const name = decodePath(path).split("/").pop();
    const dir = decodePath(folder).replace(/^\/+|\/+$/g, "");
    return dir ? `${dir}/${name}` : name;
}

/** Whether a path is inside a root folder (moves stay inside the asset root). */
export function isInside(path, root) {
    const p = decodePath(path).replace(/^\/+/, "");
    const r = decodePath(root).replace(/^\/+|\/+$/g, "");
    return !r || p === r || p.startsWith(`${r}/`);
}
