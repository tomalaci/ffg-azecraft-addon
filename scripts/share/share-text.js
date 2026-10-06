/**
 * Share Text (toolbar tab, everyone): write formatted text, or drop a journal page on the window, and
 * show it to everyone online or to chosen people. Recipients get a read-only window with the text.
 * Like Share Image it travels over the module socket; unless "Keep" is unticked it is also kept in
 * the current share archive (share-archive.js), browsable from the window.
 */

import { isFor, recipients, shareTitle, shareToLabel } from "./share-core.js";
import { keepShare } from "./share-archive.js";
import { hasSecrets, stripSecrets } from "./secrets.js";
import { ARCHIVE_PARTIAL, archiveContext, archivedItem, bindArchiveBrowse, onDeleteArchived, onNewArchive, onSetCurrentArchive } from "./archive-ui.js";

const MODULE_ID = "ffg-azecraft-addon";
const SOCKET = `module.${MODULE_ID}`;
const TEMPLATE = `modules/${MODULE_ID}/templates/share/share-text.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** A read-only window with shared text. */
class SharedTextViewer extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
        classes: ["azecraft-shared-text"],
        window: { icon: "fa-solid fa-file-lines", resizable: true },
        position: { width: 520, height: "auto" }
    };

    constructor({ title, html }) {
        super({ id: `azecraft-shared-text-${foundry.utils.randomID()}`, window: { title } });
        this.html = html;
    }

    async _renderHTML() {
        const div = document.createElement("div");
        div.className = "azst-view journal-page-content";
        // Text from another user: drop scripts and event handlers before showing it.
        const clean = foundry.utils.cleanHTML(String(this.html ?? ""));
        div.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(clean, { secrets: false });
        return div;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }
}

function showText({ title, html }) {
    new SharedTextViewer({ title, html }).render({ force: true });
}

export class ShareTextApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-share-text",
        classes: ["azecraft-share-text"],
        window: { title: "Share Text", icon: "fa-solid fa-file-lines", resizable: true },
        position: { width: 560, height: 720 },
        actions: {
            share: ShareTextApp.#onShare,
            openArchived: ShareTextApp.#onOpenArchived,
            reshow: ShareTextApp.#onReshow,
            reshare: ShareTextApp.#onReshare,
            deleteArchived: (event, target) => onDeleteArchived(target),
            newArchive: function () { return onNewArchive(this); },
            setCurrentArchive: function () { return onSetCurrentArchive(this); }
        }
    };

    static PARTS = { body: { template: TEMPLATE, scrollable: [".azst-scroll"] } };

    /** The title of the text being shared (not `title`: that is the window's). */
    heading = "";
    html = "";
    everyone = true;
    chosen = new Set();
    keep = true;
    browseId = null;
    /** Set when the text was replaced from code (dropped page, archive): do not read the old editor. */
    #replaced = false;

    async _prepareContext() {
        const users = game.users.filter(user => user.active && user.id !== game.user.id)
            .map(user => ({ id: user.id, name: user.name, color: user.color?.css ?? user.color, isGM: user.isGM, chosen: this.everyone || this.chosen.has(user.id) }));
        return {
            heading: this.heading,
            everyone: this.everyone,
            users,
            keep: this.keep,
            archive: archiveContext(this.browseId, "text", shareToLabel(this.everyone, this.chosen.size))
        };
    }

    /** Keep what is typed in the editor across re-renders. */
    _preRender(context, options) {
        if (this.#replaced) this.#replaced = false;
        else this.#readEditor();
        return super._preRender(context, options);
    }

    /** Replace the title and text from code (a dropped page, an archived share). */
    #replace(title, html) {
        this.heading = title;
        this.html = html;
        this.#replaced = true;
        this.render({ force: true });
    }

    #readEditor() {
        const editor = this.element?.querySelector("prose-mirror");
        if (editor) this.html = editor.value ?? this.html;
        const title = this.element?.querySelector("[data-azst-title]");
        if (title) this.heading = title.value;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const root = this.element;
        const slot = root.querySelector("[data-azst-editor]");
        const editor = foundry.applications.elements.HTMLProseMirrorElement.create({ name: "content", value: this.html, toggled: false });
        slot.replaceChildren(editor);
        root.querySelector("[data-azst-title]").addEventListener("input", event => {
            this.heading = event.target.value;
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
        // Drop a journal page (or a journal entry: its first text page) to share its text.
        const drop = root.querySelector("[data-azst-drop]");
        drop.addEventListener("dragover", event => {
            event.preventDefault();
            drop.classList.add("azst-drop--over");
        });
        drop.addEventListener("dragleave", () => drop.classList.remove("azst-drop--over"));
        drop.addEventListener("drop", event => {
            event.preventDefault();
            drop.classList.remove("azst-drop--over");
            this.#dropPage(event);
        });
    }

    async #dropPage(event) {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        let page = data?.uuid ? await fromUuid(data.uuid) : null;
        if (page?.documentName === "JournalEntry") page = page.pages.contents.find(entry => entry.type === "text") ?? null;
        if (page?.documentName !== "JournalEntryPage" || page.type !== "text") {
            ui.notifications.warn("Drop a journal text page (or a journal entry) here.");
            return;
        }
        const html = page.text?.content ?? "";
        // Unrevealed GM secrets of the page are never shared (nor kept in the archive players can read).
        if (hasSecrets(html)) ui.notifications.info("The page's secret sections were left out; reveal them in the journal first to share them.");
        this.#replace(page.name, stripSecrets(html));
    }

    static #onShare() {
        this.#readEditor();
        const html = String(this.html ?? "").trim();
        if (!html || html === "<p></p>") return ui.notifications.warn("Write something or drop a journal page first.");
        this.#send(this.heading.trim(), html);
    }

    /** Send text to the Show-to choice and keep it (unless unticked). */
    #send(name, rawHtml) {
        const html = stripSecrets(rawHtml);
        const to = recipients(this.everyone, [...this.chosen], game.user.id);
        if (Array.isArray(to) && !to.length) return ui.notifications.warn("Choose who should see the text.");
        game.socket.emit(SOCKET, { type: "shareText", from: game.user.id, to, heading: name, title: shareTitle(game.user.name, name), html });
        if (this.keep) keepShare({ kind: "text", title: name || "Text", html });
        ui.notifications.info(`Text shown to ${to === null ? "everyone online" : `${to.length} player(s)`}.`);
    }

    static #onReshare(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (item) this.#send(item.title.replace(/ — [^—]+$/, ""), item.html);
    }

    static #onOpenArchived(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (item) showText({ title: `${item.title} (${item.when})`, html: item.html });
    }

    static #onReshow(event, target) {
        const item = archivedItem(target.dataset.uuid);
        if (!item) return;
        this.#replace(item.title.replace(/ — [^—]+$/, ""), item.html);
    }

    static toggle() {
        const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
        if (existing) return existing.close();
        return new this().render({ force: true });
    }
}

export function initShareText() {
    Hooks.once("setup", () => foundry.applications.handlebars.loadTemplates([TEMPLATE, ARCHIVE_PARTIAL]));
    Hooks.once("ready", () => {
        // The sender is who Foundry says sent the message (its title is rebuilt with their real name).
        game.socket.on(SOCKET, (message, senderId) => {
            const sender = game.users.get(senderId);
            if (message?.type !== "shareText" || !sender || !isFor({ ...message, from: senderId }, game.user.id) || typeof message.html !== "string") return;
            showText({ title: shareTitle(sender.name, String(message.heading ?? "")), html: message.html });
        });
    });
    Hooks.on("userConnected", () => foundry.applications.instances.get(ShareTextApp.DEFAULT_OPTIONS.id)?.render());
}
