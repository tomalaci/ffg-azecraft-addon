/**
 * Manual fog mask: the scene's fog as a grid of cells (fog-raster.js) shown through a fog colour
 * sprite (and an optional overlay image). Ported from Simple Fog 1.4.4 (MIT, see LICENSE), with the
 * storage and drawing reworked for big maps:
 *
 * - The fog is stored as tiles of cells; an action rewrites only the tiles it touched, in one scene
 *   update (Simple Fog rewrote its whole stroke history, twice, on every action).
 * - Loading decodes the tiles instead of replaying every stroke ever drawn.
 * - The cells are a small texture, blurred once into a mask texture when they change (Simple Fog
 *   blurred the full-canvas fog sprite on every frame).
 *
 * Undo is per GM and per session (the last 50 actions).
 *
 * Everything lives under this module's ids, so Simple Fog can stay active alongside: scene flags
 * `flags.ffg-azecraft-addon.fog.*`, settings `ffg-azecraft-addon.fog*`, layer `canvas.azecraftFog`.
 */

import { BRUSH_TYPES } from "./fog-core.js";
import {
    LEVELS, TILE, cellSizeFor, createRaster, decodeRaster, decodeTile, encodeRaster, encodeTile, paintShape, resampleRaster, tileKey
} from "./fog-raster.js";

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

const UNDO_LIMIT = 50;
/** Longest side of the mask texture, in pixels. */
const MASK_MAX = 4096;
/** Texture grey for each level. */
const GREYS = Array.from({ length: LEVELS + 1 }, (_, level) => Math.round((level * 255) / LEVELS));
const RASTER_PATH = `flags.${MODULE_ID}.${FLAG}.raster`;

/** A per-scene fog value (flag). */
export function sceneFlag(scene, name) {
    return scene?.getFlag(MODULE_ID, `${FLAG}.${name}`);
}

export default class MaskLayer extends foundry.canvas.layers.InteractionLayer {
    constructor() {
        super();
        this.dragStart = { x: 0, y: 0 };
        this.gridLayout = {};
        // Strokes of the action in progress (cleared when it is stored).
        this.historyBuffer = [];
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

    /** The cells of the viewed scene. */
    raster = null;

    /** Tiles changed by the action in progress, with their stored text from before it (for undo). */
    #touched = new Map();

    /** Tiles whose pixels need updating. */
    #dirty = new Set();

    #frame = null;

    /** Undo entries: { sceneId, tiles: {key: text|null} } or { sceneId, raster: stored }. */
    #undo = [];

    #pixels = null;

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

    /** The fog colour sprite and, for players, the fog over the padding around the scene. */
    get #colorTargets() {
        return [this.fogColorLayer, this.paddingLayer].filter(Boolean);
    }

    setColorTint(tint) {
        for (const target of this.#colorTargets) target.tint = tint;
    }

    getFogImageOverlayAlpha() {
        return this.getSetting(game.user.isGM ? "fogImageOverlayGMAlpha" : "fogImageOverlayPlayerAlpha") / 100;
    }

    /** Fade to `alpha` over the transition time (or set it at once). */
    async #fade(targets, alpha, skip, label) {
        const duration = !skip && this.getSetting("transition") ? this.getSetting("transitionSpeed") : 0;
        if (!duration) {
            for (const target of targets) target.alpha = alpha;
            return;
        }
        await foundry.canvas.animation.CanvasAnimation.animate(
            targets.map(parent => ({ parent, attribute: "alpha", to: alpha })),
            { duration, name: `${this.options.name}.fade.${label}` }
        );
    }

    /** @param alpha {Number} 0-100 */
    async setColorAlpha(alpha, skip = false) {
        return this.#fade(this.#colorTargets, alpha / 100, skip, "color");
    }

    /** @param alpha {Number} 0-1 */
    async setFogImageOverlayAlpha(alpha, skip = false) {
        return this.#fade([this.fogImageOverlayLayer], alpha, skip, "overlay");
    }

    /* -------------------------------------------- */
    /*  Cells                                       */
    /* -------------------------------------------- */

    /** Cell size the scene asks for (precision, lined up with its grid). */
    desiredCellSize() {
        const { width, height } = canvas.dimensions.sceneRect;
        const gridSize = canvas.grid?.isGridless ? 0 : canvas.scene.grid.size;
        return cellSizeFor({ precision: this.getSetting("precision"), gridSize, width, height });
    }

    #desiredShape() {
        const cell = this.desiredCellSize();
        const { width, height } = canvas.dimensions.sceneRect;
        return { cell, cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
    }

    /**
     * The stored cells, at the scene's current precision and size. Returns whether they had to be
     * converted (and so still need storing).
     */
    #loadRaster() {
        const { cell, cols, rows } = this.#desiredShape();
        const stored = decodeRaster(sceneFlag(canvas.scene, "raster"));
        if (!stored) {
            this.raster = createRaster(cols, rows, LEVELS, cell);
            return false;
        }
        if (stored.cols === cols && stored.rows === rows && stored.cell === cell) {
            this.raster = stored;
            return false;
        }
        this.raster = resampleRaster(stored, cols, rows, cell);
        return true;
    }

    /** Whether the stored raster has the same shape as ours (else the next store writes all of it). */
    #storedMatches() {
        const stored = sceneFlag(canvas.scene, "raster");
        const r = this.raster;
        return stored && stored.cols === r.cols && stored.rows === r.rows && stored.cell === r.cell && stored.fill === r.fill;
    }

    #scale() {
        const rect = canvas.dimensions.sceneRect;
        return { originX: rect.x, originY: rect.y, scaleX: this.raster.cols / rect.width, scaleY: this.raster.rows / rect.height };
    }

    /** Paint a stroke into the cells now; it is stored when the action ends (commitHistory). */
    renderBrush(stroke, save = true) {
        if (!this.raster) return;
        const scene = canvas.scene;
        paintShape(this.raster, stroke, this.#scale(), (tx, ty) => {
            const key = tileKey(tx, ty);
            if (save && !this.#touched.has(key)) this.#touched.set(key, sceneFlag(scene, `raster.tiles.${key}`) ?? null);
            this.#dirty.add(key);
        });
        if (save) this.historyBuffer.push(stroke);
        this.#scheduleRefresh();
    }

    /** Store the tiles the action changed, in one scene update. */
    async commitHistory() {
        if (!this.#touched.size || !game.user.isGM) return;
        const touched = this.#touched;
        this.#touched = new Map();
        this.historyBuffer = [];
        const scene = canvas.scene;

        // A changed precision or scene size: store everything once.
        if (!this.#storedMatches()) {
            const before = sceneFlag(scene, "raster");
            this.#pushUndo({ sceneId: scene.id, raster: before ?? null });
            await this.#writeRaster(scene, encodeRaster(this.raster));
            return;
        }
        const update = {};
        const undo = {};
        for (const [key, before] of touched) {
            const [tx, ty] = key.split("_").map(Number);
            const text = encodeTile(this.raster, tx, ty);
            if (text === before) continue;
            undo[key] = before;
            if (text) update[`${RASTER_PATH}.tiles.${key}`] = text;
            else update[`${RASTER_PATH}.tiles.-=${key}`] = null;
        }
        if (foundry.utils.isEmpty(update)) return;
        this.#pushUndo({ sceneId: scene.id, tiles: undo });
        await scene.update(update);
    }

    #pushUndo(entry) {
        this.#undo.push(entry);
        if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
    }

    async #writeRaster(scene, stored) {
        await scene.update({ [`flags.${MODULE_ID}.${FLAG}.==raster`]: stored });
    }

    /** Cover the whole scene with fog (or reveal all of it), as one undoable action. */
    async #fillAll(level) {
        if (!game.user.isGM) return;
        const scene = canvas.scene;
        const { cell, cols, rows } = this.#desiredShape();
        this.#touched.clear();
        this.historyBuffer = [];
        this.#pushUndo({ sceneId: scene.id, raster: sceneFlag(scene, "raster") ?? null });
        this.raster = createRaster(cols, rows, level, cell);
        this.#markAllDirty();
        await this.#writeRaster(scene, encodeRaster(this.raster));
    }

    resetMask() {
        return this.#fillAll(LEVELS);
    }

    blankMask() {
        return this.#fillAll(0);
    }

    async undo() {
        const scene = canvas.scene;
        const index = this.#undo.findLastIndex(entry => entry.sceneId === scene.id);
        if (index < 0) {
            ui.notifications.info("Nothing to undo in this scene's fog.");
            return;
        }
        const [entry] = this.#undo.splice(index, 1);
        if ("raster" in entry) {
            if (entry.raster) await this.#writeRaster(scene, entry.raster);
            else await scene.update({ [`flags.${MODULE_ID}.${FLAG}.-=raster`]: null });
            this.#reload();
            return;
        }
        const update = {};
        for (const [key, text] of Object.entries(entry.tiles)) {
            const [tx, ty] = key.split("_").map(Number);
            decodeTile(this.raster, tx, ty, text);
            this.#dirty.add(key);
            if (text) update[`${RASTER_PATH}.tiles.${key}`] = text;
            else update[`${RASTER_PATH}.tiles.-=${key}`] = null;
        }
        this.#scheduleRefresh();
        await scene.update(update);
    }

    /** Foundry's undo key (Ctrl+Z) while this layer is active. */
    _onUndoKey() {
        this.undo();
        return true;
    }

    /**
     * Another user changed the stored cells: decode just the changed tiles, or all of them when
     * the whole raster was replaced.
     */
    applyStoredChange(fogChange) {
        if (!this.raster) return;
        const change = fogChange["==raster"] ?? fogChange.raster;
        const stored = sceneFlag(canvas.scene, "raster");
        const whole = "==raster" in fogChange || "-=raster" in fogChange
            || ["cols", "rows", "cell", "fill"].some(key => key in (change ?? {}))
            || !stored || stored.cols !== this.raster.cols || stored.rows !== this.raster.rows;
        if (whole) return this.#reload();
        for (const key of Object.keys(change?.tiles ?? {})) {
            const name = key.replace(/^-=/, "");
            const [tx, ty] = name.split("_").map(Number);
            if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
            decodeTile(this.raster, tx, ty, stored.tiles?.[name] ?? null);
            this.#dirty.add(name);
        }
        this.#scheduleRefresh();
    }

    #reload() {
        this.#loadRaster();
        this.#markAllDirty();
    }

    /* -------------------------------------------- */
    /*  Textures                                    */
    /* -------------------------------------------- */

    #markAllDirty() {
        this.#dirty.add("*");
        this.#scheduleRefresh();
    }

    #scheduleRefresh() {
        if (this.#frame) return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = null;
            this.#refreshMask();
        });
    }

    /** Copy the changed cells into the cell texture, then redraw (and blur) the mask once. */
    #refreshMask() {
        const r = this.raster;
        const border = this.#border;
        if (!r || !this.cellCanvas || this.cellCanvas.width !== r.cols + 2 * border || this.cellCanvas.height !== r.rows + 2 * border) {
            if (r && this.maskTexture) this.#buildTextures();
            return;
        }
        const regions = this.#dirty.has("*")
            ? [{ x0: 0, y0: 0, x1: r.cols, y1: r.rows }]
            : [...this.#dirty].map(key => {
                const [tx, ty] = key.split("_").map(Number);
                return { x0: tx * TILE, y0: ty * TILE, x1: Math.min((tx + 1) * TILE, r.cols), y1: Math.min((ty + 1) * TILE, r.rows) };
            });
        this.#dirty.clear();
        let edge = false;
        for (const { x0, y0, x1, y1 } of regions) {
            this.#writePixels(x0 + border, y0 + border, x1 + border, y1 + border);
            edge ||= x0 === 0 || y0 === 0 || x1 === r.cols || y1 === r.rows;
        }
        // The border repeats the edge cells, so the blur fades out beyond the scene, not inside it.
        if (edge && border) {
            const width = r.cols + 2 * border;
            const height = r.rows + 2 * border;
            this.#writePixels(0, 0, width, border);
            this.#writePixels(0, height - border, width, height);
            this.#writePixels(0, border, border, height - border);
            this.#writePixels(width - border, border, width, height - border);
        }
        this.cellTexture.baseTexture.update();
        canvas.app.renderer.render(this.cellSprite, { renderTexture: this.maskTexture, clear: true });
    }

    /** Cell-texture pixels [x0, x1) x [y0, y1) from the cells (border pixels from the nearest edge cell). */
    #writePixels(x0, y0, x1, y1) {
        const r = this.raster;
        const border = this.#border;
        const width = r.cols + 2 * border;
        const data = this.#pixels.data;
        for (let y = y0; y < y1; y += 1) {
            const row = Math.min(Math.max(y - border, 0), r.rows - 1) * r.cols;
            for (let x = x0; x < x1; x += 1) {
                const grey = GREYS[r.data[row + Math.min(Math.max(x - border, 0), r.cols - 1)]];
                const i = (y * width + x) * 4;
                data[i] = grey;
                data[i + 1] = grey;
                data[i + 2] = grey;
            }
        }
        this.cellContext.putImageData(this.#pixels, 0, 0, x0, y0, x1 - x0, y1 - y0);
    }

    /** Scene pixels per mask texel: fine enough for the cells and the blur, at most MASK_MAX wide. */
    #texelSize() {
        const { width, height } = canvas.dimensions.sceneRect;
        const blur = this.getSetting("blurEnable") ? Math.max(1, this.getSetting("blurRadius")) : Infinity;
        return Math.max(1, Math.min(this.raster.cell, blur) / 2, width / MASK_MAX, height / MASK_MAX);
    }

    /** Extra cells around the edges of the cell texture (enough for the blur to fade out in). */
    #border = 0;

    #buildTextures() {
        this.#destroyTextures();
        const r = this.raster;
        const rect = canvas.dimensions.sceneRect;
        const texel = this.#texelSize();
        const width = Math.ceil(rect.width / texel);
        const height = Math.ceil(rect.height / texel);
        const blurOn = this.getSetting("blurEnable");
        const strength = blurOn ? this.getSetting("blurRadius") / texel : 0;
        const texelsPerCell = width / r.cols;
        this.#border = blurOn ? Math.ceil((strength * 2 + 2) / texelsPerCell) : 0;
        const border = this.#border;

        this.cellCanvas = document.createElement("canvas");
        this.cellCanvas.width = r.cols + 2 * border;
        this.cellCanvas.height = r.rows + 2 * border;
        this.cellContext = this.cellCanvas.getContext("2d");
        this.#pixels = this.cellContext.createImageData(this.cellCanvas.width, this.cellCanvas.height);
        this.#pixels.data.fill(255);
        this.cellTexture = PIXI.Texture.from(this.cellCanvas, { scaleMode: PIXI.SCALE_MODES.NEAREST });
        this.cellSprite = new PIXI.Sprite(this.cellTexture);
        this.cellSprite.position.set(-border * texelsPerCell, -border * (height / r.rows));
        this.cellSprite.width = this.cellCanvas.width * texelsPerCell;
        this.cellSprite.height = this.cellCanvas.height * (height / r.rows);
        if (blurOn) {
            const blur = new PIXI.filters.BlurFilter(strength, this.getSetting("blurQuality"));
            blur.padding = 0;
            blur.repeatEdgePixels = true;
            // Blur the whole sprite (border included), not only the part inside the mask texture.
            blur.autoFit = false;
            this.cellSprite.filters = [blur];
        }
        this.maskTexture.resize(width, height);
        this.maskTexture.baseTexture.scaleMode = blurOn ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
        this.maskSprite.position.set(rect.x, rect.y);
        this.maskSprite.width = rect.width;
        this.maskSprite.height = rect.height;
        this.#dirty.add("*");
        this.#refreshMask();
    }

    #destroyTextures() {
        this.cellSprite?.destroy();
        this.cellTexture?.destroy(true);
        this.cellSprite = this.cellTexture = this.cellCanvas = this.cellContext = null;
        this.#pixels = null;
    }

    /* -------------------------------------------- */
    /*  Shapes for previews                         */
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

    /* -------------------------------------------- */
    /*  Drawing                                     */
    /* -------------------------------------------- */

    /** Show or hide this scene's fog for everyone. */
    async toggle() {
        const visible = !this.getSetting("visible");
        this.visible = visible;
        await this.setSetting("visible", visible);
    }

    async _draw() {
        this.visible = Boolean(this.getSetting("visible"));
        this.sortableChildren = true;
        // Escape on the canvas opens the menu.
        this._controlled = {};
        const rect = canvas.dimensions.sceneRect;

        this.maskTexture = PIXI.RenderTexture.create({ width: 1, height: 1 });
        this.maskSprite = new PIXI.Sprite(this.maskTexture);

        this.fogColorLayer = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.fogColorLayer.position.set(rect.x, rect.y);
        this.fogColorLayer.width = rect.width;
        this.fogColorLayer.height = rect.height;
        this.fogColorLayer.zIndex = 5000;
        this.fogColorLayer.mask = this.maskSprite;

        // Players also get fog over the padding around the scene (never revealed).
        this.paddingLayer = null;
        if (!game.user.isGM) {
            const all = canvas.dimensions.rect;
            this.paddingLayer = new PIXI.Graphics();
            this.paddingLayer.beginFill(0xffffff).drawRect(all.x, all.y, all.width, all.height);
            this.paddingLayer.beginHole().drawRect(rect.x, rect.y, rect.width, rect.height).endHole().endFill();
            this.paddingLayer.zIndex = 5000;
        }
        this.setColorTint(this.getTint());
        this.setColorAlpha(this.getColorAlpha(), true);

        const converted = this.#loadRaster();
        this.#buildTextures();
        // The active GM stores a precision or size change right away; others store it with their next action.
        if (converted && game.user === game.users.activeGM) {
            this.#writeRaster(canvas.scene, encodeRaster(this.raster));
        }

        const overlay = this.getSetting("fogImageOverlayFilePath");
        this.fogImageOverlayLayer = new PIXI.Sprite(overlay ? foundry.canvas.getTexture(overlay) : PIXI.Texture.EMPTY);
        this.fogImageOverlayLayer.position.set(rect.x, rect.y);
        this.fogImageOverlayLayer.width = rect.width;
        this.fogImageOverlayLayer.height = rect.height;
        this.fogImageOverlayLayer.mask = this.maskSprite;
        this.fogImageOverlayLayer.zIndex = this.getSetting("fogImageOverlayZIndex");
        this.setFogImageOverlayAlpha(this.getFogImageOverlayAlpha(), true);

        this.addChild(this.fogImageOverlayLayer);
        this.addChild(this.fogColorLayer);
        if (this.paddingLayer) this.addChild(this.paddingLayer);
        this.addChild(this.maskSprite);
    }

    async _tearDown(options) {
        if (this.#frame) cancelAnimationFrame(this.#frame);
        this.#frame = null;
        this.#touched.clear();
        this.#dirty.clear();
        this.historyBuffer = [];
        this.#destroyTextures();
        this.maskTexture?.destroy(true);
        this.maskTexture = null;
        this.raster = null;
        return super._tearDown(options);
    }
}
