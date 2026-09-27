/**
 * Measures the core Foundry UI (scene controls, scene navigation, player list, hotbar, sidebar)
 * and publishes the free space as CSS custom properties on the dashboard element.
 *
 * The dashboard is a viewport overlay: it never resizes the canvas or changes its coordinates.
 */

const WATCHED_SELECTORS = [
    "#scene-controls",
    "#scene-navigation-active",
    "#players",
    "#hotbar",
    "#sidebar",
    "#destiny-tracker"
];

const GAP = 12;

function visibleRect(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (getComputedStyle(element).display === "none" || getComputedStyle(element).visibility === "hidden") return null;

    return rect;
}

/**
 * Pure sizing rules. `ui` holds measured rects (or null) and the viewport size.
 * @returns {object} CSS pixel values and layout mode
 */
export function computeLayout({ width, height, controls, navActive, navExpand, players, destiny, hotbar, sidebar }, { compactPreference = "auto", missionCollapsed = false } = {}) {
    const left = Math.round((controls?.right ?? 0) + GAP);
    const top = Math.round(Math.max(GAP, (navActive?.bottom ?? 0) + 8));
    // The SWFFG destiny tracker is a movable window; it only constrains the rail while docked low.
    const destinyTop = destiny && destiny.top >= height * 0.6 ? destiny.top : height;
    const bottomLeftTop = Math.min(players?.top ?? height, destinyTop);
    const railBottom = Math.round(Math.max(GAP, height - bottomLeftTop + 8));
    const right = Math.round(sidebar ? Math.max(GAP, width - sidebar.left + GAP) : GAP);
    const bottom = Math.round(hotbar ? Math.max(GAP, height - hotbar.top + 8) : GAP);

    // Hidden mode leaves only a restore button: put it at the top, clear of the scene list.
    const toggleLeft = Math.round(Math.max(controls?.right ?? 0, navActive?.right ?? 0, navExpand?.right ?? 0) + GAP);
    const toggleTop = Math.round(controls?.top ?? navActive?.top ?? GAP);

    const autoCompact = height < 900 || width - left - right < 1100;
    const compact = compactPreference === "always" || (compactPreference === "auto" && autoCompact);

    let railWidth = width >= 2200 ? 380 : width >= 1600 ? 330 : 280;
    if (compact) railWidth = Math.min(railWidth, 260);

    let missionHeight = height >= 1300 ? 260 : height >= 1000 ? 220 : 180;
    if (missionCollapsed) missionHeight = 34;

    return {
        compact,
        values: {
            "--azd-left": `${left}px`,
            "--azd-top": `${top}px`,
            "--azd-rail-bottom": `${railBottom}px`,
            "--azd-right": `${right}px`,
            "--azd-bottom": `${bottom}px`,
            "--azd-rail-width": `${railWidth}px`,
            "--azd-mission-height": `${missionHeight}px`,
            "--azd-toggle-left": `${toggleLeft}px`,
            "--azd-toggle-top": `${toggleTop}px`
        }
    };
}

export function measureUI() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        controls: visibleRect("#scene-controls"),
        navActive: visibleRect("#scene-navigation-active"),
        navExpand: visibleRect("#scene-navigation-expand"),
        players: visibleRect("#players"),
        destiny: visibleRect("#destiny-tracker"),
        hotbar: visibleRect("#hotbar"),
        sidebar: visibleRect("#sidebar")
    };
}

/**
 * Keeps CSS variables in sync with the core UI. One instance per mounted dashboard.
 */
export class LayoutWatcher {
    #element;
    #getOptions;
    #frame = null;
    #observer = null;
    #hookIds = [];
    #onResize = () => this.schedule();

    constructor(element, getOptions) {
        this.#element = element;
        this.#getOptions = getOptions;
    }

    start() {
        this.#observer = new ResizeObserver(() => this.schedule());

        for (const selector of WATCHED_SELECTORS) {
            const element = document.querySelector(selector);
            if (element) this.#observer.observe(element);
        }

        window.addEventListener("resize", this.#onResize);

        for (const hook of ["collapseSidebar", "collapseSceneNavigation", "renderSceneNavigation", "renderPlayers", "renderHotbar"]) {
            this.#hookIds.push([hook, Hooks.on(hook, () => this.schedule())]);
        }

        // The sidebar animates its collapse; measure again once transitions finish.
        document.querySelector("#sidebar")?.addEventListener("transitionend", this.#onResize);
        this.apply();
    }

    stop() {
        if (this.#frame) cancelAnimationFrame(this.#frame);
        this.#frame = null;
        this.#observer?.disconnect();
        this.#observer = null;
        window.removeEventListener("resize", this.#onResize);
        document.querySelector("#sidebar")?.removeEventListener("transitionend", this.#onResize);

        for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
        this.#hookIds = [];
    }

    schedule() {
        if (this.#frame) return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = null;
            this.apply();
        });
    }

    apply() {
        if (!this.#element?.isConnected) return;

        const { compact, values } = computeLayout(measureUI(), this.#getOptions());

        for (const [name, value] of Object.entries(values)) {
            this.#element.style.setProperty(name, value);
        }

        this.#element.classList.toggle("azd--compact", compact);
    }
}
