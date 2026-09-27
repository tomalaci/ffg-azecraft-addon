/**
 * The frameless, viewport-fixed mission dashboard HUD.
 *
 * It renders a view model prepared by the controller; all async resolution happens there so a
 * slow render can never insert another Scene's content. Parts are re-rendered individually.
 */

import { DESIRE_MAX_LENGTH, MISSION_PANELS, MODULE_ID, PLACEHOLDER_ART, SETTINGS, TEMPLATE_ROOT } from "./constants.js";
import { setDefaultLedger } from "./dashboard-state.js";
import { createLedger, createLedgerEntry } from "./ledgers.js";
import { DashboardHelpApp } from "./help-app.js";
import { DEFAULT_COLUMNS, LayoutWatcher, fitSceneToFrame, moveDivider } from "./layout.js";

const ART_PAN_KEY = `${MODULE_ID}.artPan`;
const DRAG_THRESHOLD = 4;

/** Saved art pan positions per Actor, in this browser only: {uuid: {src, x, y}}. */
function readArtPans() {
    try {
        return JSON.parse(localStorage.getItem(ART_PAN_KEY) ?? "{}") ?? {};
    } catch {
        return {};
    }
}

/** Drop saved pans whose image has changed since they were made. */
function forgetStaleArtPans(currentArt) {
    try {
        const pans = readArtPans();
        const stale = Object.keys(pans).filter(uuid => uuid in currentArt && pans[uuid].src !== currentArt[uuid]);
        if (!stale.length) return;
        for (const uuid of stale) delete pans[uuid];
        localStorage.setItem(ART_PAN_KEY, JSON.stringify(pans));
    } catch {
        // Storage unavailable: nothing to clean up.
    }
}

function saveArtPan(uuid, src, x, y) {
    try {
        const pans = readArtPans();
        pans[uuid] = { src, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
        localStorage.setItem(ART_PAN_KEY, JSON.stringify(pans));
    } catch {
        // Storage can be unavailable (private mode); panning still works for this session.
    }
}

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class MissionDashboardApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(controller, options = {}) {
        super(options);
        this.controller = controller;
    }

    /** Desire drafts keyed by Actor UUID: {text, original}. Survive re-renders and remote updates. */
    drafts = new Map();

    /** Cards expanded by this client while in compact mode. */
    expanded = new Set();

    /** @type {LayoutWatcher|null} */
    #layout = null;

    static DEFAULT_OPTIONS = {
        id: "azecraft-mission-dashboard",
        tag: "section",
        classes: ["azd"],
        window: { frame: false, positioned: false },
        actions: {
            openActor: MissionDashboardApp.#onOpenActor,
            openItem: MissionDashboardApp.#onOpenItem,
            editDesire: MissionDashboardApp.#onEditDesire,
            cancelDesire: MissionDashboardApp.#onCancelDesire,
            saveDesire: MissionDashboardApp.#onSaveDesire,
            useLatestDesire: MissionDashboardApp.#onUseLatestDesire,
            editArt: MissionDashboardApp.#onEditArt,
            toggleCard: MissionDashboardApp.#onToggleCard,
            editPage: MissionDashboardApp.#onEditPage,
            configure: MissionDashboardApp.#onConfigure,
            toggleHidden: MissionDashboardApp.#onToggleHidden,
            cycleCompact: MissionDashboardApp.#onCycleCompact,
            toggleMission: MissionDashboardApp.#onToggleMission,
            openCampaign: MissionDashboardApp.#onOpenCampaign,
            pageEntry: MissionDashboardApp.#onPageEntry,
            openHelp: () => DashboardHelpApp.open(),
            fitScene: MissionDashboardApp.#onFitScene,
            newEntry: MissionDashboardApp.#onNewEntry,
            newLedger: MissionDashboardApp.#onNewLedger,
            setDefaultLedger: MissionDashboardApp.#onSetDefaultLedger,
            openLedger: MissionDashboardApp.#onOpenLedger
        }
    };

    static PARTS = {
        // Rendered first so it sits behind the panels.
        frame: { template: `${TEMPLATE_ROOT}/frame.hbs` },
        header: { template: `${TEMPLATE_ROOT}/header.hbs` },
        rail: { template: `${TEMPLATE_ROOT}/rail.hbs`, scrollable: [".azd-rail-cards"] },
        mission: { template: `${TEMPLATE_ROOT}/mission.hbs`, scrollable: [".azd-objective-body", ".azd-summary-body"] },
        intel: { template: `${TEMPLATE_ROOT}/intel.hbs`, scrollable: [".azd-intel-scroll"] },
        // Last, so the resize handles sit above the tabs they separate.
        dividers: { template: `${TEMPLATE_ROOT}/dividers.hbs` }
    };

    /** Column fractions while a divider is being dragged (not yet saved). */
    #dragColumns = null;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    _insertElement(element) {
        // Inside #interface, below the core UI columns (z-index 30) but above the canvas.
        const existing = document.getElementById(element.id);
        if (existing) existing.replaceWith(element);
        else document.getElementById("interface").prepend(element);
    }

    async _prepareContext() {
        const view = this.controller.view;
        const prefs = this.controller.preferences();
        // Invalidate pans made for a previous image, then read what is left.
        forgetStaleArtPans(Object.fromEntries((view?.cards ?? []).filter(c => c.uuid && c.art).map(c => [c.uuid, c.art])));
        const pans = readArtPans();
        const cards = (view?.cards ?? []).map(card => {
            const draft = card.uuid ? this.drafts.get(card.uuid) : null;
            // A saved pan only applies to the image it was made for.
            const pan = card.uuid ? pans[card.uuid] : null;
            const artPosition = pan && pan.src === card.art ? `${pan.x}% ${pan.y}%` : "50% 0%";

            return {
                ...card,
                expanded: this.expanded.has(card.slotId),
                artPosition,
                editing: Boolean(draft),
                draft: draft?.text ?? "",
                draftConflict: Boolean(draft) && !draft.saving && draft.original !== card.desire,
                desireMaxLength: DESIRE_MAX_LENGTH
            };
        });

        return {
            ...view,
            cards,
            visibleCards: cards.filter(card => card.availability !== "empty" || view?.isGM),
            prefs,
            compactLabel: { auto: "Auto", always: "On", never: "Off" }[prefs.compact],
            placeholderArt: PLACEHOLDER_ART
        };
    }

    _preSyncPartState(partId, newElement, priorElement, state) {
        super._preSyncPartState(partId, newElement, priorElement, state);
        const focus = priorElement.querySelector("textarea:focus, input:focus");
        if (focus && "selectionStart" in focus) state.selection = [focus.selectionStart, focus.selectionEnd];
    }

    _syncPartState(partId, newElement, priorElement, state) {
        super._syncPartState(partId, newElement, priorElement, state);
        const focus = state.focus ? newElement.querySelector(state.focus) : null;
        if (focus && state.selection) focus.setSelectionRange(...state.selection);
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);

        // Delegated listeners on the persistent root survive part re-renders.
        // Ledger switcher: a local choice, like paging.
        this.element.addEventListener("change", event => {
            const select = event.target.closest("select[data-ledger-panel]");
            if (select) this.controller.showLedger(select.dataset.ledgerPanel, select.value);
        });

        this.element.addEventListener("input", event => {
            const textarea = event.target.closest("textarea[data-desire-for]");
            if (!textarea) return;
            const draft = this.drafts.get(textarea.dataset.desireFor);
            if (draft) draft.text = textarea.value;
            const counter = textarea.closest(".azd-desire-editor")?.querySelector(".azd-desire-count");
            if (counter) counter.textContent = `${textarea.value.length}/${DESIRE_MAX_LENGTH}`;
        });

        this.element.addEventListener("keydown", event => {
            const textarea = event.target.closest("textarea[data-desire-for]");
            if (!textarea) return;
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.#saveDesire(textarea.dataset.desireFor);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.drafts.delete(textarea.dataset.desireFor);
                this.render({ parts: ["rail"] });
            }
        });

        // Broken art paths fall back to the portrait, then to the placeholder.
        this.element.addEventListener("error", event => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
            const next = img.dataset.fallback;
            img.dataset.fallback = next === PLACEHOLDER_ART ? "" : PLACEHOLDER_ART;
            img.src = next;
            img.classList.add("azd-art--fallback");
        }, true);

        this.#layout = new LayoutWatcher(this.element, () => this.#layoutOptions());

        this.element.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            const divider = event.target.closest("[data-divider]");
            if (divider) return this.#dragDivider(event, divider);
            const art = event.target.closest(".azd-card-art img");
            if (art) return this.#panArt(event, art);
        });

        this.element.addEventListener("dblclick", event => {
            if (event.target.closest("[data-divider]")) game.settings.set(MODULE_ID, SETTINGS.columns, DEFAULT_COLUMNS);
        });
        this.#layout.start();
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.applyPreferences();
    }

    applyPreferences() {
        const prefs = this.controller.preferences();
        this.element.classList.toggle("azd--hidden", prefs.hidden);
        this.element.classList.toggle("azd--mission-collapsed", prefs.missionCollapsed);
        this.element.classList.toggle("azd--framed", prefs.style !== "floating");
        this.#layout?.apply();
    }

    _onClose(options) {
        this.#layout?.stop();
        this.#layout = null;
        super._onClose(options);
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static #resolve(uuid) {
        try {
            return uuid ? foundry.utils.fromUuidSync(uuid, { strict: false }) : null;
        } catch {
            return null;
        }
    }

    static #onOpenActor(event, target) {
        const actor = MissionDashboardApp.#resolve(target.closest("[data-uuid]")?.dataset.uuid);
        if (!actor?.testUserPermission(game.user, "LIMITED")) return;
        actor.sheet?.render(true);
    }

    static #onOpenItem(event, target) {
        const item = MissionDashboardApp.#resolve(target.dataset.itemUuid);
        if (!item?.testUserPermission(game.user, "LIMITED")) return;
        item.sheet?.render(true);
    }

    static #onToggleCard(event, target) {
        const slotId = target.closest("[data-slot-id]")?.dataset.slotId;
        if (!slotId) return;
        if (this.expanded.has(slotId)) this.expanded.delete(slotId);
        else this.expanded.add(slotId);
        this.render({ parts: ["rail"] });
    }

    static #onEditDesire(event, target) {
        const uuid = target.closest("[data-uuid]")?.dataset.uuid;
        const card = this.controller.view?.cards.find(c => c.uuid === uuid);
        if (!card?.canEditDesire) return;
        this.drafts.set(uuid, { text: card.desire, original: card.desire });
        this.expanded.add(card.slotId);
        this.render({ parts: ["rail"] }).then(() => {
            const textarea = this.element.querySelector(`textarea[data-desire-for="${CSS.escape(uuid)}"]`);
            textarea?.focus();
            textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
        });
    }

    static #onCancelDesire(event, target) {
        this.drafts.delete(target.closest("[data-uuid]")?.dataset.uuid);
        this.render({ parts: ["rail"] });
    }

    static #onUseLatestDesire(event, target) {
        const uuid = target.closest("[data-uuid]")?.dataset.uuid;
        const card = this.controller.view?.cards.find(c => c.uuid === uuid);
        if (!card) return;
        this.drafts.set(uuid, { text: card.desire, original: card.desire });
        this.render({ parts: ["rail"] });
    }

    static #onSaveDesire(event, target) {
        return this.#saveDesire(target.closest("[data-uuid]")?.dataset.uuid);
    }

    async #saveDesire(uuid) {
        const draft = this.drafts.get(uuid);
        const actor = MissionDashboardApp.#resolve(uuid);
        if (!draft || !actor) return;

        // UI visibility is not authorization: check again at the write boundary.
        if (!actor.canUserModify(game.user, "update")) {
            ui.notifications.error("You don't have permission to edit this character's Desire.");
            return;
        }

        const text = draft.text.trim().slice(0, DESIRE_MAX_LENGTH);

        draft.saving = true;

        try {
            await actor.setFlag(MODULE_ID, "dashboard.desire", text);

            // Keep typing that happened while the save was in flight; it is now based on the saved text.
            draft.saving = false;
            if (draft.text.trim().slice(0, DESIRE_MAX_LENGTH) === text) this.drafts.delete(uuid);
            else draft.original = text;
            this.render({ parts: ["rail"] });
        } catch (error) {
            draft.saving = false;
            console.error("Azecraft | Could not save Desire", error);
            ui.notifications.error("Could not save the Desire. Your draft is kept.");
        }
    }

    static async #onEditArt(event, target) {
        const actor = MissionDashboardApp.#resolve(target.closest("[data-uuid]")?.dataset.uuid);
        if (!actor?.canUserModify(game.user, "update")) {
            ui.notifications.error("You don't have permission to change this character's art.");
            return;
        }

        const current = actor.getFlag(MODULE_ID, "dashboard.fullArt") ?? "";
        const canBrowse = game.user.can("FILES_BROWSE");
        const escape = foundry.utils.escapeHTML;
        const content = `
            <p>Full-body art shown on the dashboard card. Leave empty to use the Actor portrait.</p>
            <div class="form-group">
                <label>Image path</label>
                <div class="form-fields">
                    <input type="text" name="path" value="${escape(current)}" placeholder="${escape(actor.img ?? "")}">
                    ${canBrowse ? '<button type="button" class="icon fa-solid fa-file-import" data-azd-browse data-tooltip="Browse"></button>' : ""}
                </div>
            </div>`;

        const result = await DialogV2.input({
            window: { title: `Dashboard art: ${actor.name}` },
            content,
            ok: { label: "Save", icon: "fa-solid fa-save" },
            render: (_event, dialog) => {
                dialog.element.querySelector("[data-azd-browse]")?.addEventListener("click", () => {
                    const input = dialog.element.querySelector("input[name=path]");
                    new foundry.applications.apps.FilePicker.implementation({
                        type: "image",
                        current: input.value || actor.img,
                        callback: path => { input.value = path; }
                    }).render(true);
                });
            }
        });

        if (!result) return;

        const path = String(result.path ?? "").trim();

        if (path && (path.length > 500 || /^\s*(javascript|data):/i.test(path))) {
            ui.notifications.error("That image path is not allowed.");
            return;
        }

        if (path) await actor.setFlag(MODULE_ID, "dashboard.fullArt", path);
        else await actor.unsetFlag(MODULE_ID, "dashboard.fullArt");
    }

    static #onEditPage(event, target) {
        const page = MissionDashboardApp.#resolve(target.dataset.pageUuid);
        if (!page?.canUserModify(game.user, "update")) return;
        page.sheet.render(true);
    }

    static #onPageEntry(event, target) {
        this.controller.showEntry(target.dataset.panel, Number(target.dataset.step));
    }

    #panelView(key) {
        const view = this.controller.view;
        return key === "intel" ? view?.intel : view?.mission?.[key];
    }

    /** Add the next entry to the ledger being viewed; it becomes the newest (default) entry. */
    static async #onNewEntry(event, target) {
        if (!game.user.isGM) return;
        const panel = MISSION_PANELS.find(p => p.key === target.dataset.panel);
        const view = this.#panelView(panel?.key);
        if (!panel) return;
        if (!view?.ledgerUuid) return MissionDashboardApp.#onNewLedger.call(this, event, target);

        const confirmed = await DialogV2.confirm({
            window: { title: `New ${panel.label.toLowerCase()} entry` },
            content: `<p>Add a new entry to <strong>${foundry.utils.escapeHTML(view.ledgerName)}</strong>? It becomes the newest entry, which everyone sees by default.</p><p class="hint">Earlier entries stay available with ‹ ›.</p>`
        });
        if (!confirmed) return;

        try {
            const page = await createLedgerEntry(view.ledgerUuid);
            this.controller.showLedger(panel.key, view.ledgerUuid);
            page.sheet.render(true);
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }

    /** Create a ledger for a tab in the module's Journal folder, optionally as this Scene's default. */
    static async #onNewLedger(event, target) {
        if (!game.user.isGM) return;
        const panel = MISSION_PANELS.find(p => p.key === target.dataset.panel);
        const scene = game.scenes.viewed;
        if (!panel || !scene) return;

        const source = this.controller.view?.source === "scene" ? `${scene.name}'s own dashboard` : "the campaign dashboard";
        const escape = foundry.utils.escapeHTML;
        const result = await DialogV2.input({
            window: { title: `New ${panel.folderName.toLowerCase()} ledger` },
            content: `<div class="form-group"><label>Name</label><div class="form-fields"><input type="text" name="name" maxlength="120" placeholder="e.g. Operation Glass Horizon" required autofocus></div></div>
                <div class="form-group"><label>Players can read it</label><div class="form-fields"><input type="checkbox" name="playersCanRead" checked></div>
                <p class="hint">Untick to prepare it privately; change the Journal's ownership later to reveal it.</p></div>
                <div class="form-group"><label>Make it the default</label><div class="form-fields"><input type="checkbox" name="makeDefault" checked></div>
                <p class="hint">Default ${escape(panel.label.toLowerCase())} ledger for ${escape(source)}.</p></div>
                <p class="hint">Stored in the “Mission Dashboard › ${escape(panel.folderName)}” Journal folder.</p>`,
            ok: { label: "Create", icon: "fa-solid fa-book-medical" }
        });
        if (!result?.name?.trim()) return;

        try {
            const ledger = await createLedger(panel.key, result.name, { playersCanRead: Boolean(result.playersCanRead) });
            if (result.makeDefault) await setDefaultLedger(scene, panel.key, ledger.uuid);
            this.controller.showLedger(panel.key, ledger.uuid);
            ledger.pages.contents[0]?.sheet.render(true);
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }

    static async #onSetDefaultLedger(event, target) {
        if (!game.user.isGM) return;
        const view = this.#panelView(target.dataset.panel);
        const scene = game.scenes.viewed;
        if (!view?.ledgerUuid || !scene) return;

        try {
            await setDefaultLedger(scene, target.dataset.panel, view.ledgerUuid);
            ui.notifications.info(`“${view.ledgerName}” is now the default ledger.`);
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }

    static #onOpenLedger(event, target) {
        const view = this.#panelView(target.dataset.panel);
        const ledger = view?.ledgerUuid ? foundry.utils.fromUuidSync(view.ledgerUuid, { strict: false }) : null;
        if (ledger?.testUserPermission(game.user, "OBSERVER")) ledger.sheet.render(true);
    }

    static #onFitScene() {
        return fitSceneToFrame(this.#layoutOptions());
    }

    #layoutOptions() {
        const prefs = this.controller.preferences();
        return {
            compactPreference: prefs.compact,
            missionCollapsed: prefs.missionCollapsed,
            framed: prefs.style !== "floating",
            columns: this.#dragColumns ?? prefs.columns
        };
    }

    /* -------------------------------------------- */
    /*  Pointer interactions                        */
    /* -------------------------------------------- */

    /** Resize two neighbouring mission tabs; saved to this browser when released. */
    #dragDivider(event, divider) {
        const bar = this.#layout?.last?.bar;
        if (!bar?.width) return;

        event.preventDefault();
        const index = Number(divider.dataset.divider);
        const start = this.controller.preferences().columns;
        divider.setPointerCapture(event.pointerId);
        divider.classList.add("azd-divider--active");

        const move = moveEvent => {
            this.#dragColumns = moveDivider(start, index, moveEvent.clientX - bar.left, bar.width);
            this.#layout.apply();
        };
        const end = () => {
            divider.removeEventListener("pointermove", move);
            divider.classList.remove("azd-divider--active");
            const columns = this.#dragColumns;
            if (columns) game.settings.set(MODULE_ID, SETTINGS.columns, columns).finally(() => { this.#dragColumns = null; });
        };

        divider.addEventListener("pointermove", move);
        divider.addEventListener("pointerup", end, { once: true });
        divider.addEventListener("pointercancel", end, { once: true });
    }

    /**
     * Drag card art to pan it inside its fixed box; a click without dragging opens the sheet.
     * The position is saved in this browser per Actor, together with the image it applies to.
     */
    #panArt(event, img) {
        event.preventDefault();
        const uuid = img.closest("[data-uuid]")?.dataset.uuid;
        const [x0, y0] = getComputedStyle(img).objectPosition.split(" ").map(v => Number.parseFloat(v) || 0);
        const scale = Math.max(img.clientWidth / (img.naturalWidth || 1), img.clientHeight / (img.naturalHeight || 1));
        const overflowX = Math.max(0, (img.naturalWidth * scale) - img.clientWidth);
        const overflowY = Math.max(0, (img.naturalHeight * scale) - img.clientHeight);
        const startX = event.clientX;
        const startY = event.clientY;
        let panning = false;
        let position = [x0, y0];

        img.setPointerCapture(event.pointerId);

        const move = moveEvent => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (!panning && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            panning = true;
            img.classList.add("azd-art--panning");
            // Dragging the image right reveals its left side, i.e. a smaller percentage.
            const clamp = v => Math.min(100, Math.max(0, v));
            position = [
                overflowX ? clamp(x0 - (dx / overflowX) * 100) : x0,
                overflowY ? clamp(y0 - (dy / overflowY) * 100) : y0
            ];
            img.style.objectPosition = `${position[0]}% ${position[1]}%`;
        };
        const end = () => {
            img.removeEventListener("pointermove", move);
            img.classList.remove("azd-art--panning");
            if (panning) {
                if (uuid) saveArtPan(uuid, img.dataset.artSrc, ...position);
            } else {
                const actor = uuid ? foundry.utils.fromUuidSync(uuid, { strict: false }) : null;
                if (actor?.testUserPermission(game.user, "LIMITED")) actor.sheet?.render(true);
            }
        };

        img.addEventListener("pointermove", move);
        img.addEventListener("pointerup", end, { once: true });
        img.addEventListener("pointercancel", end, { once: true });
    }

    /** Fit the Scene into the frame on this client (used when a Scene opens with "fit on open"). */
    fitScene() {
        return fitSceneToFrame(this.#layoutOptions());
    }

    static #onConfigure() {
        if (!game.user.isGM) return;
        this.controller.openConfig();
    }

    static async #onToggleHidden() {
        await game.settings.set(MODULE_ID, SETTINGS.hidden, !this.controller.preferences().hidden);
    }

    static async #onCycleCompact() {
        const order = ["auto", "always", "never"];
        const current = this.controller.preferences().compact;
        await game.settings.set(MODULE_ID, SETTINGS.compact, order[(order.indexOf(current) + 1) % order.length]);
    }

    static async #onToggleMission() {
        await game.settings.set(MODULE_ID, SETTINGS.missionCollapsed, !this.controller.preferences().missionCollapsed);
    }

    static #onOpenCampaign() {
        this.controller.openCampaign();
    }
}
