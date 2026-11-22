/**
 * Manual fog mask: an interaction layer with a full-canvas colour sprite (and an optional overlay
 * image) masked by a render texture. White in the mask shows fog, black reveals. The mask is redrawn
 * from the scene's stroke history (fog-core.js). Ported from Simple Fog 1.4.4 (MIT, see LICENSE).
 *
 * Includes fixes and tool improvements from Simple Fog 1.5 (a Foundry V14 release) that also work on V13:
 * fog only over the scene for GMs, undo through Foundry's undo key, the pointer kept after a commit.
 *
 * Everything lives under this module's ids, so Simple Fog can stay active alongside: scene flags
 * `flags.ffg-azecraft-addon.fog.*`, settings `ffg-azecraft-addon.fog*`, layer `canvas.azecraftFog`.
 */

import { BRUSH_TYPES, appendHistory, emptyHistory, normalizeHistory, undoHistory } from "./fog-core.js";

export const MODULE_ID = "ffg-azecraft-addon";
export const FLAG = "fog";
export const SETTINGS = {
    enabled: "fogEnabled",
    config: "fogConfig",
    brushSize: "fogBrushSize",
    brushOpacity: "fogBrushOpacity",
    confirmDisable: "fogConfirmDisable",
    autoEnable: "fogAutoEnable",
    defaultTool: "fogDefaultTool",
    zIndex: "fogZIndex",
    previewPlayerView: "fogPreviewPlayerView"
};

const REFRESH = { refreshLighting: true, refreshVision: true, refreshOcclusion: true };

export function refreshPerception() {
    canvas.perception.update(REFRESH);
}

/** A per-scene fog value (flag), else the world default from the fog configuration. */
export function sceneFlag(scene, name) {
    return scene?.getFlag(MODULE_ID, `${FLAG}.${name}`);
}

export default class MaskLayer extends foundry.canvas.layers.InteractionLayer {
    constructor() {
        super();
        this.lock = false;
        this.historyBuffer = [];
        this.pointer = 0;
        this.gridLayout = {};
        this.dragStart = { x: 0, y: 0 };
        // Foundry expects interaction layers to have one.
        this.history = [];
        this.BRUSH_TYPES = BRUSH_TYPES;
    }

    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            baseClass: MaskLayer,
            zIndex: game.settings.get(MODULE_ID, SETTINGS.zIndex)
        });
    }

    settings = game.settings.get(MODULE_ID, SETTINGS.config);

    /** Where fog is drawn: the scene for GMs; for players also the padding around it. */
    get dimensions() {
        return game.user.isGM ? canvas.dimensions.sceneRect : canvas.dimensions.rect;
    }

    /* -------------------------------------------- */
    /*  Settings                                    */
    /* -------------------------------------------- */

    /** The scene's value, else the world default. */
    getSetting(name) {
        return sceneFlag(canvas.scene, name) ?? this.settings[name];
    }

    async setSetting(name, value) {
        return canvas.scene.setFlag(MODULE_ID, `${FLAG}.${name}`, value);
    }

    getColorAlpha() {
        return this.getSetting(game.user.isGM ? "gmColorAlpha" : "playerColorAlpha");
    }

    getTint() {
        return this.getSetting(game.user.isGM ? "gmColorTint" : "playerColorTint");
    }

    setColorTint(tint) {
        this.fogColorLayer.tint = tint;
    }

    getFogImageOverlayAlpha() {
        return this.getSetting(game.user.isGM ? "fogImageOverlayGMAlpha" : "fogImageOverlayPlayerAlpha") / 100;
    }

    /** Fade `sprite.alpha` to `alpha` over the transition time (or set it at once). */
    async #fade(sprite, alpha, skip) {
        if (!skip && this.getSetting("transition")) {
            const fps = game.settings.get("core", "maxFPS");
            const frames = Math.max(1, Math.round((fps * this.getSetting("transitionSpeed")) / 1000));
            const rate = (sprite.alpha - alpha) / frames;
            for (let f = 0; f < frames; f += 1) {
                await new Promise(resolve => { setTimeout(resolve, 1000 / fps); });
                sprite.alpha -= rate;
            }
        }
        sprite.alpha = alpha;
    }

    /** @param alpha {Number} 0-100 */
    async setColorAlpha(alpha, skip = false) {
        return this.#fade(this.fogColorLayer, alpha / 100, skip);
    }

    /** @param alpha {Number} 0-1 */
    async setFogImageOverlayAlpha(alpha, skip = false) {
        return this.#fade(this.fogImageOverlayLayer, alpha, skip);
    }

    setFogImageOverlayTexture(path) {
        this.fogImageOverlayLayer.texture = path ? foundry.canvas.getTexture(path) : PIXI.Texture.EMPTY;
    }

    static getMaskTexture() {
        const d = canvas.dimensions;
        let resolution = 1.0;
        if (d.width * d.height > 16000 ** 2) resolution = 0.25;
        else if (d.width * d.height > 8000 ** 2) resolution = 0.5;
        return PIXI.RenderTexture.create({ width: d.width, height: d.height, resolution });
    }

    /* -------------------------------------------- */
    /*  History                                     */
    /* -------------------------------------------- */

    readHistory() {
        return normalizeHistory(sceneFlag(canvas.scene, "history"));
    }

    /** Replace the stored history (unset first, or Foundry would merge the arrays). */
    async writeHistory(history) {
        await canvas.scene.unsetFlag(MODULE_ID, `${FLAG}.history`);
        await canvas.scene.setFlag(MODULE_ID, `${FLAG}.history`, history);
    }

    /**
     * Draw the history onto the mask, from this client's pointer to the history's (or from the
     * start, after an undo).
     */
    renderStack({ history = this.readHistory(), start = this.pointer, stop } = {}) {
        history = normalizeHistory(history);
        stop ??= history.pointer;
        if (!history.events.length) this.resetMask(false);
        if (stop <= this.pointer) {
            this.resetMask(false);
            start = 0;
        }
        for (let i = start; i < stop; i += 1) {
            for (const stroke of history.events[i]) this.renderBrush(stroke, false);
        }
        this.pointer = stop;
        if (!canvas.sight?.light?.los?.geometry) return;
        refreshPerception();
    }

    /** Store the strokes of the action just drawn as one history event. */
    async commitHistory() {
        if (!this.historyBuffer.length || this.lock) return;
        this.lock = true;
        try {
            const history = appendHistory(this.readHistory(), this.historyBuffer);
            await this.writeHistory(history);
            this.pointer = history.pointer;
            this.historyBuffer = [];
        } finally {
            this.lock = false;
        }
    }

    /** Fill the mask with fog; with `save`, also clear the scene's history. */
    async resetMask(save = true) {
        this.setFill();
        if (save) {
            await this.writeHistory(emptyHistory());
            this.pointer = 0;
        }
    }

    /** Clear the history and reveal the whole scene. */
    async blankMask() {
        await this.resetMask();
        this.renderBrush({ shape: BRUSH_TYPES.BOX, fill: 0x000000, ...this.#rect() });
        await this.commitHistory();
    }

    #rect() {
        const { x, y, width, height } = this.dimensions;
        return { x, y, width, height };
    }

    async undo(steps = 1) {
        const history = undoHistory(this.readHistory(), this.pointer, steps);
        await this.writeHistory(history);
        this.pointer = history.pointer;
    }

    /** Foundry's undo key (Ctrl+Z) while this layer is active. */
    _onUndoKey() {
        this.undo();
        return true;
    }

    /* -------------------------------------------- */
    /*  Shapes                                      */
    /* -------------------------------------------- */

    brush({ alpha = 1, fill, height, shape, vertices, visible = true, width, x, y, zIndex }) {
        const brush = new PIXI.Graphics();
        brush.beginFill(fill);
        switch (shape) {
            case BRUSH_TYPES.ELLIPSE: brush.drawEllipse(0, 0, width, height); break;
            case BRUSH_TYPES.BOX: brush.drawRect(0, 0, width, height); break;
            case BRUSH_TYPES.ROUNDED_RECT: brush.drawRoundedRect(0, 0, width, height, 10); break;
            case BRUSH_TYPES.POLYGON: brush.drawPolygon(vertices); break;
            default: break;
        }
        brush.endFill();
        brush.alpha = alpha;
        brush.visible = visible;
        brush.x = x;
        brush.y = y;
        brush.zIndex = zIndex;
        return brush;
    }

    /** Draw a stroke onto the mask; with `save`, keep it for the next history commit. */
    renderBrush(data, save = true) {
        const brush = this.brush(data);
        this.composite(brush);
        brush.destroy();
        if (save) this.historyBuffer.push(data);
    }

    composite(brush) {
        canvas.app.renderer.render(brush, { renderTexture: this.maskTexture, clear: false, transform: null, skipUpdateTransform: false });
    }

    getCanvasSprite() {
        const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        Object.assign(sprite, this.#rect());
        sprite.zIndex = 5000;
        return sprite;
    }

    setFill() {
        const fill = new PIXI.Graphics();
        fill.beginFill(0xffffff);
        const { x, y, width, height } = this.dimensions;
        fill.drawRect(x, y, width, height);
        fill.endFill();
        this.composite(fill);
        fill.destroy();
    }

    /** Show or hide this scene's fog for everyone. */
    async toggle() {
        const visible = !this.getSetting("visible");
        this.visible = visible;
        await this.setSetting("visible", visible);
    }

    async _draw() {
        this.visible = Boolean(this.getSetting("visible"));

        this.fogColorLayer = this.getCanvasSprite();
        this.setColorTint(this.getTint());
        this.setColorAlpha(this.getColorAlpha(), true);

        this.blur = new PIXI.filters.BlurFilter();
        this.blur.padding = 0;
        this.blur.repeatEdgePixels = true;
        this.blur.blur = this.getSetting("blurRadius");
        this.blur.quality = this.getSetting("blurQuality");
        this.fogColorLayer.filters = this.getSetting("blurEnable") ? [this.blur] : [];

        // Escape on the canvas opens the menu.
        this._controlled = {};

        this.maskTexture = MaskLayer.getMaskTexture();
        this.maskSprite = new PIXI.Sprite(this.maskTexture);
        this.fogColorLayer.mask = this.maskSprite;
        this.setFill();
        this.sortableChildren = true;

        this.pointer = 0;
        this.renderStack({ start: 0 });

        // The overlay image goes on after the mask is drawn, so it never shows the map uncovered.
        const overlay = this.getSetting("fogImageOverlayFilePath");
        const rect = canvas.dimensions.sceneRect;
        this.fogImageOverlayLayer = new PIXI.Sprite(overlay ? foundry.canvas.getTexture(overlay) : PIXI.Texture.EMPTY);
        this.fogImageOverlayLayer.position.set(rect.x, rect.y);
        this.fogImageOverlayLayer.width = rect.width;
        this.fogImageOverlayLayer.height = rect.height;
        this.fogImageOverlayLayer.mask = this.maskSprite;
        this.fogImageOverlayLayer.zIndex = this.getSetting("fogImageOverlayZIndex");
        this.setFogImageOverlayAlpha(this.getFogImageOverlayAlpha(), true);

        this.addChild(this.fogImageOverlayLayer);
        this.addChild(this.fogColorLayer);
        this.addChild(this.fogColorLayer.mask);
    }
}
