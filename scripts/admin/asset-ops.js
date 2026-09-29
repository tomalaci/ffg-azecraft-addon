/**
 * Asset operations for the Admin Panel (GM client): find which world documents use a file,
 * convert images to WebP, move files, and relink every document from the old path to the new one.
 *
 * Foundry's API can upload files and create folders but cannot delete, move or rename them. So a
 * "convert" writes `Name.optimized.webp` next to the original and a "move" copies the file; the
 * original is then unused and goes on the archive list (world setting) to delete by hand.
 * Compendium packs are not changed.
 */

import { decodePath, mentionsPath, optimizedPath, replacePathDeep, replacePathInString } from "./asset-core.js";

const MODULE_ID = "ffg-azecraft-addon";
export const ARCHIVE_SETTING = "assetArchive";

const FilePicker = () => foundry.applications.apps.FilePicker.implementation;

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

/** Every world document, with its embedded documents (items, tokens, pages...), depth first. */
function* allDocuments() {
    for (const collection of game.collections) {
        for (const doc of collection) yield* withEmbedded(doc);
    }
}

function* withEmbedded(doc) {
    yield doc;
    for (const name of Object.keys(doc.constructor.metadata.embedded ?? {})) {
        const children = doc.getEmbeddedCollection?.(name);
        if (!children || typeof children[Symbol.iterator] !== "function") continue;
        for (const child of children) yield* withEmbedded(child);
    }
}

/** A document's own data, without its embedded collections (they are handled as documents). */
function ownSource(doc) {
    const source = doc.toObject();
    for (const [name, field] of Object.entries(doc.constructor.metadata.embedded ?? {})) {
        const children = doc.getEmbeddedCollection?.(name);
        if (children && typeof children[Symbol.iterator] === "function" && Array.isArray(source[field])) delete source[field];
    }
    return source;
}

function describe(doc) {
    const parent = doc.parent ? `${doc.parent.name ?? doc.parent.documentName} › ` : "";
    return `${doc.documentName}: ${parent}${doc.name ?? doc.id}`;
}

/**
 * Which documents use any of the given paths.
 * @param {string[]} paths
 * @returns {Map<string, {doc: Document, label: string, fields: string[]}[]>} per decoded path
 */
export function findReferences(paths) {
    const wanted = paths.map(decodePath);
    const result = new Map(wanted.map(path => [path, []]));
    for (const doc of allDocuments()) {
        const source = ownSource(doc);
        const text = JSON.stringify(source);
        for (const path of wanted) {
            if (!mentionsPath(text, path)) continue;
            const { changed } = replacePathDeep(source, path, "\u0000");
            if (changed.length) result.get(path).push({ doc, label: describe(doc), fields: changed });
        }
    }
    for (const path of wanted) {
        const settings = settingReferences(path);
        if (settings.length) result.get(path).push(...settings.map(label => ({ doc: null, label, fields: [] })));
    }
    return result;
}

/** How many documents use each asset path in the world (for "used by" counts). */
export function referenceIndex() {
    const counts = new Map();
    const pattern = /"([^"]+\.(?:png|jpe?g|webp|gif|avif|svg|bmp|webm|mp4|m4v|ogg|oga|mp3|wav|flac|m4a|opus))"/gi;
    for (const doc of allDocuments()) {
        const seen = new Set();
        for (const match of JSON.stringify(ownSource(doc)).matchAll(pattern)) {
            for (const path of [decodePath(match[1]).replace(/^\/+/, "")]) {
                if (seen.has(path)) continue;
                seen.add(path);
                counts.set(path, (counts.get(path) ?? 0) + 1);
            }
        }
        // Paths inside HTML (descriptions, journal pages).
        for (const match of JSON.stringify(ownSource(doc)).matchAll(/src=\\"([^"\\]+)\\"/g)) {
            const path = decodePath(match[1]).replace(/^\/+/, "");
            if (seen.has(path)) continue;
            seen.add(path);
            counts.set(path, (counts.get(path) ?? 0) + 1);
        }
    }
    return counts;
}

/* -------------------------------------------- */
/*  Settings that hold paths                    */
/* -------------------------------------------- */

function settingReferences(path) {
    const labels = [];
    const art = game.settings.get(MODULE_ID, "defaultActorArt") ?? {};
    if (mentionsPath(JSON.stringify(art), path)) labels.push("Setting: default actor art");
    const copies = game.settings.get(MODULE_ID, "imageCopies") ?? {};
    if (Object.keys(copies).some(key => decodePath(key) === decodePath(path))) labels.push("Setting: lightweight image copies");
    return labels;
}

async function relinkSettings(oldPath, newPath) {
    const art = game.settings.get(MODULE_ID, "defaultActorArt") ?? {};
    const { data, changed } = replacePathDeep(art, oldPath, newPath);
    if (changed.length) await game.settings.set(MODULE_ID, "defaultActorArt", data);
    // A replaced original no longer needs its lightweight copy entry.
    const copies = { ...(game.settings.get(MODULE_ID, "imageCopies") ?? {}) };
    const key = Object.keys(copies).find(k => decodePath(k) === decodePath(oldPath));
    if (key) {
        delete copies[key];
        await game.settings.set(MODULE_ID, "imageCopies", copies);
    }
}

/* -------------------------------------------- */
/*  Relinking                                   */
/* -------------------------------------------- */

/**
 * Point every document (and addon setting) using `oldPath` at `newPath`.
 * @returns {Promise<{documents: number, failed: string[]}>}
 */
export async function relink(oldPath, newPath) {
    const refs = findReferences([oldPath]).get(decodePath(oldPath)) ?? [];
    let documents = 0;
    const failed = [];
    for (const { doc } of refs) {
        if (!doc) continue;
        try {
            const source = ownSource(doc);
            const { data } = replacePathDeep(source, oldPath, newPath);
            const diff = foundry.utils.diffObject(source, data);
            if (!Object.keys(diff).length) continue;
            await doc.update(diff, { diff: true, render: false });
            documents++;
        } catch (error) {
            console.warn(`Azecraft | Could not relink ${describe(doc)}`, error);
            failed.push(describe(doc));
        }
    }
    await relinkSettings(oldPath, newPath);
    return { documents, failed };
}

/* -------------------------------------------- */
/*  Files                                       */
/* -------------------------------------------- */

export async function fileSize(path) {
    try {
        const response = await fetch(encodeURI(decodePath(path)), { method: "HEAD" });
        return response.ok ? Number(response.headers.get("content-length")) || 0 : -1;
    } catch {
        return 0;
    }
}

/** List a folder of the user data: {dirs, files}. */
export async function browse(path) {
    const result = await FilePicker().browse("data", path || "");
    return { dirs: (result.dirs ?? []).map(decodePath), files: (result.files ?? []).map(decodePath), target: decodePath(result.target ?? path) };
}

async function exists(path) {
    const slash = path.lastIndexOf("/");
    try {
        const { files } = await browse(path.slice(0, slash));
        return files.includes(path);
    } catch {
        return false;
    }
}

async function ensureDirectory(directory) {
    let path = "";
    for (const part of directory.split("/").filter(Boolean)) {
        path = path ? `${path}/${part}` : part;
        try {
            await FilePicker().createDirectory("data", path, {});
        } catch {
            // Already exists.
        }
    }
}

async function upload(directory, name, blob, type) {
    await ensureDirectory(directory);
    const file = new File([blob], name, { type });
    const result = await FilePicker().upload("data", directory, file, {}, { notify: false });
    if (!result?.path) throw new Error(`Upload of ${name} failed`);
    return decodePath(result.path);
}

async function download(path) {
    const response = await fetch(encodeURI(decodePath(path)));
    if (!response.ok) throw new Error(`Could not read ${path} (${response.status})`);
    return response.blob();
}

/**
 * Make a WebP version of an image next to it (Name.optimized.webp).
 * @param {string} path
 * @param {{quality?: number, maxSide?: number}} options  quality 0-1 (default 0.9); maxSide 0 keeps the size
 * @returns {Promise<{path: string|null, skipped: boolean, before: number, after: number, width: number, height: number}>}
 *          skipped when WebP would not be at least 5% smaller (nothing is uploaded then)
 */
export async function convertToWebp(path, { quality = 0.9, maxSide = 0 } = {}) {
    const blob = await download(path);
    const bitmap = await createImageBitmap(blob);
    try {
        const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, width, height);
        const webp = await canvas.convertToBlob({ type: "image/webp", quality });
        if (webp.type !== "image/webp") throw new Error("This browser cannot encode WebP; use Chrome, Edge or a recent Firefox.");
        // Files cannot be deleted afterwards, so do not upload a copy that saves nothing.
        if (webp.size >= blob.size * 0.95) return { path: null, skipped: true, before: blob.size, after: webp.size, width, height };
        const target = optimizedPath(path);
        const saved = await upload(target.directory, target.name, webp, "image/webp");
        return { path: saved, skipped: false, before: blob.size, after: webp.size, width, height };
    } finally {
        bitmap.close();
    }
}

/** Copy a file into a folder (same name). Refuses to overwrite an existing file. */
export async function copyTo(path, folder) {
    const name = decodePath(path).split("/").pop();
    const target = `${folder.replace(/\/+$/, "")}/${name}`;
    if (await exists(target)) throw new Error(`${target} already exists`);
    const blob = await download(path);
    return upload(folder.replace(/\/+$/, ""), name, blob, blob.type || "application/octet-stream");
}

/* -------------------------------------------- */
/*  Archive list                                */
/* -------------------------------------------- */

export function archiveList() {
    return game.settings.get(MODULE_ID, ARCHIVE_SETTING) ?? [];
}

export async function addToArchive(path, replacedBy, reason) {
    const list = archiveList().filter(entry => entry.path !== path);
    list.push({ path, replacedBy, reason, at: new Date().toISOString() });
    await game.settings.set(MODULE_ID, ARCHIVE_SETTING, list);
}

export async function removeFromArchive(paths) {
    const drop = new Set(paths);
    await game.settings.set(MODULE_ID, ARCHIVE_SETTING, archiveList().filter(entry => !drop.has(entry.path)));
}

export function registerAssetSettings() {
    game.settings.register(MODULE_ID, ARCHIVE_SETTING, { scope: "world", config: false, type: Array, default: [] });
    game.settings.register(MODULE_ID, "assetWebpQuality", { scope: "client", config: false, type: Number, default: 0.9 });
    game.settings.register(MODULE_ID, "assetLargeMB", { scope: "client", config: false, type: Number, default: 5 });
    game.settings.register(MODULE_ID, "assetSkipWebp", { scope: "client", config: false, type: Boolean, default: true });
}

export { replacePathInString };
