/**
 * In-game help for the mission dashboard: quick starts for GMs and players plus a feature reference.
 */

import { TEMPLATE_ROOT } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DashboardHelpApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static #instance = null;

    /**
     * Open (or focus) the help window, optionally scrolled to a section.
     * @param {string} [section]  Section id, e.g. "gm-quick-start" or "reputation"
     */
    static open(section = null) {
        DashboardHelpApp.#instance ??= new DashboardHelpApp();
        const app = DashboardHelpApp.#instance;
        app.section = section;
        return app.render({ force: true });
    }

    /** Section to scroll to after rendering. */
    section = null;

    static DEFAULT_OPTIONS = {
        id: "azecraft-dashboard-help",
        classes: ["azd-help"],
        window: { title: "Mission Dashboard Help", icon: "fa-solid fa-circle-question", resizable: true },
        position: { width: 640, height: 720 },
        actions: {
            jump: DashboardHelpApp.#onJump
        }
    };

    static PARTS = {
        body: { template: `${TEMPLATE_ROOT}/help.hbs`, scrollable: [".azd-help-content"] }
    };

    async _prepareContext() {
        return { isGM: game.user.isGM };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const target = this.section ?? (game.user.isGM ? null : "player-quick-start");
        this.section = null;
        // On first render the window has no size yet; scroll once layout has happened.
        if (target) requestAnimationFrame(() => this.#scrollTo(target));
    }

    #scrollTo(section) {
        const element = this.element.querySelector(`[data-section="${CSS.escape(section)}"]`);
        const container = this.element.querySelector(".azd-help-content");
        if (element && container) container.scrollTop = element.offsetTop - container.offsetTop;
    }

    static #onJump(event, target) {
        this.#scrollTo(target.dataset.target);
    }

    _onClose(options) {
        super._onClose(options);
        DashboardHelpApp.#instance = null;
    }
}
