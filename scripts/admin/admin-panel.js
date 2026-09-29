/**
 * Admin Panel (toolbar tab, GMs only): bulk fixes and an asset manager, each with a pre-flight
 * summary and a confirmation before anything changes.
 *
 * - Quick actions: replace Star Wars placeholder art; make lightweight copies of squad portraits.
 * - Assets: browse the user data folders; per file size and how many documents use it; convert
 *   images to WebP (Name.optimized.webp) or copy files to another folder, relinking every document.
 * - Large files: every file over a size (default 5 MB) under a folder, largest first.
 * - Archive: originals no longer used after a conversion or move, to delete by hand (Foundry's API
 *   cannot delete files).
 */

import { SceneSpaceApp } from "../ui/scene-space.js";
import { formatBytes } from "../perf/perf-core.js";
import { decodePath, extension, isConvertible, isImage } from "./asset-core.js";
import { addToArchive, archiveList, browse, convertToWebp, copyTo, fileSize, findReferences, referenceIndex, registerAssetSettings, relink, removeFromArchive } from "./asset-ops.js";
import { replacePlaceholderArt } from "../default-art/default-art.js";
import { candidateSources, makeCopies } from "../thumbnails/thumbnails.js";
import { readSquads } from "../mission-dashboard/squads.js";

const MODULE_ID = "ffg-azecraft-addon";
const TEMPLATE = `modules/${MODULE_ID}/templates/admin/admin-panel.hbs`;
const PROTECTED_ROOTS = ["modules/", "systems/"];

const { DialogV2 } = foundry.applications.api;
const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

async function confirm(title, content, yes = "Continue") {
    return DialogV2.confirm({
        window: { title, icon: "fa-solid fa-shield-halved" },
        position: { width: 560 },
        content,
        yes: { label: yes, icon: "fa-solid fa-check" },
        no: { label: "Cancel" },
        rejectClose: false
    });
}

function refsHtml(refs) {
    if (!refs?.length) return "<em>not used by any document</em>";
    const shown = refs.slice(0, 6).map(ref => `<li>${esc(ref.label)}${ref.fields.length ? ` <span class="azap-muted">(${esc(ref.fields.slice(0, 3).join(", "))})</span>` : ""}</li>`).join("");
    return `<ul>${shown}${refs.length > 6 ? `<li>… and ${refs.length - 6} more</li>` : ""}</ul>`;
}

async function withConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    }));
    return results;
}

export class AdminPanelApp extends SceneSpaceApp {
    static DEFAULT_OPTIONS = {
        id: "azecraft-admin-panel",
        classes: ["azecraft-admin-panel"],
        window: { title: "Admin Panel", icon: "fa-solid fa-screwdriver-wrench" },
        actions: {
            switchTab: AdminPanelApp.#onTab,
            replaceArt: AdminPanelApp.#onReplaceArt,
            optimizeSquads: AdminPanelApp.#onOptimizeSquads,
            optimizeAll: AdminPanelApp.#onOptimizeAll,
            open: AdminPanelApp.#onOpen,
            up: AdminPanelApp.#onUp,
            select: AdminPanelApp.#onSelect,
            convert: AdminPanelApp.#onConvert,
            move: AdminPanelApp.#onMove,
            scanLarge: AdminPanelApp.#onScanLarge,
            unarchive: AdminPanelApp.#onUnarchive,
            copyArchive: AdminPanelApp.#onCopyArchive
        }
    };

    static PARTS = {
        body: { template: TEMPLATE, scrollable: [".azap-scroll"] }
    };

    tab = "actions";
    path = null;
    listing = null;
    sizes = new Map();
    refCounts = null;
    selected = new Set();
    large = null;
    largeRoot = null;
    busy = "";

    get quality() {
        return game.settings.get(MODULE_ID, "assetWebpQuality");
    }

    async _prepareContext() {
        this.path ??= `worlds/${game.world.id}`;
        this.largeRoot ??= `worlds/${game.world.id}`;
        const context = {
            tab: this.tab,
            busy: this.busy,
            quality: this.quality,
            largeMB: game.settings.get(MODULE_ID, "assetLargeMB"),
            skipWebp: game.settings.get(MODULE_ID, "assetSkipWebp"),
            archiveCount: archiveList().length
        };
        if (this.tab === "actions") Object.assign(context, this.#actionsContext());
        if (this.tab === "assets") Object.assign(context, await this.#assetsContext());
        if (this.tab === "large") Object.assign(context, this.#largeContext());
        if (this.tab === "archive") Object.assign(context, { archive: archiveList().map(e => ({ ...e, when: e.at?.slice(0, 10) })).reverse() });
        return context;
    }

    #actionsContext() {
        const copies = game.settings.get(MODULE_ID, "imageCopies") ?? {};
        return { squadCount: readSquads().length, copyCount: Object.keys(copies).length };
    }

    async #assetsContext() {
        this.refCounts ??= referenceIndex();
        if (!this.listing || this.listing.target !== this.path) {
            try {
                this.listing = await browse(this.path);
            } catch (error) {
                ui.notifications.error(`Cannot open ${this.path}: ${error.message}`);
                this.path = `worlds/${game.world.id}`;
                this.listing = await browse(this.path);
            }
            this.#fillSizes(this.listing.files);
        }
        const crumbs = this.path.split("/").filter(Boolean).map((part, index, all) => ({ name: part, path: all.slice(0, index + 1).join("/") }));
        return {
            path: this.path,
            crumbs,
            canUp: this.path.includes("/"),
            dirs: this.listing.dirs.map(dir => ({ path: dir, name: dir.split("/").pop() })),
            files: this.listing.files.map(file => this.#fileRow(file)),
            selectedCount: this.selected.size
        };
    }

    #fileRow(path) {
        const size = this.sizes.get(path);
        return {
            path,
            name: path.split("/").pop(),
            ext: extension(path),
            size: size === undefined ? "…" : size < 0 ? "missing" : formatBytes(size),
            heavy: size >= game.settings.get(MODULE_ID, "assetLargeMB") * 1048576,
            used: this.refCounts?.get(path) ?? 0,
            convertible: isConvertible(path),
            image: isImage(path),
            selected: this.selected.has(path)
        };
    }

    /** Fetch file sizes in the background, then re-render once. */
    async #fillSizes(files) {
        const missing = files.filter(file => !this.sizes.has(file));
        if (!missing.length) return;
        await withConcurrency(missing, 8, async file => this.sizes.set(file, await fileSize(file)));
        if (this.rendered && this.tab === "assets") this.render();
    }

    #largeContext() {
        if (this.large) this.refCounts ??= referenceIndex();
        return { largeRoot: this.largeRoot, large: this.large?.map(path => this.#fileRow(path)) ?? null, selectedCount: this.selected.size };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.addEventListener("change", event => {
            const input = event.target;
            if (input.matches("[data-azap-setting]")) {
                const key = input.dataset.azapSetting;
                const value = input.type === "checkbox" ? input.checked : Number(input.value);
                game.settings.set(MODULE_ID, key, value);
            }
            if (input.matches("[data-azap-large-root]")) this.largeRoot = input.value.trim().replace(/^\/+|\/+$/g, "");
            if (input.matches("[data-azap-path]")) {
                this.path = input.value.trim().replace(/^\/+|\/+$/g, "");
                this.selected.clear();
                this.render();
            }
        });
    }

    #run(label, fn) {
        this.busy = label;
        this.render();
        return fn().finally(() => {
            this.busy = "";
            this.refCounts = null;
            this.listing = null;
            this.render();
        });
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static #onTab(event, target) {
        this.tab = target.dataset.tab;
        this.render();
    }

    static async #onReplaceArt() {
        await replacePlaceholderArt();
    }

    static async #onOptimizeSquads() {
        const actors = new Map();
        for (const squad of readSquads()) {
            for (const slot of [...(squad.party ?? []), ...(squad.people ?? [])]) {
                const actor = slot?.actorUuid ? fromUuidSync(slot.actorUuid, { strict: false }) : null;
                if (actor) actors.set(actor.id, actor);
            }
        }
        const sources = [...new Set([...actors.values()].flatMap(a => [a.img, a.getFlag(MODULE_ID, "dashboard")?.fullArt]).filter(Boolean).map(decodePath))];
        if (!sources.length) return ui.notifications.info("No squad portraits found.");
        const ok = await confirm("Optimize squad portraits",
            `<p>Remake the lightweight WebP copies of <strong>${sources.length}</strong> portrait(s) of ${actors.size} squad member(s) and People of Note. The originals are not changed; small images are skipped.</p>`,
            "Remake copies");
        if (!ok) return;
        await this.#run("Making copies…", async () => {
            const counts = await makeCopies(sources, { force: true });
            ui.notifications.info(`Squad portraits: ${counts.made} copies made, ${counts.skipped} not needed, ${counts.failed} failed.`);
        });
    }

    static async #onOptimizeAll() {
        await this.#run("Making copies…", async () => {
            const counts = await makeCopies(candidateSources());
            ui.notifications.info(`Actor images: ${counts.made} copies made, ${counts.skipped} not needed or done, ${counts.failed} failed.`);
        });
    }

    static #onOpen(event, target) {
        // A file opens the folder it is in.
        const path = target.dataset.path;
        this.path = extension(path) && /\.[a-z0-9]{2,5}$/i.test(path) ? path.split("/").slice(0, -1).join("/") : path;
        this.selected.clear();
        this.tab = "assets";
        this.render();
    }

    static #onUp() {
        this.path = this.path.split("/").slice(0, -1).join("/");
        this.selected.clear();
        this.render();
    }

    static #onSelect(event, target) {
        const path = target.dataset.path;
        if (target.checked) this.selected.add(path);
        else this.selected.delete(path);
        this.element.querySelector("[data-azap-selected]")?.replaceChildren(String(this.selected.size));
    }

    #targets(target) {
        if (target.dataset.path) return [target.dataset.path];
        return [...this.selected];
    }

    static async #onConvert(event, target) {
        const paths = this.#targets(target).filter(isConvertible);
        if (!paths.length) return ui.notifications.warn("Select PNG, JPEG, BMP or AVIF images to convert.");
        const refs = findReferences(paths);
        const quality = this.quality;
        const rows = paths.map(path => `<li><strong>${esc(path)}</strong> (${this.sizes.has(path) ? formatBytes(this.sizes.get(path)) : "size unknown"}): used by ${refsHtml(refs.get(decodePath(path)))}</li>`).join("");
        const ok = await confirm("Convert to WebP",
            `<p>Make a WebP version (quality ${Math.round(quality * 100)}%, full resolution) of ${paths.length} image(s), saved next to each as <code>Name.optimized.webp</code>, and point every document below at it.</p>
            <ol class="azap-preflight">${rows}</ol>
            <p>The originals stay on disk (Foundry cannot delete files); they are added to the <strong>Archive</strong> list to delete by hand. Images where WebP saves less than 5% are skipped.</p>`,
            "Convert");
        if (!ok) return;
        await this.#run(`Converting ${paths.length} image(s)…`, async () => {
            let converted = 0, skipped = 0, relinked = 0, saved = 0;
            const failed = [];
            for (const path of paths) {
                try {
                    const result = await convertToWebp(path, { quality });
                    if (result.skipped) {
                        skipped++;
                        continue;
                    }
                    const { documents, failed: relinkFailed } = await relink(path, result.path);
                    relinked += documents;
                    failed.push(...relinkFailed);
                    await addToArchive(path, result.path, "converted to WebP");
                    converted++;
                    saved += result.before - result.after;
                } catch (error) {
                    failed.push(`${path}: ${error.message}`);
                }
            }
            this.selected.clear();
            ui.notifications.info(`Converted ${converted} image(s), saved ${formatBytes(saved)}, updated ${relinked} document(s); ${skipped} skipped.`);
            if (failed.length) ui.notifications.warn(`Some items failed: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`, { permanent: true });
        });
    }

    static async #onMove(event, target) {
        const paths = this.#targets(target);
        if (!paths.length) return ui.notifications.warn("Select files to move.");
        const refs = findReferences(paths);
        const folder = await DialogV2.prompt({
            window: { title: "Move files", icon: "fa-solid fa-folder-tree" },
            position: { width: 560 },
            content: `<p>Copy ${paths.length} file(s) into another folder and point every document below at the new place.</p>
                <ol class="azap-preflight">${paths.map(p => `<li><strong>${esc(p)}</strong>: used by ${refsHtml(refs.get(decodePath(p)))}</li>`).join("")}</ol>
                <div class="form-group"><label>Target folder</label><div class="form-fields"><input type="text" name="folder" value="${esc(this.path)}" autofocus></div></div>
                <p class="hint">The originals stay on disk (Foundry cannot delete files) and go on the Archive list. Files already in the target folder are not overwritten. Folders under modules/ and systems/ are not allowed.</p>`,
            ok: { label: "Move", icon: "fa-solid fa-check", callback: (e, button) => button.form.elements.folder.value.trim().replace(/^\/+|\/+$/g, "") },
            rejectClose: false
        });
        if (!folder) return;
        if (PROTECTED_ROOTS.some(root => `${folder}/`.startsWith(root))) return ui.notifications.error("Files cannot be moved into modules/ or systems/.");
        await this.#run(`Moving ${paths.length} file(s)…`, async () => {
            let moved = 0, relinked = 0;
            const failed = [];
            for (const path of paths) {
                if (path.split("/").slice(0, -1).join("/") === folder) continue;
                try {
                    const newPath = await copyTo(path, folder);
                    const { documents, failed: relinkFailed } = await relink(path, newPath);
                    relinked += documents;
                    failed.push(...relinkFailed);
                    await addToArchive(path, newPath, "moved");
                    moved++;
                } catch (error) {
                    failed.push(`${path}: ${error.message}`);
                }
            }
            this.selected.clear();
            ui.notifications.info(`Moved ${moved} file(s) to ${folder}, updated ${relinked} document(s).`);
            if (failed.length) ui.notifications.warn(`Some items failed: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}`, { permanent: true });
        });
    }

    static async #onScanLarge() {
        const root = this.largeRoot;
        const minBytes = game.settings.get(MODULE_ID, "assetLargeMB") * 1048576;
        const skipWebp = game.settings.get(MODULE_ID, "assetSkipWebp");
        await this.#run(`Scanning ${root}…`, async () => {
            const files = [];
            const queue = [root];
            let folders = 0;
            while (queue.length && folders < 2000) {
                const dir = queue.shift();
                folders++;
                try {
                    const listing = await browse(dir);
                    queue.push(...listing.dirs);
                    files.push(...listing.files);
                } catch {
                    // Unreadable folder: skip.
                }
            }
            const candidates = files.filter(file => !(skipWebp && extension(file) === "webp"));
            await withConcurrency(candidates.filter(file => !this.sizes.has(file)), 8, async file => this.sizes.set(file, await fileSize(file)));
            this.refCounts = null;
            this.large = candidates.filter(file => (this.sizes.get(file) ?? 0) >= minBytes).sort((a, b) => this.sizes.get(b) - this.sizes.get(a));
            ui.notifications.info(`Scanned ${files.length} file(s) in ${folders} folder(s): ${this.large.length} over ${formatBytes(minBytes)}.`);
        });
    }

    static async #onUnarchive(event, target) {
        await removeFromArchive([target.dataset.path]);
        this.render();
    }

    static async #onCopyArchive() {
        const text = archiveList().map(entry => entry.path).join("\n");
        await navigator.clipboard.writeText(text);
        ui.notifications.info("Archived file paths copied to the clipboard.");
    }
}

export function initAdminPanel() {
    registerAssetSettings();
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE]));
}
