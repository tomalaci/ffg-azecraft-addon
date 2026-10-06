/**
 * Dashboard lifecycle: follows the Scene *this client* is viewing, mounts at most one HUD,
 * routes document hooks to the parts they affect, and coalesces bursts of updates.
 */

import { MISSION_PANELS, MODULE_ID, SETTINGS } from "./constants.js";
import { isDashboardEnabled, normalizeDashboardConfig, referencedUuids } from "./dashboard-state.js";
import { readActiveSquad, readSquads, rememberLedgerChoice, rememberedLedger } from "./squads.js";
import { buildCharacterCard } from "./actor-adapter.js";
import { buildPanel, buildPeople, missionTitle } from "./mission-data.js";
import { ledgerPanel } from "./ledgers.js";
import { TRACKERS, buildStanding, getTrackerUuid } from "./trackers.js";
import { MissionDashboardApp } from "./dashboard-app.js";
import { DashboardConfigApp } from "./dashboard-config.js";
import { TrackerApp } from "./tracker-app.js";

const ALL_PARTS = ["header", "rail", "mission", "intel"];

function resolve(uuid) {
    if (!uuid) return null;

    try {
        return foundry.utils.fromUuidSync(uuid, { strict: false }) ?? null;
    } catch {
        return null;
    }
}

function plainText(html) {
    // DOMParser documents are inert: no scripts run and no images load.
    const spaced = String(html ?? "").replace(/<\/(p|div|li|h[1-6]|section|blockquote)>/gi, "$& ");
    const doc = new DOMParser().parseFromString(`<body>${spaced}</body>`, "text/html");
    return doc.body.textContent.replace(/\s+/g, " ").trim();
}

export class DashboardController {
    /** @type {MissionDashboardApp|null} */
    app = null;

    /** Latest view model rendered by the app. */
    view = null;

    /** Bumped whenever the viewed Scene or its config identity changes; stale async work is dropped. */
    #sceneGeneration = 0;
    #missionSeq = 0;
    #sceneId = null;
    #refs = { actors: new Set(), people: new Set(), pages: new Set() };
    #pending = new Set();
    #timer = null;
    #trackerApps = {};

    /**
     * The entry this client is viewing per tab: `index` into the entries of `ledger` (null = the
     * newest). In memory only. Which ledger a tab shows is remembered per squad in a client setting.
     */
    #panelView = {};

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    get scene() {
        return game.scenes?.viewed ?? null;
    }

    preferences() {
        return {
            hidden: game.settings.get(MODULE_ID, SETTINGS.hidden),
            compact: game.settings.get(MODULE_ID, SETTINGS.compact),
            missionCollapsed: game.settings.get(MODULE_ID, SETTINGS.missionCollapsed),
            style: game.settings.get(MODULE_ID, SETTINGS.style),
            columns: game.settings.get(MODULE_ID, SETTINGS.columns)
        };
    }

    /** Re-evaluate the viewed Scene from scratch. */
    sync() {
        this.#sceneGeneration++;
        this.#missionSeq++;
        // Config or Scene changed (e.g. a new default ledger): everyone returns to the defaults.
        this.#panelView = {};
        const scene = this.scene;

        if (!scene || !isDashboardEnabled(scene)) {
            this.unmount();
            return;
        }

        if (this.#sceneId !== scene.id) {
            // A different Scene: drop per-scene UI state and any stale content immediately.
            this.unmount();
            this.#sceneId = scene.id;
        }

        this.#pending = new Set(ALL_PARTS);
        this.#flush();
    }

    unmount() {
        // Invalidate every in-flight flush so a pending enrichment cannot remount the HUD.
        this.#sceneGeneration++;
        this.#missionSeq++;
        clearTimeout(this.#timer);
        this.#timer = null;
        this.#pending.clear();
        this.#sceneId = null;
        this.view = null;
        this.#refs = { actors: new Set(), people: new Set(), pages: new Set() };

        if (this.app) {
            const app = this.app;
            this.app = null;
            app.close({ animate: false });
        }
    }

    /** Queue parts for rebuilding; bursts within one tick are coalesced. */
    refresh(...parts) {
        if (!this.#sceneId) return;
        for (const part of parts) this.#pending.add(part);

        // Mission content may have changed access or text: an in-flight enrichment is stale from now
        // on, even before the queued rebuild starts, so it can never render revoked content.
        if (parts.includes("mission") || parts.includes("intel")) this.#missionSeq++;

        if (this.#timer) return;
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.#flush();
        }, 30);
    }

    async #flush() {
        const scene = this.scene;
        if (!scene || scene.id !== this.#sceneId || !isDashboardEnabled(scene)) {
            this.sync();
            return;
        }

        const parts = new Set(this.#pending);
        this.#pending.clear();
        if (!parts.size) return;

        const generation = this.#sceneGeneration;
        const squad = readActiveSquad();
        const config = squad ?? normalizeDashboardConfig({});
        const choices = game.settings.get(MODULE_ID, SETTINGS.ledgerChoices);
        const user = game.user;
        const view = this.view ?? { cards: [], mission: null, intel: null, people: [] };
        const needsMission = parts.has("mission") || parts.has("intel");
        const quickParts = [...parts].filter(p => p !== "mission" && p !== "intel");

        this.#refs = referencedUuids(config);
        view.isGM = user.isGM;
        view.squad = squad ? { id: squad.id, name: squad.name } : null;
        view.squads = user.isGM ? readSquads().map(s => ({ id: s.id, name: s.name, active: s.id === squad?.id })) : [];
        view.sceneName = scene.navName || scene.name;

        if (parts.has("rail") || parts.has("header")) {
            view.cards = config.party.map(slot => buildCharacterCard(slot, resolve(slot.actorUuid), user));
        }

        if (parts.has("header")) {
            view.title = missionTitle({ objective: view.mission?.objective, summary: view.mission?.summary }, scene);
            view.standing = this.#standingSummary();
        }

        this.view = view;

        if (!needsMission) {
            // Before the first mount, the in-flight full flush renders these parts too.
            if (this.app) await this.#render(quickParts);
            return;
        }

        // Cards and header need no async work; show them now if the HUD is already mounted.
        if (this.app && quickParts.length) await this.#render(quickParts);

        const seq = this.#missionSeq;
        const [summary, objective, intel] = await Promise.all(
            ["summary", "objective", "intel"].map(key => buildPanel(key, config.ledgers[key], user, {
                ledger: squad ? rememberedLedger(choices, squad, key) : null,
                index: this.#panelView[key]?.index ?? null,
                indexLedger: this.#panelView[key]?.ledger ?? null
            }))
        );

        // Dropped if the Scene changed, the HUD unmounted, or a newer mission refresh was queued.
        if (generation !== this.#sceneGeneration || seq !== this.#missionSeq || !this.#sceneId) return;

        view.mission = { summary, objective, objectiveText: plainText(objective.html) };
        view.intel = intel;
        view.people = buildPeople(config, user);
        view.title = missionTitle({ objective, summary }, scene);
        // The first mount waits for mission content so no placeholder text flashes.
        await this.#render(this.app ? ["mission", "intel", "header"] : ALL_PARTS);
    }

    async #render(parts) {
        if (!this.app) {
            const app = this.app = new MissionDashboardApp(this);
            await app.render({ force: true });
            // Art/landing Scenes can ask to be fitted into the frame once, when they open.
            if (app === this.app && this.scene?.flags?.[MODULE_ID]?.dashboard?.fitOnOpen) {
                requestAnimationFrame(() => app.fitScene());
            }
            return;
        }

        // ApplicationV2 serializes renders, so a partial render queued behind the first one is safe.
        await this.app.render({ parts });
    }

    /** Header chips: Fame and Credits, when their trackers are readable. */
    #standingSummary() {
        const summary = {};
        for (const kind of Object.keys(TRACKERS)) {
            try {
                const standing = buildStanding(kind);
                summary[kind] = { ready: standing.state === "ready", state: standing.state };
                if (standing.state !== "ready") continue;
                if (kind === "reputation") summary[kind].value = standing.fame;
                else summary[kind].value = (standing.entries.find(e => e.id === "credits")?.total ?? 0).toLocaleString();
            } catch (error) {
                console.warn(`Azecraft | Could not read the ${kind} tracker`, error);
                summary[kind] = { ready: false, state: "error" };
            }
        }
        return summary;
    }

    /**
     * Page one mission panel through its history on this client only.
     * @param {string} panelKey
     * @param {number} step   -1 for an earlier entry, +1 for a later one, 0 for the newest
     */
    showEntry(panelKey, step) {
        if (!MISSION_PANELS.some(p => p.key === panelKey)) return;
        const panel = panelKey === "intel" ? this.view?.intel : this.view?.mission?.[panelKey];
        if (!panel || panel.count < 1) return;

        const next = step === 0 ? null : Math.min(Math.max(0, panel.index + step), panel.count - 1);
        this.#panelView[panelKey] = { ledger: panel.ledgerUuid, index: next === panel.count - 1 ? null : next };
        this.refresh(panelKey === "intel" ? "intel" : "mission");
    }

    /**
     * Switch one tab to another ledger on this client only, starting at its newest entry.
     * @param {string} panelKey
     * @param {string|null} ledgerUuid   null returns to the default ledger
     */
    showLedger(panelKey, ledgerUuid) {
        if (!MISSION_PANELS.some(p => p.key === panelKey)) return;
        this.#panelView[panelKey] = { ledger: ledgerUuid || null, index: null };

        // Remembered per squad in this browser; the setting's onChange refreshes the tabs.
        const squad = readActiveSquad();
        if (squad) rememberLedgerChoice(squad, panelKey, ledgerUuid || null);
        else this.refresh(panelKey === "intel" ? "intel" : "mission");
    }

    /* -------------------------------------------- */
    /*  Apps                                        */
    /* -------------------------------------------- */

    openConfig(scene = this.scene) {
        if (!game.user.isGM || !scene) return;
        DashboardConfigApp.openFor(scene);
    }

    /** Open the Reputation or Resources tracker window. */
    openTracker(kind = "reputation") {
        if (!TRACKERS[kind]) return;
        this.#trackerApps[kind] ??= new TrackerApp(kind);
        this.#trackerApps[kind].render({ force: true });
    }

    /* -------------------------------------------- */
    /*  Hook routing                                */
    /* -------------------------------------------- */

    registerHooks() {
        Hooks.on("canvasReady", () => this.sync());
        Hooks.on("canvasTearDown", () => this.unmount());

        Hooks.on("updateScene", (scene, changes) => {
            if (scene.id !== this.scene?.id) return;
            const relevant = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)
                || "ownership" in changes || "name" in changes || "navName" in changes;
            if (relevant) this.sync();
        });

        const onActor = actor => {
            if (!actor || actor.isToken) return;
            if (this.#refs.actors.has(actor.uuid)) this.refresh("rail");
            if (this.#refs.people.has(actor.uuid)) this.refresh("intel");
        };

        Hooks.on("updateActor", onActor);
        Hooks.on("deleteActor", onActor);
        Hooks.on("createActor", onActor);

        const onItem = item => onActor(item.parent);
        for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, onItem);

        // Effects also change the squad effects strip in the header.
        const onEffect = effect => {
            const actor = effect.parent?.documentName === "Item" ? effect.parent.parent : effect.parent;
            if (!actor || actor.isToken) return;
            if (this.#refs.actors.has(actor.uuid)) this.refresh("rail", "header");
            if (this.#refs.people.has(actor.uuid)) this.refresh("intel");
        };
        for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, onEffect);
        Hooks.on("azecraftSquadConditions", () => this.refresh("rail", "header"));

        // Any change to a mission ledger (new entry, edit, ownership, rename) can change a tab.
        const onPage = page => {
            if (ledgerPanel(page.parent)) this.refresh("mission", "intel");
            if (this.#isTracker(page.parent)) this.#onTrackerChanged();
        };

        for (const hook of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(hook, onPage);

        const onEntry = entry => {
            if (ledgerPanel(entry)) this.refresh("mission", "intel");
            if (this.#isTracker(entry)) this.#onTrackerChanged();
        };

        for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"]) Hooks.on(hook, onEntry);

        // A role change (e.g. promotion to Assistant GM) invalidates every permission-filtered view.
        // Document ownership changes arrive through the Actor/Journal hooks above.
        Hooks.on("updateUser", (user, changes) => {
            if ("role" in changes && user.isSelf) this.sync();
        });
    }

    #isTracker(entry) {
        return Boolean(entry) && Object.keys(TRACKERS).some(kind => entry.uuid === getTrackerUuid(kind));
    }

    onTrackerSettingChanged() {
        this.#onTrackerChanged();
    }

    #onTrackerChanged() {
        this.refresh("header");
        for (const app of Object.values(this.#trackerApps)) if (app.rendered) app.render();
    }
}
