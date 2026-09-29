/**
 * Lightweight copies of large images (see thumbnail-core.js for the rules).
 *
 * - The active GM's client finds large actor images (portraits and dashboard full-body art), makes
 *   a WebP copy in the browser and uploads it to worlds/<world>/azecraft-thumbs/. The world setting
 *   `imageCopies` lists them, so every client knows about every copy.
 * - Every client then swaps an <img> that shows an original for its copy, wherever Foundry or the
 *   addon renders it (dashboard, Actors tab, sheets, chat...). The image viewer keeps the original,
 *   and nothing in the actors' data changes.
 */

import { urlPath } from "../paths.js";
import { MAX_SIDE, QUALITY, copyPath, copySize, isCandidatePath, lookup, normalizeSrc, originalOf, worthCopying } from "./thumbnail-core.js";

const MODULE_ID = "ffg-azecraft-addon";
const SETTINGS = { registry: "imageCopies", enabled: "useImageCopies" };
/** Elements that must show the original image (image viewer, file picker). */
const KEEP_ORIGINAL = ".image-popout, .file-picker, .filepicker, [data-azecraft-original]";

let registry = {};
/** The page origin, so absolute image URLs match their registry keys (read lazily: no window in tests). */
const origin = () => `${globalThis.location?.origin ?? ""}/`;

function enabled() {
    return globalThis.game?.settings?.get(MODULE_ID, SETTINGS.enabled) ?? false;
}

/** The lightweight copy to show for an image, or null. */
export function imageCopyFor(src) {
    if (!enabled()) return null;
    const copy = lookup(registry, src, origin());
    return copy ? urlPath(copy) : null;
}

/** An image to display: its copy (as a URL) when one exists, otherwise the image itself. */
export function displaySrc(src) {
    return imageCopyFor(src) ?? src;
}

/* -------------------------------------------- */
/*  Showing copies                              */
/* -------------------------------------------- */

function swap(img) {
    if (img.dataset.azecraftSwapped === img.getAttribute("src") || img.closest(KEEP_ORIGINAL)) return;
    const copy = imageCopyFor(img.getAttribute("src"));
    if (!copy) return;
    const original = img.getAttribute("src");
    img.dataset.azecraftOriginalSrc = original;
    img.dataset.azecraftSwapped = copy;
    // A missing copy (e.g. deleted from disk) falls back to the original.
    img.addEventListener("error", () => {
        if (img.getAttribute("src") !== copy) return;
        img.dataset.azecraftSwapped = original;
        img.setAttribute("src", original);
    }, { once: true });
    img.setAttribute("src", copy);
}

function swapWithin(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "IMG") swap(node);
    else for (const img of node.getElementsByTagName("img")) swap(img);
}

/**
 * Sheets save the `src` of their `<img data-edit>` (the portrait) with every form submit, which would
 * write a swapped-in copy into the document. Form data always gets the original back.
 */
function keepOriginalsInForms() {
    const FormDataExtended = foundry.applications.ux.FormDataExtended;
    const set = FormDataExtended.prototype.set;
    FormDataExtended.prototype.set = function (name, value) {
        const original = typeof value === "string" && value ? originalOf(registry, value, origin()) : null;
        return set.call(this, name, original ?? value);
    };
}

function watchDocument() {
    swapWithin(document.body);
    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes") swap(record.target);
            else for (const node of record.addedNodes) swapWithin(node);
        }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
}

/* -------------------------------------------- */
/*  Making copies (GM)                          */
/* -------------------------------------------- */

/** Actor images worth checking: portraits and dashboard full-body art. */
export function candidateSources() {
    const sources = new Set();
    for (const actor of game.actors) {
        for (const src of [actor.img, actor.getFlag(MODULE_ID, "dashboard")?.fullArt]) {
            if (src && isCandidatePath(src)) sources.add(normalizeSrc(src));
        }
    }
    return [...sources];
}

async function ensureDirectory(directory) {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    let path = "";
    for (const part of directory.split("/")) {
        path = path ? `${path}/${part}` : part;
        try {
            await FilePicker.createDirectory("data", path, {});
        } catch {
            // Already exists.
        }
    }
}

async function fileSize(src) {
    try {
        const response = await fetch(urlPath(src), { method: "HEAD" });
        return Number(response.headers.get("content-length")) || 0;
    } catch {
        return 0;
    }
}

/**
 * Make and upload the copy of one image. Returns its registry entry, or null if not worth it.
 * @param {Set<string>} taken  copy paths other originals use (so no copy overwrites another)
 */
async function makeCopy(src, taken) {
    const bytes = await fileSize(src);
    if (bytes && !worthCopying({ bytes })) return null;

    const response = await fetch(urlPath(src));
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    try {
        if (!worthCopying({ bytes, width: bitmap.width, height: bitmap.height })) return null;
        const size = copySize(bitmap.width, bitmap.height, MAX_SIDE);
        const canvas = new OffscreenCanvas(size.width, size.height);
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
        if (bytes && blob.size >= bytes) return null;

        const { directory, name } = copyPath(game.world.id, src, taken);
        await ensureDirectory(directory);
        const file = new File([blob], name, { type: "image/webp" });
        const result = await foundry.applications.apps.FilePicker.implementation.upload("data", directory, file, {}, { notify: false });
        if (!result?.path) return null;
        // Upload results are URL-encoded ("Mass%20Effect"); the registry keeps plain paths.
        return { thumb: normalizeSrc(result.path), width: bitmap.width, height: bitmap.height, bytes: bytes || blob.size, thumbBytes: blob.size };
    } finally {
        bitmap.close();
    }
}

/** Whether a copy is still good: the copy file exists and the original has not changed size since. */
async function isCurrent(src, entry) {
    try {
        const [original, copy] = await Promise.all([src, entry.thumb].map(path => fetch(urlPath(path), { method: "HEAD" })));
        return original.ok && copy.ok && Number(original.headers.get("content-length")) === entry.bytes;
    } catch {
        return false;
    }
}

let queue = Promise.resolve();
const checked = new Set();

/**
 * Make copies of the given images (or all actor images) that do not have one yet. Runs one image at
 * a time, so a GM client never decodes several huge images at once.
 * @param {{refresh?: boolean, force?: boolean}} options
 *        refresh: also remake copies that are missing on disk or whose original changed;
 *        force: remake every copy
 * @returns {Promise<{made: number, current: number, skipped: number, failed: number}>}
 *          current: copies already up to date; skipped: images too small to need one
 */
export function makeCopies(sources = candidateSources(), { refresh = false, force = false } = {}) {
    const run = async () => {
        const counts = { made: 0, current: 0, skipped: 0, failed: 0 };
        const added = {};
        for (const src of sources) {
            if (!force && registry[src] && (!refresh || await isCurrent(src, registry[src]))) {
                counts.current++;
                continue;
            }
            if (!force && !refresh && checked.has(src)) continue;
            checked.add(src);
            try {
                const others = Object.entries({ ...registry, ...added }).filter(([original]) => original !== src);
                const entry = await makeCopy(src, new Set(others.map(([, e]) => normalizeSrc(e.thumb))));
                if (entry) {
                    added[src] = entry;
                    counts.made++;
                } else counts.skipped++;
            } catch (error) {
                counts.failed++;
                console.warn(`Azecraft | Could not make a lightweight copy of ${src}`, error);
            }
        }
        if (counts.made) {
            await game.settings.set(MODULE_ID, SETTINGS.registry, { ...game.settings.get(MODULE_ID, SETTINGS.registry), ...added });
        }
        return counts;
    };
    queue = queue.then(run, run);
    return queue;
}

function isCopyMaker() {
    return game.user.isGM && game.user === game.users.activeGM && game.user.can("FILES_UPLOAD");
}

/* -------------------------------------------- */
/*  Settings window                             */
/* -------------------------------------------- */

async function openSettings() {
    const entries = Object.entries(game.settings.get(MODULE_ID, SETTINGS.registry) ?? {});
    const mb = bytes => (bytes / 1048576).toFixed(1);
    const saved = entries.reduce((sum, [, e]) => sum + (e.bytes - e.thumbBytes), 0);
    const rows = entries
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .map(([src, e]) => `<tr><td>${foundry.utils.escapeHTML(src.split("/").pop())}</td><td>${e.width}×${e.height}</td><td>${mb(e.bytes)} MB</td><td>${mb(e.thumbBytes)} MB</td></tr>`)
        .join("");
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: "Lightweight images", icon: "fa-solid fa-images" },
        position: { width: 560 },
        content: `<p>Large actor images get a lightweight WebP copy (at most ${MAX_SIDE} px), which the dashboard, the Actors tab and sheets show instead. The image viewer and the actors' data keep the originals.</p>
            <p><strong>${entries.length}</strong> image(s) have a copy, saving <strong>${mb(saved)} MB</strong> per client that shows them all.</p>
            ${rows ? `<div style="max-height: 280px; overflow-y: auto"><table><thead><tr><th>Image</th><th>Original</th><th>Size</th><th>Copy</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
            <p class="hint">Copies are made automatically by the GM's browser when actors are created or their art changes. "Check now" looks for images still without a copy; "Remake all" replaces every copy (e.g. after editing an image in place).</p>`,
        buttons: [
            { action: "scan", label: "Check now", icon: "fa-solid fa-magnifying-glass", default: true },
            { action: "remake", label: "Remake all", icon: "fa-solid fa-rotate" },
            { action: "close", label: "Close" }
        ],
        rejectClose: false
    });
    if (choice !== "scan" && choice !== "remake") return;
    ui.notifications.info("Making lightweight image copies… this can take a moment for very large images.");
    checked.clear();
    const counts = await makeCopies(candidateSources(), { refresh: true, force: choice === "remake" });
    ui.notifications.info(`Lightweight images: ${counts.made} made, ${counts.current} already up to date, ${counts.skipped} not needed (small), ${counts.failed} failed.`);
}

/* -------------------------------------------- */

export function initThumbnails() {
    game.settings.register(MODULE_ID, SETTINGS.registry, {
        scope: "world",
        config: false,
        type: Object,
        default: {},
        onChange: value => {
            registry = value ?? {};
            swapWithin(document.body);
        }
    });
    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Use lightweight images",
        hint: "Show lightweight copies of large actor images in the dashboard, the Actors tab and sheets (much faster to load). Turn off to always show the originals.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => foundry.utils.debouncedReload()
    });
    // Settings menus need an application class; this one just opens the dialog.
    class ImageCopiesMenu extends foundry.applications.api.ApplicationV2 {
        render() {
            openSettings();
            return this;
        }
    }
    game.settings.registerMenu(MODULE_ID, "imageCopiesMenu", {
        name: "Lightweight images",
        label: "Manage lightweight images",
        hint: "See which large images have a lightweight copy, and make copies for any that are missing.",
        icon: "fa-solid fa-images",
        type: ImageCopiesMenu,
        restricted: true
    });

    Hooks.once("setup", () => {
        registry = game.settings.get(MODULE_ID, SETTINGS.registry) ?? {};
    });

    Hooks.once("ready", () => {
        if (enabled()) {
            keepOriginalsInForms();
            watchDocument();
        }
        if (isCopyMaker()) {
            // Give the world a moment to settle before decoding large images.
            setTimeout(() => makeCopies(), 5000);
        }
    });

    const onArtChange = actor => {
        if (!isCopyMaker()) return;
        const sources = [actor.img, actor.getFlag(MODULE_ID, "dashboard")?.fullArt].filter(src => src && isCandidatePath(src)).map(src => normalizeSrc(src));
        if (sources.length) makeCopies(sources);
    };
    Hooks.on("createActor", onArtChange);
    Hooks.on("updateActor", (actor, changes) => {
        if ("img" in changes || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.dashboard.fullArt`)) onArtChange(actor);
    });
}
