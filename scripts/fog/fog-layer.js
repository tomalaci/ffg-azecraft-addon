/**
 * Manual fog tools (GM): brush, grid cells, room (wall-bounded), polygon, box and ellipse, drawn
 * onto the mask layer. Ported from Simple Fog 1.4.4 (MIT, see LICENSE) with these Simple Fog 1.5
 * improvements: a continuous brush line on fast drags, polygon edges and a line to the pointer while
 * drawing, a room tool that reveals as far as you drag (or the whole room with Expand), snapping
 * shapes to the grid, an eraser toggle, and the grid tool following grid size changes.
 */

import { Layout } from "./hexagons.js";
import { BrushControls } from "./brush-controls.js";
import { CWSPNoDoors } from "./clockwise-sweep.js";
import { pointsToPolygon } from "./fog-core.js";
import { LEVELS, levelFromPercent } from "./fog-raster.js";
import MaskLayer, { MODULE_ID, SETTINGS } from "./mask-layer.js";

export const LAYER = "azecraftFog";
const HIGHLIGHT = "azecraft-fog";
const HANDLE_SIZE = 20;
const PREVIEW_ALPHA = 0.4;
const HANDLE_FILL = 0xff6400;
export const TOOLS = ["brush", "grid", "room", "polygon", "box", "ellipse"];

export default class FogLayer extends MaskLayer {
    constructor() {
        super();
        this.addListener("pointerup", this._pointerUp);
        this.addListener("pointermove", this._pointerMove);
    }

    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, { name: LAYER });
    }

    brushSize = game.settings.get(MODULE_ID, SETTINGS.brushSize);

    /** Opacity level of new strokes: 0 reveals, 20 (100%) hides. */
    brushLevel = levelFromPercent(game.settings.get(MODULE_ID, SETTINGS.brushOpacity));

    /** Room tool: reveal the whole room on click instead of as far as you drag. */
    roomExpand = false;

    activeTool;

    #brushControls;

    #brushPrev = null;

    #gridSize;

    #gridType;

    #lastPosition;

    #previewTint = 0xff0000;

    #rightclick;

    get brushControls() {
        return this.#brushControls ??= new BrushControls();
    }

    _activate() {
        super._activate();
        const tool = ui.controls.tool?.name;
        this._changeTool(TOOLS.includes(tool) ? tool : "brush");
    }

    _deactivate() {
        super._deactivate();
        this.brushControls.close({ animate: false });
        this.clearActiveTool();
    }

    _changeTool(tool = "") {
        this.clearActiveTool();
        this.activeTool = tool;
        this.setPreviewTint();
        if (tool === "brush") {
            this.ellipsePreview.visible = true;
            this._pointerMoveBrush(canvas.mousePosition);
        } else if (tool === "grid") {
            this._initGrid();
            this._pointerMoveGrid(canvas.mousePosition);
        } else if (tool === "room") {
            canvas.walls.objects.visible = true;
            canvas.walls.placeables.forEach(wall => wall.renderFlags.set({ refreshState: true }));
        }
        this.brushControls.render({ force: true });
    }

    /** Show or hide the scene's fog; tools only show while it is on. */
    async toggle() {
        this.#endInterrupted();
        await super.toggle();
        if (!TOOLS.includes(this.activeTool)) this._changeTool("brush");
        ui.controls.render({ reset: true });
    }

    /** Eraser on: shapes reveal; off: they hide. */
    async setEraser(active) {
        await game.settings.set(MODULE_ID, SETTINGS.brushOpacity, active ? 0 : 100);
    }

    get eraser() {
        return this.brushLevel === 0;
    }

    /* -------------------------------------------- */
    /*  Scene changes                               */
    /* -------------------------------------------- */

    /**
     * Another user's change: decode the fog tiles they stored, show or hide the fog, or redraw the
     * layer after its look or precision changed.
     */
    _updateScene(scene, changed, options, userId) {
        if (!scene.isView || !this.raster) return;
        const fog = changed.flags?.[MODULE_ID]?.fog;
        if (fog && userId !== game.user.id) {
            const keys = Object.keys(fog);
            if (keys.some(key => key.replace(/^(-=|==)/, "") === "raster")) this.applyStoredChange(fog);
            if ("visible" in fog) {
                this.visible = Boolean(this.getSetting("visible"));
                ui.controls.render({ reset: true });
            }
            const look = keys.filter(key => !["raster", "==raster", "-=raster", "visible"].includes(key));
            if (look.length) this.draw();
        } else if (game.user.isGM && this.activeTool === "grid" && (changed.grid?.size || changed.grid?.type)) {
            this._initGrid();
        }
    }

    /* -------------------------------------------- */
    /*  Previews                                    */
    /* -------------------------------------------- */

    highlightConfig(x, y) {
        return { x, y, color: this.#previewTint, alpha: PREVIEW_ALPHA };
    }

    /** Green previews reveal, red ones hide. */
    setPreviewTint() {
        this.#previewTint = this.brushLevel < LEVELS ? 0x00ff00 : 0xff0000;
        for (const preview of [this.ellipsePreview, this.boxPreview, this.polygonPreview, this.pointerPreview]) {
            if (preview) preview.tint = this.#previewTint;
        }
        if (this.activeTool === "grid" && this.#lastPosition) {
            const { x, y } = this.#lastPosition;
            canvas.interface.grid.clearHighlightLayer(HIGHLIGHT);
            canvas.interface.grid.highlightPosition(HIGHLIGHT, this.highlightConfig(x, y));
        }
    }

    setBrushSize(size) {
        this.brushSize = size;
        if (this.ellipsePreview && this.activeTool === "brush") {
            this.ellipsePreview.width = size * 2;
            this.ellipsePreview.height = size * 2;
        }
    }

    /** Cancel any drawing in progress. */
    clearActiveTool() {
        canvas.interface.grid.clearHighlightLayer(HIGHLIGHT);
        this.boxPreview.visible = false;
        this.ellipsePreview.visible = false;
        this.polygonPreview.clear();
        this.polygonPreview.visible = false;
        this.polygonHandle.visible = false;
        this.pointerPreview.visible = false;
        this.polygon = [];
        this.op = false;
        this.#brushPrev = null;
        // A drawing cut short (tool change, layer change) is stored as it is.
        if (this.historyBuffer.length) this.commitHistory();
        if (this.activeTool === "room") {
            canvas.walls.objects.visible = false;
            canvas.walls.placeables.forEach(wall => wall.renderFlags.set({ refreshState: true }));
        }
    }

    /** With Force Snap on (box, ellipse, polygon), a grid vertex or cell corner; else the point. */
    snapped(p) {
        if (!canvas.forceSnapVertices || canvas.grid.isGridless) return { x: p.x, y: p.y };
        const { type } = canvas.scene.grid;
        if (type === CONST.GRID_TYPES.SQUARE) return canvas.grid.getTopLeftPoint(p);
        return canvas.grid.getTopLeftPoint(canvas.grid.getOffset(canvas.grid.getCube(canvas.grid.getCenterPoint(p))));
    }

    #showPointer(p) {
        const { x, y } = this.snapped(p);
        this.pointerPreview.visible = true;
        this.pointerPreview.x = x;
        this.pointerPreview.y = y;
    }

    /* -------------------------------------------- */
    /*  Pointer events                              */
    /* -------------------------------------------- */

    static #point() {
        const p = canvas.mousePosition;
        return { x: Math.round(p.x), y: Math.round(p.y) };
    }

    _onClickLeft(event) {
        // Not while the last action is still being stored.
        if (this.historyBuffer.length > 0) return;
        const p = FogLayer.#point();
        if (!canvas.dimensions.sceneRect.contains(p.x, p.y)) return;
        if (!this.visible) {
            ui.notifications.info("Manual fog is off for this scene: switch it on with the eye button first.");
            return;
        }
        this.op = true;
        switch (this.activeTool) {
            case "brush": this._pointerDownBrush(p); break;
            case "grid": this._pointerDownGrid(); break;
            case "box": this._pointerDownBox(p); break;
            case "ellipse": this._pointerDownEllipse(p); break;
            case "polygon": this._pointerDownPolygon(p); break;
            case "room": this._pointerDownRoom(p, event); break;
            default: break;
        }
        // A click without moving still draws.
        this._pointerMove(event);
    }

    _onClickLeft2(event) {
        if (this.historyBuffer.length > 0) return;
        const p = FogLayer.#point();
        if (!canvas.dimensions.sceneRect.contains(p.x, p.y)) return;
        if (this.activeTool === "polygon") this._pointerDown2Polygon();
        this._pointerMove(event);
    }

    _onClickRight() {
        if (this.historyBuffer.length > 0) return;
        if (["box", "ellipse"].includes(this.activeTool)) this.clearActiveTool();
        else if (this.activeTool === "polygon") this.#rightclick = true;
    }

    _pointerMove(event) {
        // The button was let go outside the canvas (over the toolbar, another window): end the
        // drawing there, instead of drawing on without a held button.
        if (this.op && event?.buttons === 0 && this.activeTool !== "polygon") this.#endInterrupted();
        const p = FogLayer.#point();
        switch (this.activeTool) {
            case "brush": this._pointerMoveBrush(p); break;
            case "box": this._pointerMoveBox(p, event); break;
            case "grid": this._pointerMoveGrid(p); break;
            case "ellipse": this._pointerMoveEllipse(p, event); break;
            case "polygon":
                this._pointerMovePolygon(p);
                this.#rightclick = false;
                break;
            case "room": this._pointerMoveRoom(p, event); break;
            default: break;
        }
    }

    _pointerUp(event) {
        if (event.data.button === 0) {
            const p = FogLayer.#point();
            switch (this.op) {
                case "box": this._pointerUpBox(p, event); break;
                case "ellipse": this._pointerUpEllipse(p, event); break;
                case "room": this._pointerUpRoom(p, event); break;
                default: break;
            }
            this.op = false;
            this.#brushPrev = null;
            this.commitHistory();
        } else if (event.data.button === 2 && this.activeTool === "polygon" && this.#rightclick) {
            this.clearActiveTool();
        }
    }

    /** Finish a drawing whose button release the canvas never saw: keep what was drawn, drop drag previews. */
    #endInterrupted() {
        if (!this.op) return;
        if (["box", "ellipse", "room"].includes(this.op)) {
            this.boxPreview.visible = false;
            this.polygonPreview.clear();
            this.polygonPreview.visible = false;
            if (this.op === "ellipse") this.ellipsePreview.visible = false;
        }
        this.op = false;
        this.#brushPrev = null;
        this.commitHistory();
    }

    /* -------------------------------------------- */
    /*  Brush                                       */
    /* -------------------------------------------- */

    _pointerDownBrush(p) {
        this.op = true;
        this.#brushPrev = { x: p.x, y: p.y };
    }

    _pointerMoveBrush(p) {
        if (!canvas.dimensions.sceneRect.contains(p.x, p.y)) {
            this.ellipsePreview.visible = false;
            return;
        }
        this.ellipsePreview.visible = true;
        this.ellipsePreview.width = this.brushSize * 2;
        this.ellipsePreview.height = this.brushSize * 2;
        this.ellipsePreview.x = p.x;
        this.ellipsePreview.y = p.y;
        if (this.op) {
            this.#brushLine(this.#brushPrev ?? p, p);
            this.#brushPrev = { x: p.x, y: p.y };
        }
    }

    /** Dabs along the line from the last position, so a fast drag leaves no gaps. */
    #brushLine(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(this.brushSize * 0.5, 4)));
        for (let i = 0; i <= count; i += 1) {
            if (i === 0 && (dx || dy)) continue;
            const t = i / count;
            this.renderBrush({
                shape: this.BRUSH_TYPES.ELLIPSE,
                x: Math.round(from.x + dx * t),
                y: Math.round(from.y + dy * t),
                level: this.brushLevel,
                width: this.brushSize,
                height: this.brushSize
            });
        }
    }

    /* -------------------------------------------- */
    /*  Box and ellipse                             */
    /* -------------------------------------------- */

    #startDrag(p, op, preview) {
        const { x, y } = this.snapped(p);
        this.op = op;
        this.dragStart.x = x;
        this.dragStart.y = y;
        this.pointerPreview.visible = false;
        preview.x = x;
        preview.y = y;
        preview.width = 0;
        preview.height = 0;
        preview.visible = true;
    }

    _pointerDownBox(p) {
        this.#startDrag(p, "box", this.boxPreview);
    }

    _pointerMoveBox(p, event) {
        if (!this.op) return this.#showPointer(p);
        const d = this._getDragBounds(p, event);
        this.boxPreview.width = d.w;
        this.boxPreview.height = d.h;
    }

    _pointerUpBox(p, event) {
        const d = this._getDragBounds(p, event);
        this.renderBrush({ shape: this.BRUSH_TYPES.BOX, x: this.dragStart.x, y: this.dragStart.y, width: d.w, height: d.h, level: this.brushLevel });
        this.boxPreview.visible = false;
    }

    _pointerDownEllipse(p) {
        this.#startDrag(p, "ellipse", this.ellipsePreview);
    }

    _pointerMoveEllipse(p, event) {
        if (!this.op) return this.#showPointer(p);
        const d = this._getDragBounds(p, event);
        this.ellipsePreview.width = d.w * 2;
        this.ellipsePreview.height = d.h * 2;
    }

    _pointerUpEllipse(p, event) {
        const d = this._getDragBounds(p, event);
        this.renderBrush({ shape: this.BRUSH_TYPES.ELLIPSE, x: this.dragStart.x, y: this.dragStart.y, width: Math.abs(d.w), height: Math.abs(d.h), level: this.brushLevel });
        this.ellipsePreview.visible = false;
    }

    /** Drag size from the start point; Shift makes it a square or circle. Snaps with Force Snap. */
    _getDragBounds(p, event) {
        const end = this.snapped(p);
        let h = end.y - this.dragStart.y;
        let w = end.x - this.dragStart.x;
        if (event?.data?.originalEvent?.shiftKey) {
            const ws = Math.sign(w) || 1;
            const hs = Math.sign(h) || 1;
            if (Math.abs(h) > Math.abs(w)) w = Math.abs(h) * ws;
            else h = Math.abs(w) * hs;
        }
        return { w, h };
    }

    /* -------------------------------------------- */
    /*  Polygon                                     */
    /* -------------------------------------------- */

    _pointerDownPolygon(p) {
        this.polygon ??= [];
        const { x, y } = this.snapped(p);
        if (this.polygon.length) {
            // A click near the first point closes the shape.
            const first = this.polygon[0];
            if (Math.abs(first.x - x) < HANDLE_SIZE && Math.abs(first.y - y) < HANDLE_SIZE) {
                this._pointerClosePolygon();
                return;
            }
        } else {
            this.polygonHandle.x = x - HANDLE_SIZE;
            this.polygonHandle.y = y - HANDLE_SIZE;
            this.polygonHandle.visible = true;
        }
        this.polygon.push({ x, y });
        this.#drawPolygonPreview();
    }

    _pointerDown2Polygon() {
        if (this.polygon?.length >= 3) this._pointerClosePolygon();
    }

    _pointerClosePolygon() {
        this.renderBrush({ shape: this.BRUSH_TYPES.POLYGON, x: 0, y: 0, vertices: pointsToPolygon(this.polygon), level: this.brushLevel });
        this.polygonPreview.clear();
        this.polygonPreview.visible = false;
        this.polygonHandle.visible = false;
        this.polygon = [];
    }

    /** The shape so far: a light fill, its edges and its corners (line widths independent of zoom). */
    #drawPolygonPreview(cursor = null) {
        const preview = this.polygonPreview;
        preview.clear();
        if (!this.polygon?.length) {
            preview.visible = false;
            return;
        }
        const line = 2 / canvas.stage.scale.x;
        preview.beginFill(0xffffff, 0.3);
        preview.drawPolygon(pointsToPolygon(this.polygon));
        preview.endFill();
        preview.lineStyle(line, 0xffffff, 0.8);
        this.polygon.forEach((point, i) => {
            const next = this.polygon[(i + 1) % this.polygon.length];
            preview.moveTo(point.x, point.y);
            preview.lineTo(next.x, next.y);
        });
        preview.lineStyle(0);
        const half = HANDLE_SIZE / 2;
        for (const point of this.polygon) {
            preview.beginFill(HANDLE_FILL, 0.8);
            preview.drawRect(point.x - half, point.y - half, half * 2, half * 2);
            preview.endFill();
        }
        if (cursor) {
            const last = this.polygon.at(-1);
            preview.lineStyle(line, 0xffff00, 0.6);
            preview.moveTo(last.x, last.y);
            preview.lineTo(cursor.x, cursor.y);
        }
        preview.visible = true;
    }

    _pointerMovePolygon(p) {
        if (!canvas.dimensions.sceneRect.contains(p.x, p.y)) {
            this.pointerPreview.visible = false;
            return;
        }
        this.#showPointer(p);
        if (this.polygon?.length) this.#drawPolygonPreview(this.snapped(p));
    }

    /* -------------------------------------------- */
    /*  Room                                        */
    /* -------------------------------------------- */

    _pointerDownRoom(p, event) {
        if (this.roomExpand) {
            this.#drawRoom(p, event);
            return;
        }
        this.op = "room";
        this.roomOrigin = { x: p.x, y: p.y };
        this.pointerPreview.visible = false;
    }

    _pointerUpRoom(p, event) {
        if (this.roomExpand) return;
        this.#drawRoom(p, event);
        this.polygonPreview.clear();
        this.polygonPreview.visible = false;
    }

    #drawRoom(p, event) {
        const vertices = this._getRoomVertices(p, event);
        if (vertices.length) this.renderBrush({ shape: this.BRUSH_TYPES.POLYGON, x: 0, y: 0, vertices, level: this.brushLevel });
    }

    _pointerMoveRoom(p, event) {
        if (!this.op && !this.roomExpand) {
            this.#showPointer(p);
            return;
        }
        this.pointerPreview.visible = false;
        const vertices = this._getRoomVertices(p, event);
        this.polygonPreview.clear();
        this.polygonPreview.visible = vertices.length > 0;
        if (!vertices.length) return;
        this.polygonPreview.beginFill(0xffffff);
        this.polygonPreview.drawPolygon(vertices);
        this.polygonPreview.endFill();
    }

    /**
     * The area seen from a point, bounded by walls (open doors let it through unless Shift is held).
     * Dragging: from where the drag started, out to the pointer; Expand: the whole room at the pointer.
     */
    _getRoomVertices(p, event) {
        const rect = canvas.dimensions.sceneRect;
        if (!rect.contains(p.x, p.y)) return [];
        const origin = this.roomExpand || !this.roomOrigin ? { x: p.x, y: p.y } : this.roomOrigin;
        const radius = this.roomExpand ? undefined : Math.max(Math.abs(p.x - origin.x), Math.abs(p.y - origin.y));
        if (radius === 0) return [];
        const shiftKey = event?.data?.originalEvent?.shiftKey ?? event?.shiftKey ?? false;
        const sweep = CWSPNoDoors.create(origin, { type: "sight", radius, shiftKey });
        return Array.from(sweep.points);
    }

    /* -------------------------------------------- */
    /*  Grid                                        */
    /* -------------------------------------------- */

    _pointerDownGrid() {
        this.op = "grid";
        this._initGrid();
    }

    _pointerMoveGrid(p) {
        canvas.interface.grid.clearHighlightLayer(HIGHLIGHT);
        if (!canvas.dimensions.sceneRect.contains(p.x, p.y)) return;
        const { size, type } = canvas.scene.grid;
        if (type === CONST.GRID_TYPES.SQUARE) {
            const { x, y } = canvas.grid.getTopLeftPoint(p);
            canvas.interface.grid.highlightPosition(HIGHLIGHT, this.highlightConfig(x, y));
            this.#lastPosition = { x, y };
            if (!this.op) return;
            const cell = `${x},${y}`;
            if (this.dupes.includes(cell)) return;
            this.dupes.push(cell);
            this.renderBrush({ shape: this.BRUSH_TYPES.BOX, x, y, width: size, height: size, level: this.brushLevel });
        } else if (type !== CONST.GRID_TYPES.GRIDLESS) {
            const { x, y } = canvas.grid.getTopLeftPoint(canvas.grid.getOffset(canvas.grid.getCube(canvas.grid.getCenterPoint(p))));
            canvas.interface.grid.highlightPosition(HIGHLIGHT, this.highlightConfig(x, y));
            this.#lastPosition = { x, y };
            if (!this.op) return;
            const hex = this.gridLayout.pixelToHex(p).round();
            const cell = `${hex.q},${hex.r}`;
            if (this.dupes.includes(cell)) return;
            this.dupes.push(cell);
            const vertices = pointsToPolygon(this.gridLayout.polygonCorners({ q: hex.q, r: hex.r }));
            this.renderBrush({ shape: this.BRUSH_TYPES.POLYGON, vertices, x: 0, y: 0, level: this.brushLevel });
        }
    }

    /** Reset the drawn-cell list and (for hex grids) the hex layout for the scene's grid. */
    _initGrid() {
        const { size, type } = canvas.scene.grid;
        this.dupes = [];
        if (this.#gridSize === size && this.#gridType === type) return;
        const legacyHex = Boolean(canvas.scene.flags.core?.legacyHex);
        const divisor = legacyHex ? 2 : Math.sqrt(3);
        const cell = { x: size / divisor, y: size / divisor };
        const half = legacyHex ? (Math.sqrt(3) * size) / 4 : size / 2;
        const { HEXODDR, HEXEVENR, HEXODDQ, HEXEVENQ } = CONST.GRID_TYPES;
        if (type === HEXODDR) this.gridLayout = new Layout(Layout.pointy, cell, { x: 0, y: size / divisor });
        else if (type === HEXEVENR) this.gridLayout = new Layout(Layout.pointy, cell, { x: half, y: size / divisor });
        else if (type === HEXODDQ) this.gridLayout = new Layout(Layout.flat, cell, { x: size / divisor, y: 0 });
        else if (type === HEXEVENQ) this.gridLayout = new Layout(Layout.flat, cell, { x: size / divisor, y: half });
        this.#gridType = type;
        this.#gridSize = size;
    }

    /* -------------------------------------------- */
    /*  Drawing                                     */
    /* -------------------------------------------- */

    async _draw() {
        await super._draw();
        const preview = (data) => this.brush({ x: 0, y: 0, fill: 0xffffff, alpha: PREVIEW_ALPHA, width: 100, height: 100, visible: false, zIndex: 10, ...data });
        this.boxPreview = preview({ shape: this.BRUSH_TYPES.BOX });
        this.ellipsePreview = preview({ shape: this.BRUSH_TYPES.ELLIPSE });
        this.polygonPreview = preview({ shape: this.BRUSH_TYPES.POLYGON, vertices: [] });
        this.polygonHandle = preview({ shape: this.BRUSH_TYPES.BOX, fill: HANDLE_FILL, width: HANDLE_SIZE * 2, height: HANDLE_SIZE * 2, zIndex: 15 });
        // Where the next point goes (box, ellipse, polygon, room).
        this.pointerPreview = preview({ shape: this.BRUSH_TYPES.ELLIPSE, width: HANDLE_SIZE / 2, height: HANDLE_SIZE / 2, zIndex: 15 });
        for (const child of [this.boxPreview, this.ellipsePreview, this.polygonPreview, this.polygonHandle, this.pointerPreview]) this.addChild(child);
        canvas.interface.grid.addHighlightLayer(HIGHLIGHT);
        this.setPreviewTint();
    }
}

