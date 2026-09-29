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
    "#players-active",
    "#hotbar",
    "#sidebar",
    "#destiny-tracker",
    "#azecraft-story-points"
];

const GAP = 12;

/** Narrowest a mission tab may become, in CSS pixels. */
export const MIN_COLUMN_WIDTH = 180;
export const DEFAULT_COLUMNS = [1 / 3, 1 / 3, 1 / 3];

function validColumns(fractions) {
    return Array.isArray(fractions) && fractions.length === 3 && fractions.every(f => Number.isFinite(f) && f > 0)
        ? fractions
        : DEFAULT_COLUMNS;
}

/**
 * Pixel widths of the three mission tabs for a bar of `total` pixels. Pure.
 * Every tab keeps at least `min` pixels; the rest is shared in proportion to the saved fractions.
 */
export function clampColumns(fractions, total, min = MIN_COLUMN_WIDTH) {
    const f = validColumns(fractions);
    const sum = f.reduce((a, b) => a + b, 0);

    if (total <= 3 * min) return [total / 3, total / 3, total / 3];

    const excess = f.map(x => Math.max(0, (x / sum) * total - min));
    const excessSum = excess.reduce((a, b) => a + b, 0);
    const spare = total - 3 * min;

    return excess.map(e => min + (excessSum ? (e / excessSum) * spare : spare / 3));
}

/**
 * Move one divider (0: objective|summary, 1: summary|intel) to `x` pixels from the bar's left edge.
 * Only the two tabs next to the divider change. Returns new fractions. Pure.
 */
export function moveDivider(fractions, divider, x, total, min = MIN_COLUMN_WIDTH) {
    const [a, b, c] = clampColumns(fractions, total, min);

    if (divider === 0) {
        const first = Math.min(Math.max(x, min), a + b - min);
        return [first / total, (a + b - first) / total, c / total];
    }

    const boundary = Math.min(Math.max(x, a + min), total - min);
    return [a / total, (boundary - a) / total, (total - boundary) / total];
}

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
export function computeLayout({ width, height, controls, navActive, navExpand, players, destiny, hotbar, sidebar }, { compactPreference = "auto", missionCollapsed = false, framed = true, columns = DEFAULT_COLUMNS } = {}) {
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

    // Wide enough that character art is a real feature of the frame, not a thumbnail.
    let railWidth = width >= 2200 ? 480 : width >= 1600 ? 420 : 340;
    if (compact) railWidth = Math.min(railWidth, 280);

    let missionHeight = height >= 1300 ? 260 : height >= 1000 ? 220 : 180;
    if (missionCollapsed) missionHeight = 34;

    // Framed: the squad column runs down to the story point bar in the bottom-left corner (or, with
    // nothing docked there, to where the mission tabs begin).
    const railEnd = framed
        ? (destiny && destiny.top >= height * 0.6 ? railBottom : Math.max(railBottom, bottom + missionHeight))
        : railBottom;

    // The mission bar: one strip split into three resizable tabs.
    const barLeft = left + railWidth + GAP + (framed ? GAP : 0);
    const barRight = width - (framed ? Math.max(GAP, right) : right);
    const barWidth = Math.max(0, barRight - barLeft);
    // The third tab takes whatever rounding leaves, so the three always add up to the bar width.
    const [col1, col2] = clampColumns(columns, barWidth).map(Math.round);

    return {
        compact,
        values: {
            "--azd-left": `${left}px`,
            "--azd-top": `${top}px`,
            "--azd-rail-bottom": `${railEnd}px`,
            "--azd-right": `${right}px`,
            "--azd-bottom": `${bottom}px`,
            "--azd-rail-width": `${railWidth}px`,
            "--azd-mission-height": `${missionHeight}px`,
            "--azd-toggle-left": `${toggleLeft}px`,
            "--azd-toggle-top": `${toggleTop}px`,
            "--azd-bar-left": `${barLeft}px`,
            "--azd-bar-width": `${barWidth}px`,
            "--azd-col-1": `${col1}px`,
            "--azd-col-2": `${col2}px`,
            "--azd-col-3": `${barWidth - col1 - col2}px`
        },
        bar: { left: barLeft, width: barWidth }
    };
}

export function measureUI() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        controls: visibleRect("#scene-controls"),
        navActive: visibleRect("#scene-navigation-active"),
        navExpand: visibleRect("#scene-navigation-expand"),
        // Only the always-visible part of the player list: expanding it (the inactive players above)
        // floats over the rail instead of pushing the frame up.
        // The player list is a drop-down from the toolbar's Players button: it takes no room.
        players: document.body.classList.contains("aztb-players-managed") ? null : visibleRect("#players-active") ?? visibleRect("#players"),
        // The addon's story point bar (bottom-left, where the player list was), or the system's
        // destiny tracker when the bar is off.
        destiny: visibleRect("#azecraft-story-points") ?? visibleRect("#destiny-tracker"),
        hotbar: visibleRect("#hotbar"),
        sidebar: visibleRect("#sidebar")
    };
}

/**
 * Keeps CSS variables in sync with the core UI. One instance per mounted dashboard.
 */
export class LayoutWatcher {
    /** The most recent layout result (used by divider dragging). */
    last = null;
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

        const result = computeLayout(measureUI(), this.#getOptions());
        const { compact, values } = result;
        this.last = result;

        for (const [name, value] of Object.entries(values)) {
            this.#element.style.setProperty(name, value);
        }

        this.#element.classList.toggle("azd--compact", compact);
        // The story point bar fits itself into the corner left under the rail.
        document.dispatchEvent(new CustomEvent("azecraft:layout"));
    }
}

/**
 * The map "window" left free by the dashboard frame, in screen pixels. Pure.
 * @returns {{left: number, top: number, right: number, bottom: number}}
 */
export function frameWindow(ui, options = {}) {
    const { values } = computeLayout(ui, options);
    const px = name => Number.parseFloat(values[name]);
    const left = px("--azd-left") + px("--azd-rail-width") + GAP;
    const right = ui.width - Math.max(0, px("--azd-right") - GAP);
    const bottom = ui.height - (px("--azd-bottom") + px("--azd-mission-height") + GAP);
    return { left, top: 0, right, bottom };
}

/**
 * Pan and zoom this client's canvas so the whole Scene (its background area) fits inside the
 * frame window. Only ever called explicitly or once when a Scene opens; never continuously.
 */
export async function fitSceneToFrame(options = {}) {
    const rect = canvas?.dimensions?.sceneRect;
    if (!canvas?.ready || !rect) return;

    const view = frameWindow(measureUI(), options);
    const width = Math.max(100, view.right - view.left);
    const height = Math.max(100, view.bottom - view.top);
    const margin = 0.98;
    const limits = CONFIG.Canvas ?? {};
    const scale = Math.min(limits.maxZoom ?? 3, Math.max(limits.minZoom ?? 0.1, Math.min(width / rect.width, height / rect.height) * margin));

    // animatePan centres a world point on the screen; offset it so it centres in the frame window.
    const offsetX = (view.left + view.right) / 2 - window.innerWidth / 2;
    const offsetY = (view.top + view.bottom) / 2 - window.innerHeight / 2;
    await canvas.animatePan({
        x: rect.x + rect.width / 2 - offsetX / scale,
        y: rect.y + rect.height / 2 - offsetY / scale,
        scale,
        duration: 250
    });
}
