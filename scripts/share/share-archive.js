/**
 * Share archives: images and text shared with Share Image / Share Text are kept in the world (unless
 * the sharer unticks "Keep"), as pages of an archive Journal Entry in the "Shared Content" folder.
 * Images are stored inside the page (their data URL), so nothing is uploaded and deleting a page
 * frees the space. One archive is current (world setting); GMs can start a new one (e.g. per
 * session) or switch, and everyone can browse any archive.
 *
 * Players can read the archives but not write them, so pages are created and deleted by the active
 * GM's client (module socket), as the story points are. Deleting is allowed to the author and GMs.
 */

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const FOLDER_NAME = "Shared Content";
const FOLDER_FLAG = "shareFolder";
const ARCHIVE_FLAG = "shareArchive";
const PAGE_FLAG = "share";
const CURRENT = "shareArchiveCurrent";

const esc = text => foundry.utils.escapeHTML(String(text ?? ""));

function isActiveGM() {
    return game.user.isGM && game.user === game.users.activeGM;
}

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/** Archive journals, newest first. */
export function archives() {
    return game.journal.filter(entry => entry.getFlag(MODULE_ID, ARCHIVE_FLAG))
        .sort((a, b) => (b.getFlag(MODULE_ID, ARCHIVE_FLAG)?.created ?? 0) - (a.getFlag(MODULE_ID, ARCHIVE_FLAG)?.created ?? 0));
}

/** The archive new shares go to (null until the first one is made). */
export function currentArchive() {
    const id = game.settings.get(MODULE_ID, CURRENT);
    return game.journal.get(id) ?? archives()[0] ?? null;
}

/**
 * The shares of an archive, newest first.
 * @param {"image"|"text"|null} kind
 */
export function sharesIn(archive, kind = null) {
    if (!archive) return [];
    return archive.pages.contents
        .map(page => ({ page, meta: page.getFlag(MODULE_ID, PAGE_FLAG) }))
        .filter(({ meta }) => meta && (!kind || meta.kind === kind))
        .sort((a, b) => (b.meta.time ?? 0) - (a.meta.time ?? 0))
        .map(({ page, meta }) => {
            const image = meta.kind === "image" ? page.text?.content?.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null : null;
            return {
                uuid: page.uuid,
                kind: meta.kind,
                title: page.name,
                caption: meta.caption ?? "",
                author: game.users.get(meta.author)?.name ?? "someone",
                authorId: meta.author,
                time: meta.time,
                when: new Date(meta.time ?? 0).toLocaleString(),
                image,
                html: page.text?.content ?? "",
                canDelete: game.user.isGM || meta.author === game.user.id
            };
        });
}

/* -------------------------------------------- */
/*  Writing (active GM)                         */
/* -------------------------------------------- */

async function ensureFolder() {
    const existing = game.folders.find(folder => folder.type === "JournalEntry" && folder.getFlag(MODULE_ID, FOLDER_FLAG));
    if (existing) return existing;
    return Folder.implementation.create({ name: FOLDER_NAME, type: "JournalEntry", color: "#1b3a57", flags: { [MODULE_ID]: { [FOLDER_FLAG]: true } } });
}

async function createArchive(name) {
    const folder = await ensureFolder();
    const archive = await JournalEntry.implementation.create({
        name: String(name ?? "").trim() || `Shared ${new Date().toLocaleDateString()}`,
        folder: folder.id,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        flags: { [MODULE_ID]: { [ARCHIVE_FLAG]: { created: Date.now() } } }
    });
    await game.settings.set(MODULE_ID, CURRENT, archive.id);
    return archive;
}

function pageContent({ kind, src, caption, html }) {
    if (kind === "image") return `<p><img src="${esc(src)}"></p>${caption ? `<p>${esc(caption)}</p>` : ""}`;
    return String(html ?? "");
}

/** A kept share with the same image or text (sharing it again moves it up instead of copying it). */
function findSame(archive, share) {
    const content = pageContent(share);
    return archive.pages.find(page => {
        const meta = page.getFlag(MODULE_ID, PAGE_FLAG);
        if (meta?.kind !== share.kind) return false;
        const html = page.text?.content ?? "";
        if (share.kind === "image") {
            const src = html.match(/<img[^>]+src="([^"]+)"/)?.[1];
            return src === share.src || src === esc(share.src);
        }
        return html === content;
    }) ?? null;
}

async function store(share) {
    const archive = currentArchive() ?? await createArchive("Shared");
    const name = share.title || (share.kind === "image" ? "Image" : "Text");
    const same = findSame(archive, share);
    if (same) {
        const meta = same.getFlag(MODULE_ID, PAGE_FLAG);
        const update = { [`flags.${MODULE_ID}.${PAGE_FLAG}.time`]: Date.now() };
        // A new caption replaces the old one (the author stays who first shared it).
        if (share.kind === "image" && share.caption && share.caption !== meta.caption) {
            update[`flags.${MODULE_ID}.${PAGE_FLAG}.caption`] = share.caption;
            update["text.content"] = pageContent(share);
            update.name = `${name} — ${game.users.get(meta.author)?.name ?? "someone"}`;
        }
        await same.update(update);
        return;
    }
    await archive.createEmbeddedDocuments("JournalEntryPage", [{
        name: `${name} — ${game.users.get(share.author)?.name ?? "someone"}`,
        type: "text",
        text: { content: pageContent(share) },
        flags: { [MODULE_ID]: { [PAGE_FLAG]: { kind: share.kind, author: share.author, time: Date.now(), caption: share.caption ?? "" } } }
    }]);
}

async function remove(uuid, userId) {
    const page = fromUuidSync(uuid);
    const meta = page?.getFlag(MODULE_ID, PAGE_FLAG);
    if (!meta) return;
    const user = game.users.get(userId);
    if (!user?.isGM && meta.author !== userId) return;
    await page.delete();
}

/* -------------------------------------------- */
/*  Requests (any user)                         */
/* -------------------------------------------- */

function relay(type, data) {
    if (isActiveGM()) return handle({ type, ...data, userId: game.user.id });
    if (!game.users.activeGM) {
        ui.notifications.warn("Keeping shares needs a GM online; this one was not kept.");
        return null;
    }
    game.socket.emit(SOCKET, { type, ...data, userId: game.user.id });
    return null;
}

function handle(message) {
    if (message.type === "shareStore") return store({ ...message.share, author: message.userId });
    if (message.type === "shareDelete") return remove(message.uuid, message.userId);
    if (message.type === "shareNewArchive") return game.users.get(message.userId)?.isGM ? createArchive(message.name) : null;
    return null;
}

/** Keep a share in the current archive. */
export function keepShare(share) {
    return relay("shareStore", { share });
}

/** Delete a kept share (its author or a GM). */
export function deleteShare(uuid) {
    return relay("shareDelete", { uuid });
}

/** Start a new archive and make it current (GMs). */
export function newArchive(name) {
    if (!game.user.isGM) return null;
    return relay("shareNewArchive", { name });
}

/** Make an archive current (GMs). */
export function setCurrentArchive(id) {
    if (game.user.isGM) return game.settings.set(MODULE_ID, CURRENT, id);
    return null;
}

/** Re-render share windows when archives change. */
function refreshWindows() {
    for (const id of ["azecraft-share-image", "azecraft-share-text"]) foundry.applications.instances.get(id)?.render();
}

export function initShareArchive() {
    game.settings.register(MODULE_ID, CURRENT, { scope: "world", config: false, type: String, default: "", onChange: refreshWindows });
    Hooks.once("ready", () => {
        game.socket.on(SOCKET, message => {
            if (!["shareStore", "shareDelete", "shareNewArchive"].includes(message?.type) || !isActiveGM()) return;
            Promise.resolve(handle(message)).catch(error => console.warn("Azecraft | Share archive", error));
        });
    });
    const onPage = page => {
        if (page.parent?.getFlag(MODULE_ID, ARCHIVE_FLAG)) refreshWindows();
    };
    for (const hook of ["createJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntryPage"]) Hooks.on(hook, onPage);
    for (const hook of ["createJournalEntry", "deleteJournalEntry"]) Hooks.on(hook, refreshWindows);
}
