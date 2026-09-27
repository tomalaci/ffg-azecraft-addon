/**
 * Mass Effect themed story points: replaces the starwarsffg Light/Dark destiny tracker's look and
 * wording with a tug-of-war bar: the players' points (default name "Destiny") in blue from the
 * left, the GM's points (default "Doom") in red from the right. Both names are world
 * settings.
 *
 * The system's data and rules stay authoritative: the pool is the system's dPoolLight / dPoolDark
 * world settings, and the system's own tracker keeps running hidden, because it applies players'
 * flips (players cannot write world settings; they ask the active GM's tracker over the system
 * socket) and owns the Group Manager / Request Destiny Roll actions.
 */

import { storyPointsBox } from "./story-layout.js";
import { SIDES, shiftPool, fromSystemPool, poolCapacity, poolSegments, resizePool, squadShare, toSystemPool, usePoint } from "./story-pool.js";

const MODULE_ID = "ffg-azecraft-addon";
const SYSTEM_ID = "starwarsffg";
const TEMPLATE = `modules/${MODULE_ID}/templates/story-points.hbs`;
const SETTINGS = {
    enabled: "storyPointsEnabled",
    squadName: "storyPointsSquadName",
    threatName: "storyPointsThreatName"
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function names() {
    return {
        squad: game.settings.get(MODULE_ID, SETTINGS.squadName) || "Destiny",
        threat: game.settings.get(MODULE_ID, SETTINGS.threatName) || "Doom"
    };
}

function readPool() {
    return fromSystemPool(game.settings.get(SYSTEM_ID, "dPoolLight"), game.settings.get(SYSTEM_ID, "dPoolDark"));
}

/** An element's box on screen, or null when it is missing or not displayed. */
function visibleRect(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
}

/** The system's (hidden) destiny tracker, which processes player flips and owns the GM menu. */
function systemTracker() {
    return Object.values(ui.windows).find(app => app.id === "destiny-tracker") ?? null;
}

export class StoryPointsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "azecraft-story-points",
        tag: "section",
        classes: ["azsp"],
        window: { frame: false, positioned: false },
        actions: {
            use: StoryPointsApp.#onUse,
            adjust: StoryPointsApp.#onAdjust,
            resize: StoryPointsApp.#onResizePool,
            systemMenu: StoryPointsApp.#onSystemMenu
        }
    };

    static PARTS = {
        bar: { template: TEMPLATE }
    };

    #observer = null;
    #onResize = () => this.#position();

    _insertElement(element) {
        // Above the mission dashboard (z-index 1 in #interface), below Foundry's own UI columns.
        const existing = document.getElementById(element.id);
        if (existing) existing.replaceWith(element);
        else document.getElementById("interface").prepend(element);
    }

    async _prepareContext() {
        const pool = readPool();
        const label = names();
        const isGM = game.user.isGM;

        return {
            isGM,
            pool,
            label,
            segments: poolSegments(pool).map((side, index, all) => ({
                side,
                // The segment next to the boundary is the one a flip moves.
                edge: side === SIDES.squad ? all[index + 1] !== SIDES.squad : all[index - 1] !== SIDES.threat
            })),
            empty: pool.squad + pool.threat === 0,
            capacity: poolCapacity(pool),
            squadPercent: Math.round(squadShare(pool) * 100),
            canUseSquad: pool.squad > 0,
            canUseThreat: isGM && pool.threat > 0,
            menu: isGM ? (systemTracker()?.menu ?? []).map((item, index) => ({ index, name: item.name, icon: item.icon })) : []
        };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        // Sit right of the player list, in the corner under the dashboard's squad rail.
        this.#observer = new ResizeObserver(this.#onResize);
        for (const id of ["players", "players-active", "hotbar"]) {
            const element = document.getElementById(id);
            if (element) this.#observer.observe(element);
        }
        window.addEventListener("resize", this.#onResize);
        document.addEventListener("azecraft:layout", this.#onResize);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#position();
    }

    _onClose(options) {
        this.#observer?.disconnect();
        window.removeEventListener("resize", this.#onResize);
        document.removeEventListener("azecraft:layout", this.#onResize);
        super._onClose(options);
    }

    #position() {
        const element = this.element;
        if (!element) return;
        const box = storyPointsBox({
            width: window.innerWidth,
            height: window.innerHeight,
            players: visibleRect("#players-active") ?? visibleRect("#players"),
            controls: visibleRect("#scene-controls"),
            hotbar: visibleRect("#hotbar"),
            rail: document.querySelector("#azecraft-mission-dashboard:not(.azd--hidden)") ? visibleRect("#azecraft-mission-dashboard .azd-rail") : null
        });
        element.classList.toggle("azsp--vertical", box.vertical);
        element.style.setProperty("--azsp-left", `${box.left}px`);
        element.style.setProperty("--azsp-bottom", `${box.bottom}px`);
        element.style.setProperty("--azsp-width", `${box.width}px`);
        element.style.setProperty("--azsp-max-height", `${box.maxHeight}px`);
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /** Use one point from a side; it passes to the other side. Players may only use squad points. */
    static async #onUse(event, target) {
        const side = target.dataset.side;
        if (side === SIDES.threat && !game.user.isGM) return;

        const label = names();
        const before = readPool();
        const next = usePoint(before, side);
        if (!next) {
            ui.notifications.warn(`No ${label[side]} story points left.`);
            return;
        }

        if (game.user.isGM) {
            await StoryPointsApp.#writePool(next);
        } else {
            if (!game.users.activeGM) {
                ui.notifications.warn("A GM needs to be online to use a story point.");
                return;
            }
            // The active GM's system tracker applies the flip (players cannot write world settings).
            game.socket.emit(`system.${SYSTEM_ID}`, { pool: toSystemPool(next) });
        }

        const other = side === SIDES.squad ? SIDES.threat : SIDES.squad;
        await ChatMessage.create({
            user: game.user.id,
            content: `<div class="azsp-chat azsp-chat--${side}">
                <div class="azsp-chat-title">${foundry.utils.escapeHTML(label[side])} story point used</div>
                <div class="azsp-chat-body">It passes to ${foundry.utils.escapeHTML(label[other])}.</div>
                <div class="azsp-chat-pool"><span class="azsp-squad">${foundry.utils.escapeHTML(label.squad)} ${next.squad}</span> · <span class="azsp-threat">${foundry.utils.escapeHTML(label.threat)} ${next.threat}</span></div>
            </div>`
        });
    }

    /** GM: move a point to or from one side (the other side gives or takes it). */
    static async #onAdjust(event, target) {
        if (!game.user.isGM) return;
        await StoryPointsApp.#writePool(shiftPool(readPool(), target.dataset.side, Number(target.dataset.delta)));
    }

    /** GM: grow or shrink the whole pool (see resizePool for which side changes). */
    static async #onResizePool(event, target) {
        if (!game.user.isGM) return;
        await StoryPointsApp.#writePool(resizePool(readPool(), Number(target.dataset.delta)));
    }

    static #onSystemMenu(event, target) {
        if (!game.user.isGM) return;
        systemTracker()?.menu?.[Number(target.dataset.index)]?.callback();
    }

    static async #writePool(pool) {
        const { light, dark } = toSystemPool(pool);
        await game.settings.set(SYSTEM_ID, "dPoolLight", light);
        await game.settings.set(SYSTEM_ID, "dPoolDark", dark);
    }
}

/** Re-theme the system's remaining Star Wars wording (Group Manager, destiny roll chat button). */
function overrideSystemWording() {
    const label = names();
    const set = (key, value) => foundry.utils.setProperty(game.i18n.translations, key, value);
    set("SWFFG.Lightside", label.squad);
    set("SWFFG.Darkside", label.threat);
    set("SWFFG.DestinyPool", "Story Points");
    set("SWFFG.RequestDestinyRoll", "Request story point roll");
    set("SWFFG.DestinyPoolRoll", "Click here to roll for starting story points");
    set("SWFFG.DestinyAlreadyRolled", "You have already rolled for story points!");
    set("SWFFG.DestinyFlipMessage", "Story point used");
    set("SWFFG.DestinyTrackerHint", "Story points");
}

let app = null;

export function initStoryPoints() {
    const reload = () => foundry.utils.debouncedReload?.() ?? window.location.reload();

    game.settings.register(MODULE_ID, SETTINGS.enabled, {
        name: "Mass Effect story points",
        hint: "Replace the Star Wars Light/Dark destiny tracker with the Mass Effect story point bar. The system's pool and rules are unchanged.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: reload
    });
    game.settings.register(MODULE_ID, SETTINGS.squadName, {
        name: "Story points: players' side name",
        hint: "Points the players can spend for a story advantage (the system's Light side).",
        scope: "world",
        config: true,
        type: String,
        default: "Destiny",
        onChange: reload
    });
    game.settings.register(MODULE_ID, SETTINGS.threatName, {
        name: "Story points: GM's side name",
        hint: "Points the GM can spend for story setbacks (the system's Dark side).",
        scope: "world",
        config: true,
        type: String,
        default: "Doom",
        onChange: reload
    });

    Hooks.once("setup", () => {
        if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;
        overrideSystemWording();
        foundry.applications.handlebars.loadTemplates([TEMPLATE]);
    });

    Hooks.once("ready", () => {
        if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;
        document.body.classList.add("azsp-active");
        app = new StoryPointsApp();
        app.render({ force: true });
    });

    // Any change to the pool (from this widget, the system, the Group Manager or another client).
    Hooks.on("updateSetting", setting => {
        if (setting.key === `${SYSTEM_ID}.dPoolLight` || setting.key === `${SYSTEM_ID}.dPoolDark`) app?.render();
    });
    Hooks.on("createSetting", setting => {
        if (setting.key === `${SYSTEM_ID}.dPoolLight` || setting.key === `${SYSTEM_ID}.dPoolDark`) app?.render();
    });
}
