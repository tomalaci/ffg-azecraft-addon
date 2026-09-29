/**
 * Asset path rules for the Admin Panel (pure, unit-tested): finding asset paths in document data,
 * replacing one path with another everywhere it is used, and naming optimized copies.
 */

export const ASSET_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "webm", "mp4", "m4v", "ogg", "oga", "mp3", "wav", "flac", "m4a", "opus"];
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
/** Formats worth converting to WebP (not SVG/GIF/WebP itself). */
const CONVERTIBLE = new Set(["png", "jpg", "jpeg", "bmp", "avif"]);

const EXT = `\\.(?:${ASSET_EXTENSIONS.join("|")})`;
/** A whole string that is one path (spaces allowed, as in "worlds/x/Mass Effect/a.png?v=1"). */
const WHOLE_PATH = new RegExp(`^[^"'<>\\n\\\\]+?${EXT}(?:[?#][^"'<>\\s]*)?$`, "i");
/** A quoted path in HTML/CSS/JSON text (spaces allowed inside the quotes). */
const QUOTED_PATH = new RegExp(`(["'])([^"'<>\\n\\\\]*?${EXT})(?:[?#][^"'<>\\s]*)?\\1`, "gi");
/** An unquoted path, e.g. CSS url(a.png) or a path in running text (no spaces). */
const BARE_PATH = new RegExp(`[^"'\\s<>()=,\\\\]+?${EXT}(?=["'\\s<>),?#\\\\]|$)`, "gi");

export function extension(path) {
    return String(path ?? "").split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
}

export function isImage(path) {
    return IMAGE_EXTENSIONS.has(extension(path));
}

export function isConvertible(path) {
    return CONVERTIBLE.has(extension(path));
}

const MEDIA_EXTENSIONS = new Set(ASSET_EXTENSIONS);
/** A world's or package's databases and manifests: never offered for deleting. */
const DATABASE_FOLDER = /(^|\/)(worlds\/[^/]+\/data|packs)\//;

/**
 * Whether a file may appear in the unused-file list: images, video and audio only, never a world's
 * data (world.json, data/*.ldb) or compendium pack files.
 */
export function isUnusedCandidate(path) {
    const plain = decodePath(path).replace(/^\/+/, "");
    return MEDIA_EXTENSIONS.has(extension(plain)) && !DATABASE_FOLDER.test(plain);
}

/** Decode a path for comparison ("Mass%20Effect" -> "Mass Effect"); invalid escapes stay as written. */
export function decodePath(path) {
    try {
        return decodeURIComponent(String(path ?? ""));
    } catch {
        return String(path ?? "");
    }
}

/** Normalized form of a found path: decoded, without origin, query, hash or leading slash. */
function cleanPath(path) {
    return decodePath(path.trim().split(/[?#]/)[0]).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").replace(/^\/+/, "");
}

/** Asset-like paths (by extension) found in a string, e.g. an HTML description or a src field. */
export function extractAssetPaths(text) {
    const value = String(text ?? "");
    const trimmed = value.trim();
    if (WHOLE_PATH.test(trimmed)) return [cleanPath(trimmed)];
    const found = new Set();
    for (const match of value.matchAll(QUOTED_PATH)) found.add(cleanPath(match[2]));
    for (const match of value.matchAll(BARE_PATH)) found.add(cleanPath(match[0]));
    return [...found].filter(Boolean);
}

/**
 * Every asset path used anywhere in some data (document source, setting value): all string values,
 * including HTML, CSS url(...), paths with a query string and JSON held in a string (setting values
 * are stored as JSON). For the unused-file scan, where a missed path could get a live file deleted.
 * @returns {Set<string>} decoded paths without a leading slash, query or origin
 */
export function collectAssetPaths(data) {
    const found = new Set();
    const walk = (value, depth) => {
        if (typeof value === "string") {
            for (const path of extractAssetPaths(value)) found.add(path);
            const text = value.trim();
            if (depth < 8 && /^[[{"]/.test(text)) {
                try {
                    walk(JSON.parse(text), depth + 1);
                } catch {
                    // Not JSON.
                }
            }
        } else if (Array.isArray(value)) {
            for (const item of value) walk(item, depth);
        } else if (value && typeof value === "object") {
            // Keys too: e.g. the lightweight-image registry is keyed by the original's path.
            for (const [key, item] of Object.entries(value)) {
                for (const path of extractAssetPaths(key)) found.add(path);
                walk(item, depth);
            }
        }
    };
    walk(data, 0);
    return found;
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
        // Only whole paths: not followed by more path characters (so "a.png" does not hit "a.png.bak"
        // or a folder named "a.png").
        const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`(^|[^A-Za-z0-9_./%-])${escaped}(?![A-Za-z0-9_%/-]|\\.[A-Za-z0-9])`, "g"), (_, lead) => lead + target);
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
export function optimizedPath(path, { withExtension = false } = {}) {
    const plain = decodePath(path);
    const slash = plain.lastIndexOf("/");
    const dir = slash >= 0 ? plain.slice(0, slash) : "";
    // withExtension: "Name.png" -> "Name.png.optimized.webp", when "Name.jpg" already took the plain name.
    const file = withExtension ? plain.slice(slash + 1) : plain.slice(slash + 1).replace(/\.[^.]+$/, "");
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
