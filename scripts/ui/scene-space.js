/**
 * Windows that fill the scene space left free by the HUD (UI Performance, Admin Panel): between the
 * dashboard's squad rail and Foundry's sidebar, from below the toolbar down to the mission panels
 * (or the hotbar when the dashboard is hidden). They refit when the layout or window size changes.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const GAP = 10;

function visibleRect(selector) {
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return rect.width && rect.height ? rect : null;
}

/** The free scene area, in screen pixels. */
export function sceneSpaceRect() {
    const controls = visibleRect("#scene-controls");
    const toolbar = visibleRect("#azecraft-toolbar");
    const sidebar = visibleRect("#sidebar");
    const hotbar = visibleRect("#hotbar");

    let left = (controls?.right ?? 0) + GAP;
    let top = (toolbar?.bottom ?? controls?.top ?? 0) + GAP;
    let right = (sidebar?.left ?? window.innerWidth) - GAP;
    let bottom = (hotbar?.top ?? window.innerHeight) - GAP;

    // The space of the dashboard's normal layout (normal rail, normal panels), published by its
    // layout: windows open over an expanded rail or panels without moving or shrinking.
    const dashboard = document.querySelector("#azecraft-mission-dashboard:not(.azd--hidden)");
    const spaceLeft = Number.parseFloat(dashboard?.style.getPropertyValue("--azd-space-left"));
    const spaceBottom = Number.parseFloat(dashboard?.style.getPropertyValue("--azd-space-bottom"));
    if (Number.isFinite(spaceLeft)) left = Math.max(left, spaceLeft + GAP);
    if (Number.isFinite(spaceBottom)) bottom = Math.min(bottom, window.innerHeight - spaceBottom - GAP);
    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.max(360, Math.round(right - left)),
        height: Math.max(260, Math.round(bottom - top))
    };
}

/** A framed window fitted to the free scene area. */
export class SceneSpaceApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ["azecraft-scene-space"],
        window: { resizable: false, minimizable: true }
    };

    #refit = () => this.fit();

    fit() {
        if (!this.rendered || this.minimized) return;
        this.setPosition(sceneSpaceRect());
    }

    /** Always exactly the free scene area: re-renders never grow or shrink the window. */
    setPosition(position = {}) {
        if (this.minimized) return super.setPosition(position);
        return super.setPosition({ ...position, ...sceneSpaceRect() });
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.fit();
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        window.addEventListener("resize", this.#refit);
        document.addEventListener("azecraft:layout", this.#refit);
        this.fit();
    }

    _onClose(options) {
        window.removeEventListener("resize", this.#refit);
        document.removeEventListener("azecraft:layout", this.#refit);
        super._onClose(options);
    }

    /** Open the window, or close it if it is open (toolbar buttons toggle). */
    static toggle() {
        const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
        if (existing) return existing.close();
        return new this().render({ force: true });
    }
}
