/**
 * Quick image sharing (toolbar tab, everyone): drop, paste or link an image and show it to everyone
 * online or to chosen people, like Foundry's "Show to players" but without uploading anything. The
 * image is shrunk to a WebP in the browser (see share-core.js) and sent over the module socket inside
 * the message; recipients see it in Foundry's image viewer. Unless "Keep" is unticked, the image is
 * also kept in the current share archive (share-archive.js), browsable from the window; a strip of
 * this page's images ("Recent (until you reload)") reopens recent ones until a reload.
 */

import { MAX_BYTES, QUALITY, dataUrlBytes, imageLink, isFor, recipients, scaled, shareTitle, shareToLabel, sideSteps } from "./share-core.js";
import { keepShare } from "./share-archive.js";
import { ARCHIVE_PARTIAL, archiveContext, archivedItem, bindArchiveBrowse, onDeleteArchived, onNewArchive, onSetCurrentArchive } from "./archive-ui.js";

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const TEMPLATE = `modules/${MODULE_ID}/templates/share/share-image.hbs`;
const RECENT_MAX = 12;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Images shared or received since this page loaded (sent and received), newest first. */
const recent = [];

function remember(entry) {
    const index = recent.findIndex(other => other.src === entry.src);
    if (index >= 0) recent.splice(index, 1);
    recent.unshift(entry);
    recent.length = Math.min(recent.length, RECENT_MAX);
    foundry.applications.instances.get(ShareImageApp.DEFAULT_OPTIONS.id)?.render();
}

function show({ src, title, caption }) {
    new foundry.applications.apps.ImagePopout({ src, caption: caption ?? "", window: { title } }).render({ force: true });
}

function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/** Shrink an image file to a WebP data URL that fits the message size limit. */
async function encode(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        for (const side of sideSteps(Math.max(bitmap.width, bitmap.height))) {
            const size = scaled(bitmap.width, bitmap.height, side);
            const canvas = new OffscreenCanvas(size.width, size.height);
            const context = canvas.getContext("2d");
            context.imageSmoothingQuality = "high";
            context.drawImage(bitmap, 0, 0, size.width, size.height);
            const webp = await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
            const src = await readAsDataUrl(webp);
            if (dataUrlBytes(src) <= MAX_BYTES) return { src, width: size.width, height: size.height, bytes: dataUrlBytes(src) };
        }
    } finally {
        bitmap.close();
    }
    throw new Error("The image is too large to share even when shrunk; try a smaller one.");
}

export class ShareImageApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-share-image",
        classes: ["azecraft-share-image"],
        window: { title: "Share Image", icon: "fa-solid fa-share-from-square" },
        position: { width: 440 },
        actions: {
            share: ShareImageApp.#onShare,
            reopen: ShareImageApp.#onReopen,
            openArchived: ShareImageApp.#onOpenArchived,
            reshow: ShareImageApp.#onReshow,
            reshare: ShareImageApp.#onReshare,
            deleteArchived: (event, target) => onDeleteArchived(target),
            newArchive: function () { return onNewArchive(this); },
            setCurrentArchive: function () { return onSetCurrentArchive(this); }
        }
    };

    static PARTS = {
        body: { template: TEMPLATE }
    };

    /** {src, label} of the image ready to share (an encoded file or a link). */
    pending = null;
    link = "";
    caption = "";
    everyone = true;
    chosen = new Set();
    busy = "";
    keep = true;
    /** The archive shown in the window (null: the current one). */
    browseId = null;
    #onPaste = event => this.#paste(event);

    async _prepareContext() {
        const users = game.users.filter(user => user.active && user.id !== game.user.id)
            .map(user => ({ id: user.id, name: user.name, color: user.color?.css ?? user.color, isGM: user.isGM, chosen: this.everyone || this.chosen.has(user.id) }));
        return {
            pending: this.pending,
            link: this.link,
            caption: this.caption,
            everyone: this.everyone,
            users,
            busy: this.busy,
            canShare: Boolean(this.pending) && !this.busy && (this.everyone || this.chosen.size > 0),
            recent: recent.map(entry => ({ src: entry.src, title: entry.title })),
            keep: this.keep,
            archive: archiveContext(this.browseId, "image", shareToLabel(this.everyone, this.chosen.size))
        };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        document.addEventListener("paste", this.#onPaste);
    }

    _onClose(options) {
        document.removeEventListener("paste", this.#onPaste);
        super._onClose(options);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        const drop = root.querySelector("[data-azsh-drop]");
        const file = root.querySelector("[data-azsh-file]");
        drop.addEventListener("click", () => file.click());
        drop.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") file.click();
        });
        file.addEventListener("change", () => file.files?.[0] && this.#useFile(file.files[0]));
        drop.addEventListener("dragover", event => {
            event.preventDefault();
            drop.classList.add("azsh-drop--over");
        });
        drop.addEventListener("dragleave", () => drop.classList.remove("azsh-drop--over"));
        drop.addEventListener("drop", event => {
            event.preventDefault();
            drop.classList.remove("azsh-drop--over");
            const image = [...(event.dataTransfer?.files ?? [])].find(f => f.type.startsWith("image/"));
            if (image) return this.#useFile(image);
            const text = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain");
            this.#useLink(text);
        });
        root.querySelector("[data-azsh-link]").addEventListener("change", event => this.#useLink(event.target.value, { quiet: !event.target.value }));
        root.querySelector("[data-azsh-caption]").addEventListener("input", event => {
            this.caption = event.target.value;
        });
        root.querySelector("[data-azsh-keep]")?.addEventListener("change", event => {
            this.keep = event.target.checked;
        });
        bindArchiveBrowse(this, root);
        root.querySelector("[data-azsh-everyone]").addEventListener("change", event => {
            this.everyone = event.target.checked;
            this.render();
        });
        for (const box of root.querySelectorAll("[data-azsh-user]")) {
            box.addEventListener("change", () => {
                if (box.checked) this.chosen.add(box.dataset.azshUser);
                else this.chosen.delete(box.dataset.azshUser);
                this.render();
            });
        }
    }

    /** Ctrl+V while the window is open: an image from the clipboard, or a link. */
    #paste(event) {
        if (event.target?.closest?.("input, textarea, [contenteditable]") && !event.clipboardData?.files?.length) return;
        const image = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith("image/"));
        if (image) {
            event.preventDefault();
            this.#useFile(image);
            return;
        }
        const link = imageLink(event.clipboardData?.getData("text/plain"));
        if (link) {
            event.preventDefault();
            this.#useLink(link);
        }
    }

    async #useFile(file) {
        this.busy = "Preparing the image…";
        await this.render();
        try {
            const encoded = await encode(file);
            this.pending = { src: encoded.src, label: `${encoded.width}×${encoded.height}, ${Math.round(encoded.bytes / 1024)} KB` };
            this.link = "";
        } catch (error) {
            ui.notifications.error(error.message || "That file could not be read as an image.");
        } finally {
            this.busy = "";
            this.render();
        }
    }

    #useLink(text, { quiet = false } = {}) {
        const link = imageLink(text);
        if (!link) {
            if (!quiet) ui.notifications.warn("That is not an image link.");
            return;
        }
        this.link = link;
        this.pending = { src: link, label: "Link" };
        this.render();
    }

    /** Send an image to the Show-to choice and keep it (unless unticked). False if nobody is chosen. */
    #send(src, caption) {
        const to = recipients(this.everyone, [...this.chosen], game.user.id);
        if (Array.isArray(to) && !to.length) {
            ui.notifications.warn("Choose who should see the image.");
            return false;
        }
        const title = shareTitle(game.user.name, caption);
        game.socket.emit(SOCKET, { type: "shareImage", from: game.user.id, to, src, title, caption });
        remember({ src, title, caption });
        if (this.keep) keepShare({ kind: "image", src, caption, title: caption || "Image" });
        const count = to === null ? "everyone online" : `${to.length} player(s)`;
        ui.notifications.info(`Image shown to ${count}.`);
        return true;
    }

    static #onShare() {
        if (!this.pending || !this.#send(this.pending.src, this.caption.trim())) return;
        this.pending = null;
        this.link = "";
        this.caption = "";
        this.render();
    }

    static #onOpenArchived(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (item?.image) show({ src: item.image, title: `${item.title} (${item.when})`, caption: item.caption });
    }

    static #onReshow(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (!item?.image) return;
        this.pending = { src: item.image, label: `From the archive (${item.when})` };
        this.caption = item.caption;
        this.render();
    }

    static #onReshare(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (item?.image) this.#send(item.image, item.caption);
    }

    static #onReopen(event, target) {
        const entry = recent[Number(target.dataset.index)];
        if (entry) show(entry);
    }

    /** Open the window, or close it if it is open (toolbar button). */
    static toggle() {
        const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
        if (existing) return existing.close();
        return new this().render({ force: true });
    }
}

export function initImageShare() {
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([ARCHIVE_PARTIAL]));
    Hooks.once("ready", () => {
        game.socket.on(SOCKET, message => {
            if (message?.type !== "shareImage" || !isFor(message, game.user.id) || typeof message.src !== "string") return;
            const entry = { src: message.src, title: String(message.title ?? "Shared image"), caption: String(message.caption ?? "") };
            remember(entry);
            show(entry);
        });
    });
    // A player joining or leaving changes who can be picked.
    Hooks.on("userConnected", () => foundry.applications.instances.get(ShareImageApp.DEFAULT_OPTIONS.id)?.render());
}
