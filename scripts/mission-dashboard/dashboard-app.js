/**
 * The frameless, viewport-fixed mission dashboard HUD.
 *
 * It renders a view model prepared by the controller; all async resolution happens there so a
 * slow render can never insert another Scene's content. Parts are re-rendered individually.
 */

import { DESIRE_MAX_LENGTH, MISSION_PANELS, MODULE_ID, PLACEHOLDER_ART, SETTINGS, TEMPLATE_ROOT } from "./constants.js";
import { displaySrc } from "../thumbnails/thumbnails.js";
import { setActiveSquad, setSquadDefaultLedger } from "./squads.js";
import { htmlToText, textToHtml } from "./actor-adapter.js";
import { createLedger, createLedgerEntry } from "./ledgers.js";
import { DashboardHelpApp } from "./help-app.js";
import { DEFAULT_COLUMNS, LayoutWatcher, fitSceneToFrame, moveDivider } from "./layout.js";
import { artOverflow, artViewStyle, normalizeArtView, panArtView, zoomArtView, DEFAULT_ART_VIEW } from "./art-view.js";
import { describeCondition, squadGroups } from "../effects/effect-core.js";
import { EffectPickerApp, readConditions, runConditionOp, runEffectOp } from "../effects/quick-effects.js";

const ART_VIEW_KEY = `${MODULE_ID}.artView`;
const DRAG_THRESHOLD = 4;
/** How long a portrait click waits for a second click before showing the art instead of the sheet. */
const DOUBLE_CLICK_DELAY = 250;
const ZOOM_BUTTON_STEP = 0.25;
const ZOOM_WHEEL_STEP = 0.1;
/** Rows of squad effect chips before the rest go into the "N+ Effects" menu. */
const SQUAD_ROWS = 3;

// Pan-only positions from an earlier build were made without zoom; drop them once.
try {
    localStorage.removeItem(`${MODULE_ID}.artPan`);
} catch {
    // Storage unavailable.
}

/** Saved art views per Actor, in this browser only: {uuid: {src, x, y, z}}. */
function readArtViews() {
    try {
        return JSON.parse(localStorage.getItem(ART_VIEW_KEY) ?? "{}") ?? {};
    } catch {
        return {};
    }
}

/** Drop saved views whose image has changed since they were made. */
function forgetStaleArtViews(currentArt) {
    try {
        const views = readArtViews();
        const stale = Object.keys(views).filter(uuid => uuid in currentArt && views[uuid].src !== currentArt[uuid]);
        if (!stale.length) return;
        for (const uuid of stale) delete views[uuid];
        localStorage.setItem(ART_VIEW_KEY, JSON.stringify(views));
    } catch {
        // Storage unavailable: nothing to clean up.
    }
}

function saveArtView(uuid, src, view) {
    try {
        const views = readArtViews();
        views[uuid] = { src, ...normalizeArtView(view) };
        localStorage.setItem(ART_VIEW_KEY, JSON.stringify(views));
    } catch {
        // Storage can be unavailable (private mode); the view still applies for this session.
    }
}

/** The view currently applied to an art image (from its CSS variables). */
function currentArtView(img) {
    const read = name => Number.parseFloat(img.style.getPropertyValue(name));
    return normalizeArtView({ x: read("--azd-art-x"), y: read("--azd-art-y"), z: read("--azd-art-z") });
}

function applyArtView(img, view) {
    img.setAttribute("style", artViewStyle(view));
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
            endConcentration: MissionDashboardApp.#onEndConcentration,
            toggleCard: MissionDashboardApp.#onToggleCard,
            editPage: MissionDashboardApp.#onEditPage,
            configure: MissionDashboardApp.#onConfigure,
            cycleCompact: MissionDashboardApp.#onCycleCompact,
            toggleMission: MissionDashboardApp.#onToggleMission,
            openTracker: MissionDashboardApp.#onOpenTracker,
            pageEntry: MissionDashboardApp.#onPageEntry,
            openHelp: () => DashboardHelpApp.open(),
            fitScene: MissionDashboardApp.#onFitScene,
            artZoom: MissionDashboardApp.#onArtZoom,
            newEntry: MissionDashboardApp.#onNewEntry,
            newLedger: MissionDashboardApp.#onNewLedger,
            setDefaultLedger: MissionDashboardApp.#onSetDefaultLedger,
            openLedger: MissionDashboardApp.#onOpenLedger,
            addEffect: MissionDashboardApp.#onAddEffect,
            removeEffect: MissionDashboardApp.#onRemoveEffect,
            addSquadEffect: MissionDashboardApp.#onAddSquadEffect,
            removeSquadEffect: MissionDashboardApp.#onRemoveSquadEffect,
            addCondition: MissionDashboardApp.#onAddCondition,
            toggleSquadMore: MissionDashboardApp.#onToggleSquadMore,
            toggleCondition: MissionDashboardApp.#onToggleCondition,
            removeCondition: MissionDashboardApp.#onRemoveCondition
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
        forgetStaleArtViews(Object.fromEntries((view?.cards ?? []).filter(c => c.uuid && c.art).map(c => [c.uuid, c.art])));
        const artViews = readArtViews();
        const cards = (view?.cards ?? []).map(card => {
            const draft = card.uuid ? this.drafts.get(card.uuid) : null;
            // A saved view only applies to the image it was made for.
            const saved = card.uuid ? artViews[card.uuid] : null;
            const artStyle = artViewStyle(saved && saved.src === card.art ? saved : DEFAULT_ART_VIEW);

            return {
                ...card,
                expanded: this.expanded.has(card.slotId),
                artStyle,
                // Show the lightweight copy of large art; the original stays in data-art-src.
                displayArt: card.art ? displaySrc(card.art) : card.art,
                displayPortrait: card.portrait ? displaySrc(card.portrait) : card.portrait,
                editing: Boolean(draft),
                draft: draft?.text ?? "",
                draftConflict: Boolean(draft) && !draft.saving && draft.original !== card.desire,
                desireMaxLength: DESIRE_MAX_LENGTH
            };
        });

        const people = view?.people?.map(person => ({ ...person, displayImg: person.img ? displaySrc(person.img) : person.img }));

        const members = cards.filter(card => card.uuid && card.effects);
        const squadId = view?.squad?.id ?? null;
        const conditions = squadId ? readConditions().filter(c => c.squadId === squadId).map(c => ({
            ...c,
            img: c.img || "icons/svg/aura.svg",
            tooltip: describeCondition(c),
            count: members.filter(card => card.effects.some(chip => chip.condition === c.id)).length
        })) : [];
        return {
            ...view,
            ...(people ? { people } : {}),
            cards,
            squadEffects: {
                show: members.length > 0,
                members: members.length,
                canCondition: Boolean(squadId),
                chips: [...conditions.map(c => ({ ...c, condition: true })), ...squadGroups(members.map(card => card.effects))]
            },
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
        // Ledger switcher (a local choice, like paging) and the GM's active-squad selector.
        this.element.addEventListener("change", event => {
            const select = event.target.closest("select[data-ledger-panel]");
            if (select) return this.controller.showLedger(select.dataset.ledgerPanel, select.value);
            const squadSelect = event.target.closest("select[data-squad-select]");
            if (squadSelect) return this.#changeActiveSquad(squadSelect);
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

        // Portraits: a click shows the art, a double click opens the sheet. (Card art clicks come
        // from #panArt, which tells a click from a pan.)
        this.element.addEventListener("click", event => {
            const img = event.target.closest(".azd-person-img");
            if (img) this.#portraitClick(img);
        });

        // Shift + wheel over card art zooms it; a plain wheel still scrolls the squad column.
        this.element.addEventListener("wheel", event => {
            if (!event.shiftKey) return;
            const img = event.target.closest(".azd-card-art")?.querySelector("img");
            if (!img) return;
            event.preventDefault();
            const delta = event.deltaY || event.deltaX;
            this.#zoomArt(img, delta < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP);
        }, { passive: false });

        this.element.addEventListener("dblclick", event => {
            if (event.target.closest("[data-divider]")) game.settings.set(MODULE_ID, SETTINGS.columns, DEFAULT_COLUMNS);
            const portrait = event.target.closest(".azd-card-art img, .azd-person-img");
            if (portrait) this.#portraitDoubleClick(portrait);
        });

        // Rail fade edges follow the scroll position (scroll events do not bubble: capture them).
        this.element.addEventListener("scroll", event => {
            if (event.target.classList?.contains("azd-rail-cards")) this.#updateRailEdges();
        }, true);
        document.addEventListener("azecraft:layout", this.#onLayout);
        document.addEventListener("pointerdown", this.#onPointerOutside, true);

        this.#layout.start();
    }

    #onLayout = () => {
        this.#updateRailEdges();
        this.#updateSquadChips();
    };

    /** Squad effects menu ("N+ Effects") open: kept across header re-renders. */
    #squadMoreOpen = false;

    /**
     * Fit the squad effect chips into at most SQUAD_ROWS rows: when they need more, the last place
     * goes to an "N+ Effects" button listing the rest. Then the header's height (which places the
     * portrait rail) follows its content.
     */
    #updateSquadChips() {
        const root = this.element;
        const header = root?.querySelector(".azd-header");
        if (!header) return;
        const chips = header.querySelector("[data-squad-chips]");
        if (chips) {
            const items = [...chips.querySelectorAll(":scope > [data-squad-chip]")];
            const more = chips.querySelector("[data-squad-more]");
            const rows = () => new Set([...items, more].filter(el => !el.hidden).map(el => el.offsetTop)).size;
            for (const item of items) item.hidden = false;
            more.hidden = true;
            let shown = items.length;
            if (rows() > SQUAD_ROWS) {
                more.hidden = false;
                const label = more.querySelector("[data-squad-more-label]");
                while (shown > 0) {
                    items[--shown].hidden = true;
                    label.textContent = `${items.length - shown}+ Effects`;
                    if (rows() <= SQUAD_ROWS) break;
                }
            }
            more.querySelectorAll("[data-squad-chip]").forEach((item, index) => { item.hidden = index < shown; });
        }
        root.style.setProperty("--azd-header-height", `${Math.ceil(header.offsetHeight)}px`);
        this.#placeSquadMenu();
    }

    /**
     * The open "N+ Effects" menu: copies of the chips that did not fit, floating on the dashboard
     * root under its button (the header's clipped corners would cut it off inside the header).
     */
    #placeSquadMenu() {
        const root = this.element;
        root.querySelector(":scope > .azd-squad-more-menu")?.remove();
        const more = root.querySelector(".azd-header [data-squad-more]");
        const open = this.#squadMoreOpen && more && !more.hidden;
        more?.querySelector("button").setAttribute("aria-expanded", String(Boolean(open)));
        if (!open) return;
        const menu = document.createElement("div");
        menu.className = "azd-squad-more-menu";
        menu.setAttribute("role", "menu");
        menu.append(...[...more.querySelectorAll("[data-squad-more-menu] [data-squad-chip]:not([hidden])")].map(item => item.cloneNode(true)));
        const button = more.querySelector("button").getBoundingClientRect();
        const base = root.getBoundingClientRect();
        menu.style.left = `${button.left - base.left}px`;
        menu.style.top = `${button.bottom - base.top + 3}px`;
        root.append(menu);
    }

    /** A click outside the "N+ Effects" menu closes it. */
    #onPointerOutside = event => {
        if (!this.#squadMoreOpen || event.target.closest?.("[data-squad-more], .azd-squad-more-menu")) return;
        this.#squadMoreOpen = false;
        this.#updateSquadChips();
    };

    static #onToggleSquadMore() {
        this.#squadMoreOpen = !this.#squadMoreOpen;
        this.#updateSquadChips();
    }

    /** Show the rail's top / bottom fade only where cards are scrolled out of view. */
    #updateRailEdges() {
        const rail = this.element?.querySelector(".azd-rail");
        const cards = rail?.querySelector(".azd-rail-cards");
        if (!cards) return;
        const above = cards.scrollTop > 1;
        const below = cards.scrollTop + cards.clientHeight < cards.scrollHeight - 1;
        rail.toggleAttribute("data-more-above", above);
        rail.toggleAttribute("data-more-below", below);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.applyPreferences();
        this.#updateRailEdges();
        this.#updateSquadChips();
    }

    applyPreferences() {
        const prefs = this.controller.preferences();
        this.element.classList.toggle("azd--hidden", prefs.hidden);
        this.element.classList.toggle("azd--mission-collapsed", prefs.missionCollapsed);
        this.element.classList.toggle("azd--framed", prefs.style !== "floating");
        this.#layout?.apply();
    }

    _onClose(options) {
        document.removeEventListener("azecraft:layout", this.#onLayout);
        document.removeEventListener("pointerdown", this.#onPointerOutside, true);
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

    /** Stop concentrating on a power (the flag the Biotics / Tech tabs set). */
    /** The squad members shown as cards (Actors the user can see). */
    #squadActors() {
        return (this.controller.view?.cards ?? []).filter(card => card.uuid && card.effects)
            .map(card => fromUuidSync(card.uuid)).filter(Boolean);
    }

    static #onAddEffect(event, target) {
        const actor = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid ?? "");
        if (actor) EffectPickerApp.open({ actors: [actor], label: actor.name });
    }

    static async #onRemoveEffect(event, target) {
        const uuid = target.closest("[data-uuid]")?.dataset.uuid;
        if (uuid) await runEffectOp({ kind: "remove", effectId: target.dataset.effectId, actorUuids: [uuid] });
    }

    static #onAddSquadEffect() {
        const actors = this.#squadActors();
        if (actors.length) EffectPickerApp.open({ actors, label: "Squad", squad: true });
    }

    static #onAddCondition() {
        const squad = this.controller.view?.squad;
        const actors = this.#squadActors();
        if (squad && actors.length) EffectPickerApp.open({ actors, label: squad.name, condition: squad.id });
    }

    static async #onToggleCondition(event, target) {
        await runConditionOp({ action: "toggle", id: target.dataset.condition });
    }

    static async #onRemoveCondition(event, target) {
        await runConditionOp({ action: "remove", id: target.dataset.condition });
    }

    static async #onRemoveSquadEffect(event, target) {
        await runEffectOp({ kind: "removeGroup", group: target.dataset.group, actorUuids: this.#squadActors().map(actor => actor.uuid) });
    }

    static async #onEndConcentration(event, target) {
        const actor = MissionDashboardApp.#resolve(target.closest("[data-uuid]")?.dataset.uuid);
        if (!actor?.canUserModify(game.user, "update")) return;
        const current = actor.getFlag(MODULE_ID, "concentration") ?? [];
        await actor.setFlag(MODULE_ID, "concentration", current.filter(id => id !== target.dataset.power));
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

    static async #onEditDesire(event, target) {
        const uuid = target.closest("[data-uuid]")?.dataset.uuid;
        const card = this.controller.view?.cards.find(c => c.uuid === uuid);
        if (!card?.canEditDesire) return;

        // The sheet's Desire is rich text; a plain-text edit here would drop its formatting.
        if (card.desireRich) {
            const choice = await DialogV2.wait({
                window: { title: "Desire has formatting" },
                content: "<p>This Desire uses formatting (bold, links, lists…) from the character sheet. Editing it here saves plain text and removes that formatting.</p>",
                buttons: [
                    { action: "sheet", label: "Edit on the sheet", icon: "fa-solid fa-user", default: true },
                    { action: "plain", label: "Edit here as plain text", icon: "fa-solid fa-pen" }
                ]
            });
            if (choice === "sheet") {
                foundry.utils.fromUuidSync(uuid, { strict: false })?.sheet?.render(true);
                return;
            }
            if (choice !== "plain") return;
        }

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

        // Normalise through the same HTML round-trip the sheet field will go through.
        const normalize = raw => htmlToText(textToHtml(raw.trim().slice(0, DESIRE_MAX_LENGTH)));
        const text = normalize(draft.text);

        draft.saving = true;

        try {
            // The Genesys Desire motivation on the sheet (Basic Information tab) is the one source of truth.
            await actor.update({ "system.motivation.desire": textToHtml(text) });

            // Keep typing that happened while the save was in flight; it is now based on the saved text.
            draft.saving = false;
            if (normalize(draft.text) === text) this.drafts.delete(uuid);
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
            const squad = this.controller.view?.squad;
            if (result.makeDefault && squad) await setSquadDefaultLedger(squad.id, panel.key, ledger.uuid);
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
            const squad = this.controller.view?.squad;
            if (!squad) return;
            await setSquadDefaultLedger(squad.id, target.dataset.panel, view.ledgerUuid);
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
     * Drag card art to pan it inside its fixed box; a click without dragging counts as a portrait click.
     * The position is saved in this browser per Actor, together with the image it applies to.
     */
    #panArt(event, img) {
        event.preventDefault();
        const uuid = img.closest("[data-uuid]")?.dataset.uuid;
        const box = img.parentElement.getBoundingClientRect();
        const start = currentArtView(img);
        const overflow = artOverflow(box, { width: img.naturalWidth, height: img.naturalHeight }, start.z);
        const startX = event.clientX;
        const startY = event.clientY;
        let panning = false;
        let view = start;

        img.setPointerCapture(event.pointerId);

        const move = moveEvent => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (!panning && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            panning = true;
            img.classList.add("azd-art--panning");
            view = panArtView(start, dx, dy, overflow);
            applyArtView(img, view);
        };
        const end = () => {
            img.removeEventListener("pointermove", move);
            img.classList.remove("azd-art--panning");
            if (panning) {
                if (uuid) saveArtView(uuid, img.dataset.artSrc, view);
            } else {
                this.#portraitClick(img);
            }
        };

        img.addEventListener("pointermove", move);
        img.addEventListener("pointerup", end, { once: true });
        img.addEventListener("pointercancel", end, { once: true });
    }

    #portraitClickTimer = null;

    /** A single portrait click shows the art, unless a second click (a double click) follows. */
    #portraitClick(img) {
        clearTimeout(this.#portraitClickTimer);
        this.#portraitClickTimer = setTimeout(() => {
            this.#portraitClickTimer = null;
            this.#showArt(img);
        }, DOUBLE_CLICK_DELAY);
    }

    #portraitDoubleClick(img) {
        clearTimeout(this.#portraitClickTimer);
        this.#portraitClickTimer = null;
        const actor = MissionDashboardApp.#resolve(img.closest("[data-uuid]")?.dataset.uuid);
        if (actor?.testUserPermission(game.user, "LIMITED")) actor.sheet?.render(true);
    }

    /** Show the art the dashboard displays (full-body art or portrait) in Foundry's image viewer. */
    #showArt(img) {
        // Always the original image, not the lightweight copy on the card.
        const src = img.dataset.artSrc || img.dataset.azecraftOriginalSrc || img.getAttribute("src");
        if (!src || src === PLACEHOLDER_ART) return;
        const actor = MissionDashboardApp.#resolve(img.closest("[data-uuid]")?.dataset.uuid);
        const canSee = actor?.testUserPermission(game.user, "LIMITED");
        new foundry.applications.apps.ImagePopout({
            src,
            uuid: canSee ? actor.uuid : undefined,
            window: { title: canSee ? actor.name : "Art" }
        }).render({ force: true });
    }

    /** Zoom card art by a step (0 resets to the default view); saved in this browser. */
    #zoomArt(img, step) {
        const uuid = img.closest("[data-uuid]")?.dataset.uuid;
        const view = step === 0 ? { ...DEFAULT_ART_VIEW } : zoomArtView(currentArtView(img), step);
        applyArtView(img, view);
        if (uuid) saveArtView(uuid, img.dataset.artSrc, view);
    }

    static #onArtZoom(event, target) {
        const img = target.closest(".azd-card-art")?.querySelector("img");
        if (img) this.#zoomArt(img, Number(target.dataset.step) * ZOOM_BUTTON_STEP);
    }

    /** Fit the Scene into the frame on this client (used when a Scene opens with "fit on open"). */
    fitScene() {
        return fitSceneToFrame(this.#layoutOptions());
    }

    static #onConfigure() {
        if (!game.user.isGM) return;
        this.controller.openConfig();
    }

    static async #onCycleCompact() {
        const order = ["auto", "always", "never"];
        const current = this.controller.preferences().compact;
        await game.settings.set(MODULE_ID, SETTINGS.compact, order[(order.indexOf(current) + 1) % order.length]);
    }

    static async #onToggleMission() {
        await game.settings.set(MODULE_ID, SETTINGS.missionCollapsed, !this.controller.preferences().missionCollapsed);
    }

    static #onOpenTracker(event, target) {
        this.controller.openTracker(target.dataset.kind);
    }

    /** GM: make another squad active for everyone, after a warning (it resets everyone's tabs). */
    async #changeActiveSquad(select) {
        const current = this.controller.view?.squad;
        const next = this.controller.view?.squads?.find(squad => squad.id === select.value);
        if (!game.user.isGM || !next || next.id === current?.id) return;

        const escape = foundry.utils.escapeHTML;
        const confirmed = await DialogV2.confirm({
            window: { title: "Change active squad" },
            content: `<p>Make <strong>${escape(next.name)}</strong> the active squad for <strong>everyone</strong>?</p>
                <p class="hint">Every player's dashboard switches to this squad's members, and every Objective, Summary and Intel tab jumps to this squad's default ledger at its newest entry. Anything people were reading in other ledgers is replaced.</p>`
        });

        if (!confirmed) {
            select.value = current?.id ?? "";
            return;
        }

        try {
            await setActiveSquad(next.id);
            ui.notifications.info(`${next.name} is now the active squad.`);
        } catch (error) {
            select.value = current?.id ?? "";
            ui.notifications.error(error.message);
        }
    }
}
