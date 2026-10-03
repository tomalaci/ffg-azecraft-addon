/**
 * The archive section of the Share Image and Share Text windows (templates/share/archive.hbs):
 * choose an archive to browse, open or re-share kept items, delete them (author or GM), and for
 * GMs start a new archive or make one current.
 */

import { archives, currentArchive, deleteShare, newArchive, setCurrentArchive, sharesIn } from "./share-archive.js";

const MODULE_ID = "ffg-azecraft-addon";
export const ARCHIVE_PARTIAL = `modules/${MODULE_ID}/templates/share/archive.hbs`;

/**
 * Context for the partial. `browseId`: the archive this window shows (default: the current one);
 * `shareTo`: who "Share again" sends to (the window's Show-to choice), for its tooltip.
 */
export function archiveContext(browseId, kind, shareTo = "everyone online") {
    const current = currentArchive();
    const list = archives();
    const shown = list.find(entry => entry.id === browseId) ?? current ?? null;
    return {
        isGM: game.user.isGM,
        shareTo,
        kindLabel: kind === "image" ? "shared as an image" : "shared as text",
        shownIsCurrent: shown?.id === current?.id,
        list: list.map(entry => ({ id: entry.id, name: entry.name, current: entry.id === current?.id, shown: entry.id === shown?.id })),
        items: sharesIn(shown, kind),
        shownId: shown?.id ?? null
    };
}

/** Find a kept share by page uuid. */
export function archivedItem(uuid) {
    const page = fromUuidSync(uuid);
    return page ? sharesIn(page.parent).find(item => item.uuid === uuid) ?? null : null;
}

export function bindArchiveBrowse(app, root) {
    root.querySelector("[data-azsh-browse]")?.addEventListener("change", event => {
        app.browseId = event.target.value;
        app.render();
    });
}

export async function onDeleteArchived(target) {
    const item = archivedItem(target.dataset.uuid);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Delete from the archive" },
        content: `<p>Delete <strong>${foundry.utils.escapeHTML(item.title)}</strong> from the archive? This cannot be undone.</p>`,
        rejectClose: false
    });
    if (ok) await deleteShare(item.uuid);
}

export async function onNewArchive(app) {
    if (!game.user.isGM) return;
    const name = await foundry.applications.api.DialogV2.prompt({
        window: { title: "New archive" },
        content: `<div class="form-group"><label>Name</label><div class="form-fields"><input type="text" name="name" value="Session ${new Date().toLocaleDateString()}" autofocus></div></div>`,
        ok: { label: "Create", callback: (event, button) => button.form.elements.name.value.trim() },
        rejectClose: false
    });
    if (!name) return;
    await newArchive(name);
    app.browseId = null;
}

export async function onSetCurrentArchive(app) {
    if (app.browseId) await setCurrentArchive(app.browseId);
}
